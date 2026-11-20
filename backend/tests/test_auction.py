import os
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///./bidflow-tests.db")

from app.auction import rank_current_bids, submit_bid
from app.database import Base
from app.models import ActivityLog, Bid, RFQ
from app.schemas import BidCreate, RFQCreate


class AuctionEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db: Session = self.session_factory()
        self.now = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def create_rfq(
        self,
        trigger_type: str = "ANY_BID",
        *,
        close_in_minutes: int = 30,
        forced_close_in_minutes: int | None = None,
        trigger_window_minutes: int = 5,
        extension_duration_minutes: int = 10,
    ) -> RFQ:
        close_time = self.now + timedelta(minutes=close_in_minutes)
        forced_close_time = self.now + timedelta(
            minutes=(
                forced_close_in_minutes
                if forced_close_in_minutes is not None
                else close_in_minutes + 60
            )
        )
        rfq = RFQ(
            rfq_name="Test RFQ",
            reference_id=f"TEST-{id(self)}-{trigger_type}-{close_in_minutes}",
            start_time=self.now - timedelta(minutes=10),
            original_close_time=close_time,
            current_close_time=close_time,
            forced_close_time=forced_close_time,
            pickup_date=self.now.date() + timedelta(days=1),
            trigger_window_minutes=trigger_window_minutes,
            extension_duration_minutes=extension_duration_minutes,
            trigger_type=trigger_type,
            status="active",
        )
        self.db.add(rfq)
        self.db.commit()
        self.db.refresh(rfq)
        return rfq

    def payload(self, supplier: str, amount: str) -> BidCreate:
        return BidCreate(
            supplier_name=supplier,
            freight_charges=Decimal(amount),
            origin_charges=Decimal("10.00"),
            destination_charges=Decimal("5.00"),
            transit_time=4,
            quote_validity=30,
            bid_amount=Decimal(amount),
        )

    def seed_bid(self, rfq_id: int, supplier: str, amount: str, order: int) -> Bid:
        bid = Bid(
            rfq_id=rfq_id,
            supplier_name=supplier,
            freight_charges=Decimal(amount),
            origin_charges=Decimal("10.00"),
            destination_charges=Decimal("5.00"),
            transit_time=4,
            quote_validity=30,
            bid_amount=Decimal(amount),
            created_at=self.now - timedelta(days=order),
        )
        self.db.add(bid)
        self.db.commit()
        return bid

    def activity_count(self, rfq_id: int, activity_type: str) -> int:
        return self.db.scalar(
            select(func.count())
            .select_from(ActivityLog)
            .where(
                ActivityLog.rfq_id == rfq_id,
                ActivityLog.activity_type == activity_type,
            )
        ) or 0

    def test_forced_close_must_be_later_than_original_close(self) -> None:
        base_payload = {
            "rfq_name": "Schedule validation",
            "reference_id": "SCHEDULE-VALIDATION",
            "start_time": "2026-11-20T09:00:00Z",
            "original_close_time": "2026-11-20T10:00:00Z",
            "pickup_date": "2026-11-21",
            "trigger_window_minutes": 5,
            "extension_duration_minutes": 10,
            "trigger_type": "ANY_BID",
        }

        for forced_close_time in (
            "2026-11-20T09:59:59Z",
            "2026-11-20T10:00:00Z",
        ):
            with self.subTest(forced_close_time=forced_close_time):
                with self.assertRaises(ValidationError):
                    RFQCreate(
                        **base_payload,
                        forced_close_time=forced_close_time,
                    )

        with self.assertRaises(ValidationError):
            RFQCreate(**base_payload)

    def test_any_bid_trigger_window_includes_boundary_but_not_earlier_time(
        self,
    ) -> None:
        boundary_rfq = self.create_rfq(
            close_in_minutes=5,
            trigger_window_minutes=5,
            extension_duration_minutes=2,
        )
        submit_bid(
            self.db,
            boundary_rfq.id,
            self.payload("Boundary Supplier", "100.00"),
            now=self.now,
        )

        self.db.refresh(boundary_rfq)
        self.assertEqual(
            boundary_rfq.current_close_time,
            boundary_rfq.original_close_time + timedelta(minutes=2),
        )
        self.assertEqual(
            self.activity_count(boundary_rfq.id, "auction_extended"),
            1,
        )

        before_window_rfq = self.create_rfq(
            close_in_minutes=6,
            trigger_window_minutes=5,
            extension_duration_minutes=2,
        )
        submit_bid(
            self.db,
            before_window_rfq.id,
            self.payload("Early Supplier", "100.00"),
            now=self.now,
        )

        self.db.refresh(before_window_rfq)
        self.assertEqual(
            before_window_rfq.current_close_time,
            before_window_rfq.original_close_time,
        )
        self.assertEqual(
            self.activity_count(before_window_rfq.id, "auction_extended"),
            0,
        )

    def test_ranking_returns_l1_l2_l3_using_latest_supplier_bid(self) -> None:
        rfq = self.create_rfq()
        self.seed_bid(rfq.id, "Supplier A", "100.00", 3)
        self.seed_bid(rfq.id, "Supplier B", "125.00", 2)
        self.seed_bid(rfq.id, "Supplier C", "150.00", 1)

        submit_bid(self.db, rfq.id, self.payload("Supplier A", "175.00"), now=self.now)

        ranking = rank_current_bids(self.db, rfq.id)
        self.assertEqual(
            [(bid.supplier_name, bid.bid_amount) for bid in ranking],
            [
                ("Supplier B", Decimal("125.00")),
                ("Supplier C", Decimal("150.00")),
                ("Supplier A", Decimal("175.00")),
            ],
        )
        self.assertEqual(
            self.db.scalar(
                select(func.count()).select_from(Bid).where(Bid.rfq_id == rfq.id)
            ),
            4,
        )

    def test_normal_bid_does_not_extend_outside_trigger_window(self) -> None:
        rfq = self.create_rfq()
        bid = submit_bid(self.db, rfq.id, self.payload("Supplier A", "100.00"), now=self.now)

        self.assertEqual(bid.supplier_name, "Supplier A")
        self.assertEqual(bid.created_at.replace(tzinfo=timezone.utc), self.now)
        self.db.refresh(rfq)
        self.assertEqual(rfq.current_close_time, rfq.original_close_time)
        self.assertEqual(self.activity_count(rfq.id, "auction_extended"), 0)

    def test_any_bid_extends_during_trigger_window(self) -> None:
        rfq = self.create_rfq(close_in_minutes=3, extension_duration_minutes=10)
        previous_close = rfq.current_close_time

        submit_bid(self.db, rfq.id, self.payload("Supplier A", "100.00"), now=self.now)

        self.db.refresh(rfq)
        self.assertEqual(
            rfq.current_close_time,
            previous_close + timedelta(minutes=10),
        )
        extension = self.db.scalar(
            select(ActivityLog).where(ActivityLog.activity_type == "auction_extended")
        )
        self.assertIn("ANY_BID", extension.description)
        self.assertIn(previous_close.isoformat(), extension.description)
        self.assertIn(rfq.current_close_time.isoformat(), extension.description)

    def test_any_rank_change_extends_when_supplier_order_changes(self) -> None:
        rfq = self.create_rfq("ANY_RANK_CHANGE", close_in_minutes=3)
        self.seed_bid(rfq.id, "Supplier A", "100.00", 2)
        self.seed_bid(rfq.id, "Supplier B", "150.00", 1)

        submit_bid(self.db, rfq.id, self.payload("Supplier B", "75.00"), now=self.now)

        ranking = rank_current_bids(self.db, rfq.id)
        self.assertEqual([bid.supplier_name for bid in ranking], ["Supplier B", "Supplier A"])
        self.assertEqual(self.activity_count(rfq.id, "auction_extended"), 1)

    def test_any_rank_change_does_not_extend_if_positions_are_unchanged(self) -> None:
        rfq = self.create_rfq("ANY_RANK_CHANGE", close_in_minutes=3)
        self.seed_bid(rfq.id, "Supplier A", "100.00", 2)
        self.seed_bid(rfq.id, "Supplier B", "150.00", 1)

        submit_bid(self.db, rfq.id, self.payload("Supplier A", "90.00"), now=self.now)

        self.assertEqual(self.activity_count(rfq.id, "auction_extended"), 0)

    def test_l1_rank_change_extends_when_lowest_supplier_changes(self) -> None:
        rfq = self.create_rfq("L1_RANK_CHANGE", close_in_minutes=3)
        self.seed_bid(rfq.id, "Supplier A", "100.00", 2)
        self.seed_bid(rfq.id, "Supplier B", "150.00", 1)

        submit_bid(self.db, rfq.id, self.payload("Supplier B", "90.00"), now=self.now)

        self.assertEqual(rank_current_bids(self.db, rfq.id)[0].supplier_name, "Supplier B")
        self.assertEqual(self.activity_count(rfq.id, "auction_extended"), 1)

    def test_l1_price_change_without_supplier_change_does_not_extend(self) -> None:
        rfq = self.create_rfq("L1_RANK_CHANGE", close_in_minutes=3)
        self.seed_bid(rfq.id, "Supplier A", "100.00", 2)
        self.seed_bid(rfq.id, "Supplier B", "150.00", 1)

        submit_bid(self.db, rfq.id, self.payload("Supplier A", "90.00"), now=self.now)

        self.assertEqual(rank_current_bids(self.db, rfq.id)[0].supplier_name, "Supplier A")
        self.assertEqual(self.activity_count(rfq.id, "auction_extended"), 0)

    def test_multiple_extensions_move_the_close_from_its_current_time(self) -> None:
        rfq = self.create_rfq(
            close_in_minutes=3,
            trigger_window_minutes=5,
            extension_duration_minutes=2,
        )
        initial_close = rfq.current_close_time

        submit_bid(self.db, rfq.id, self.payload("Supplier A", "100.00"), now=self.now)
        submit_bid(
            self.db,
            rfq.id,
            self.payload("Supplier B", "90.00"),
            now=self.now + timedelta(minutes=1),
        )

        self.db.refresh(rfq)
        self.assertEqual(
            rfq.current_close_time,
            initial_close + timedelta(minutes=4),
        )
        self.assertEqual(self.activity_count(rfq.id, "auction_extended"), 2)

    def test_extension_is_capped_at_forced_close_and_forced_close_rejects_bids(
        self,
    ) -> None:
        rfq = self.create_rfq(
            close_in_minutes=1,
            forced_close_in_minutes=3,
            extension_duration_minutes=10,
        )
        submit_bid(self.db, rfq.id, self.payload("Supplier A", "100.00"), now=self.now)

        self.db.refresh(rfq)
        self.assertEqual(rfq.current_close_time, rfq.forced_close_time)
        self.assertEqual(self.activity_count(rfq.id, "auction_extended"), 1)

        with self.assertRaises(HTTPException) as raised:
            submit_bid(
                self.db,
                rfq.id,
                self.payload("Supplier B", "90.00"),
                now=self.now + timedelta(minutes=3),
            )
        self.assertEqual(raised.exception.status_code, 409)

    def test_bid_after_current_close_is_rejected(self) -> None:
        rfq = self.create_rfq(close_in_minutes=-1)

        with self.assertRaises(HTTPException) as raised:
            submit_bid(self.db, rfq.id, self.payload("Supplier A", "100.00"), now=self.now)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(len(rank_current_bids(self.db, rfq.id)), 0)

    def test_bid_before_start_is_rejected(self) -> None:
        rfq = self.create_rfq()

        with self.assertRaises(HTTPException) as raised:
            submit_bid(
                self.db,
                rfq.id,
                self.payload("Supplier A", "100.00"),
                now=self.now - timedelta(minutes=11),
            )

        self.assertEqual(raised.exception.status_code, 409)

    def test_newest_supplier_bid_replaces_only_the_ranking_entry(self) -> None:
        rfq = self.create_rfq()
        self.seed_bid(rfq.id, "Supplier A", "100.00", 2)
        self.seed_bid(rfq.id, "Supplier B", "125.00", 1)

        submit_bid(self.db, rfq.id, self.payload("Supplier A", "175.00"), now=self.now)

        ranking = rank_current_bids(self.db, rfq.id)
        self.assertEqual(len(ranking), 2)
        self.assertEqual(
            [(bid.supplier_name, bid.bid_amount) for bid in ranking],
            [("Supplier B", Decimal("125.00")), ("Supplier A", Decimal("175.00"))],
        )
        self.assertEqual(
            self.db.scalar(select(func.count()).select_from(Bid).where(Bid.rfq_id == rfq.id)),
            3,
        )

    def test_equal_bids_are_tied_by_supplier_name_case_insensitively(self) -> None:
        rfq = self.create_rfq()
        self.seed_bid(rfq.id, "zulu", "100.00", 2)
        self.seed_bid(rfq.id, "Alpha", "100.00", 1)

        ranking = rank_current_bids(self.db, rfq.id)

        self.assertEqual([bid.supplier_name for bid in ranking], ["Alpha", "zulu"])

    def test_trigger_type_is_case_normalized_and_naive_times_are_utc(self) -> None:
        rfq = RFQCreate(
            rfq_name="Schema test",
            reference_id="SCHEMA-TEST",
            start_time="2026-11-20T10:00:00",
            original_close_time="2026-11-20T11:00:00",
            forced_close_time="2026-11-20T11:10:00",
            pickup_date="2026-11-21",
            trigger_window_minutes=5,
            extension_duration_minutes=10,
            trigger_type="any_bid",
        )

        self.assertEqual(rfq.trigger_type, "ANY_BID")
        self.assertEqual(rfq.start_time.utcoffset(), timedelta(0))
        self.assertEqual(rfq.current_close_time, rfq.original_close_time)


if __name__ == "__main__":
    unittest.main()
