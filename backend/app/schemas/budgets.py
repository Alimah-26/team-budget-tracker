from app.schemas.line_items import BudgetLineItemCreate, LineItemResponse
from decimal import Decimal
from typing import Annotated, Optional
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class BudgetCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    line_items: list[BudgetLineItemCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_codes(self):
        codes = [item.code for item in self.line_items]
        if len(codes) != len(set(codes)):
            raise ValueError("Line item codes must be unique within a budget")
        return self


class BudgetResponse(BaseModel):
    id: int
    team_id: int
    period: str


class BudgetSummaryItem(BaseModel):
    budget_id: Optional[int] = None
    team_id: int
    team_name: str
    currency: Optional[str] = None
    total_amount: Decimal


class BudgetSummaryResponse(BaseModel):
    period: str
    summaries: list[BudgetSummaryItem]

class BudgetLineItemResponse(LineItemResponse):
    source: str

class CurrencyTotal(BaseModel):
    currency: str
    total_amount: Decimal


class BudgetDetailResponse(BudgetResponse):
    line_items: list[BudgetLineItemResponse]
    totals: list[CurrencyTotal]
