from typing import Optional
from pydantic import BaseModel, EmailStr
from app.schemas.users import UserResponse


class GoogleAuthRequest(BaseModel):
    id_token: str


class TokenPayload(BaseModel):
    sub: str  
    email: str
    role: str
    team_id: Optional[int] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
