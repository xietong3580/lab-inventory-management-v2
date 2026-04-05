"""
交易记录 API 路由（骨架）
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db, Transaction

router = APIRouter()

@router.get("/")
def get_transactions(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取交易记录列表（骨架实现）"""
    transactions = db.query(Transaction).offset(skip).limit(limit).all()
    return [txn.to_dict() for txn in transactions]

@router.post("/")
def create_transaction():
    """创建交易记录（骨架）"""
    return {"message": "交易记录创建接口（骨架）"}

@router.get("/{transaction_id}")
def get_transaction(transaction_id: str):
    """获取单个交易记录（骨架）"""
    return {"message": f"获取交易记录 {transaction_id}（骨架）"}

@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: str):
    """删除交易记录（骨架）"""
    return {"message": f"删除交易记录 {transaction_id}（骨架）"}

@router.post("/{transaction_id}/reverse")
def reverse_transaction(transaction_id: str):
    """撤销交易记录（骨架）"""
    return {"message": f"撤销交易记录 {transaction_id}（骨架）"}