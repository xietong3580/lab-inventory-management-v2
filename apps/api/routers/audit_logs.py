"""
审计日志 API 路由（骨架）
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db, AuditLog

router = APIRouter()

@router.get("/")
def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取审计日志列表（骨架实现）"""
    logs = db.query(AuditLog).offset(skip).limit(limit).all()
    return [log.to_dict() for log in logs]

@router.post("/")
def create_audit_log():
    """创建审计日志（骨架）"""
    return {"message": "审计日志创建接口（骨架）"}

@router.get("/{log_id}")
def get_audit_log(log_id: str):
    """获取单个审计日志（骨架）"""
    return {"message": f"获取审计日志 {log_id}（骨架）"}