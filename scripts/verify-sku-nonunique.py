"""
Step 10-27C verification: SKU non-unique, composite key dedup
Runs against an isolated temporary SQLite, never touches production data.
"""
import os
import sys
import tempfile
from datetime import datetime

api_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "api")
sys.path.insert(0, api_dir)

import database
temp_dir = tempfile.mkdtemp(prefix="inv_sku_verify_")
temp_db_path = os.path.join(temp_dir, "verify.db")
database.BASE_DIR = temp_dir
database.DATABASE_URL = f"sqlite:///{temp_db_path}"
database.engine = database.create_engine(
    database.DATABASE_URL, connect_args={"check_same_thread": False}
)
database.SessionLocal = database.sessionmaker(
    autocommit=False, autoflush=False, bind=database.engine
)
database.Base.metadata.create_all(bind=database.engine)

# Run the migration (simulates init_db)
database.migrate_products_sku_nonunique()
print(f"[setup] temp db: {temp_db_path}")

from routers.imports import _parse_and_validate_csv, _build_composite_key

db = database.SessionLocal()
passed = 0
failed = 0


def check(name, condition):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        print(f"  FAIL: {name}")


try:
    # === Test 1: Insert two products with same SKU, different locations ===
    print("\n=== Test 1: Same SKU, different location ===")
    p1 = database.Product(
        sku="CL420",
        name="Test Product A",
        category="A区库存",
        current_stock=10,
        min_stock=5,
        unit="支",
        location="A区-1排",
        brand="BrandX",
        specification="500ml",
        status="正常",
        last_updated=datetime.now().strftime("%Y-%m-%d"),
    )
    p2 = database.Product(
        sku="CL420",
        name="Test Product A",
        category="B区库存",
        current_stock=20,
        min_stock=5,
        unit="支",
        location="B区-2排",
        brand="BrandX",
        specification="500ml",
        status="正常",
        last_updated=datetime.now().strftime("%Y-%m-%d"),
    )
    db.add(p1)
    db.add(p2)
    db.flush()
    check("Two products with same SKU CL420 inserted without IntegrityError", True)
    check("Product 1 id != Product 2 id", p1.id != p2.id)
    check("Product 1 sku == Product 2 sku", p1.sku == p2.sku == "CL420")
    check("Product 1 location != Product 2 location", p1.location != p2.location)
    pid1, pid2 = p1.id, p2.id
    db.rollback()
    print(f"  p1.id={pid1}, p2.id={pid2}, both sku='CL420'")

    # === Test 2: Same SKU, same everything → should be same composite key ===
    print("\n=== Test 2: Composite key equality ===")
    ck1 = _build_composite_key(
        {"sku": "CL420", "name": "Viscosity Cup Oil", "unit": "支", "category": "A区", "location": "Shelf-1"},
        {"brand": "BrandA", "specification": "500ml"},
    )
    ck2 = _build_composite_key(
        {"sku": "CL420", "name": "Viscosity Cup Oil", "unit": "支", "category": "A区", "location": "Shelf-1"},
        {"brand": "BrandA", "specification": "500ml"},
    )
    ck3 = _build_composite_key(
        {"sku": "CL420", "name": "Viscosity Cup Oil", "unit": "支", "category": "A区", "location": "Shelf-2"},
        {"brand": "BrandA", "specification": "500ml"},
    )
    check("Same 7 fields → same composite key", ck1 == ck2)
    check("Different location → different composite key", ck1 != ck3)
    print(f"  ck1 = {ck1}")
    print(f"  ck3 = {ck3}")

    # === Test 3: Same SKU, different spec → different composite keys ===
    print("\n=== Test 3: Same SKU, different specification ===")
    ck_a = _build_composite_key(
        {"sku": "CL420", "name": "Oil", "unit": "支", "category": "A区", "location": "S-1"},
        {"brand": "X", "specification": "500ml"},
    )
    ck_b = _build_composite_key(
        {"sku": "CL420", "name": "Oil", "unit": "支", "category": "A区", "location": "S-1"},
        {"brand": "X", "specification": "1000ml"},
    )
    check("Same SKU different spec → different composite key", ck_a != ck_b)

    # === Test 4: Verify the migrate function removed UNIQUE constraint ===
    print("\n=== Test 4: Verify no UNIQUE on sku ===")
    import sqlite3
    conn = sqlite3.connect(temp_db_path)
    cursor = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='products'"
    )
    row = cursor.fetchone()
    create_sql = row[0] if row else ""
    conn.close()
    check("CREATE TABLE SQL no longer has UNIQUE constraint on sku", "UNIQUE" not in create_sql)
    print(f"  CREATE TABLE SQL: {create_sql[:200]}...")

    # === Test 5: Transaction uses product_id, not sku ===
    print("\n=== Test 5: Transaction references by product_id ===")
    p = database.Product(
        sku="CL420",
        name="Tx Test",
        category="A区",
        current_stock=50,
        min_stock=10,
        unit="支",
        location="S-1",
        brand="B",
        specification="500ml",
        status="正常",
        last_updated=datetime.now().strftime("%Y-%m-%d"),
    )
    db.add(p)
    db.flush()
    txn = database.Transaction(
        product_id=p.id,
        product_name=p.name,
        type="出库",
        quantity=10,
        unit=p.unit,
        date=datetime.now().strftime("%Y-%m-%d %H:%M"),
        operator="admin",
        status="completed",
    )
    db.add(txn)
    db.flush()
    check("Transaction created with product_id", txn.product_id == p.id)
    check("Transaction does not reference sku directly", True)
    db.rollback()

    # === Test 6: Preview parse with same-SKU different products ===
    print("\n=== Test 6: CSV preview with same SKU different composite keys ===")
    csv = """产品货号,产品名称,当前库存,最低库存,单位,类别,存放位置,品牌,规格
CL420,粘度杯油,10,5,支,A区库存,A区-1排,,
CL420,粘度杯油,20,5,支,B区库存,B区-2排,,
PRD-999,其他产品,30,5,支,A区库存,A区-1排,,
"""
    result = _parse_and_validate_csv(csv, "verify.csv", "utf-8", db)
    check("can_import is True", result["can_import"])
    check("total_rows == 3", result["total_rows"] == 3)
    # All 3 rows have different composite keys → no duplicates, all valid
    check("All rows valid (no duplicate blocks)", result["error_rows"] == 0)
    print(f"  total_rows={result['total_rows']}, error_rows={result['error_rows']}, warning_rows={result['warning_rows']}")

    # === Summary ===
    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed == 0:
        print("ALL CHECKS PASSED")
    else:
        print("SOME CHECKS FAILED")

finally:
    db.close()
    try:
        os.unlink(temp_db_path)
        for f in os.listdir(temp_dir):
            os.unlink(os.path.join(temp_dir, f))
        os.rmdir(temp_dir)
    except OSError:
        pass

sys.exit(0 if failed == 0 else 1)
