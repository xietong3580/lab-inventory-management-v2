"""
产品主图 API 路由

- POST   /api/products/{product_id}/image   上传/替换图片（仅 admin）
- GET    /api/products/{product_id}/image   获取图片（登录用户，admin/viewer 均可）
- DELETE /api/products/{product_id}/image   删除图片（仅 admin）
"""

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db, Product, AuditLog
from auth import get_current_user, require_admin
import image_store

router = APIRouter()


def _resolve_product(product_id: str, db: Session) -> Product:
    """解析产品 ID 并返回产品对象，无效 ID 返回 400，不存在返回 404"""
    try:
        if product_id.startswith("prod-"):
            db_id = int(product_id[5:])
        else:
            db_id = int(product_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的产品ID格式")

    product = db.query(Product).filter(Product.id == db_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="产品未找到")
    return product


def _write_audit(db: Session, action_type: str, product: Product, product_id: str, operator: str, details: str) -> None:
    """写入图片相关审计日志"""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.add(AuditLog(
        action_type=action_type,
        product_name=product.name,
        product_id=product_id,
        operator=operator,
        timestamp=now_str,
        details=details,
    ))


def _safe_cleanup_file(filename):
    """数据库提交成功后安全清理图片文件；失败仅记录安全警告，不影响已成功的业务。

    遗留文件由 maintenance preflight 作为孤立文件发现。
    """
    if not filename:
        return
    try:
        image_store.delete_image(filename)
    except (image_store.ImageValidationError, OSError) as e:
        # 只记录相对文件名，不暴露服务器绝对路径
        print(f"[警告] 清理图片文件失败（图片引用: {filename}）: {e}")


@router.post("/{product_id}/image")
def upload_image(
    product_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """上传或替换产品主图（仅管理员）。

    - multipart/form-data，字段名 file
    - 产品不存在返回 404，文件无效返回 400
    - 替换：先保存新图 → 更新数据库 → 数据库成功后清理旧图；数据库失败则清理本次新图
    """
    product = _resolve_product(product_id, db)

    # 有界读取：最多读取 MAX_FILE_BYTES + 1 字节，避免把任意超大文件全部读入内存
    try:
        data = file.file.read(image_store.MAX_FILE_BYTES + 1)
    except Exception:
        raise HTTPException(status_code=400, detail="读取图片文件失败")

    if len(data) > image_store.MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="图片大小超过 5MB 限制")

    try:
        filename = image_store.save_image(data)
    except image_store.ImageValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="图片处理失败")

    old_filename = product.image_path
    product.image_path = filename
    product.image_updated_at = datetime.now().isoformat()

    operator = admin.display_name or admin.username
    is_replace = bool(old_filename)
    action_type = "PRODUCT_IMAGE_REPLACE" if is_replace else "PRODUCT_IMAGE_UPLOAD"
    action_label = "替换" if is_replace else "上传"
    _write_audit(
        db, action_type, product, product_id, operator,
        f"{action_label}产品图片：{product.name}（SKU: {product.sku}）",
    )

    try:
        db.commit()
    except Exception:
        db.rollback()
        # 数据库更新失败：清理本次新文件，不留下孤立文件
        image_store.delete_image(filename)
        raise HTTPException(status_code=500, detail="保存图片信息失败")

    db.refresh(product)

    # 数据库更新成功后，清理旧图片（失败仅留下可后续清理的孤立文件，不影响业务）
    if is_replace:
        _safe_cleanup_file(old_filename)

    return {
        "product_id": product_id,
        "has_image": True,
        "image_updated_at": product.image_updated_at,
        "action": action_label,
    }


@router.get("/{product_id}/image")
def get_image(
    product_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """获取产品主图（登录用户，admin/viewer 均可查看）。

    - 无图片返回 404（前端按约定显示占位）
    - 返回正确 Content-Type 与缓存头，替换后因版本参数变化不显示旧缓存
    """
    product = _resolve_product(product_id, db)

    if not product.image_path:
        raise HTTPException(status_code=404, detail="该产品暂无图片")

    try:
        path = image_store.resolve_image_path(product.image_path)
    except image_store.ImageValidationError:
        raise HTTPException(status_code=404, detail="图片路径无效")

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="图片文件不存在")

    try:
        data = path.read_bytes()
    except OSError:
        # 权限/磁盘/读取异常时返回安全的 404，不暴露内部错误与绝对路径
        raise HTTPException(status_code=404, detail="图片暂时不可用")

    version = product.image_updated_at or ""
    return Response(
        content=data,
        media_type="image/webp",
        headers={
            # 私有缓存 + 明确过期；前端以 version 作为查询参数，替换后 URL 变化不命中旧缓存
            "Cache-Control": "private, max-age=86400",
            "ETag": f'"{version or product.image_path}"',
            "Content-Disposition": "inline",
        },
    )


@router.delete("/{product_id}/image")
def delete_image(
    product_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """删除产品主图（仅管理员）。

    - 产品不存在返回 404
    - 无图片时安全幂等成功
    - 清空数据库字段后，安全删除图片目录内文件
    """
    product = _resolve_product(product_id, db)

    old_filename = product.image_path
    product.image_path = None
    product.image_updated_at = None

    operator = admin.display_name or admin.username
    _write_audit(
        db, "PRODUCT_IMAGE_DELETE", product, product_id, operator,
        f"删除产品图片：{product.name}（SKU: {product.sku}）",
    )

    try:
        db.commit()
    except Exception:
        # commit 失败时回滚，图片文件保留，字段恢复由数据库事务回滚保证
        db.rollback()
        raise HTTPException(status_code=500, detail="删除图片信息失败")

    db.refresh(product)

    # 数据库提交成功后，幂等删除文件（文件不存在也成功），失败仅留下孤立文件不影响业务
    _safe_cleanup_file(old_filename)

    return {
        "product_id": product_id,
        "has_image": False,
        "message": "图片已删除",
    }
