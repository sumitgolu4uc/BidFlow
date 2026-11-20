import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.auction import rank_current_bids, submit_bid
from app.models import ActivityLog, Bid, RFQ
from app.schemas import (
    ActivityLogResponse,
    BidCreate,
    BidResponse,
    RFQCreate,
    RFQResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rfqs", tags=["RFQs"])


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A database constraint was violated.",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Database write failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database operation failed.",
        ) from exc


@router.post("", response_model=RFQResponse, status_code=status.HTTP_201_CREATED)
def create_rfq(payload: RFQCreate, db: Session = Depends(get_db)) -> RFQ:
    existing_rfq = db.scalar(
        select(RFQ).where(RFQ.reference_id == payload.reference_id)
    )
    if existing_rfq is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An RFQ with this reference_id already exists.",
        )

    rfq = RFQ(**payload.model_dump())
    rfq.activity_logs.append(
        ActivityLog(
            activity_type="rfq_created",
            description=f"RFQ '{rfq.rfq_name}' was created.",
        )
    )
    db.add(rfq)
    _commit(db)
    db.refresh(rfq)
    return rfq


@router.get("", response_model=list[RFQResponse])
def list_rfqs(db: Session = Depends(get_db)) -> list[RFQ]:
    statement = select(RFQ).order_by(RFQ.created_at.desc(), RFQ.id.desc())
    return list(db.scalars(statement).all())


@router.get("/{rfq_id}", response_model=RFQResponse)
def get_rfq(rfq_id: int, db: Session = Depends(get_db)) -> RFQ:
    rfq = db.get(RFQ, rfq_id)
    if rfq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="RFQ not found."
        )
    return rfq


@router.post(
    "/{rfq_id}/bids", response_model=BidResponse, status_code=status.HTTP_201_CREATED
)
def create_bid(
    rfq_id: int, payload: BidCreate, db: Session = Depends(get_db)
) -> Bid:
    return submit_bid(db, rfq_id, payload)


@router.get("/{rfq_id}/bids", response_model=list[BidResponse])
def list_bids(rfq_id: int, db: Session = Depends(get_db)) -> list[Bid]:
    if db.get(RFQ, rfq_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="RFQ not found."
        )
    return list(
        db.scalars(
            select(Bid)
            .where(Bid.rfq_id == rfq_id)
            .order_by(Bid.created_at, Bid.id)
        ).all()
    )


@router.get("/{rfq_id}/ranking", response_model=list[BidResponse])
def rank_bids(rfq_id: int, db: Session = Depends(get_db)) -> list[Bid]:
    if db.get(RFQ, rfq_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="RFQ not found."
        )
    return rank_current_bids(db, rfq_id)


@router.get("/{rfq_id}/activity", response_model=list[ActivityLogResponse])
def list_activity(
    rfq_id: int, db: Session = Depends(get_db)
) -> list[ActivityLog]:
    if db.get(RFQ, rfq_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="RFQ not found."
        )
    statement = (
        select(ActivityLog)
        .where(ActivityLog.rfq_id == rfq_id)
        .order_by(ActivityLog.created_at, ActivityLog.id)
    )
    return list(db.scalars(statement).all())
