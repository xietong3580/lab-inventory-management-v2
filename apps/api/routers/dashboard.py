"""
仪表盘数据 API 路由（骨架）
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db, Product, Transaction, AuditLog

router = APIRouter()

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """获取仪表盘统计数据（骨架实现）"""
    # 产品总数
    total_products = db.query(func.count(Product.id)).scalar() or 0

    # 正常库存产品数
    normal_stock = db.query(func.count(Product.id)).filter(Product.status == "正常").scalar() or 0

    # 低库存产品数
    low_stock = db.query(func.count(Product.id)).filter(Product.status == "低库存").scalar() or 0

    # 近期交易记录数（最近7天）
    # 注意：这里需要根据实际时间字段计算，暂时返回总数
    recent_transactions = db.query(func.count(Transaction.id)).scalar() or 0

    # 近期审计日志数（最近7天）
    recent_audit_logs = db.query(func.count(AuditLog.id)).scalar() or 0

    return {
        "total_products": total_products,
        "normal_stock_count": normal_stock,
        "low_stock_count": low_stock,
        "recent_transactions_count": min(recent_transactions, 50),  # 限制最大值
        "recent_audit_logs_count": min(recent_audit_logs, 200),  # 限制最大值
    }

@router.get("/recent-transactions")
def get_recent_transactions(db: Session = Depends(get_db)):
    """获取近期交易记录（骨架）"""
    transactions = db.query(Transaction).order_by(Transaction.created_at.desc()).limit(10).all()
    return [txn.to_dict() for txn in transactions]

@router.get("/low-stock-alerts")
def get_low_stock_alerts(db: Session = Depends(get_db)):
    """获取低库存预警（骨架）"""
    low_stock_products = db.query(Product).filter(Product.status == "低库存").limit(10).all()
    return [product.to_dict() for product in low_stock_products]