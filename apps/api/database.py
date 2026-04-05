"""
数据库配置和模型定义
使用 SQLite + SQLAlchemy
"""

import os
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# 数据库文件路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'inventory.db')}"

# 创建引擎和会话
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """获取数据库会话依赖"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """初始化数据库，创建所有表"""
    Base.metadata.create_all(bind=engine)
    print(f"数据库已初始化: {DATABASE_URL}")

# 模型定义
class Product(Base):
    """产品模型"""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False, default="耗材")
    current_stock = Column(Integer, nullable=False, default=0)
    min_stock = Column(Integer, nullable=False, default=0)
    unit = Column(String(20), nullable=False, default="个")
    location = Column(String(100), nullable=True)
    status = Column(String(20), nullable=False, default="正常")  # 正常/低库存
    last_updated = Column(String(20), nullable=True)  # YYYY-MM-DD 格式

    # 额外字段
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    def to_dict(self):
        """转换为字典格式（与前端数据结构对齐）"""
        return {
            "id": f"prod-{self.id:06d}",  # 与前端 ID 格式对齐
            "sku": self.sku,
            "name": self.name,
            "category": self.category,
            "currentStock": self.current_stock,
            "minStock": self.min_stock,
            "unit": self.unit,
            "location": self.location or "",
            "status": self.status,
            "lastUpdated": self.last_updated or "",
        }

class Transaction(Base):
    """交易记录模型"""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, nullable=False)  # 关联产品ID
    product_name = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False)  # '入库'/'出库'
    quantity = Column(Integer, nullable=False)
    unit = Column(String(20), nullable=False)
    date = Column(String(50), nullable=False)  # YYYY-MM-DD HH:MM 格式
    operator = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="completed")  # completed/pending/reversed
    notes = Column(Text, nullable=True)

    # 撤销相关字段
    reversed_at = Column(String(50), nullable=True)
    reversed_by = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.now)

    def to_dict(self):
        """转换为字典格式"""
        return {
            "id": f"txn-{self.id:06d}",
            "productName": self.product_name,
            "type": self.type,
            "quantity": self.quantity,
            "unit": self.unit,
            "date": self.date,
            "operator": self.operator,
            "status": self.status,
            "notes": self.notes or "",
        }

class AuditLog(Base):
    """审计日志模型"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action_type = Column(String(50), nullable=False)  # PRODUCT_ADD, PRODUCT_UPDATE, etc.
    product_name = Column(String(100), nullable=True)
    product_id = Column(String(50), nullable=True)
    operator = Column(String(50), nullable=False, default="系统")
    timestamp = Column(String(50), nullable=False)  # YYYY-MM-DD HH:MM:SS 格式
    details = Column(Text, nullable=True)  # JSON 格式的详细信息

    created_at = Column(DateTime, default=datetime.now)

    def to_dict(self):
        """转换为字典格式"""
        return {
            "id": f"log-{self.id:06d}",
            "actionType": self.action_type,
            "productName": self.product_name or "",
            "productId": self.product_id or "",
            "operator": self.operator,
            "timestamp": self.timestamp,
            "details": self.details,
        }