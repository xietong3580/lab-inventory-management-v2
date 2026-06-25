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
    migrate_users()

def migrate_users():
    """迁移 users 表：检查并逐列添加缺失字段（安全迁移，不删除数据）"""
    import sqlite3
    import os

    db_path = os.path.join(BASE_DIR, 'inventory.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("PRAGMA table_info(users)")
    existing_columns = {row[1] for row in cursor.fetchall()}

    # 需要按需添加的列（列名, SQLite 类型）
    new_columns = [
        ("password_hash", "VARCHAR(128)"),
        ("display_name", "VARCHAR(100)"),
        ("is_active", "BOOLEAN DEFAULT 1"),
    ]

    for col_name, col_type in new_columns:
        if col_name not in existing_columns:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            print(f"  [迁移] users 表已添加列: {col_name} ({col_type})")

    conn.commit()
    conn.close()


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
        # 实时计算库存状态，不信任数据库中可能过期的 status 字段
        status = "低库存" if self.current_stock <= self.min_stock else "正常"
        return {
            "id": f"prod-{self.id:06d}",  # 与前端 ID 格式对齐
            "sku": self.sku,
            "name": self.name,
            "category": self.category,
            "currentStock": self.current_stock,
            "minStock": self.min_stock,
            "unit": self.unit,
            "location": self.location or "",
            "status": status,
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
            "productId": f"prod-{self.product_id:06d}",
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

class User(Base):
    """用户模型（最小可用版，含 bcrypt 密码哈希）"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(128), nullable=True)  # bcrypt 哈希密码
    display_name = Column(String(100), nullable=True)    # 显示名称
    email = Column(String(100), nullable=True)
    role = Column(String(30), nullable=False, default="viewer")
    is_active = Column(Boolean, nullable=False, default=True)  # 是否激活
    status = Column(String(20), nullable=False, default="活跃")  # 活跃/停用
    last_login = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.now)

    def to_dict(self):
        """转换为字典格式（不输出 password_hash）"""
        return {
            "id": f"user-{self.id:06d}",
            "username": self.username,
            "display_name": self.display_name or self.username,
            "email": self.email or "",
            "role": self.role,
            "is_active": bool(self.is_active) if self.is_active is not None else True,
            "status": self.status,
            "lastLogin": self.last_login or "",
        }