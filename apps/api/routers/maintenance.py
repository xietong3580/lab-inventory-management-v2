"""
维护 API 路由：备份前安全检查 + 数据库物理备份 + 测试业务数据清空

- GET  /api/maintenance/preflight           备份前安全检查（所有登录用户可访问，只读）
- POST /api/maintenance/backups            创建 SQLite 数据库物理副本（仅管理员）
- GET  /api/maintenance/reset-preview      测试业务数据清空预览（所有登录用户可访问，只读）
- POST /api/maintenance/reset-business-data 清空测试业务数据（仅管理员，需确认短语）
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


class ResetPreviewItem(BaseModel):
    key: str
    name: str
    count: int
    description: str


class ResetPreviewSummary(BaseModel):
    products: int
    transactions: int
    ledger_records: int
    audit_logs: int
    low_stock_products: int


class ResetPreviewResponse(BaseModel):
    success: bool
    summary: ResetPreviewSummary
    will_clear: List[ResetPreviewItem]
    will_keep: List[ResetPreviewItem]
    warnings: List[str]


class ResetBusinessDataRequest(BaseModel):
    confirmation: str


class ResetBusinessDataBackup(BaseModel):
    filename: str
    size_bytes: int
    created_at: str


class ResetBusinessDataCounts(BaseModel):
    products: int
    transactions: int
    ledger_records: int
    audit_logs: int
    low_stock_products: int


class ResetBusinessDataResponse(BaseModel):
    success: bool
    message: str
    backup: ResetBusinessDataBackup
    before: ResetBusinessDataCounts
    after: ResetBusinessDataCounts
    preflight: PreflightResponse
    warnings: List[str]


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


@router.get("/reset-preview", response_model=ResetPreviewResponse)
def reset_preview(user=Depends(get_current_user)):
    """
    正式导入前测试业务数据清空预览（只读，所有登录用户可访问）。

    返回当前若执行清空测试业务数据时的预期影响范围。
    本接口**只读**，不删除、不修改任何数据。

    计数逻辑：
    - products: 当前产品总数
    - transactions: 出入库记录总数（台账由交易记录前端派生，无独立表）
    - ledger_records: 同 transactions 计数（台账来源于交易记录，清空交易后台账同步消失）
    - audit_logs: 审计日志总数（表可能不存在，安全返回 0）
    - low_stock_products: 低库存产品数（current_stock <= min_stock）
    """
    warnings: List[str] = [
        "本接口仅用于预览，不会删除或修改任何数据。",
        "正式清空测试业务数据前必须先创建数据库备份。",
        "后续正式数据应以旧系统导出的真实产品库存数据为准。",
    ]

    # ── 安全计数（每项独立 try/except，单点失败不影响其他项） ──

    # 产品数
    products_count = 0
    low_stock_count = 0
    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            products_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
            low_stock_count = conn.execute(
                "SELECT COUNT(*) FROM products WHERE current_stock <= min_stock"
            ).fetchone()[0]
            conn.close()
    except sqlite3.Error as e:
        warnings.append(f"产品表查询异常（不影响其他统计）：{e}")

    # 交易记录数（台账来源）
    transactions_count = 0
    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            if _table_exists(conn, "transactions"):
                transactions_count = conn.execute(
                    "SELECT COUNT(*) FROM transactions"
                ).fetchone()[0]
            conn.close()
    except sqlite3.Error as e:
        warnings.append(f"交易表查询异常（不影响其他统计）：{e}")

    # 审计日志数
    audit_logs_count = 0
    try:
        if DB_PATH.exists():
            conn = sqlite3.connect(str(DB_PATH))
            if _table_exists(conn, "audit_logs"):
                audit_logs_count = conn.execute(
                    "SELECT COUNT(*) FROM audit_logs"
                ).fetchone()[0]
            conn.close()
    except sqlite3.Error as e:
        warnings.append(f"审计日志表查询异常（不影响其他统计）：{e}")

    # ── 组装返回 ──
    return ResetPreviewResponse(
        success=True,
        summary=ResetPreviewSummary(
            products=products_count,
            transactions=transactions_count,
            ledger_records=transactions_count,  # 台账由交易记录派生，无独立表
            audit_logs=audit_logs_count,
            low_stock_products=low_stock_count,
        ),
        will_clear=[
            ResetPreviewItem(
                key="products",
                name="产品数据",
                count=products_count,
                description="当前系统中的产品与库存数据，正式导入旧系统数据前应清空。",
            ),
            ResetPreviewItem(
                key="transactions",
                name="出入库记录",
                count=transactions_count,
                description="当前测试出入库记录，不能污染正式库存。",
            ),
            ResetPreviewItem(
                key="ledger_records",
                name="库存台账",
                count=transactions_count,
                description="测试台账记录（由交易记录派生），正式数据导入后应重新生成。",
            ),
            ResetPreviewItem(
                key="audit_logs",
                name="审计日志",
                count=audit_logs_count,
                description="当前开发和验收期间产生的测试操作日志。",
            ),
        ],
        will_keep=[
            ResetPreviewItem(
                key="users",
                name="用户账号",
                count=0,
                description="admin/viewer 等登录账号不属于业务测试数据，不在本清空范围内。",
            ),
            ResetPreviewItem(
                key="settings",
                name="系统设置",
                count=0,
                description="系统配置不在本清空范围内。",
            ),
            ResetPreviewItem(
                key="backups",
                name="备份文件",
                count=0,
                description="备份文件用于回滚和追溯，不应自动删除。",
            ),
        ],
        warnings=warnings,
    )


# ── 清空计数辅助函数 ──────────────────────────────────────

def _count_business_data(conn: sqlite3.Connection) -> dict:
    """统计当前业务数据量（只读，不修改任何数据）。"""
    counts = {
        "products": 0,
        "transactions": 0,
        "ledger_records": 0,
        "audit_logs": 0,
        "low_stock_products": 0,
    }
    try:
        counts["products"] = conn.execute(
            "SELECT COUNT(*) FROM products"
        ).fetchone()[0]
    except sqlite3.Error:
        pass

    try:
        if _table_exists(conn, "transactions"):
            counts["transactions"] = conn.execute(
                "SELECT COUNT(*) FROM transactions"
            ).fetchone()[0]
    except sqlite3.Error:
        pass

    # 台账由交易记录派生，无独立表
    counts["ledger_records"] = counts["transactions"]

    try:
        if _table_exists(conn, "audit_logs"):
            counts["audit_logs"] = conn.execute(
                "SELECT COUNT(*) FROM audit_logs"
            ).fetchone()[0]
    except sqlite3.Error:
        pass

    try:
        counts["low_stock_products"] = conn.execute(
            "SELECT COUNT(*) FROM products WHERE current_stock <= min_stock"
        ).fetchone()[0]
    except sqlite3.Error:
        pass

    return counts


# ═══════════════════════════════════════════════════════════

@router.post("/reset-business-data", response_model=ResetBusinessDataResponse)
def reset_business_data(req: ResetBusinessDataRequest, admin=Depends(require_admin)):
    """
    清空测试业务数据（仅管理员，需确认短语完全匹配）。

    安全流程：
    1. 校验 admin 权限（由 require_admin 保证）
    2. 校验 confirmation 短语必须为「清空测试业务数据」
    3. 统计清空前数据量（before_counts）
    4. 自动创建数据库备份
    5. 确认备份文件真实存在且大小 > 0
    6. 在数据库事务中按安全顺序清空测试业务数据
    7. 统计清空后数据量（after_counts）
    8. 运行 preflight 检查数据完整性
    9. 返回完整清空结果

    清空范围：products / transactions / audit_logs
    保留范围：users / settings / 备份文件
    """
    CONFIRMATION_PHRASE = "清空测试业务数据"

    # ── 1. 校验 confirmation 短语 ──
    if req.confirmation != CONFIRMATION_PHRASE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="确认短语不匹配，操作已拒绝。请输入「清空测试业务数据」。",
        )

    # ── 2. 数据库文件存在检查 ──
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库文件不存在，无法执行清空操作",
        )

    # ── 3. 统计清空前数据量 ──
    try:
        conn = sqlite3.connect(str(DB_PATH))
        before_counts = _count_business_data(conn)
        conn.close()
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"清空前数据统计失败：{e}",
        )

    # ── 4. 创建数据库备份 ──
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"inventory_backup_{timestamp}.sqlite"
    backup_path = BACKUP_DIR / backup_filename
    backup_created_at = datetime.now().isoformat()

    try:
        src_conn = sqlite3.connect(str(DB_PATH))
        dst_conn = sqlite3.connect(str(backup_path))
        src_conn.backup(dst_conn)
        src_conn.close()
        dst_conn.close()
    except sqlite3.Error as e:
        if backup_path.exists():
            backup_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"备份创建失败，清空操作已中止：{e}",
        )

    # ── 5. 确认备份文件真实存在且大小 > 0 ──
    if not backup_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="备份文件创建后未找到，清空操作已中止",
        )
    backup_size = backup_path.stat().st_size
    if backup_size == 0:
        backup_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="备份文件大小为 0，清空操作已中止",
        )

    # ── 6. 在事务中按安全顺序清空测试业务数据 ──
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("BEGIN TRANSACTION")

        # 6a. 审计日志（子表，先清空）
        if _table_exists(conn, "audit_logs"):
            conn.execute("DELETE FROM audit_logs")

        # 6b. 出入库记录（引用 products，次清空）
        if _table_exists(conn, "transactions"):
            conn.execute("DELETE FROM transactions")

        # 6c. 产品数据（最后清空）
        conn.execute("DELETE FROM products")

        conn.execute("COMMIT")
        conn.close()
    except sqlite3.Error as e:
        try:
            conn.execute("ROLLBACK")
            conn.close()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"清空操作失败，事务已回滚：{e}",
        )

    # ── 7. 统计清空后数据量 ──
    try:
        conn = sqlite3.connect(str(DB_PATH))
        after_counts = _count_business_data(conn)
        conn.close()
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"清空后数据统计失败：{e}",
        )

    # ── 8. 运行 preflight 检查 ──
    preflight_warnings: List[str] = []
    preflight_errors: List[str] = []
    preflight_status = "ok"

    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row

        pf_products = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        pf_transactions = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        pf_audit = 0
        if _table_exists(conn, "audit_logs"):
            pf_audit = conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0]
        pf_negative = conn.execute(
            "SELECT COUNT(*) FROM products WHERE current_stock < 0"
        ).fetchone()[0]
        pf_dup_sku = len(conn.execute(
            "SELECT sku, COUNT(*) as cnt FROM products GROUP BY sku HAVING cnt > 1"
        ).fetchall())

        pf_orphan = 0
        pf_missing_pid = 0
        if _column_exists(conn, "transactions", "product_id"):
            pf_missing_pid = conn.execute(
                "SELECT COUNT(*) FROM transactions WHERE product_id IS NULL OR product_id = 0"
            ).fetchone()[0]
            pf_orphan = conn.execute("""
                SELECT COUNT(*) FROM transactions t
                WHERE t.product_id IS NOT NULL AND t.product_id > 0
                AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = t.product_id)
            """).fetchone()[0]

        conn.close()

        if pf_products > 0:
            preflight_warnings.append(f"清空后 products 表仍有 {pf_products} 条记录")
            preflight_status = "warning"
        if pf_transactions > 0:
            preflight_warnings.append(f"清空后 transactions 表仍有 {pf_transactions} 条记录")
            preflight_status = "warning"
        if pf_audit > 0:
            preflight_warnings.append(f"清空后 audit_logs 表仍有 {pf_audit} 条记录")
            preflight_status = "warning"
        if pf_negative > 0:
            preflight_errors.append(f"清空后仍存在 {pf_negative} 个负库存产品")
            preflight_status = "error"
        if pf_orphan > 0:
            preflight_errors.append(f"清空后仍存在 {pf_orphan} 条孤立 product_id 交易记录")
            preflight_status = "error"

        post_preflight = PreflightResponse(
            database_exists=True,
            database_readable=True,
            backup_dir_exists=BACKUP_DIR.exists() and BACKUP_DIR.is_dir(),
            backup_dir_writable=backup_size > 0,  # 刚成功写入备份，目录必定可写
            products_count=pf_products,
            transactions_count=pf_transactions,
            audit_logs_count=pf_audit,
            negative_stock_count=pf_negative,
            transactions_missing_product_id_count=pf_missing_pid,
            transactions_orphan_product_id_count=pf_orphan,
            duplicate_sku_count=pf_dup_sku,
            status=preflight_status,
            warnings=preflight_warnings,
            errors=preflight_errors,
        )
    except sqlite3.Error as e:
        post_preflight = PreflightResponse(
            database_exists=DB_PATH.exists(),
            database_readable=False,
            backup_dir_exists=BACKUP_DIR.exists() and BACKUP_DIR.is_dir(),
            backup_dir_writable=False,
            products_count=0,
            transactions_count=0,
            audit_logs_count=0,
            negative_stock_count=0,
            transactions_missing_product_id_count=0,
            transactions_orphan_product_id_count=0,
            duplicate_sku_count=0,
            status="error",
            warnings=[],
            errors=[f"清空后 preflight 检查失败：{e}"],
        )

    # ── 9. 组装返回 ──
    return ResetBusinessDataResponse(
        success=True,
        message="测试业务数据已清空",
        backup=ResetBusinessDataBackup(
            filename=backup_filename,
            size_bytes=backup_size,
            created_at=backup_created_at,
        ),
        before=ResetBusinessDataCounts(**before_counts),
        after=ResetBusinessDataCounts(**after_counts),
        preflight=post_preflight,
        warnings=[
            "用户账号、系统设置和备份文件已保留。",
            "后续正式数据应以旧系统导出的真实产品库存 CSV 为准重新导入。",
        ],
    )
