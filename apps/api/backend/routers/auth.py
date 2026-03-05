from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from sqlmodel import Session, select
import secrets

from apps.api.backend.config import settings
from apps.api.backend.db import get_session
from apps.api.backend.models.user import User, Role
from apps.api.backend.security.password import hash_password, verify_password
from apps.api.backend.security.jwt import decode_hs256, make_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


# -------- Schemas --------
from pydantic import BaseModel, EmailStr, Field

class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class UpdateMeIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr

class GMResetIn(BaseModel):
    user_id: int

class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: Role
    must_reset_password: bool


# -------- Helpers --------
def _set_auth_cookie(resp: Response, token: str) -> None:
    # local dev: secure=False. Em prod: secure=True + SameSite adequado.
    resp.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.auth_jwt_ttl_seconds,
        path="/",
    )

def _clear_auth_cookie(resp: Response) -> None:
    resp.delete_cookie(key=settings.auth_cookie_name, path="/")

def _get_token_from_cookie(req: Request) -> Optional[str]:
    return req.cookies.get(settings.auth_cookie_name)

def get_current_user(req: Request, session: Session = Depends(get_session)) -> User:
    token = _get_token_from_cookie(req)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_hs256(token, settings.auth_jwt_secret)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    user = session.get(User, user_id)
    if user.must_reset_password and req.url.path not in ("/auth/me", "/auth/change-password", "/auth/logout"):
        raise HTTPException(status_code=403, detail="Password reset required")

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

def require_gm(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.GM:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="GM only")
    return user


# -------- Routes --------
@router.post("/register", response_model=UserOut, status_code=201)
def register(data: RegisterIn, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        name=data.name,
        email=str(data.email).lower(),
        password_hash=hash_password(data.password),
        role=Role.PLAYER,  # papel fixo no cadastro
        must_reset_password=False,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserOut.model_validate(user, from_attributes=True)


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, resp: Response, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == str(data.email).lower())).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = make_access_token(
        sub=str(user.id),
        secret=settings.auth_jwt_secret,
        issuer=settings.auth_jwt_issuer,
        ttl_seconds=settings.auth_jwt_ttl_seconds,
        extra={"role": user.role},
    )
    _set_auth_cookie(resp, token)
    return UserOut.model_validate(user, from_attributes=True)


@router.post("/logout")
def logout(resp: Response):
    _clear_auth_cookie(resp)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user, from_attributes=True)


@router.patch("/me", response_model=UserOut)
def update_me(
    data: UpdateMeIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    new_email = str(data.email).strip().lower()
    if new_email != getattr(user, "email", ""):
        existing = session.exec(select(User).where(User.email == new_email)).first()
        if existing and existing.id != user.id:
            raise HTTPException(status_code=409, detail="Email already registered")
    user.name = data.name.strip()
    user.email = new_email
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserOut.model_validate(user, from_attributes=True)


@router.post("/change-password")
def change_password(
    data: ChangePasswordIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is wrong")

    user.password_hash = hash_password(data.new_password)
    user.must_reset_password = False
    session.add(user)
    session.commit()
    return {"ok": True}


@router.post("/gm/reset-password")
def gm_reset_password(
    data: GMResetIn,
    gm: User = Depends(require_gm),
    session: Session = Depends(get_session),
):
    target = session.get(User, data.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == Role.GM:
        raise HTTPException(status_code=400, detail="Cannot reset GM password here")

    temp_password = secrets.token_urlsafe(12)
    target.password_hash = hash_password(temp_password)
    target.must_reset_password = True

    session.add(target)
    session.commit()

    # GM entrega essa senha temporária fora do sistema (WhatsApp etc.)
    return {"user_id": target.id, "temp_password": temp_password, "must_reset_password": True}
