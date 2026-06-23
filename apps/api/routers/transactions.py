"""
交易记录 API 路由
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db, Transaction, Product, AuditLog
from schemas import TransactionCreate

router = APIRouter()

@router.get("/")
def get_transactions(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取交易记录列表"""
    transactions = db.query(Transaction).offset(skip).limit(limit).all()
    return [txn.to_dict() for txn in transactions]

@router.post("/", response_model=dict)
def create_transaction(transaction_data: TransactionCreate, db: Session = Depends(get_db)):
    """创建交易记录并更新产品库存"""
    # 从模型中获取字段（支持别名）
    product_id = transaction_data.product_id
    type_ = transaction_data.type
    quantity = transaction_data.quantity
    operator = transaction_data.operator
    notes = transaction_data.notes or ''

    # 验证类型
    if type_ not in ['入库', '出库']:
        raise HTTPException(status_code=400, detail="交易类型必须是'入库'或'出库'")

    # 验证数量有效性
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="数量必须大于0")

    # 解析产品ID（格式：prod-000001）
    try:
        if product_id.startswith('prod-'):
            product_db_id = int(product_id[5:])
        else:
            product_db_id = int(product_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的产品ID格式")

    # 查找产品
    product = db.query(Product).filter(Product.id == product_db_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")

    # 出库校验：库存不能为负数
    if type_ == '出库':
        if product.current_stock < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"库存不足。当前库存: {product.current_stock} {product.unit}，出库数量: {quantity} {product.unit}"
            )

    # 计算库存变化
    stock_delta = quantity if type_ == '入库' else -quantity
    new_stock = product.current_stock + stock_delta

    # 更新产品库存
    product.current_stock = new_stock
    product.last_updated = datetime.now().strftime("%Y-%m-%d")
    # 重新计算库存状态
    product.status = "低库存" if product.current_stock <= product.min_stock else "正常"

    # 创建交易记录
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M")
    transaction = Transaction(
        product_id=product_db_id,
        product_name=product.name,
        type=type_,
        quantity=quantity,
        unit=product.unit,
        date=current_time,
        operator=operator,
        status='completed',
        notes=notes
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    # 创建审计日志
    audit_log = AuditLog(
        action_type='TRANSACTION_ADD',
        product_name=product.name,
        product_id=f"prod-{product_db_id:06d}",
        operator=operator,
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        details=f"创建{type_}交易，数量: {quantity} {product.unit}"
    )
    db.add(audit_log)
    db.commit()

    return transaction.to_dict()

@router.get("/{transaction_id}")
def get_transaction(transaction_id: str, db: Session = Depends(get_db)):
    """获取单个交易记录"""
    # 解析交易ID（格式：txn-000001）
    try:
        if transaction_id.startswith('txn-'):
            transaction_db_id = int(transaction_id[4:])
        else:
            transaction_db_id = int(transaction_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的交易记录ID格式")

    transaction = db.query(Transaction).filter(Transaction.id == transaction_db_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="交易记录不存在")

    return transaction.to_dict()

@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: str):
    """删除交易记录（骨架）"""
    return {"message": f"删除交易记录 {transaction_id}（骨架）"}

@router.post("/{transaction_id}/reverse")
def reverse_transaction(transaction_id: str, request_data: dict = None, db: Session = Depends(get_db)):
    """撤销交易记录并回滚库存"""
    # 提取撤销操作人
    reversed_by = '系统'
    if request_data and 'reversedBy' in request_data:
        reversed_by = request_data['reversedBy']

    # 解析交易ID（格式：txn-000001）
    try:
        if transaction_id.startswith('txn-'):
            transaction_db_id = int(transaction_id[4:])
        else:
            transaction_db_id = int(transaction_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的交易记录ID格式")

    # 查找交易记录
    transaction = db.query(Transaction).filter(Transaction.id == transaction_db_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="交易记录不存在")

    # 验证交易状态
    if transaction.status != 'completed':
        if transaction.status == 'reversed':
            raise HTTPException(status_code=400, detail="此交易记录状态已是'已撤销'，不能重复撤销")
        raise HTTPException(status_code=400, detail="只能撤销状态为'已完成'的交易记录")

    # 查找对应产品
    product = db.query(Product).filter(Product.id == transaction.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail=f"产品不存在 (ID: {transaction.product_id})")

    # 计算回滚库存量
    # 原类型为'入库' → 撤销时库存减少 quantity
    # 原类型为'出库' → 撤销时库存增加 quantity
    stock_delta = -transaction.quantity if transaction.type == '入库' else transaction.quantity
    new_stock = product.current_stock + stock_delta

    # 安全校验：撤销入库时，确保当前库存足够扣减（不能为负）
    if new_stock < 0:
        raise HTTPException(
            status_code=400,
            detail=f"库存安全规则不允许撤销：撤销此{transaction.type}操作会导致库存不足。当前库存: {product.current_stock} {product.unit}，撤销后将减少 {transaction.quantity} {product.unit}，库存将变为 {new_stock} {product.unit}（不能为负数）"
        )

    # 更新产品库存
    product.current_stock = new_stock
    product.last_updated = datetime.now().strftime("%Y-%m-%d")
    product.status = "低库存" if product.current_stock <= product.min_stock else "正常"

    # 更新交易记录状态
    transaction.status = 'reversed'
    transaction.reversed_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    transaction.reversed_by = reversed_by

    db.commit()
    db.refresh(transaction)

    # 创建审计日志（交易撤销）
    audit_log = AuditLog(
        action_type='TRANSACTION_REVERSE',
        product_name=product.name,
        product_id=f"prod-{transaction.product_id:06d}",
        operator=reversed_by,
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        details=f"撤销{transaction.type}交易，数量: {transaction.quantity} {product.unit}"
    )
    db.add(audit_log)
    db.commit()

    return transaction.to_dict()