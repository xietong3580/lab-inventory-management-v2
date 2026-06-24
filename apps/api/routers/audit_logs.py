"""
审计日志 API 路由（骨架）
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db, AuditLog, User
from auth import get_current_user, require_admin

router = APIRouter()

@router.get("/")
def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取审计日志列表（需登录）"""
    logs = db.query(AuditLog).offset(skip).limit(limit).all()
    return [log.to_dict() for log in logs]

@router.post("/")
def create_audit_log(current_user: User = Depends(require_admin)):
    """创建审计日志（骨架，需管理员权限）"""
    return {"message": "审计日志创建接口（骨架）"}

@router.get("/{log_id}")
def get_audit_log(log_id: str, current_user: User = Depends(get_current_user)):
    """获取单个审计日志（需登录）"""
    return {"message": f"获取审计日志 {log_id}（骨架）"}