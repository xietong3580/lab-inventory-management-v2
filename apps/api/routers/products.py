"""
产品管理 API 路由
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db, Product, User, Transaction, AuditLog
from schemas import ProductCreate, ProductUpdate, ProductResponse
from auth import get_current_user, require_admin
import image_store

router = APIRouter()

@router.get("/", response_model=list[ProductResponse])
def get_products(
    skip: int = 0,
    limit: int = None,
    category: str = None,
    status: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取产品列表（需登录）

    - 不传 limit 时返回全量产品（默认行为，Dashboard/Alerts/Products 统计依赖全量数据）
    - 传 limit 时启用分页（如 limit=20 则每页 20 条）
    - skip 配合 limit 使用分页偏移
    """
    query = db.query(Product)

    if category and category != "all":
        query = query.filter(Product.category == category)

    if status and status != "all":
        # 实时计算库存状态进行筛选，不依赖数据库旧 status 字段
        if status == "低库存":
            query = query.filter(Product.current_stock <= Product.min_stock)
        elif status == "正常":
            query = query.filter(Product.current_stock > Product.min_stock)

    if limit is not None:
        products = query.offset(skip).limit(limit).all()
    else:
        products = query.offset(skip).all()
    return [product.to_dict() for product in products]

@router.get("/{product_id}")
def get_product(product_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """获取单个产品详情（需登录）"""
    try:
        # 解析产品ID（格式：prod-000001）
        if product_id.startswith("prod-"):
            db_id = int(product_id[5:])
        else:
            db_id = int(product_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的产品ID格式")

    product = db.query(Product).filter(Product.id == db_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="产品未找到")

    return product.to_dict()

@router.post("/", response_model=ProductResponse)
def create_product(product_data: ProductCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """创建新产品（需管理员权限）"""
    # Step 10-27C: 七字段复合键判重（品牌+货号+名称+规格+单位+类别+位置）
    # 只有完全相同才拒绝，同 SKU 不同规格/库位/品牌允许共存。
    existing = db.query(Product).filter(
        Product.sku == product_data.sku,
        Product.name == product_data.name,
        Product.brand == (product_data.brand or None),
        Product.specification == (product_data.specification or None),
        Product.unit == product_data.unit,
        Product.category == product_data.category,
        Product.location == (product_data.location or ""),
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"完全重复的库存产品（ID: prod-{existing.id:06d}，名称: {existing.name}），"
                   f"品牌/货号/名称/规格/单位/类别/位置均相同。同货号不同规格/库位可正常创建。"
        )

    # 计算库存状态
    status = "低库存" if product_data.currentStock <= product_data.minStock else "正常"

    # 创建产品记录
    db_product = Product(
        sku=product_data.sku,
        name=product_data.name,
        category=product_data.category,
        current_stock=product_data.currentStock,
        min_stock=product_data.minStock,
        unit=product_data.unit,
        location=product_data.location,
        status=status,
        last_updated=datetime.now().strftime("%Y-%m-%d"),
        # P1 扩展字段（Step 10-2B）
        brand=product_data.brand or None,
        specification=product_data.specification or None,
        supplier=product_data.supplier or None,
        notes=product_data.notes or None,
        # P1 价格字段（Step 10-6C）
        purchase_price=product_data.purchasePrice,
        sale_price=product_data.salePrice,
    )

    db.add(db_product)
    db.flush()  # 获取自增 ID

    # Step 10-21B：审计日志 — PRODUCT_ADD
    operator = current_user.display_name or current_user.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    audit_log = AuditLog(
        action_type="PRODUCT_ADD",
        product_name=db_product.name,
        product_id=f"prod-{db_product.id:06d}",
        operator=operator,
        timestamp=now_str,
        details=f"新增产品：{db_product.name}（SKU: {db_product.sku}），"
                f"当前库存: {db_product.current_stock} {db_product.unit}，"
                f"分类: {db_product.category or '-'}",
    )
    db.add(audit_log)

    db.commit()
    db.refresh(db_product)

    return db_product.to_dict()

@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: str,
    product_data: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """更新产品信息（需管理员权限）"""
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

    # 更新字段
    update_data = product_data.dict(exclude_unset=True)

    # 映射字段名：前端 currentStock -> 数据库 current_stock
    if "currentStock" in update_data:
        product.current_stock = update_data["currentStock"]
    if "minStock" in update_data:
        product.min_stock = update_data["minStock"]
    if "sku" in update_data:
        # Step 10-27C: 七字段复合键判重（排除自身）
        existing = db.query(Product).filter(
            Product.sku == update_data["sku"],
            Product.name == product.name,
            Product.brand == (product.brand or None),
            Product.specification == (product.specification or None),
            Product.unit == product.unit,
            Product.category == product.category,
            Product.location == (product.location or ""),
            Product.id != db_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"完全重复的库存产品（ID: prod-{existing.id:06d}）。"
                       f"同货号不同规格/库位可正常保存。"
            )
        product.sku = update_data["sku"]

    # 直接更新的字段
    field_mapping = {
        "name": "name",
        "category": "category",
        "unit": "unit",
        "location": "location",
        # P1 扩展字段（Step 10-2B）
        "brand": "brand",
        "specification": "specification",
        "supplier": "supplier",
        "notes": "notes",
        # P1 价格字段（Step 10-6C）
        "purchasePrice": "purchase_price",
        "salePrice": "sale_price",
    }

    for frontend_key, backend_key in field_mapping.items():
        if frontend_key in update_data:
            setattr(product, backend_key, update_data[frontend_key])

    # 重新计算状态
    product.status = "低库存" if product.current_stock <= product.min_stock else "正常"
    product.last_updated = datetime.now().strftime("%Y-%m-%d")

    # Step 10-21B：审计日志 — PRODUCT_UPDATE
    operator = current_user.display_name or current_user.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    audit_log = AuditLog(
        action_type="PRODUCT_UPDATE",
        product_name=product.name,
        product_id=product_id,
        operator=operator,
        timestamp=now_str,
        details=f"编辑产品：{product.name}（SKU: {product.sku}），"
                f"当前库存: {product.current_stock} {product.unit}，"
                f"分类: {product.category or '-'}",
    )
    db.add(audit_log)

    db.commit()
    db.refresh(product)

    return product.to_dict()

@router.delete("/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """删除产品（需管理员权限，有关联交易记录时禁止删除）"""
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

    # Step 10-20C：删除前检查关联交易记录
    related_txn_count = db.query(Transaction).filter(
        Transaction.product_id == db_id
    ).count()

    if related_txn_count > 0:
        raise HTTPException(
            status_code=409,
            detail="该产品已有出入库记录，不能直接删除。请保留产品档案以保证库存台账和审计记录完整。",
        )

    # 仅暂存当前图片相对文件名，不提前删除文件。
    # 只有数据库删除与事务提交真正成功后，才清理对应图片文件。
    image_path_to_clean = product.image_path

    # 记录删除前产品信息（用于审计日志）
    operator = current_user.display_name or current_user.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    audit_details = (
        f"删除产品：{product.name}（SKU: {product.sku}），"
        f"当前库存: {product.current_stock} {product.unit}，"
        f"分类: {product.category or '-'}，"
        f"操作人: {operator}"
    )

    # 在同一事务中：写审计日志 → 删除产品 → 提交
    audit_log = AuditLog(
        action_type="PRODUCT_DELETE",
        product_name=product.name,
        product_id=product_id,
        operator=operator,
        timestamp=now_str,
        details=audit_details,
    )
    db.add(audit_log)

    db.delete(product)
    db.commit()

    # 产品数据库删除已成功提交，此时才安全清理主图。
    # 图片不存在或清理失败都不回滚已完成的产品删除，仅留下可由维护预检发现的孤立文件。
    if image_path_to_clean:
        try:
            image_store.delete_image(image_path_to_clean)
        except (image_store.ImageValidationError, OSError) as e:
            # 记录安全警告，不暴露服务器绝对路径，不影响已完成的业务删除
            print(f"[警告] 删除产品 {product_id} 后清理图片失败（图片引用: {image_path_to_clean}）: {e}")

    return {"message": "产品已删除", "id": product_id}