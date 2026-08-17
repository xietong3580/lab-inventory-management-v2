"""
备份 API 路由：手动触发数据库备份 + 备份文件列表
"""

import re
import sqlite3
import shutil
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, get_db_path, AuditLog
from auth import require_admin
import image_store

router = APIRouter()

# 路径常量
DB_PATH = Path(get_db_path())
BACKUP_DIR = Path(get_db_path()).parent / "backups"


class BackupResponse(BaseModel):
    success: bool
    filename: str
    relative_path: str
    size_bytes: int
    created_at: str
    integrity_check: str
    message: str
    # 产品图片配套备份信息
    image_backup_filename: str = ""
    image_count: int = 0
    image_backup_size_bytes: int = 0
    # 图片备份是否失败（数据库备份成功但图片备份失败时为 True）
    image_backup_failed: bool = False


class BackupItem(BaseModel):
    filename: str
    relative_path: str
    size_bytes: int
    created_at: str
    integrity_check: str


class BackupListResponse(BaseModel):
    success: bool
    items: List[BackupItem]
    count: int
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


# 允许的备份文件名模式（兼容 .db 旧格式与 .sqlite maintenance 格式）
_BACKUP_FILENAME_PATTERN = re.compile(
    r"^inventory-backup-\d{4}-\d{2}-\d{2}-\d{6}\.db$"
)
_MAINTENANCE_BACKUP_FILENAME_PATTERN = re.compile(
    r"^inventory_backup_\d{8}_\d{6}\.sqlite$"
)


def _safe_validate_filename(filename: str) -> str:
    """
    校验备份文件名是否安全，返回 resolved_path。
    不通过则抛出 HTTPException。
    """
    # 禁止路径穿越字符
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件名包含非法字符",
        )

    # 必须匹配 backup-YYYY-MM-DD-HHMMSS.db 或 backup_YYYYMMDD_HHMMSS.sqlite
    if not (_BACKUP_FILENAME_PATTERN.match(filename) or
            _MAINTENANCE_BACKUP_FILENAME_PATTERN.match(filename)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不允许的文件名格式：{filename}",
        )

    # 解析到 BACKUP_DIR 下的绝对路径
    resolved = (BACKUP_DIR / filename).resolve()

    # 确认路径仍在 BACKUP_DIR 内（防符号链接穿越）
    if not str(resolved).startswith(str(BACKUP_DIR.resolve())):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="非法的文件路径",
        )

    return str(resolved)


@router.post("/manual", response_model=BackupResponse)
def manual_backup(admin=Depends(require_admin), db: Session = Depends(get_db)):
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

    # 5.5 产品图片配套备份（与数据库备份同一时间戳）
    # 图片备份失败不影响已成功的数据库备份，也不影响原图片。
    image_backup_filename = ""
    image_count = 0
    image_backup_size_bytes = 0
    image_backup_failed = False
    try:
        image_backup = image_store.create_images_backup(timestamp)
        image_backup_filename = image_backup["filename"]
        image_count = image_backup["count"]
        image_backup_size_bytes = image_backup["size_bytes"]
    except image_store.ImageBackupError:
        image_backup_failed = True

    # Step 10-20D：审计日志（明确记录数据库备份成功、图片备份失败）
    operator = admin.display_name or admin.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if image_backup_failed:
        audit_details = (
            f"数据库备份已创建：{filename}，大小: {final_size:,} 字节；"
            f"产品图片备份失败"
        )
    else:
        image_desc = (
            f"图片备份: {image_backup_filename}（{image_count} 张）"
            if image_backup_filename
            else "图片备份: 无图片"
        )
        audit_details = (
            f"创建数据库备份：{filename}，大小: {final_size:,} 字节；{image_desc}"
        )
    audit_log = AuditLog(
        action_type="BACKUP_CREATE",
        product_name=f"数据库备份: {filename}",
        product_id="",
        operator=operator,
        timestamp=now_str,
        details=audit_details,
    )
    db.add(audit_log)
    db.commit()

    if image_backup_failed:
        message = f"数据库备份已创建：{filename}（{final_size:,} 字节），但产品图片备份失败"
    else:
        message = f"备份成功：{filename}（{final_size:,} 字节）"
        if image_backup_filename:
            message += f"；图片备份: {image_backup_filename}（{image_count} 张，{image_backup_size_bytes:,} 字节）"
        else:
            message += "；当前无图片"

    return BackupResponse(
        success=True,
        filename=filename,
        relative_path=relative_path,
        size_bytes=final_size,
        created_at=created_at,
        integrity_check="ok",
        message=message,
        image_backup_filename=image_backup_filename,
        image_count=image_count,
        image_backup_size_bytes=image_backup_size_bytes,
        image_backup_failed=image_backup_failed,
    )


@router.get("", response_model=BackupListResponse)
@router.get("/", response_model=BackupListResponse)
def list_backups(admin: str = Depends(require_admin)):
    """
    获取备份文件列表（仅管理员）

    按文件修改时间倒序排列，最新的备份在最前。
    对每个备份文件执行 SQLite integrity_check。
    """
    items: List[BackupItem] = []

    # 如果备份目录不存在，返回空列表
    if not BACKUP_DIR.exists():
        return BackupListResponse(
            success=True,
            items=[],
            count=0,
            message="备份目录尚未创建，无备份文件",
        )

    # 扫描备份目录中的 .db 和 .sqlite 备份文件，按修改时间倒序
    db_files = list(BACKUP_DIR.glob("inventory-backup-*.db"))
    sqlite_files = list(BACKUP_DIR.glob("inventory_backup_*.sqlite"))
    backup_files = sorted(
        db_files + sqlite_files,
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    for backup_path in backup_files:
        filename = backup_path.name
        size = backup_path.stat().st_size
        created_at = datetime.fromtimestamp(
            backup_path.stat().st_mtime
        ).isoformat()

        # 校验每个备份文件
        validation = _validate_backup(backup_path, size)

        items.append(BackupItem(
            filename=filename,
            relative_path=f"backups/{filename}",
            size_bytes=size,
            created_at=created_at,
            integrity_check=validation["integrity_check"],
        ))

    return BackupListResponse(
        success=True,
        items=items,
        count=len(items),
        message=f"备份文件列表获取成功，共 {len(items)} 个备份文件",
    )


@router.get("/{filename}/download")
def download_backup(filename: str, admin: str = Depends(require_admin)):
    """
    下载指定备份文件（仅管理员）

    安全要求：
    - 仅允许 inventory-backup-YYYY-MM-DD-HHMMSS.db 格式
    - 禁止路径穿越
    - 下载前执行 SQLite integrity_check，校验失败拒绝下载
    """
    # 1. 安全校验文件名并获取解析后的路径
    safe_path = _safe_validate_filename(filename)
    backup_path = Path(safe_path)

    # 2. 文件存在性检查
    if not backup_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"备份文件不存在：{filename}",
        )

    # 3. 下载前完整性校验
    validation = _validate_backup(backup_path, backup_path.stat().st_size)
    if validation["integrity_check"] != "ok":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"备份文件校验失败，拒绝下载：{validation['integrity_check']}",
        )

    # 4. 返回文件下载
    return FileResponse(
        path=str(backup_path),
        filename=filename,
        media_type="application/octet-stream",
    )
