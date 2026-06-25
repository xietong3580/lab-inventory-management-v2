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
    product_id: str = Field(..., alias="productId")
    type: str  # '入库'/'出库'
    quantity: int
    operator: str
    notes: Optional[str] = ""
    status: str = "completed"

    class Config:
        populate_by_name = True  # 允许同时使用字段名和别名

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

# 用户管理相关模型（Step 7-2）
class UserCreate(BaseModel):
    """创建用户请求模型"""
    username: str = Field(..., min_length=1, max_length=50)
    display_name: Optional[str] = None
    email: Optional[str] = None
    role: str = "viewer"
    password: str = Field(..., min_length=6, max_length=128)


class UserUpdate(BaseModel):
    """编辑用户请求模型"""
    username: Optional[str] = Field(None, min_length=1, max_length=50)
    display_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class UserStatusUpdate(BaseModel):
    """用户状态更新请求模型"""
    is_active: bool


class UserPasswordReset(BaseModel):
    """重置密码请求模型"""
    new_password: str = Field(..., min_length=6, max_length=128)


# 仪表盘数据模型
class DashboardStats(BaseModel):
    total_products: int
    normal_stock_count: int
    low_stock_count: int
    recent_transactions_count: int
    recent_audit_logs_count: int