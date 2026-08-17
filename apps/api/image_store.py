"""
产品主图文件存储与安全处理模块

- 图片文件保存在服务器文件系统，SQLite 只保存相对文件名（不含目录、不含绝对路径）
- 使用 Pillow 校验真实图片内容，并统一安全处理（EXIF 修正、去元数据、限边长、转 WebP）
- 文件名使用 UUID 随机生成，杜绝原始文件名冲突与路径注入
- 所有删除/解析操作严格限制在图片目录内，禁止路径穿越
"""

import io
import os
import re
import uuid
import warnings
import zipfile
from pathlib import Path

from PIL import Image, ImageOps

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 单张图片最大 5MB
MAX_FILE_BYTES = 5 * 1024 * 1024
# 最大边长（防解压炸弹 / 超大像素）
MAX_DIMENSION = 2000
# 显式像素上限（超过直接拒绝）
MAX_PIXELS = 40_000_000
# 允许的真实图片格式（校验真实内容，不看扩展名）
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# 将 Pillow 的像素炸弹阈值设为项目安全上限，超大图片尽早被拒绝
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

# 系统生成的正式产品图片文件名：UUID32 十六进制 + .webp
_IMAGE_FILENAME_PATTERN = re.compile(r"^[0-9a-f]{32}\.webp$")


class ImageValidationError(ValueError):
    """图片校验失败"""


class ImageBackupError(Exception):
    """图片备份失败（用于向调用方抛出安全异常，不暴露内部细节）"""


def get_upload_dir() -> Path:
    """图片目录（可通过 INVENTORY_IMAGE_DIR 环境变量覆盖，测试使用临时目录）"""
    env = os.environ.get("INVENTORY_IMAGE_DIR")
    if env:
        return Path(env)
    return Path(BASE_DIR) / "uploads" / "product-images"


def get_backup_dir() -> Path:
    """备份目录（与数据库备份同目录，保证 DB 与图片备份时间戳配对）"""
    from database import get_db_path
    return Path(get_db_path()).parent / "backups"


def ensure_upload_dir() -> Path:
    """确保图片目录存在（自动安全创建）"""
    upload_dir = get_upload_dir()
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


def validate_and_process_image(data: bytes) -> bytes:
    """校验真实图片内容并安全处理，返回统一 WebP 字节。

    允许 JPG/JPEG/PNG/WebP；拒绝空文件、伪造扩展名、SVG、GIF、
    可执行文件、超 5MB、异常超大像素图片。
    """
    if not data:
        raise ImageValidationError("图片文件为空")

    if len(data) > MAX_FILE_BYTES:
        raise ImageValidationError("图片大小超过 5MB 限制")

    # 第一次打开：尽早读取格式与尺寸，尽早拒绝像素炸弹（访问 .size 会触发解压炸弹检测）
    with warnings.catch_warnings():
        # 将 DecompressionBombWarning 升级为异常，统一转换为 ImageValidationError
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            img = Image.open(io.BytesIO(data))
            fmt = (img.format or "").upper()
            width, height = img.size
        except (Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise ImageValidationError("图片像素尺寸过大")
        except Exception:
            raise ImageValidationError("不是有效的图片文件（仅支持 JPG/PNG/WebP）")

    if fmt not in ALLOWED_FORMATS:
        raise ImageValidationError(
            f"不支持的图片格式：{fmt or '未知'}（仅支持 JPG/PNG/WebP）"
        )

    if width <= 0 or height <= 0:
        raise ImageValidationError("图片尺寸无效")
    if width > 20000 or height > 20000:
        raise ImageValidationError("图片像素尺寸过大")
    if width * height > MAX_PIXELS:
        raise ImageValidationError("图片像素尺寸过大")

    # verify 完整校验（verify 会关闭文件，故随后重新打开）
    try:
        img.verify()
    except Exception:
        raise ImageValidationError("不是有效的图片文件（仅支持 JPG/PNG/WebP）")

    # 重新打开用于处理
    img = Image.open(io.BytesIO(data))

    # 修正 EXIF 方向（旋转照片）
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # 限制最大边长，保持清晰度
    if max(img.size) > MAX_DIMENSION:
        img.thumbnail((MAX_DIMENSION, MAX_DIMENSION))

    # 统一转 WebP；PNG 透明背景转 RGBA，其余转 RGB
    if img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info):
        img = img.convert("RGBA")
    else:
        img = img.convert("RGB")

    out = io.BytesIO()
    img.save(out, format="WEBP", quality=88)
    return out.getvalue()


def generate_filename() -> str:
    """生成安全的随机文件名（UUID，无扩展名歧义）"""
    return f"{uuid.uuid4().hex}.webp"


def resolve_image_path(filename: str) -> Path:
    """将相对文件名解析到图片目录内，禁止路径穿越 / 绝对路径 / 目录穿越"""
    if not filename or not isinstance(filename, str):
        raise ImageValidationError("无效的图片文件名")
    # 仅允许纯文件名（不含路径分隔符、不含 ".."、不以点开头）
    if os.path.basename(filename) != filename:
        raise ImageValidationError("非法图片文件名")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise ImageValidationError("非法图片文件名")
    if filename.startswith("."):
        raise ImageValidationError("非法图片文件名")

    upload_dir = get_upload_dir().resolve()
    path = (upload_dir / filename).resolve()
    if not str(path).startswith(str(upload_dir) + os.sep):
        raise ImageValidationError("图片路径越界")
    return path


def save_image(data: bytes) -> str:
    """校验并保存图片，返回相对文件名（仅文件名，不含目录）"""
    processed = validate_and_process_image(data)
    ensure_upload_dir()
    filename = generate_filename()
    path = get_upload_dir() / filename
    with open(path, "wb") as f:
        f.write(processed)
    return filename


def delete_image(filename: str) -> bool:
    """安全删除图片目录内的文件，文件不存在时幂等返回 False"""
    if not filename:
        return False
    path = resolve_image_path(filename)
    if path.exists() and path.is_file():
        path.unlink()
        return True
    return False


def is_valid_image_filename(name: str) -> bool:
    """判断是否为系统生成的正式产品图片文件名（UUID32 十六进制 + .webp）。

    明确排除 .gitkeep、隐藏文件、临时文件、ZIP 及其他非产品图片。
    """
    if not name or not isinstance(name, str):
        return False
    if name.startswith("."):
        return False
    return bool(_IMAGE_FILENAME_PATTERN.match(name))


def list_image_files():
    """列出图片目录内的正式产品图片文件名（排序），目录不存在返回空列表。

    仅返回符合系统生成规则的 .webp 文件，排除 .gitkeep、隐藏文件、临时文件、ZIP 等。
    """
    upload_dir = get_upload_dir()
    if not upload_dir.exists():
        return []
    return sorted(
        p.name for p in upload_dir.iterdir()
        if p.is_file() and is_valid_image_filename(p.name)
    )


def create_images_backup(timestamp: str) -> dict:
    """为产品图片目录生成配套压缩包，返回 {filename, count, size_bytes}。

    - 无图片时返回 count=0、filename=""（不生成空压缩包）
    - 压缩包与数据库备份使用同一时间戳，可明确配对
    - 压缩包内文件使用固定前缀 product-images/，不含路径穿越
    - 原子生成：先写 .tmp，全部成功后 os.replace 为正式 .zip
    """
    files = list_image_files()
    if not files:
        return {"filename": "", "count": 0, "size_bytes": 0}

    filename = f"product_images_backup_{timestamp}.zip"
    tmp_path = None

    def _cleanup_tmp():
        if tmp_path is not None:
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except OSError:
                pass

    try:
        backup_dir = get_backup_dir()
        backup_dir.mkdir(parents=True, exist_ok=True)
        final_path = backup_dir / filename
        tmp_path = backup_dir / f"{filename}.tmp"

        # 清理可能残留的同名临时文件
        if tmp_path.exists():
            tmp_path.unlink()

        # 写入压缩包（先写 .tmp）
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for name in files:
                src = get_upload_dir() / name
                # 图片可能在压缩过程中被删除/消失，写入前再次确认
                if not src.exists() or not src.is_file():
                    raise ImageBackupError("产品图片备份失败")
                zf.write(src, arcname=f"product-images/{name}")

        # 原子改名（正式 ZIP 已存在时 os.replace 会安全覆盖，不产生半覆盖文件）
        os.replace(tmp_path, final_path)

        return {"filename": filename, "count": len(files), "size_bytes": final_path.stat().st_size}
    except ImageBackupError:
        # 业务失败：尽力删除残留 .tmp，不删除原图片、不删除已存在正式 ZIP
        _cleanup_tmp()
        raise ImageBackupError("产品图片备份失败")
    except OSError:
        # 普通文件系统异常统一归一化，避免绕过部分成功处理
        _cleanup_tmp()
        raise ImageBackupError("产品图片备份失败")
