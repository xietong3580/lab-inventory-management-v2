"""
用户管理 API 路由（最小可用版）
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db, User
from auth import get_current_user

router = APIRouter()

# 默认管理员用户（数据库为空时的兜底数据）
DEFAULT_ADMIN = {
    "username": "admin",
    "email": "admin@example.com",
    "role": "管理员",
    "status": "活跃",
    "last_login": datetime.now().strftime("%Y-%m-%d %H:%M"),
}


@router.get("/")
def get_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取用户列表（需登录）"""
    users = db.query(User).offset(skip).limit(limit).all()

    if users:
        return [user.to_dict() for user in users]

    # 数据库无用户时返回默认管理员（最小可用兜底）
    return [{
        "id": "user-default-admin",
        "username": DEFAULT_ADMIN["username"],
        "email": DEFAULT_ADMIN["email"],
        "role": DEFAULT_ADMIN["role"],
        "status": DEFAULT_ADMIN["status"],
        "lastLogin": DEFAULT_ADMIN["last_login"],
    }]


@router.get("/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """获取单个用户（需登录）"""
    # 解析用户ID（格式：user-000001 或 user-default-admin）
    if user_id == "user-default-admin":
        return {
            "id": "user-default-admin",
            "username": DEFAULT_ADMIN["username"],
            "email": DEFAULT_ADMIN["email"],
            "role": DEFAULT_ADMIN["role"],
            "status": DEFAULT_ADMIN["status"],
            "lastLogin": DEFAULT_ADMIN["last_login"],
        }

    try:
        if user_id.startswith("user-"):
            db_id = int(user_id[5:])
        else:
            db_id = int(user_id)
    except ValueError:
        # 非数字ID，返回404
        raise HTTPException(status_code=404, detail="用户不存在")

    user = db.query(User).filter(User.id == db_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    return user.to_dict()
