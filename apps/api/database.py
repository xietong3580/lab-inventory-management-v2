"""
数据库配置和模型定义
使用 SQLite + SQLAlchemy
"""

import os
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# 数据库文件路径（可通过 INVENTORY_DB_PATH 环境变量覆盖，用于测试隔离）
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_db_path():
    """返回数据库文件绝对路径（环境变量可覆盖，测试使用临时数据库）"""
    return os.environ.get("INVENTORY_DB_PATH") or os.path.join(BASE_DIR, 'inventory.db')

DB_PATH = get_db_path()
DATABASE_URL = f"sqlite:///{DB_PATH}"

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
    # 生产环境保护：数据库文件必须已存在，禁止自动创建空数据库
    if os.getenv("INVENTORY_ENV", "").strip().lower() == "production":
        if not os.path.exists(DB_PATH):
            raise RuntimeError(
                f"Production database not found: {DB_PATH}. "
                "When INVENTORY_ENV=production, the database file must already exist. "
                "Create the database file or check the deployment before starting the application."
            )
    Base.metadata.create_all(bind=engine)
    print(f"数据库已初始化: {DATABASE_URL}")
    migrate_users()
    migrate_products()
    migrate_transactions()
    migrate_products_sku_nonunique()
    migrate_performance_indexes()
    migrate_products_image()

def migrate_users():
    """迁移 users 表：检查并逐列添加缺失字段（安全迁移，不删除数据）"""
    import sqlite3
    import os

    db_path = get_db_path()
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


def migrate_products():
    """迁移 products 表：安全添加 P1 扩展字段（Step 10-2B）"""
    import sqlite3
    import os

    db_path = get_db_path()
    if not os.path.exists(db_path):
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.execute("PRAGMA table_info(products)")
    existing_columns = {row[1] for row in cursor.fetchall()}

    # P1 扩展字段（Step 10-2B）
    new_columns = [
        ("brand", "VARCHAR(100)"),
        ("specification", "VARCHAR(200)"),
        ("supplier", "VARCHAR(100)"),
        ("notes", "TEXT"),
        # P1 价格字段（Step 10-6C）
        ("purchase_price", "FLOAT"),
        ("sale_price", "FLOAT"),
    ]

    for col_name, col_type in new_columns:
        if col_name not in existing_columns:
            conn.execute(f"ALTER TABLE products ADD COLUMN {col_name} {col_type}")
            print(f"  [迁移] products 表已添加列: {col_name} ({col_type})")

    conn.commit()
    conn.close()


def migrate_products_image(db_path=None):
    """迁移 products 表：安全添加产品主图字段（image_path, image_updated_at）

    - 字段允许 NULL，现有产品迁移后默认 NULL（未上传图片）
    - 幂等：先检查列是否存在，不存在才 ALTER TABLE ADD COLUMN，已存在安全跳过
    - 不重建表、不删除/复制数据、不修改现有字段
    """
    import sqlite3

    path = db_path or get_db_path()
    if not os.path.exists(path):
        return

    conn = sqlite3.connect(path)
    try:
        cursor = conn.execute("PRAGMA table_info(products)")
        existing_columns = {row[1] for row in cursor.fetchall()}

        new_columns = [
            ("image_path", "VARCHAR(255)"),
            ("image_updated_at", "VARCHAR(50)"),
        ]

        for col_name, col_type in new_columns:
            if col_name not in existing_columns:
                conn.execute(f"ALTER TABLE products ADD COLUMN {col_name} {col_type}")
                print(f"  [迁移] products 表已添加列: {col_name} ({col_type})")

        conn.commit()
    finally:
        conn.close()


def migrate_transactions():
    """迁移 transactions 表：安全添加 product_id 字段（Step 10-4D）
    使用 ALTER TABLE ADD COLUMN，不删表不丢数据。
    如果列已存在则跳过。"""
    import sqlite3
    import os

    db_path = get_db_path()
    if not os.path.exists(db_path):
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.execute("PRAGMA table_info(transactions)")
    existing_columns = {row[1] for row in cursor.fetchall()}

    # product_id：关联产品 ID，允许为空以兼容历史交易
    new_columns = [
        ("product_id", "INTEGER"),
    ]

    for col_name, col_type in new_columns:
        if col_name not in existing_columns:
            conn.execute(f"ALTER TABLE transactions ADD COLUMN {col_name} {col_type}")
            print(f"  [迁移] transactions 表已添加列: {col_name} ({col_type})")

    conn.commit()
    conn.close()


def migrate_products_sku_nonunique():
    """Step 10-27C / 10-27C-fix: 安全移除 products.sku 所有唯一约束和唯一索引

    检测两种形式的唯一约束：
    1. CREATE TABLE 中 sku 列带有 UNIQUE → 重建 products 表（原 10-27C 逻辑）
    2. 独立的 CREATE UNIQUE INDEX ON products(sku) → DROP + 重建普通索引

    对空表和已有数据表均安全。幂等。
    """
    import sqlite3
    import os

    db_path = get_db_path()
    if not os.path.exists(db_path):
        return

    conn = sqlite3.connect(db_path)

    # ── 检查 1：CREATE TABLE SQL 中 sku 是否仍有 UNIQUE ──
    cursor = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='products'"
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return

    create_sql = row[0]
    table_has_sku_unique = (
        '"sku"' in create_sql or 'sku' in create_sql
    ) and 'UNIQUE' in create_sql

    if table_has_sku_unique:
        # ── 路径 A：重建表（原 10-27C 逻辑）──────
        cursor = conn.execute("PRAGMA table_info('products')")
        columns = [(r[1], r[2]) for r in cursor.fetchall()]
        if not columns:
            conn.close()
            return

        try:
            conn.execute("BEGIN TRANSACTION")
            col_defs = []
            for col_name, col_type in columns:
                if col_name == 'sku':
                    col_defs.append(f'"{col_name}" {col_type} NOT NULL')
                elif col_name == 'id':
                    col_defs.append(f'"{col_name}" {col_type} PRIMARY KEY')
                else:
                    col_defs.append(f'"{col_name}" {col_type}')

            conn.execute(
                f"CREATE TABLE products_new ({', '.join(col_defs)})"
            )
            col_names = [c[0] for c in columns]
            conn.execute(
                f"INSERT INTO products_new ({', '.join(col_names)}) "
                f"SELECT {', '.join(col_names)} FROM products"
            )
            conn.execute("DROP TABLE products")
            conn.execute("ALTER TABLE products_new RENAME TO products")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS ix_products_sku ON products (sku)"
            )
            conn.execute("COMMIT")
            print("  [迁移] products.sku UNIQUE 约束已通过重建表安全移除")
        except sqlite3.Error as e:
            conn.execute("ROLLBACK")
            print(f"  [迁移] products.sku UNIQUE 约束移除失败（已回滚）: {e}")
            raise
        finally:
            conn.close()
        return

    # ── 检查 2：PRAGMA index_list 中是否有 sku 唯一索引 ──
    # Step 10-27C-fix: 独立 UNIQUE INDEX 不会被 CREATE TABLE SQL 检测到
    cursor = conn.execute("PRAGMA index_list('products')")
    indexes = [(r[1], r[2]) for r in cursor.fetchall()]  # (name, unique)

    sku_unique_indexes = []
    for idx_name, idx_unique in indexes:
        if idx_unique == 0:
            continue
        # 检查该索引的列
        idx_cols = conn.execute(
            f"PRAGMA index_info('{idx_name}')"
        ).fetchall()
        col_names = [c[2] for c in idx_cols]  # index_info returns (rank, cid, name)
        if col_names == ['sku']:
            sku_unique_indexes.append(idx_name)

    if not sku_unique_indexes:
        conn.close()
        return

    # ── 路径 B：DROP 唯一索引 + 重建普通索引 ──
    removed = []
    skipped = []
    for idx_name in sku_unique_indexes:
        if idx_name.startswith('sqlite_autoindex_'):
            # 自动索引由列 UNIQUE 约束产生，应走路径 A 但 CREATE TABLE 未检测到？
            # 保守处理：标记跳过，不强制操作
            skipped.append(idx_name)
        else:
            try:
                conn.execute(f"DROP INDEX {idx_name}")
                removed.append(idx_name)
            except sqlite3.Error as e:
                print(f"  [迁移] DROP INDEX {idx_name} 失败: {e}")
                skipped.append(idx_name)

    # 重建普通非唯一索引
    if removed:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS ix_products_sku ON products (sku)"
        )

    if removed:
        print(f"  [迁移] 已移除 sku 唯一索引: {', '.join(removed)}，已重建普通索引 ix_products_sku")
    if skipped:
        print(f"  [迁移] 跳过的索引（需人工检查）: {', '.join(skipped)}")

    conn.close()


def migrate_performance_indexes():
    """Step 10-29A-fix1: 安全幂等补充常用查询索引

    所有 INDEX 使用 CREATE INDEX IF NOT EXISTS，多次执行安全。
    不修改任何数据，不影响已有约束。
    """
    import sqlite3
    import os

    db_path = get_db_path()
    if not os.path.exists(db_path):
        return

    conn = sqlite3.connect(db_path)

    indexes = [
        # 产品常用筛选字段
        ("ix_products_category", "products", "category"),
        ("ix_products_location", "products", "location"),
        ("ix_products_brand", "products", "brand"),
        # 交易记录产品关联
        ("ix_transactions_product_id", "transactions", "product_id"),
        ("ix_transactions_date", "transactions", "date"),
        # 审计日志时间与类型
        ("ix_audit_logs_timestamp", "audit_logs", "timestamp"),
        ("ix_audit_logs_action_type", "audit_logs", "action_type"),
    ]

    created = 0
    for idx_name, table, column in indexes:
        try:
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({column})"
            )
            created += 1
        except sqlite3.Error as e:
            print(f"  [索引] {idx_name} 创建失败: {e}")

    if created > 0:
        print(f"  [索引] 已确保 {created} 个性能索引存在（幂等）")

    conn.close()


# 模型定义
class Product(Base):
    """产品模型"""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    # Step 10-27C: 移除 unique=True — 产品货号不是全局唯一字段。
    # 同一货号可在不同品牌/规格/分类/库位下共存。
    # 唯一性由七字段复合键判定：品牌+货号+名称+规格+单位+类别+存放位置。
    # 数据库主键 id 是产品的唯一标识。
    sku = Column(String(50), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False, default="耗材")
    current_stock = Column(Integer, nullable=False, default=0)
    min_stock = Column(Integer, nullable=False, default=0)
    unit = Column(String(20), nullable=False, default="个")
    location = Column(String(100), nullable=True)
    status = Column(String(20), nullable=False, default="正常")  # 正常/低库存
    last_updated = Column(String(20), nullable=True)  # YYYY-MM-DD 格式

    # P1 扩展字段（Step 10-2B）
    brand = Column(String(100), nullable=True)
    specification = Column(String(200), nullable=True)
    supplier = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)

    # P1 价格字段（Step 10-6C）
    purchase_price = Column(Float, nullable=True)
    sale_price = Column(Float, nullable=True)

    # 产品主图字段（Step 11：可空，未上传时为 NULL）
    image_path = Column(String(255), nullable=True)       # 相对文件名（不含目录）
    image_updated_at = Column(String(50), nullable=True)  # ISO 时间戳，用于缓存版本

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
            # P1 扩展字段（Step 10-2B）
            "brand": self.brand or "",
            "specification": self.specification or "",
            "supplier": self.supplier or "",
            "notes": self.notes or "",
            # P1 价格字段（Step 10-6C）
            "purchasePrice": self.purchase_price,
            "salePrice": self.sale_price,
            # 产品主图（不返回服务器绝对路径，只返回布尔标识和缓存版本）
            "hasImage": bool(self.image_path),
            "imageUpdatedAt": self.image_updated_at or "",
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