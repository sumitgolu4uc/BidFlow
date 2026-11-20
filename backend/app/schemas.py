from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RFQCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    rfq_name: str = Field(min_length=1, max_length=200)
    reference_id: str = Field(min_length=1, max_length=100)
    start_time: datetime
    original_close_time: datetime
    current_close_time: datetime | None = None
    forced_close_time: datetime
    pickup_date: date
    trigger_window_minutes: int = Field(gt=0)
    extension_duration_minutes: int = Field(gt=0)
    trigger_type: Literal["ANY_BID", "ANY_RANK_CHANGE", "L1_RANK_CHANGE"]
    status: str = Field(default="draft", min_length=1, max_length=30)

    @field_validator("trigger_type", mode="before")
    @classmethod
    def normalize_trigger_type(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_times(self) -> "RFQCreate":
        timestamps = [
            self.start_time,
            self.original_close_time,
            self.current_close_time,
            self.forced_close_time,
        ]
        awareness = {
            timestamp.utcoffset() is not None
            for timestamp in timestamps
            if timestamp is not None
        }
        if len(awareness) > 1:
            raise ValueError("RFQ timestamps must use a consistent timezone format")
        if awareness == {False}:
            for field_name in (
                "start_time",
                "original_close_time",
                "current_close_time",
                "forced_close_time",
            ):
                timestamp = getattr(self, field_name)
                if timestamp is not None:
                    setattr(self, field_name, timestamp.replace(tzinfo=timezone.utc))

        if self.start_time >= self.original_close_time:
            raise ValueError("start_time must be earlier than original_close_time")

        if self.current_close_time is None:
            self.current_close_time = self.original_close_time
        if self.current_close_time < self.original_close_time:
            raise ValueError("current_close_time cannot be earlier than original_close_time")
        if self.forced_close_time <= self.original_close_time:
            raise ValueError("forced_close_time must be later than original_close_time")
        if self.current_close_time > self.forced_close_time:
            raise ValueError("current_close_time cannot be later than forced_close_time")
        return self


class RFQResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rfq_name: str
    reference_id: str
    start_time: datetime
    original_close_time: datetime
    current_close_time: datetime
    forced_close_time: datetime
    pickup_date: date
    trigger_window_minutes: int
    extension_duration_minutes: int
    trigger_type: str
    status: str
    created_at: datetime


class BidCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    supplier_name: str = Field(min_length=1, max_length=200)
    freight_charges: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    origin_charges: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    destination_charges: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    transit_time: int = Field(gt=0, description="Transit duration in days")
    quote_validity: int = Field(gt=0, description="Quote validity duration in days")
    bid_amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class BidResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rfq_id: int
    supplier_name: str
    freight_charges: Decimal
    origin_charges: Decimal
    destination_charges: Decimal
    transit_time: int
    quote_validity: int
    bid_amount: Decimal
    created_at: datetime


class ActivityLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rfq_id: int
    activity_type: str
    description: str
    created_at: datetime
