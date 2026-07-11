"""
仪表盘数据 API 路由
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta

from database import get_db, Product, Transaction, AuditLog, User
from auth import get_current_user

router = APIRouter()

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """获取仪表盘统计数据（需登录）"""
    # 产品总数
    total_products = db.query(func.count(Product.id)).scalar() or 0

    # 正常库存产品数（实时计算：current_stock > min_stock）
    normal_stock = db.query(func.count(Product.id)).filter(Product.current_stock > Product.min_stock).scalar() or 0

    # 低库存产品数（实时计算：current_stock <= min_stock）
    low_stock = db.query(func.count(Product.id)).filter(Product.current_stock <= Product.min_stock).scalar() or 0

    # 近期交易记录数（最近7天，按 date 字段过滤）
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    recent_transactions = db.query(func.count(Transaction.id)).filter(
        Transaction.date >= seven_days_ago
    ).scalar() or 0

    # 近期审计日志数（最近7天，按 timestamp 字段过滤）
    recent_audit_logs = db.query(func.count(AuditLog.id)).filter(
        AuditLog.timestamp >= seven_days_ago
    ).scalar() or 0

    return {
        "total_products": total_products,
        "normal_stock_count": normal_stock,
        "low_stock_count": low_stock,
        "recent_transactions_count": recent_transactions,
        "recent_audit_logs_count": recent_audit_logs,
    }

@router.get("/recent-transactions")
def get_recent_transactions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """获取近期交易记录（需登录）"""
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    transactions = db.query(Transaction).filter(
        Transaction.date >= seven_days_ago
    ).order_by(Transaction.created_at.desc()).limit(10).all()
    return [txn.to_dict() for txn in transactions]

@router.get("/low-stock-alerts")
def get_low_stock_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """获取低库存预警（需登录，返回全量低库存产品供前端统计与展示）"""
    low_stock_products = db.query(Product).filter(Product.current_stock <= Product.min_stock).all()
    return [product.to_dict() for product in low_stock_products]