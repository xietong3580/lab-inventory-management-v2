"""
维护 API 路由：备份前安全检查 + 数据库物理备份

- GET  /api/maintenance/preflight  备份前安全检查（所有登录用户可访问，只读）
- POST /api/maintenance/backups   创建 SQLite 数据库物理副本（仅管理员）
"""

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import BASE_DIR
from auth import get_current_user, require_admin

router = APIRouter()

# ── 路径常量 ──────────────────────────────────────────────
DB_PATH = Path(BASE_DIR) / "inventory.db"
BACKUP_DIR = Path(BASE_DIR) / "backups"


# ═══════════════════════════════════════════════════════════
# 响应模型
# ═══════════════════════════════════════════════════════════

class PreflightResponse(BaseModel):
    database_exists: bool
    database_readable: bool
    backup_dir_exists: bool
    backup_dir_writable: bool
    products_count: int
    transactions_count: int
    audit_logs_count: int
    negative_stock_count: int
    transactions_missing_product_id_count: int
    transactions_orphan_product_id_count: int
    duplicate_sku_count: int
    status: str  # "ok" | "warning" | "error"
    warnings: List[str]
    errors: List[str]


class MaintenanceBackupResponse(BaseModel):
    success: bool
    filename: str
    path: str
    size_bytes: int
    created_at: str
    message: str


# ═══════════════════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════════════════

def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    """检查表是否存在"""
    return conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone() is not None


def _column_exists(conn: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    """检查列是否存在"""
    return column_name in {
        row[1] for row in conn.execute(f"PRAGMA table_info({table_name})")
    }


# ═══════════════════════════════════════════════════════════
# 接口
# ═══════════════════════════════════════════════════════════

@router.get("/preflight", response_model=PreflightResponse)
def preflight_check(user=Depends(get_current_user)):
    """
    备份前安全检查（所有登录用户可访问，只读数据库）。

    检查项目：
    - 数据库文件是否存在且可读
    - 备份目录是否存在且可写
    - 核心表记录数统计
    - 数据完整性问题（负库存、缺少 product_id、孤立的 product_id、重复 SKU）
    """
    warnings: List[str] = []
    errors: List[str] = []

    # ── 1. 数据库文件检查 ──
    database_exists = DB_PATH.exists() and DB_PATH.is_file()
    database_readable = False
    if database_exists:
        try:
            with open(DB_PATH, "rb") as f:
                f.read(16)
            database_readable = True
        except OSError:
            pass

    if not database_exists:
        errors.append("数据库文件不存在")
        return PreflightResponse(
            database_exists=False,
            database_readable=False,
            backup_dir_exists=False,
            backup_dir_writable=False,
            products_count=0,
            transactions_count=0,
            audit_logs_count=0,
            negative_stock_count=0,
            transactions_missing_product_id_count=0,
            transactions_orphan_product_id_count=0,
            duplicate_sku_count=0,
            status="error",
            warnings=warnings,
            errors=errors,
        )

    if not database_readable:
        errors.append("数据库文件不可读，无法继续检查")

    # ── 2. 备份目录检查 ──
    backup_dir_exists = BACKUP_DIR.exists() and BACKUP_DIR.is_dir()
    backup_dir_writable = False
    if backup_dir_exists:
        try:
            test_file = BACKUP_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
            backup_dir_writable = True
        except OSError:
            warnings.append("备份目录不可写，备份功能将无法使用")
    else:
        try:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            backup_dir_exists = True
            test_file = BACKUP_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
            backup_dir_writable = True
        except OSError:
            warnings.append("备份目录不存在且无法自动创建，备份功能将无法使用")

    # ── 3. 数据完整性检查 ──
    products_count = 0
    transactions_count = 0
    audit_logs_count = 0
    negative_stock_count = 0
    transactions_missing_product_id_count = 0
    transactions_orphan_product_id_count = 0
    duplicate_sku_count = 0

    if database_readable:
        try:
            conn = sqlite3.connect(str(DB_PATH))
            conn.row_factory = sqlite3.Row

            # 产品总数
            products_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]

            # 交易总数
            transactions_count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]

            # 审计日志总数（表可能不存在）
            if _table_exists(conn, "audit_logs"):
                audit_logs_count = conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0]
            else:
                warnings.append("audit_logs 表不存在（可能未初始化）")

            # 负库存产品
            negative_stock_count = conn.execute(
                "SELECT COUNT(*) FROM products WHERE current_stock < 0"
            ).fetchone()[0]
            if negative_stock_count > 0:
                warnings.append(f"存在 {negative_stock_count} 个负库存产品，建议修正后再备份")

            # product_id 完整性（列可能不存在）
            if _column_exists(conn, "transactions", "product_id"):
                missing = conn.execute(
                    "SELECT COUNT(*) FROM transactions WHERE product_id IS NULL OR product_id = 0"
                ).fetchone()[0]
                transactions_missing_product_id_count = missing
                if missing > 0:
                    warnings.append(f"存在 {missing} 条交易记录缺少 product_id")

                orphan = conn.execute("""
                    SELECT COUNT(*) FROM transactions t
                    WHERE t.product_id IS NOT NULL AND t.product_id > 0
                    AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = t.product_id)
                """).fetchone()[0]
                transactions_orphan_product_id_count = orphan
                if orphan > 0:
                    warnings.append(f"存在 {orphan} 条交易记录的 product_id 指向不存在的产品")
            else:
                warnings.append("transactions 表缺少 product_id 列")

            # 重复 SKU
            dupes = conn.execute(
                "SELECT sku, COUNT(*) as cnt FROM products GROUP BY sku HAVING cnt > 1"
            ).fetchall()
            duplicate_sku_count = len(dupes)
            if duplicate_sku_count > 0:
                duped_skus = ", ".join(row["sku"] for row in dupes[:5])
                if len(dupes) > 5:
                    duped_skus += f" 等 {len(dupes)} 个 SKU"
                errors.append(f"存在 {duplicate_sku_count} 个重复的 SKU：{duped_skus}")

            conn.close()
        except sqlite3.Error as e:
            errors.append(f"数据库查询异常：{e}")

    # ── 4. 判断整体状态 ──
    if errors:
        overall_status = "error"
    elif warnings:
        overall_status = "warning"
    else:
        overall_status = "ok"

    return PreflightResponse(
        database_exists=database_exists,
        database_readable=database_readable,
        backup_dir_exists=backup_dir_exists,
        backup_dir_writable=backup_dir_writable,
        products_count=products_count,
        transactions_count=transactions_count,
        audit_logs_count=audit_logs_count,
        negative_stock_count=negative_stock_count,
        transactions_missing_product_id_count=transactions_missing_product_id_count,
        transactions_orphan_product_id_count=transactions_orphan_product_id_count,
        duplicate_sku_count=duplicate_sku_count,
        status=overall_status,
        warnings=warnings,
        errors=errors,
    )


@router.post("/backups", response_model=MaintenanceBackupResponse)
def create_backup(admin=Depends(require_admin)):
    """
    创建数据库物理备份（仅管理员）。

    - 使用 SQLite backup API 安全复制数据库文件
    - 备份目录为 backend/backups/
    - 文件名格式：inventory_backup_YYYYMMDD_HHMMSS.sqlite
    - 不做恢复，不做压缩，不删除旧备份
    """
    # ── 1. 前置检查 ──
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库文件不存在，无法备份",
        )

    # ── 2. 确保备份目录存在 ──
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    # ── 3. 生成文件名 ──
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"inventory_backup_{timestamp}.sqlite"
    backup_path = BACKUP_DIR / filename

    # ── 4. 使用 SQLite backup API 安全备份 ──
    created_at = datetime.now().isoformat()
    try:
        src_conn = sqlite3.connect(str(DB_PATH))
        dst_conn = sqlite3.connect(str(backup_path))
        src_conn.backup(dst_conn)
        src_conn.close()
        dst_conn.close()
    except sqlite3.Error as e:
        # 清理失败的部分文件
        if backup_path.exists():
            backup_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"数据库备份失败：{e}",
        )

    # ── 5. 确认备份文件大小 ──
    size_bytes = backup_path.stat().st_size

    return MaintenanceBackupResponse(
        success=True,
        filename=filename,
        path=str(backup_path),
        size_bytes=size_bytes,
        created_at=created_at,
        message=f"备份成功：{filename}（{size_bytes:,} 字节）",
    )
