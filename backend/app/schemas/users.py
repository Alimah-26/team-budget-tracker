from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

UserRole = Literal["admin", "employee"]


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_id: Optional[int] = Field(default=None, gt=0)
    role: Optional[UserRole] = None

    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set:
            raise ValueError("Provide team_id or role")

        if "role" in self.model_fields_set and self.role is None:
            raise ValueError("Role cannot be null")

        return self


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    team_id: Optional[int] = None


class CurrentUserResponse(UserResponse):
    team_name: Optional[str] = None