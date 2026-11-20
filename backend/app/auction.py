import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import ActivityLog, Bid, RFQ
from app.schemas import BidCreate

logger = logging.getLogger(__name__)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _supplier_key(supplier_name: str) -> str:
    return supplier_name.strip().casefold()


def rank_current_bids(db: Session, rfq_id: int) -> list[Bid]:
    historical_bids = db.scalars(
        select(Bid)
        .where(Bid.rfq_id == rfq_id)
        .order_by(Bid.created_at.desc(), Bid.id.desc())
    ).all()

    latest_by_supplier: dict[str, Bid] = {}
    for bid in historical_bids:
        supplier_key = _supplier_key(bid.supplier_name)
        if supplier_key not in latest_by_supplier:
            latest_by_supplier[supplier_key] = bid

    return sorted(
        latest_by_supplier.values(),
        key=lambda bid: (bid.bid_amount, _supplier_key(bid.supplier_name)),
    )


def _rank_positions(bids: list[Bid]) -> dict[str, int]:
    return {
        _supplier_key(bid.supplier_name): position
        for position, bid in enumerate(bids, start=1)
    }


def _extension_reason(
    trigger_type: str,
    supplier_name: str,
    previous_ranks: dict[str, int],
    current_ranks: dict[str, int],
    trigger_window_minutes: int,
) -> str | None:
    normalized_trigger = trigger_type.upper()
    if normalized_trigger == "ANY_BID":
        return (
            f"ANY_BID: a valid bid from {supplier_name} arrived within the "
            f"final {trigger_window_minutes} minutes."
        )
    if normalized_trigger == "ANY_RANK_CHANGE" and previous_ranks != current_ranks:
        return (
            f"ANY_RANK_CHANGE: supplier rankings changed after a bid from "
            f"{supplier_name} within the final {trigger_window_minutes} minutes."
        )
    if normalized_trigger == "L1_RANK_CHANGE":
        previous_l1 = next(iter(previous_ranks), None)
        current_l1 = next(iter(current_ranks), None)
        if previous_l1 != current_l1:
            return (
                f"L1_RANK_CHANGE: the lowest-bid supplier changed after a bid "
                f"from {supplier_name} within the final {trigger_window_minutes} minutes."
            )
    return None


def submit_bid(
    db: Session,
    rfq_id: int,
    payload: BidCreate,
    *,
    now: datetime | None = None,
) -> Bid:
    try:
        rfq = db.scalar(
            select(RFQ).where(RFQ.id == rfq_id).with_for_update()
        )
        if rfq is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="RFQ not found."
            )

        server_time = _as_utc(
            now if now is not None else datetime.now(timezone.utc)
        )
        start_time = _as_utc(rfq.start_time)
        current_close_time = _as_utc(rfq.current_close_time)
        forced_close_time = (
            _as_utc(rfq.forced_close_time) if rfq.forced_close_time else None
        )

        if server_time < start_time:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The auction has not started.",
            )
        if forced_close_time is not None and server_time >= forced_close_time:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The auction has reached its forced close time.",
            )
        if server_time >= current_close_time:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The auction is closed.",
            )

        previous_ranking = rank_current_bids(db, rfq_id)
        previous_ranks = _rank_positions(previous_ranking)

        bid = Bid(rfq_id=rfq_id, created_at=server_time, **payload.model_dump())
        db.add(bid)
        db.add(
            ActivityLog(
                rfq_id=rfq_id,
                activity_type="bid_submitted",
                description=f"A bid was submitted by {payload.supplier_name}.",
                created_at=server_time,
            )
        )
        db.flush()

        current_ranking = rank_current_bids(db, rfq_id)
        current_ranks = _rank_positions(current_ranking)
        trigger_window_start = current_close_time - timedelta(
            minutes=rfq.trigger_window_minutes
        )
        if server_time >= trigger_window_start:
            reason = _extension_reason(
                rfq.trigger_type,
                payload.supplier_name,
                previous_ranks,
                current_ranks,
                rfq.trigger_window_minutes,
            )
            if reason is not None:
                new_close_time = current_close_time + timedelta(
                    minutes=rfq.extension_duration_minutes
                )
                if forced_close_time is not None:
                    new_close_time = min(new_close_time, forced_close_time)
                if new_close_time > current_close_time:
                    rfq.current_close_time = new_close_time
                    db.add(
                        ActivityLog(
                            rfq_id=rfq_id,
                            activity_type="auction_extended",
                            created_at=server_time,
                            description=(
                                f"{reason} Close time extended from "
                                f"{current_close_time.isoformat()} to "
                                f"{new_close_time.isoformat()}."
                            ),
                        )
                    )

        db.commit()
        db.refresh(bid)
        return bid
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The bid could not be accepted due to a database constraint.",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Bid submission failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database operation failed.",
        ) from exc
