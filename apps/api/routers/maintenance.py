"""
维护 API 路由：备份前安全检查 + 数据库物理备份 + 业务数据清空 + 恢复预检

- GET  /api/maintenance/preflight           备份前安全检查（所有登录用户可访问，只读）
- POST /api/maintenance/backups            创建 SQLite 数据库物理副本（仅管理员）
- GET  /api/maintenance/reset-preview      业务数据清空预览（所有登录用户可访问，只读）
- POST /api/maintenance/reset-business-data 清空当前业务数据（仅管理员，需确认短语）
- GET  /api/maintenance/restore-candidates 备份恢复候选列表（仅管理员，只读）
- GET  /api/maintenance/restore-preflight  备份恢复预检（仅管理员，只读）
"""

import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import BASE_DIR, get_db, AuditLog
from auth import get_current_user, require_admin
from sqlalchemy.orm import Session

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
# 恢复预检响应模型（Step 10-7A）
# ═══════════════════════════════════════════════════════════

class RestoreCandidate(BaseModel):
    filename: str
    size_bytes: int
    created_at: str
    extension: str
    is_candidate: bool
    warnings: List[str]


class RestoreCandidatesResponse(BaseModel):
    success: bool
    candidates: List[RestoreCandidate]
    count: int
    message: str


class RestorePreflightCheck(BaseModel):
    name: str
    passed: bool
    detail: str


class RestorePreflightResponse(BaseModel):
    success: bool  # 整体预检是否成功
    filename: str
    size_bytes: int
    level: str  # "ok" | "warning" | "error"
    checks: List[RestorePreflightCheck]
    counts: dict  # { products_count, transactions_count, audit_logs_count, users_count }
    warnings: List[str]
    errors: List[str]
    message: str


# ═══════════════════════════════════════════════════════════
# 恢复准备响应模型（Step 10-7B）
# ═══════════════════════════════════════════════════════════

class RestorePrepareRequest(BaseModel):
    filename: str


class RestorePrepareResponse(BaseModel):
    success: bool
    target_backup_filename: str
    target_size_bytes: int
    pre_restore_backup_filename: str
    pre_restore_backup_size_bytes: int
    target_counts: dict  # backup file data counts
    current_counts: dict  # live DB data counts
    confirmation_phrase: str
    warnings: List[str]
    risks: List[str]
    message: str
    operator: str
    timestamp: str


# ═══════════════════════════════════════════════════════════
# 正式启用检查响应模型（Step 10-8A）
# ═══════════════════════════════════════════════════════════

class GoLiveDatabaseStatus(BaseModel):
    products_count: int = 0
    transactions_count: int = 0
    audit_logs_count: int = 0
    users_count: int = 0
    low_stock_count: int = 0
    negative_stock_count: int = 0
    missing_sku_count: int = 0
    duplicate_sku_count: int = 0


class GoLiveBackupStatus(BaseModel):
    backup_files_count: int = 0
    latest_backup_filename: str = ""
    latest_backup_time: str = ""
    latest_backup_size_bytes: int = 0
    has_available_backup: bool = False
    has_pre_restore_backup: bool = False
    candidate_extensions: list = []


class GoLiveEntryReadiness(BaseModel):
    current_products_count: int = 0
    current_transactions_count: int = 0
    data_may_be_test_data: bool = False
    before_entry_reminder: str = ""
    batch_entry_reminder: str = ""
    final_backup_reminder: str = ""


class GoLiveChecklistResponse(BaseModel):
    success: bool
    database_status: GoLiveDatabaseStatus
    backup_status: GoLiveBackupStatus
    entry_readiness: GoLiveEntryReadiness
    recommended_steps: list
    warnings: list
    overall_level: str  # "ok" | "warning" | "error"
    overall_message: str
    message: str
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
def create_backup(admin=Depends(require_admin), db: Session = Depends(get_db)):
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

    # Step 10-20D：审计日志
    operator = admin.display_name or admin.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    audit_log = AuditLog(
        action_type="BACKUP_CREATE",
        product_name=f"数据库备份: {filename}",
        product_id="",
        operator=operator,
        timestamp=now_str,
        details=f"创建数据库备份：{filename}，大小: {size_bytes:,} 字节",
    )
    db.add(audit_log)
    db.commit()

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
    正式导入前业务数据清空预览（只读，所有登录用户可访问）。

    返回当前若执行清空当前业务数据时的预期影响范围。
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
        "正式清空当前业务数据前必须先创建数据库备份。",
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
                description="admin/viewer 等登录账号不属于业务数据，不在本清空范围内。",
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
    清空当前业务数据（仅管理员，需确认短语完全匹配）。

    安全流程：
    1. 校验 admin 权限（由 require_admin 保证）
    2. 校验 confirmation 短语必须为「清空当前业务数据」
    3. 统计清空前数据量（before_counts）
    4. 自动创建数据库备份
    5. 确认备份文件真实存在且大小 > 0
    6. 在数据库事务中按安全顺序清空当前业务数据
    7. 统计清空后数据量（after_counts）
    8. 运行 preflight 检查数据完整性
    9. 返回完整清空结果

    清空范围：products / transactions / audit_logs
    保留范围：users / settings / 备份文件
    """
    CONFIRMATION_PHRASE = "清空当前业务数据"

    # ── 1. 校验 confirmation 短语 ──
    if req.confirmation != CONFIRMATION_PHRASE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="确认短语不匹配，操作已拒绝。请输入「清空当前业务数据」。",
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

    # ── 6. 在事务中按安全顺序清空当前业务数据 ──
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

    # ── 7.5 Step 10-20D：写入清空审计日志（在 audit_logs 清空之后）──
    operator = admin.display_name or admin.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    clear_details = json.dumps({
        "action": "business_data_clear",
        "before": before_counts,
        "backup_filename": backup_filename,
        "operator": operator,
    }, ensure_ascii=False)
    try:
        audit_conn = sqlite3.connect(str(DB_PATH))
        audit_conn.execute(
            "INSERT INTO audit_logs (action_type, product_name, product_id, operator, timestamp, details, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "BUSINESS_DATA_CLEAR",
                "清空当前业务数据",
                "",
                operator,
                now_str,
                clear_details,
                now_str,
            ),
        )
        audit_conn.commit()
        audit_conn.close()
    except sqlite3.Error:
        pass  # 审计日志写入失败不影响清空流程返回

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
        message="当前业务数据已清空",
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


# ═══════════════════════════════════════════════════════════
# 恢复预检 + 恢复准备接口（Step 10-7A / 10-7B）
# ═══════════════════════════════════════════════════════════

# 合法的备份文件扩展名
_ALLOWED_EXTENSIONS = {".db", ".sqlite"}
# 文件名安全模式：仅允许字母、数字、下划线、连字符、点号
_FILENAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$")
# 恢复准备确认短语
_RESTORE_PREPARE_CONFIRMATION = "确认我已了解恢复风险"


def _count_live_data(conn: sqlite3.Connection) -> dict:
    """
    统计当前正式数据库核心数据量（只读）。

    返回 dict: products_count, transactions_count, audit_logs_count, users_count
    """
    counts = {
        "products_count": 0,
        "transactions_count": 0,
        "audit_logs_count": 0,
        "users_count": 0,
    }
    for table in ["products", "transactions", "audit_logs", "users"]:
        try:
            if _table_exists(conn, table):
                counts[f"{table}_count"] = conn.execute(
                    f"SELECT COUNT(*) FROM {table}"
                ).fetchone()[0]
        except sqlite3.Error:
            pass
    return counts


def _run_backup_preflight(backup_path: Path, safe_name: str) -> dict:
    """
    对目标备份执行完整预检，返回结构化结果 dict。

    这是 restore-preflight 的内部复用版本，返回 dict 而非 Response。
    """
    checks: List[dict] = []
    error_msgs: List[str] = []
    warning_msgs: List[str] = []
    counts = {
        "products_count": 0,
        "transactions_count": 0,
        "audit_logs_count": 0,
        "users_count": 0,
    }

    # 1. 文件存在性
    if not backup_path.exists():
        return {
            "success": False, "level": "error", "filename": safe_name,
            "size_bytes": 0, "checks": [
                {"name": "文件存在性", "passed": False, "detail": "备份文件不存在"}
            ], "counts": counts, "warnings": [],
            "errors": ["备份文件不存在"],
            "message": "预检失败：备份文件不存在",
        }
    checks.append({"name": "文件存在性", "passed": True, "detail": "备份文件存在"})

    # 2. 文件大小
    file_size = 0
    try:
        file_size = backup_path.stat().st_size
    except OSError as e:
        error_msgs.append(f"无法读取文件大小：{e}")
        checks.append({"name": "文件大小", "passed": False, "detail": f"无法读取：{e}"})
    else:
        if file_size == 0:
            error_msgs.append("备份文件大小为 0，不可用于恢复")
            checks.append({"name": "文件大小", "passed": False, "detail": "文件大小为 0"})
        else:
            checks.append({"name": "文件大小", "passed": True, "detail": f"{file_size:,} 字节"})

    if file_size == 0:
        return {
            "success": False, "level": "error", "filename": safe_name,
            "size_bytes": 0, "checks": checks, "counts": counts,
            "warnings": warning_msgs, "errors": error_msgs,
            "message": "预检失败：备份文件大小为 0，不可用于恢复",
        }

    # 3. SQLite 可打开
    can_open, open_detail = _is_sqlite_valid(backup_path)
    checks.append({"name": "SQLite 可打开", "passed": can_open, "detail": open_detail})
    if not can_open:
        error_msgs.append(open_detail)
        return {
            "success": False, "level": "error", "filename": safe_name,
            "size_bytes": file_size, "checks": checks, "counts": counts,
            "warnings": warning_msgs, "errors": error_msgs,
            "message": f"预检失败：备份文件无法作为有效 SQLite 数据库打开 — {open_detail}",
        }

    # 4. PRAGMA integrity_check
    int_ok, int_detail = _validate_integrity(backup_path)
    checks.append({"name": "完整性检查", "passed": int_ok, "detail": int_detail})
    if not int_ok:
        error_msgs.append(int_detail)

    # 5. 关键表检查 + 数据量统计
    expected_tables = {
        "products": "产品表",
        "transactions": "出入库记录表",
        "audit_logs": "审计日志表",
        "users": "用户表",
    }
    try:
        uri = backup_path.resolve().as_uri()
        conn = sqlite3.connect(f"{uri}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        for table_name, table_label in expected_tables.items():
            exists = _table_exists(conn, table_name)
            checks.append({
                "name": f"{table_label} ({table_name})",
                "passed": exists,
                "detail": "表存在" if exists else f"缺少 {table_name} 表",
            })
            if not exists:
                warning_msgs.append(f"备份中缺少 {table_name} 表（{table_label}）")
            if exists:
                try:
                    row_count = conn.execute(
                        f"SELECT COUNT(*) FROM {table_name}"
                    ).fetchone()[0]
                    count_key = f"{table_name}_count"
                    if count_key in counts:
                        counts[count_key] = row_count
                except sqlite3.Error:
                    pass
        conn.close()
    except sqlite3.Error as e:
        error_msgs.append(f"关键表检查失败：{e}")
        checks.append({"name": "关键表检查", "passed": False, "detail": f"SQLite 查询异常：{e}"})

    # 6. 判定整体结果
    if error_msgs:
        level = "error"
        overall_ok = False
    elif warning_msgs:
        level = "warning"
        overall_ok = True
    else:
        level = "ok"
        overall_ok = True

    msg = (
        "预检通过，备份文件可用于恢复" if level == "ok"
        else "预检通过但有警告" if level == "warning"
        else "预检失败，该备份文件不可用于恢复"
    )

    return {
        "success": overall_ok, "level": level, "filename": safe_name,
        "size_bytes": file_size, "checks": checks, "counts": counts,
        "warnings": warning_msgs, "errors": error_msgs, "message": msg,
    }


def _validate_backup_filename(filename: str) -> str:
    """
    安全校验备份文件名，拒绝路径穿越和非法扩展名。

    Raises HTTPException on failure, returns sanitized filename on success.
    """
    if not filename or not filename.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件名不能为空",
        )

    # 禁止路径分隔符、反斜杠、点dot路径穿越
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件名包含非法字符，已拒绝",
        )

    # 仅允许纯文件名（不含路径）
    name = Path(filename).name
    if name != filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件名包含路径信息，已拒绝",
        )

    # 安全模式校验
    if not _FILENAME_PATTERN.match(name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件名包含不允许的字符",
        )

    # 扩展名校验
    suffix = Path(name).suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型：{suffix}，仅允许 .db 和 .sqlite",
        )

    return name


def _is_sqlite_valid(filepath: Path) -> tuple[bool, str]:
    """
    使用 SQLite 只读模式打开并检查文件是否为有效数据库。

    Returns (is_valid, detail_message).
    """
    try:
        uri = filepath.resolve().as_uri()
        conn = sqlite3.connect(f"{uri}?mode=ro", uri=True)
        conn.execute("SELECT 1")
        conn.close()
        return True, "文件为有效 SQLite 数据库"
    except sqlite3.Error as e:
        return False, f"SQLite 打开失败：{e}"


def _validate_integrity(filepath: Path) -> tuple[bool, str]:
    """对备份文件执行 PRAGMA integrity_check（只读模式）。"""
    try:
        uri = filepath.resolve().as_uri()
        conn = sqlite3.connect(f"{uri}?mode=ro", uri=True)
        result = conn.execute("PRAGMA integrity_check").fetchone()
        conn.close()
        if result and result[0] == "ok":
            return True, "完整性检查通过"
        return False, f"完整性检查失败：{result[0] if result else '未知错误'}"
    except sqlite3.Error as e:
        return False, f"完整性检查异常：{e}"


@router.get("/restore-candidates", response_model=RestoreCandidatesResponse)
def restore_candidates(admin=Depends(require_admin)):
    """
    列出可用的备份恢复候选文件（仅管理员，只读）。

    - 扫描 backups 目录下的 .db 和 .sqlite 文件
    - 返回文件大小、时间、类型、是否可用为候选
    - 不打开文件，不做恢复操作
    - 不返回绝对路径给前端
    """
    warnings: List[str] = []
    candidates: List[RestoreCandidate] = []

    # 确保备份目录存在
    if not BACKUP_DIR.exists() or not BACKUP_DIR.is_dir():
        return RestoreCandidatesResponse(
            success=True,
            candidates=[],
            count=0,
            message="备份目录不存在，暂无恢复候选",
        )

    # 扫描备份文件
    try:
        backup_files = []
        for ext in _ALLOWED_EXTENSIONS:
            backup_files.extend(BACKUP_DIR.glob(f"*{ext}"))

        # 去重并按修改时间倒序
        backup_files = sorted(set(backup_files), key=lambda f: f.stat().st_mtime, reverse=True)
    except OSError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"扫描备份目录失败：{e}",
        )

    for bf in backup_files:
        try:
            stat = bf.stat()
            file_warnings: List[str] = []
            is_candidate = True

            if stat.st_size == 0:
                file_warnings.append("文件大小为 0，不可用于恢复")
                is_candidate = False

            candidates.append(RestoreCandidate(
                filename=bf.name,
                size_bytes=stat.st_size,
                created_at=datetime.fromtimestamp(stat.st_ctime).isoformat(),
                extension=bf.suffix.lower(),
                is_candidate=is_candidate,
                warnings=file_warnings,
            ))
        except OSError:
            # 跳过无法读取状态的文件
            continue

    return RestoreCandidatesResponse(
        success=True,
        candidates=candidates,
        count=len(candidates),
        message=f"共发现 {len(candidates)} 个备份候选文件",
    )


@router.get("/restore-preflight", response_model=RestorePreflightResponse)
def restore_preflight(
    filename: str = Query(..., description="备份文件名（纯文件名，不含路径）"),
    admin=Depends(require_admin),
):
    """
    对指定备份文件做只读恢复预检（仅管理员，只读）。

    安全要求：
    - filename 必须是纯文件名，不允许路径穿越
    - 文件必须位于 BACKUP_DIR 下
    - 扩展名必须是 .db 或 .sqlite
    - 使用 SQLite 只读模式打开
    - 禁止对当前正式数据库做任何写操作
    - 禁止覆盖数据库

    预检内容：
    1. 文件存在性检查
    2. 文件大小检查
    3. SQLite 可打开检查（只读）
    4. PRAGMA integrity_check
    5. 关键表存在检查（products / transactions / audit_logs / users）
    6. 核心数据量统计
    """
    # ── 安全校验文件名 ──
    safe_name = _validate_backup_filename(filename)

    # ── 确认文件在备份目录下 ──
    backup_path = (BACKUP_DIR / safe_name).resolve()
    allowed_prefix = BACKUP_DIR.resolve()

    if not str(backup_path).startswith(str(allowed_prefix)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不允许访问备份目录之外的文件",
        )

    checks: List[RestorePreflightCheck] = []
    error_messages: List[str] = []
    warning_messages: List[str] = []
    counts = {
        "products_count": 0,
        "transactions_count": 0,
        "audit_logs_count": 0,
        "users_count": 0,
    }

    # ── 1. 文件存在性检查 ──
    if not backup_path.exists():
        checks.append(RestorePreflightCheck(name="文件存在性", passed=False, detail="备份文件不存在"))
        return RestorePreflightResponse(
            success=False,
            filename=safe_name,
            size_bytes=0,
            level="error",
            checks=checks,
            counts=counts,
            warnings=warning_messages,
            errors=["备份文件不存在"] + error_messages,
            message="预检失败：备份文件不存在",
        )
    checks.append(RestorePreflightCheck(name="文件存在性", passed=True, detail="备份文件存在"))

    # ── 2. 文件大小检查 ──
    file_size = 0
    try:
        file_size = backup_path.stat().st_size
    except OSError as e:
        error_messages.append(f"无法读取文件大小：{e}")
        checks.append(RestorePreflightCheck(name="文件大小", passed=False, detail=f"无法读取：{e}"))
    else:
        if file_size == 0:
            error_messages.append("备份文件大小为 0，不可用于恢复")
            checks.append(RestorePreflightCheck(name="文件大小", passed=False, detail="文件大小为 0"))
        else:
            checks.append(RestorePreflightCheck(
                name="文件大小", passed=True,
                detail=f"{file_size:,} 字节",
            ))

    if file_size == 0:
        return RestorePreflightResponse(
            success=False,
            filename=safe_name,
            size_bytes=0,
            level="error",
            checks=checks,
            counts=counts,
            warnings=warning_messages,
            errors=error_messages,
            message="预检失败：备份文件大小为 0，不可用于恢复",
        )

    # ── 3. SQLite 可打开检查（只读模式） ──
    can_open, open_detail = _is_sqlite_valid(backup_path)
    checks.append(RestorePreflightCheck(name="SQLite 可打开", passed=can_open, detail=open_detail))
    if not can_open:
        error_messages.append(open_detail)
        return RestorePreflightResponse(
            success=False,
            filename=safe_name,
            size_bytes=file_size,
            level="error",
            checks=checks,
            counts=counts,
            warnings=warning_messages,
            errors=error_messages,
            message=f"预检失败：备份文件无法作为有效 SQLite 数据库打开 — {open_detail}",
        )

    # ── 4. PRAGMA integrity_check ──
    int_ok, int_detail = _validate_integrity(backup_path)
    checks.append(RestorePreflightCheck(name="完整性检查", passed=int_ok, detail=int_detail))
    if not int_ok:
        error_messages.append(int_detail)

    # ── 5. 关键表检查 + 数据量统计 ──
    expected_tables = {
        "products": "产品表",
        "transactions": "出入库记录表",
        "audit_logs": "审计日志表",
        "users": "用户表",
    }

    try:
        uri = backup_path.resolve().as_uri()
        conn = sqlite3.connect(f"{uri}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row

        for table_name, table_label in expected_tables.items():
            exists = _table_exists(conn, table_name)
            checks.append(RestorePreflightCheck(
                name=f"{table_label} ({table_name})",
                passed=exists,
                detail="表存在" if exists else f"缺少 {table_name} 表",
            ))
            if not exists:
                warning_messages.append(f"备份中缺少 {table_name} 表（{table_label}）")

            # 统计行数
            if exists:
                try:
                    row_count = conn.execute(
                        f"SELECT COUNT(*) FROM {table_name}"
                    ).fetchone()[0]
                    count_key = f"{table_name}_count"
                    if count_key in counts:
                        counts[count_key] = row_count
                except sqlite3.Error:
                    pass

        conn.close()
    except sqlite3.Error as e:
        error_messages.append(f"关键表检查失败：{e}")
        checks.append(RestorePreflightCheck(
            name="关键表检查", passed=False, detail=f"SQLite 查询异常：{e}",
        ))

    # ── 6. 判定整体结果 ──
    if error_messages:
        level = "error"
        overall_success = False
    elif warning_messages:
        level = "warning"
        overall_success = True
    else:
        level = "ok"
        overall_success = True

    return RestorePreflightResponse(
        success=overall_success,
        filename=safe_name,
        size_bytes=file_size,
        level=level,
        checks=checks,
        counts=counts,
        warnings=warning_messages,
        errors=error_messages,
        message=(
            "预检通过，备份文件可用于恢复" if level == "ok"
            else "预检通过但有警告，请检查警告项" if level == "warning"
            else "预检失败，该备份文件不可用于恢复"
        ),
    )


# ═══════════════════════════════════════════════════════════
# 恢复准备接口（Step 10-7B）
# ═══════════════════════════════════════════════════════════

@router.post("/restore-prepare", response_model=RestorePrepareResponse)
def restore_prepare(
    req: RestorePrepareRequest,
    admin=Depends(require_admin),
):
    """
    恢复前准备（仅管理员，不执行真实恢复）。

    安全流程：
    1. 校验 filename 安全性
    2. 对目标备份执行预检（复用 _run_backup_preflight）
    3. 预检失败则拒绝准备
    4. 预检通过 → 创建"恢复前当前数据库备份"（安全网）
    5. 统计当前正式数据库核心数据量
    6. 记录审计日志
    7. 返回恢复计划（含确认短语和风险提示）

    本接口：
    - ✅ 创建恢复前备份
    - ✅ 记录审计日志
    - ❌ 不覆盖当前数据库
    - ❌ 不执行真实恢复
    - ❌ 不删除任何备份
    """
    # ── 1. 安全校验文件名 ──
    safe_name = _validate_backup_filename(req.filename)

    # ── 2. 确认文件在备份目录下 ──
    backup_path = (BACKUP_DIR / safe_name).resolve()
    allowed_prefix = BACKUP_DIR.resolve()
    if not str(backup_path).startswith(str(allowed_prefix)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不允许访问备份目录之外的文件",
        )

    # ── 3. 对目标备份执行预检 ──
    preflight = _run_backup_preflight(backup_path, safe_name)
    if not preflight["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"目标备份预检未通过，无法准备恢复：{preflight['message']}",
        )
    if preflight["level"] == "error":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"目标备份存在严重错误：{'; '.join(preflight['errors'][:3])}",
        )

    # ── 4. 检查当前数据库是否存在 ──
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="当前数据库文件不存在，无法创建恢复前备份",
        )

    # ── 5. 统计当前正式数据库核心数据量 ──
    current_counts = {}
    try:
        conn = sqlite3.connect(str(DB_PATH))
        current_counts = _count_live_data(conn)
        conn.close()
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"当前数据库统计失败：{e}",
        )

    # ── 6. 创建恢复前当前数据库备份（安全网） ──
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    pre_restore_filename = f"pre_restore_backup_{timestamp}.sqlite"
    pre_restore_path = BACKUP_DIR / pre_restore_filename

    try:
        src = sqlite3.connect(str(DB_PATH))
        dst = sqlite3.connect(str(pre_restore_path))
        src.backup(dst)
        src.close()
        dst.close()
    except sqlite3.Error as e:
        if pre_restore_path.exists():
            pre_restore_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"恢复前备份创建失败：{e}",
        )

    # 确认备份大小
    if not pre_restore_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="恢复前备份创建后未找到文件",
        )
    pre_restore_size = pre_restore_path.stat().st_size
    if pre_restore_size == 0:
        pre_restore_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="恢复前备份大小为 0",
        )

    # ── 7. 记录审计日志 ──
    operator_name = admin.username if hasattr(admin, "username") else "admin"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    audit_details = json.dumps({
        "action": "restore_prepare",
        "target_backup": safe_name,
        "target_size_bytes": preflight["size_bytes"],
        "pre_restore_backup": pre_restore_filename,
        "current_counts": current_counts,
        "target_counts": preflight["counts"],
        "confirmation_phrase": _RESTORE_PREPARE_CONFIRMATION,
        "note": "仅完成恢复前准备，未执行真实恢复",
    }, ensure_ascii=False)

    try:
        audit_conn = sqlite3.connect(str(DB_PATH))
        if _table_exists(audit_conn, "audit_logs"):
            audit_conn.execute(
                "INSERT INTO audit_logs (action_type, product_name, operator, timestamp, details, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    "RESTORE_PREPARE",
                    f"恢复准备 — 目标备份: {safe_name}",
                    operator_name,
                    now_str,
                    audit_details,
                    now_str,
                ),
            )
            audit_conn.commit()
        audit_conn.close()
    except sqlite3.Error as e:
        # 审计记录失败不影响主流程返回，但加入 warnings
        pass

    # ── 8. 组装风险提示 ──
    risks = [
        "恢复操作将用备份文件完全替换当前数据库，恢复后当前数据库中的数据将被覆盖。",
        "恢复前已自动创建当前数据库备份作为安全网，恢复后如需撤销请使用该备份。",
        "恢复将影响所有用户的数据，请在确认无人操作时执行。",
        "恢复后需要重启后端服务，SQLite 文件级替换才能生效。",
        "请先导出当前数据为 CSV 进行二次核对，确认无误后再执行恢复。",
    ]

    warnings = list(preflight.get("warnings", []))
    if preflight["level"] == "warning":
        warnings.append("目标备份预检存在警告，请仔细审查警告项后再决定是否恢复。")

    return RestorePrepareResponse(
        success=True,
        target_backup_filename=safe_name,
        target_size_bytes=preflight["size_bytes"],
        pre_restore_backup_filename=pre_restore_filename,
        pre_restore_backup_size_bytes=pre_restore_size,
        target_counts=preflight["counts"],
        current_counts=current_counts,
        confirmation_phrase=_RESTORE_PREPARE_CONFIRMATION,
        warnings=warnings,
        risks=risks,
        message=(
            f"恢复准备完成。已创建当前数据库备份 {pre_restore_filename}，"
            f"目标备份 {safe_name} 预检通过。当前版本仅完成准备，不执行真实恢复。"
        ),
        operator=operator_name,
        timestamp=now_str,
    )


# ═══════════════════════════════════════════════════════════
# 正式启用检查接口（Step 10-8A）
# ═══════════════════════════════════════════════════════════

@router.get("/go-live-checklist", response_model=GoLiveChecklistResponse)
def go_live_checklist(user=Depends(get_current_user)):
    """
    管理员维护检查：只读状态总览（所有登录用户可访问，只读）。

    返回：
    - 当前数据库状态（产品数、出入库记录数、审计日志数、用户数、低库存、负库存、缺失/重复 SKU）
    - 备份状态（数量、最新备份、是否有可用备份、是否有恢复前备份）
    - 正式录入准备状态
    - 推荐流程步骤
    - 风险提示
    - 整体评估

    本接口只读，不执行任何写操作。
    """
    warnings: List[str] = []
    db_status = {}
    backup_status = {}
    entry_readiness = {}

    # ── 1. 当前数据库状态 ──
    products_count = 0
    transactions_count = 0
    audit_logs_count = 0
    users_count = 0
    low_stock_count = 0
    negative_stock_count = 0
    missing_sku_count = 0
    duplicate_sku_count = 0

    if DB_PATH.exists():
        try:
            conn = sqlite3.connect(str(DB_PATH))
            conn.row_factory = sqlite3.Row

            products_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
            transactions_count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]

            if _table_exists(conn, "audit_logs"):
                audit_logs_count = conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0]
            if _table_exists(conn, "users"):
                users_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

            # 低库存
            low_stock_count = conn.execute(
                "SELECT COUNT(*) FROM products WHERE current_stock <= min_stock AND current_stock >= 0"
            ).fetchone()[0]

            # 负库存
            negative_stock_count = conn.execute(
                "SELECT COUNT(*) FROM products WHERE current_stock < 0"
            ).fetchone()[0]
            if negative_stock_count > 0:
                warnings.append(f"存在 {negative_stock_count} 个负库存产品，请及时修正")

            # 缺失 SKU
            missing_sku_count = conn.execute(
                "SELECT COUNT(*) FROM products WHERE sku IS NULL OR TRIM(sku) = ''"
            ).fetchone()[0]
            if missing_sku_count > 0:
                warnings.append(f"存在 {missing_sku_count} 个产品缺少 SKU 编码")

            # 重复 SKU
            dupes = conn.execute(
                "SELECT sku, COUNT(*) as cnt FROM products WHERE sku IS NOT NULL AND TRIM(sku) != '' GROUP BY sku HAVING cnt > 1"
            ).fetchall()
            duplicate_sku_count = len(dupes)
            if duplicate_sku_count > 0:
                warnings.append(f"存在 {duplicate_sku_count} 个重复的 SKU 编码")

            conn.close()
        except sqlite3.Error as e:
            warnings.append(f"数据库状态统计异常：{e}")

    db_status = GoLiveDatabaseStatus(
        products_count=products_count,
        transactions_count=transactions_count,
        audit_logs_count=audit_logs_count,
        users_count=users_count,
        low_stock_count=low_stock_count,
        negative_stock_count=negative_stock_count,
        missing_sku_count=missing_sku_count,
        duplicate_sku_count=duplicate_sku_count,
    )

    # ── 2. 备份状态 ──
    backup_files_count = 0
    latest_backup_filename = ""
    latest_backup_time = ""
    latest_backup_size_bytes = 0
    has_available_backup = False
    has_pre_restore_backup = False
    candidate_extensions = []

    if BACKUP_DIR.exists() and BACKUP_DIR.is_dir():
        try:
            backup_files = []
            for ext in _ALLOWED_EXTENSIONS:
                backup_files.extend(BACKUP_DIR.glob(f"*{ext}"))
            backup_files = sorted(set(backup_files), key=lambda f: f.stat().st_mtime, reverse=True)

            backup_files_count = len(backup_files)
            extensions_seen = set()
            for bf in backup_files:
                ext = bf.suffix.lower()
                if ext not in extensions_seen:
                    extensions_seen.add(ext)
                    candidate_extensions.append(ext)
                if bf.name.startswith("pre_restore_backup_"):
                    has_pre_restore_backup = True

            if backup_files_count > 0:
                latest = backup_files[0]
                try:
                    stat = latest.stat()
                    latest_backup_filename = latest.name
                    latest_backup_time = datetime.fromtimestamp(stat.st_mtime).isoformat()
                    latest_backup_size_bytes = stat.st_size
                    if stat.st_size > 0:
                        has_available_backup = True
                except OSError:
                    pass
        except OSError as e:
            warnings.append(f"备份目录扫描异常：{e}")

    if not has_available_backup:
        warnings.append("尚未检测到可用备份，正式操作前请先创建数据库备份")

    backup_status = GoLiveBackupStatus(
        backup_files_count=backup_files_count,
        latest_backup_filename=latest_backup_filename,
        latest_backup_time=latest_backup_time,
        latest_backup_size_bytes=latest_backup_size_bytes,
        has_available_backup=has_available_backup,
        has_pre_restore_backup=has_pre_restore_backup,
        candidate_extensions=candidate_extensions,
    )

    # ── 3. 正式录入准备状态 ──
    data_may_be_test_data = products_count > 0 or transactions_count > 0
    before_entry_reminder = "正式录入前建议先创建数据库备份，确保可以回滚"
    batch_entry_reminder = "每批手动录入后建议导出 CSV 文件，与旧系统或腾讯文档反向核对"
    final_backup_reminder = "全部录入完成后建议创建数据库备份"

    if data_may_be_test_data:
        warnings.append("当前系统存在业务数据，正式录入前请确认数据是否为有效的正式产品数据")

    entry_readiness = GoLiveEntryReadiness(
        current_products_count=products_count,
        current_transactions_count=transactions_count,
        data_may_be_test_data=data_may_be_test_data,
        before_entry_reminder=before_entry_reminder,
        batch_entry_reminder=batch_entry_reminder,
        final_backup_reminder=final_backup_reminder,
    )

    # ── 4. 推荐流程 ──
    recommended_steps = [
        "第一步：创建当前数据库备份，确保操作安全",
        "第二步：确认当前系统中产品与出入库记录是否需要保留",
        "第三步：如需清空当前业务数据，先在设置页完成备份，再按受控清空流程处理",
        "第四步：按库存分类或库位分批手动录入正式产品信息",
        "第五步：每批录入完成后导出 CSV 文件，与旧系统或腾讯文档反向核对",
        "第六步：全部产品录入完成后，创建数据库备份",
        "第七步：确认用户权限、审计日志和备份预检均正常工作",
        "第八步：正式开始使用新系统进行出入库操作",
    ]

    # ── 5. 风险提示 ──
    risk_warnings = [
        "不要在未创建备份时清空数据，操作不可逆",
        "不要把未知采购价、售价填为 0，未知时应留空",
        "不要把旧系统历史出入库记录直接混入新系统正式出入库",
        "不要在未核对库存数量前开始正式出入库操作",
        "不要直接手工修改数据库文件，应通过系统功能操作",
        "不要提交数据库文件或备份文件到代码仓库",
        "出问题时先查看备份预检、恢复准备和审计日志，不要盲目修改数据",
    ]

    # ── 6. 整体评估 ──
    all_warnings = warnings + risk_warnings
    if negative_stock_count > 0 or duplicate_sku_count > 0:
        overall_level = "error"
        overall_message = "存在需要立即处理的数据异常（负库存或重复 SKU），请在重要操作前修正"
    elif not has_available_backup:
        overall_level = "warning"
        overall_message = "尚未检测到可用备份，正式操作前请先创建数据库备份"
    elif missing_sku_count > 0 or data_may_be_test_data:
        overall_level = "warning"
        overall_message = "系统数据尚有需要关注的事项，请在重要操作前检查确认"
    else:
        overall_level = "ok"
        overall_message = "系统状态正常，可以开始正式录入产品"

    return GoLiveChecklistResponse(
        success=True,
        database_status=db_status,
        backup_status=backup_status,
        entry_readiness=entry_readiness,
        recommended_steps=recommended_steps,
        warnings=all_warnings,
        overall_level=overall_level,
        overall_message=overall_message,
        message="管理员维护检查完成，请逐项查看状态和提醒",
    )
