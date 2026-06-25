"""
认证 API 路由：登录、获取当前用户、修改自己密码
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, User
from auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    verify_password,
    get_password_hash,
)
from schemas import ChangePassword

router = APIRouter()


# ---- 请求/响应模型 ----

class LoginRequest(BaseModel):
    username: str
    password: str


class UserInfo(BaseModel):
    id: str
    username: str
    displayName: str
    role: str
    isActive: bool

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo


class MessageResponse(BaseModel):
    message: str


# ---- 路由 ----

@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """用户登录，返回 JWT token 和用户信息，并更新 last_login"""
    user = authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

    # 更新最后登录时间
    user.last_login = datetime.utcnow().isoformat()
    db.commit()
    db.refresh(user)

    access_token = create_access_token(data={"sub": user.username})

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserInfo(
            id=user.to_dict()["id"],
            username=user.username,
            displayName=user.display_name or user.username,
            role=user.role,
            isActive=bool(user.is_active) if user.is_active is not None else True,
        ),
    )


@router.get("/me", response_model=UserInfo)
def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息（需要 Bearer token）"""
    return UserInfo(
        id=current_user.to_dict()["id"],
        username=current_user.username,
        displayName=current_user.display_name or current_user.username,
        role=current_user.role,
        isActive=bool(current_user.is_active) if current_user.is_active is not None else True,
    )


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    body: ChangePassword,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """当前登录用户修改自己的密码"""
    # old_password 必须校验当前用户密码
    if not current_user.password_hash or not verify_password(
        body.old_password, current_user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前密码错误",
        )

    # 新密码 bcrypt hash 后保存
    current_user.password_hash = get_password_hash(body.new_password)
    db.commit()
    db.refresh(current_user)

    return MessageResponse(message="密码修改成功")
