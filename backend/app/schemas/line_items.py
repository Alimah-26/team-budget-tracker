from decimal import Decimal
from typing import Annotated, Optional
from pydantic import (
    AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints,
    model_validator,
)
from app.core.currencies import supported_currency

MoneyAmount = Annotated[
    Decimal, Field(gt=0, max_digits=14, decimal_places=2)
    ]

NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def normalize_currency(value):
    return value.strip().upper() if isinstance(value, str) else value


CurrencyCode = Annotated[
    str,
    BeforeValidator(normalize_currency),
    StringConstraints(pattern=r"^[A-Z]{3}$"),
    AfterValidator(supported_currency),
]

class BudgetLineItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: NonEmptyText = Field(..., json_schema_extra={"example": "CW1-001"})
    description: NonEmptyText
    purpose: NonEmptyText
    amount: MoneyAmount
    currency: CurrencyCode = Field(..., json_schema_extra={"example": "NGN"})


class LineItemCreate(BudgetLineItemCreate):
    budget_id: int = Field(gt=0)


class LineItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Optional[NonEmptyText] = None
    description: Optional[NonEmptyText] = None
    purpose: Optional[NonEmptyText] = None
    amount: Optional[MoneyAmount] = None
    currency: Optional[CurrencyCode] = None

    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one line item field")
        if any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("Line item fields cannot be null")
        return self


class LineItemResponse(BaseModel):
    id: int
    budget_id: int
    code: str
    description: str
    purpose: str
    amount: Decimal
    currency: str


class LineItemListResponse(BaseModel):
    line_items: list[LineItemResponse]


class ImportRowError(BaseModel):
    row: int
    error: str


class ImportResponse(BaseModel):
    success: bool
    dry_run: bool
    total_rows: int
    imported_count: int = 0
    errors: list[ImportRowError] = Field(default_factory=list)


class CurrencyResponse(BaseModel):
    code: str
    name: str
