"""
产品管理 API 路由
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db, Product
from schemas import ProductCreate, ProductUpdate, ProductResponse

router = APIRouter()

@router.get("/", response_model=list[ProductResponse])
def get_products(
    skip: int = 0,
    limit: int = 100,
    category: str = None,
    status: str = None,
    db: Session = Depends(get_db)
):
    """获取产品列表"""
    query = db.query(Product)

    if category and category != "all":
        query = query.filter(Product.category == category)

    if status and status != "all":
        query = query.filter(Product.status == status)

    products = query.offset(skip).limit(limit).all()
    return [product.to_dict() for product in products]

@router.get("/{product_id}")
def get_product(product_id: str, db: Session = Depends(get_db)):
    """获取单个产品详情"""
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
def create_product(product_data: ProductCreate, db: Session = Depends(get_db)):
    """创建新产品"""
    # 检查SKU是否已存在
    existing = db.query(Product).filter(Product.sku == product_data.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail="SKU已存在")

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
        last_updated=datetime.now().strftime("%Y-%m-%d")
    )

    db.add(db_product)
    db.commit()
    db.refresh(db_product)

    return db_product.to_dict()

@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: str,
    product_data: ProductUpdate,
    db: Session = Depends(get_db)
):
    """更新产品信息"""
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
        # 检查SKU是否重复（排除自身）
        existing = db.query(Product).filter(
            Product.sku == update_data["sku"],
            Product.id != db_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="SKU已存在")
        product.sku = update_data["sku"]

    # 直接更新的字段
    field_mapping = {
        "name": "name",
        "category": "category",
        "unit": "unit",
        "location": "location"
    }

    for frontend_key, backend_key in field_mapping.items():
        if frontend_key in update_data:
            setattr(product, backend_key, update_data[frontend_key])

    # 重新计算状态
    product.status = "低库存" if product.current_stock <= product.min_stock else "正常"
    product.last_updated = datetime.now().strftime("%Y-%m-%d")

    db.commit()
    db.refresh(product)

    return product.to_dict()

@router.delete("/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db)):
    """删除产品"""
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

    db.delete(product)
    db.commit()

    return {"message": "产品已删除", "id": product_id}