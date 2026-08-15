"""
Step 10-27C-fix verification: 验证正式库当前 SKU 非唯一状态

当前正式规则：
- SKU 允许重复
- products.sku 不应有 UNIQUE 约束
- 普通非唯一索引允许存在
- 同货号不同库存条目属于合法业务数据

本脚本在正式库的临时副本上验证，绝不接触 apps/api/inventory.db。
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


# === Step 1: 复制正式库到临时副本（对正式库只读） ===
print("=== Step 1: 复制正式库到临时副本 ===")
if not os.path.exists(REAL_DB):
    print(f"  SKIP: real db not found at {REAL_DB}")
    sys.exit(0)

temp_dir = tempfile.mkdtemp(prefix="inv_fix_verify_")
temp_db = os.path.join(temp_dir, "verify.db")
shutil.copy2(REAL_DB, temp_db)
print(f"  Copied to: {temp_db}")

conn = sqlite3.connect(temp_db)

try:
    # === Step 2: 检查当前表结构与 SKU 索引状态 ===
    print("\n=== Step 2: 表结构与 SKU 索引状态 ===")
    for table in ["products", "transactions", "audit_logs", "users"]:
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count} rows")

    create_sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='products'"
    ).fetchone()[0]
    check("products 建表 SQL 中无 UNIQUE 约束", "UNIQUE" not in create_sql)

    indexes = [(r[1], r[2]) for r in conn.execute("PRAGMA index_list('products')").fetchall()]
    print("  products 索引:")
    for name, uniq in indexes:
        cols = [c[2] for c in conn.execute(f"PRAGMA index_info('{name}')").fetchall()]
        print(f"    {name}: unique={uniq}, columns={cols}")

    sku_uniq = [
        name for name, uniq in indexes
        if uniq == 1 and [c[2] for c in conn.execute(f"PRAGMA index_info('{name}')").fetchall()] == ['sku']
    ]
    check("无 SKU 唯一索引（0 个）", len(sku_uniq) == 0)

    sku_nonuniq = [name for name, uniq in indexes if name == 'ix_products_sku' and uniq == 0]
    check("ix_products_sku 存在且为非唯一索引（unique=0）", len(sku_nonuniq) == 1)

    # === Step 3: 验证可插入重复 SKU（相同货号、不同库位），且不破坏原有数据 ===
    print("\n=== Step 3: 插入重复 SKU（相同货号、不同库位） ===")
    before_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    dup_sku = "__VERIFY_DUP_SKU__"

    insert_ok = True
    try:
        conn.execute(
            "INSERT INTO products (sku, name, category, current_stock, min_stock, unit, location, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (dup_sku, "Verify A", "A区", 10, 5, "支", "Shelf-1", "正常"),
        )
        conn.execute(
            "INSERT INTO products (sku, name, category, current_stock, min_stock, unit, location, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (dup_sku, "Verify A", "B区", 20, 5, "支", "Shelf-2", "正常"),
        )
        conn.commit()
    except sqlite3.IntegrityError as e:
        insert_ok = False
        conn.rollback()
        print(f"    IntegrityError: {e}")
    check("成功插入 2 条相同 SKU 记录（无 IntegrityError）", insert_ok)

    # 修正多行解包：按 SKU 精确取回刚插入的两条记录 id
    dup_ids = [
        r[0] for r in conn.execute(
            "SELECT id FROM products WHERE sku=? ORDER BY id", (dup_sku,)
        ).fetchall()
    ]
    check(f"按 SKU 精确找到 2 条记录（实际 {len(dup_ids)}）", len(dup_ids) == 2)
    if len(dup_ids) >= 2:
        check("两条重复 SKU 记录 id 不同", dup_ids[0] != dup_ids[1])

    after_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    check(
        f"原有产品数据未被破坏（{before_count} + 2 = {after_count}）",
        after_count == before_count + 2,
    )

    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed == 0:
        print("ALL CHECKS PASSED")
    else:
        print("SOME CHECKS FAILED")

finally:
    conn.close()
    try:
        os.unlink(temp_db)
        os.rmdir(temp_dir)
    except OSError:
        pass

sys.exit(0 if failed == 0 else 1)
