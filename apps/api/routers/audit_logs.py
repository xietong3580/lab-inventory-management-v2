"""
审计日志 API 路由

GET /api/audit-logs/ 提供服务端分页与筛选：
  - 稳定排序：timestamp DESC, id DESC（最新日志始终在第一页）
  - 筛选：action_type（精确）、product_name（包含）、operator（包含）、
          time_range（all/today/week/month）、start_date/end_date（可与快捷范围叠加）
  - 返回：items / total / page / page_size / total_pages（total 为筛选后的真实总数）
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db, AuditLog, User
from auth import get_current_user, require_admin

router = APIRouter()

# 分页边界
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# 合法的快捷时间范围
_TIME_RANGES = {"all", "today", "week", "month"}


def _is_date(value):
    """校验 YYYY-MM-DD 格式，非法返回 False"""
    if not value:
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _apply_filters(query, action_type, product_name, operator, time_range, start_date, end_date):
    """在查询上叠加服务端筛选条件（全部使用参数化绑定，不拼接用户输入）。

    时间筛选语义与前端 filterLogsByTimeRange 保持一致：
      - 快捷范围 today/week/month 计算一个起始时间点（当日/前7日/前30日的 00:00:00）
      - 自定义 start_date / end_date 可与快捷范围叠加（AND 求交集）
    """
    # action_type 精确匹配
    if action_type:
        query = query.filter(AuditLog.action_type == action_type)

    # product_name 包含匹配
    if product_name:
        query = query.filter(AuditLog.product_name.ilike(f"%{product_name}%"))

    # operator 包含匹配
    if operator:
        query = query.filter(AuditLog.operator.ilike(f"%{operator}%"))

    # 快捷时间范围
    if time_range and time_range in _TIME_RANGES and time_range != "all":
        now = datetime.now()
        if time_range == "today":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_range == "week":
            start = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
        else:  # month
            start = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(AuditLog.timestamp >= start.strftime("%Y-%m-%d %H:%M:%S"))

    # 自定义起止日期（可与快捷范围叠加）
    if _is_date(start_date):
        query = query.filter(AuditLog.timestamp >= f"{start_date} 00:00:00")
    if _is_date(end_date):
        query = query.filter(AuditLog.timestamp <= f"{end_date} 23:59:59")

    return query


@router.get("/")
def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    action_type: str = None,
    product_name: str = None,
    operator: str = None,
    time_range: str = "all",
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取审计日志列表（服务端分页 + 筛选，需登录；viewer/admin 均可查看）"""
    query = db.query(AuditLog)
    query = _apply_filters(query, action_type, product_name, operator, time_range, start_date, end_date)

    # 筛选后的真实总数
    total = query.count()

    # 稳定排序：时间倒序，同一时间按 id 倒序（保证最新记录总在第一页）
    query = query.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()

    return {
        "items": [log.to_dict() for log in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }

@router.post("/")
def create_audit_log(current_user: User = Depends(require_admin)):
    """创建审计日志（骨架，需管理员权限）"""
    return {"message": "审计日志创建接口（骨架）"}

@router.get("/{log_id}")
def get_audit_log(log_id: str, current_user: User = Depends(get_current_user)):
    """获取单个审计日志（需登录）"""
    return {"message": f"获取审计日志 {log_id}（骨架）"}
