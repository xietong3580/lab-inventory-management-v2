"""
认证 API 路由：登录、获取当前用户
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, User
from auth import authenticate_user, create_access_token, get_current_user

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


# ---- 路由 ----

@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """用户登录，返回 JWT token 和用户信息"""
    user = authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

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
