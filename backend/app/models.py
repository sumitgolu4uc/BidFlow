from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RFQ(Base):
    __tablename__ = "rfqs"

    id: Mapped[int] = mapped_column(primary_key=True)
    rfq_name: Mapped[str] = mapped_column(String(200), nullable=False)
    reference_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    original_close_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    current_close_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    forced_close_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    pickup_date: Mapped[date] = mapped_column(Date, nullable=False)
    trigger_window_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    extension_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    bids: Mapped[list["Bid"]] = relationship(
        back_populates="rfq", cascade="all, delete-orphan"
    )
    activity_logs: Mapped[list["ActivityLog"]] = relationship(
        back_populates="rfq", cascade="all, delete-orphan"
    )


class Bid(Base):
    __tablename__ = "bids"

    id: Mapped[int] = mapped_column(primary_key=True)
    rfq_id: Mapped[int] = mapped_column(
        ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_name: Mapped[str] = mapped_column(String(200), nullable=False)
    freight_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    origin_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    destination_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    transit_time: Mapped[int] = mapped_column(Integer, nullable=False)
    quote_validity: Mapped[int] = mapped_column(Integer, nullable=False)
    bid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    rfq: Mapped[RFQ] = relationship(back_populates="bids")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    rfq_id: Mapped[int] = mapped_column(
        ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    rfq: Mapped[RFQ] = relationship(back_populates="activity_logs")
