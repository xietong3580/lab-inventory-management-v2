"""
Pydantic 数据模型定义
用于请求和响应验证
"""

from pydantic import BaseModel, Field
from typing import Optional

# 产品相关模型
class ProductBase(BaseModel):
    sku: str
    name: str
    category: str = "耗材"
    currentStock: int = 0
    minStock: int = 0
    unit: str = "个"
    location: Optional[str] = ""

class ProductCreate(ProductBase):
    """创建产品请求模型"""
    pass

class ProductUpdate(BaseModel):
    """更新产品请求模型"""
    sku: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    currentStock: Optional[int] = None
    minStock: Optional[int] = None
    unit: Optional[str] = None
    location: Optional[str] = None

class ProductResponse(ProductBase):
    """产品响应模型"""
    id: str  # 格式: prod-000001
    status: str  # 正常/低库存
    lastUpdated: str

    class Config:
        from_attributes = True

# 交易记录相关模型
class TransactionBase(BaseModel):
    product_id: str
    product_name: str
    type: str  # '入库'/'出库'
    quantity: int
    unit: str
    date: str
    operator: str
    status: str = "completed"
    notes: Optional[str] = ""

class TransactionCreate(TransactionBase):
    """创建交易记录请求模型"""
    pass

class TransactionResponse(TransactionBase):
    """交易记录响应模型"""
    id: str  # 格式: txn-000001

    class Config:
        from_attributes = True

# 审计日志相关模型
class AuditLogBase(BaseModel):
    action_type: str
    product_name: Optional[str] = None
    product_id: Optional[str] = None
    operator: str = "系统"
    timestamp: str
    details: Optional[str] = None

class AuditLogCreate(AuditLogBase):
    """创建审计日志请求模型"""
    pass

class AuditLogResponse(AuditLogBase):
    """审计日志响应模型"""
    id: str  # 格式: log-000001

    class Config:
        from_attributes = True

# 仪表盘数据模型
class DashboardStats(BaseModel):
    total_products: int
    normal_stock_count: int
    low_stock_count: int
    recent_transactions_count: int
    recent_audit_logs_count: int