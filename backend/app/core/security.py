from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt # type: ignore
from google.oauth2 import id_token # type: ignore
from google.auth.transport import requests as google_requests # type: ignore
from fastapi import HTTPException, status
from app.core.config import COMPANY_DOMAIN, GOOGLE_CLIENT_ID, JWT_SECRET

SECRET_KEY = JWT_SECRET
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
GOOGLE_CLOCK_SKEW_SECONDS = 5
ALLOWED_DOMAIN = COMPANY_DOMAIN


def require_signing_key():
    if len(SECRET_KEY) < 32:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Configure JWT_SECRET with at least 32 characters on the server.",
        )


def verify_google_token(token: str) -> dict:
    if not GOOGLE_CLIENT_ID or not ALLOWED_DOMAIN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google client ID and company domain must be configured.",
        )

    try:
        id_info = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=GOOGLE_CLOCK_SKEW_SECONDS,
        )

       
        user_domain = (id_info.get("hd") or "").lower()

        if user_domain != ALLOWED_DOMAIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only company Google Workspace accounts are allowed.",
            )

        if id_info.get("email_verified") is not True:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="A verified Google email is required.",
            )

        return {
            "google_sub": id_info["sub"],
            "email": id_info["email"],
            "full_name": id_info.get("name", id_info["email"].split("@")[0]),
            "domain": user_domain,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google ID token: {str(e)}",
        )

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    require_signing_key()
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta is not None else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    require_signing_key()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate session token",
        )
