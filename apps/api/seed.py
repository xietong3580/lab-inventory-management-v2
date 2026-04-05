"""
数据库种子数据脚本
将 mock 数据导入 SQLite 数据库
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, Product, Transaction, AuditLog, init_db
from datetime import datetime

# mock 数据（从前端 mockData.js 转换）
mock_products = [
    {
        "sku": "PRD-2026001",
        "name": "离心管 50mL",
        "category": "耗材",
        "current_stock": 125,
        "min_stock": 50,
        "unit": "个",
        "location": "A区-3排-2层",
        "status": "正常",
        "last_updated": "2026-03-28",
    },
    {
        "sku": "PRD-2026002",
        "name": "移液器吸头 (10µL)",
        "category": "耗材",
        "current_stock": 520,
        "min_stock": 200,
        "unit": "盒",
        "location": "B区-1排-4层",
        "status": "正常",
        "last_updated": "2026-03-29",
    },
    {
        "sku": "PRD-2026003",
        "name": "PCR 板 (96孔)",
        "category": "耗材",
        "current_stock": 35,
        "min_stock": 30,
        "unit": "个",
        "location": "A区-2排-1层",
        "status": "低库存",
        "last_updated": "2026-03-27",
    },
    {
        "sku": "PRD-2026004",
        "name": "细胞培养瓶 (25cm²)",
        "category": "耗材",
        "current_stock": 80,
        "min_stock": 40,
        "unit": "个",
        "location": "C区-4排-3层",
        "status": "正常",
        "last_updated": "2026-03-28",
    },
    {
        "sku": "PRD-2026005",
        "name": "血清 (胎牛)",
        "category": "试剂",
        "current_stock": 15,
        "min_stock": 20,
        "unit": "瓶",
        "location": "冷藏室-2层",
        "status": "低库存",
        "last_updated": "2026-03-26",
    },
]

mock_transactions = [
    {
        "product_id": 1,
        "product_name": "离心管 50mL",
        "type": "出库",
        "quantity": 120,
        "unit": "个",
        "date": "2026-03-29 14:30",
        "operator": "张三",
        "status": "completed",
        "notes": "实验室日常使用",
    },
    {
        "product_id": 2,
        "product_name": "移液器吸头 (10µL)",
        "type": "入库",
        "quantity": 500,
        "unit": "盒",
        "date": "2026-03-29 11:15",
        "operator": "李四",
        "status": "completed",
        "notes": "新采购批次",
    },
    {
        "product_id": 3,
        "product_name": "PCR 板 (96孔)",
        "type": "出库",
        "quantity": 25,
        "unit": "个",
        "date": "2026-03-29 09:45",
        "operator": "王五",
        "status": "completed",
        "notes": "实验项目领用",
    },
]

def seed_database():
    """导入种子数据"""
    # 确保数据库表存在
    init_db()

    db = SessionLocal()

    try:
        # 清空现有数据
        db.query(Product).delete()
        db.query(Transaction).delete()
        db.query(AuditLog).delete()
        db.commit()

        # 导入产品数据
        for product_data in mock_products:
            product = Product(**product_data)
            db.add(product)
        db.commit()

        # 导入交易记录
        for txn_data in mock_transactions:
            transaction = Transaction(**txn_data)
            db.add(transaction)
        db.commit()

        # 创建一些审计日志
        audit_logs = [
            AuditLog(
                action_type="SYSTEM_INIT",
                product_name="",
                product_id="",
                operator="系统",
                timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                details="系统初始化完成"
            ),
            AuditLog(
                action_type="SEED_DATA_IMPORT",
                product_name="",
                product_id="",
                operator="系统",
                timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                details=f"导入了 {len(mock_products)} 个产品和 {len(mock_transactions)} 条交易记录"
            )
        ]

        for log in audit_logs:
            db.add(log)
        db.commit()

        print(f"种子数据导入完成:")
        print(f"  - 产品: {len(mock_products)} 条")
        print(f"  - 交易记录: {len(mock_transactions)} 条")
        print(f"  - 审计日志: {len(audit_logs)} 条")

    except Exception as e:
        db.rollback()
        print(f"种子数据导入失败: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()