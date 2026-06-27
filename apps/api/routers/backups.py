"""
备份 API 路由：手动触发数据库备份
"""

import sqlite3
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import BASE_DIR
from auth import require_admin

router = APIRouter()

# 路径常量
DB_PATH = Path(BASE_DIR) / "inventory.db"
BACKUP_DIR = Path(BASE_DIR) / "backups"


class BackupResponse(BaseModel):
    success: bool
    filename: str
    relative_path: str
    size_bytes: int
    created_at: str
    integrity_check: str
    message: str


def _check_preconditions() -> None:
    """备份前检查，不通过则抛出 HTTPException"""
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库文件不存在，无法备份",
        )
    if not DB_PATH.is_file():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库路径不是文件，无法备份",
        )

    # 确保备份目录存在
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    # 检查磁盘空间（至少需要 db 文件大小的 2 倍）
    db_size = DB_PATH.stat().st_size
    usage = shutil.disk_usage(BACKUP_DIR)
    if usage.free < db_size * 2:
        raise HTTPException(
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            detail=f"磁盘空间不足：需要 {db_size * 2:,} 字节，可用 {usage.free:,} 字节",
        )


def _validate_backup(backup_path: Path, expected_size: int) -> dict:
    """校验备份文件，返回 {'integrity_check': str, 'size_bytes': int}"""
    if not backup_path.exists():
        return {"integrity_check": "FAILED", "size_bytes": 0}

    size = backup_path.stat().st_size
    if size == 0:
        return {"integrity_check": "FAILED: empty file", "size_bytes": 0}

    # SQLite 文件头魔数校验
    with open(backup_path, "rb") as f:
        header = f.read(16)
    if header != b"SQLite format 3\x00":
        return {"integrity_check": "FAILED: invalid SQLite header", "size_bytes": size}

    # PRAGMA integrity_check
    try:
        conn = sqlite3.connect(str(backup_path))
        cursor = conn.execute("PRAGMA integrity_check")
        result = cursor.fetchone()[0]
        conn.close()
        return {"integrity_check": result, "size_bytes": size}
    except sqlite3.Error as e:
        return {"integrity_check": f"FAILED: {e}", "size_bytes": size}


@router.post("/manual", response_model=BackupResponse)
def manual_backup(admin: str = Depends(require_admin)):
    """
    手动触发数据库备份（仅管理员）

    使用 SQLite backup API 安全复制数据库文件，
    先写入临时文件，校验通过后再 rename 为最终文件名。
    """
    # 1. 备份前检查
    _check_preconditions()

    # 2. 生成文件名
    timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    filename = f"inventory-backup-{timestamp}.db"
    final_path = BACKUP_DIR / filename
    temp_path = BACKUP_DIR / f".{filename}.tmp"

    # 清理可能残留的同名临时文件
    if temp_path.exists():
        temp_path.unlink()

    created_at = datetime.now().isoformat()
    db_size = DB_PATH.stat().st_size

    # 3. 使用 SQLite backup API 安全备份
    try:
        src_conn = sqlite3.connect(str(DB_PATH))
        dst_conn = sqlite3.connect(str(temp_path))
        src_conn.backup(dst_conn)
        src_conn.close()
        dst_conn.close()
    except sqlite3.Error as e:
        # 清理失败的临时文件
        if temp_path.exists():
            temp_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"数据库备份失败：{e}",
        )

    # 4. 校验备份文件
    validation = _validate_backup(temp_path, db_size)

    if validation["integrity_check"] != "ok":
        # 校验失败，删除临时文件
        if temp_path.exists():
            temp_path.unlink()
        return BackupResponse(
            success=False,
            filename="",
            relative_path="",
            size_bytes=0,
            created_at=created_at,
            integrity_check=validation["integrity_check"],
            message=f"备份校验失败：{validation['integrity_check']}，备份文件已丢弃",
        )

    # 5. 校验通过，rename 为最终文件名
    temp_path.rename(final_path)
    final_size = final_path.stat().st_size

    # 相对路径（相对于 BASE_DIR）
    relative_path = f"backups/{filename}"

    return BackupResponse(
        success=True,
        filename=filename,
        relative_path=relative_path,
        size_bytes=final_size,
        created_at=created_at,
        integrity_check="ok",
        message=f"备份成功：{filename}（{final_size:,} 字节）",
    )
