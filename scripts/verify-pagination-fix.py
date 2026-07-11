"""
Step 10-28A verification: Backend product limit removed, stats correct
Tests against a COPY of the current production database.
"""
import os
import shutil
import sys
import sqlite3
import tempfile

API_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "api")
REAL_DB = os.path.join(API_DIR, "inventory.db")

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


if not os.path.exists(REAL_DB):
    print(f"SKIP: real db not found at {REAL_DB}")
    sys.exit(0)

# Copy DB
temp_dir = tempfile.mkdtemp(prefix="inv_limit_verify_")
temp_db = os.path.join(temp_dir, "verify.db")
shutil.copy2(REAL_DB, temp_db)

sys.path.insert(0, API_DIR)
import database
database.BASE_DIR = temp_dir
database.DATABASE_URL = f"sqlite:///{temp_db}"
database.engine = database.create_engine(
    database.DATABASE_URL, connect_args={"check_same_thread": False}
)
database.SessionLocal = database.sessionmaker(
    autocommit=False, autoflush=False, bind=database.engine
)

from routers.products import get_products
from routers.dashboard import get_dashboard_stats, get_low_stock_alerts
from routers.dashboard import get_low_stock_alerts as get_alerts

db = database.SessionLocal()

try:
    conn = sqlite3.connect(temp_db)
    total_products = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    low_stock = conn.execute(
        "SELECT COUNT(*) FROM products WHERE current_stock <= min_stock"
    ).fetchone()[0]
    normal_stock = conn.execute(
        "SELECT COUNT(*) FROM products WHERE current_stock > min_stock"
    ).fetchone()[0]
    conn.close()

    print(f"=== DB state: {total_products} products, {low_stock} low_stock, {normal_stock} normal ===")

    # Test 1: GET /products/ returns all products (no limit default)
    print("\n=== Test 1: GET /products/ returns all products ===")
    products = get_products(db=db, current_user=None)
    check(f"Returns all {total_products} products", len(products) == total_products)
    check("Returns full list with product fields", len(products) > 0 and 'sku' in products[0])

    # Test 2: GET /products/ with explicit limit respects it
    print("\n=== Test 2: GET /products/ with explicit limit ===")
    limited = get_products(limit=10, db=db, current_user=None)
    check("limit=10 returns 10 products", len(limited) == 10)

    # Test 3: GET /dashboard/stats returns correct counts
    print("\n=== Test 3: GET /dashboard/stats ===")
    stats = get_dashboard_stats(db=db, current_user=None)
    check(f"total_products={stats['total_products']} == {total_products}", stats['total_products'] == total_products)
    check(f"low_stock_count={stats['low_stock_count']} == {low_stock}", stats['low_stock_count'] == low_stock)
    check(f"normal_stock_count={stats['normal_stock_count']} == {normal_stock}", stats['normal_stock_count'] == normal_stock)

    # Test 4: GET /dashboard/low-stock-alerts returns all
    print("\n=== Test 4: GET /dashboard/low-stock-alerts ===")
    alerts = get_low_stock_alerts(db=db, current_user=None)
    check(f"Returns {len(alerts)} low-stock alerts == {low_stock}", len(alerts) == low_stock)

    # Test 5: Products list has correct status
    print("\n=== Test 5: Products have correct status calculation ===")
    low_in_list = sum(1 for p in products if p['status'] == '低库存')
    normal_in_list = sum(1 for p in products if p['status'] == "正常")
    check(f"Products list low_stock count {low_in_list} == {low_stock}", low_in_list == low_stock)
    check(f"Products list normal count {normal_in_list} == {normal_stock}", normal_in_list == normal_stock)

    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed == 0:
        print("ALL CHECKS PASSED")
    else:
        print("SOME CHECKS FAILED")

finally:
    db.close()
    try:
        os.unlink(temp_db)
        os.rmdir(temp_dir)
    except OSError:
        pass

sys.exit(0 if failed == 0 else 1)
