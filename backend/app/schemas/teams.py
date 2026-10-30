from datetime import datetime
from typing import Optional

from typing import Annotated
from pydantic import BaseModel, StringConstraints

class TeamBase(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

class TeamCreate(TeamBase):
    pass

class TeamResponse(TeamBase):
    id: int
    created_at: Optional[datetime] = None
    created_by: Optional[int] = None

class TeamListResponse(BaseModel):
    teams: list[TeamResponse]
