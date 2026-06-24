"""
认证模块：JWT token 创建与验证、bcrypt 密码校验、用户依赖注入
"""

import bcrypt
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db, User

# JWT 配置
SECRET_KEY = "inventory-v2-jwt-secret-key-2026"  # 生产环境应使用环境变量
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 小时

# HTTP Bearer 安全方案
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """使用 bcrypt 校验密码（与 seed.py 的 hashpw 兼容）"""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def get_password_hash(plain_password: str) -> str:
    """使用 bcrypt 生成密码哈希"""
    return bcrypt.hashpw(
        plain_password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """验证用户名和密码，返回用户对象或 None"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None
    if not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    if not user.is_active:
        return None
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """从 Bearer token 解析当前用户（依赖注入）"""
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被停用",
        )
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """要求当前用户为管理员角色（英文 role == 'admin'）"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    return current_user
