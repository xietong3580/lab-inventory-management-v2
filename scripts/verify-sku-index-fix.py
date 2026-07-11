"""
Step 10-27C-fix verification: ensure ix_products_sku unique index is removed

Tests on a COPY of the current production database.
Never touches the real inventory.db directly.
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


# === Step 1: Copy the real DB ===
print("=== Step 1: Copy real DB to temp ===")
if not os.path.exists(REAL_DB):
    print(f"  SKIP: real db not found at {REAL_DB}")
    sys.exit(0)

temp_dir = tempfile.mkdtemp(prefix="inv_fix_verify_")
temp_db = os.path.join(temp_dir, "verify.db")
shutil.copy2(REAL_DB, temp_db)
print(f"  Copied to: {temp_db}")

conn = sqlite3.connect(temp_db)

# === Step 2: Check pre-migration state ===
print("\n=== Step 2: Pre-migration state ===")

# Table row counts
for table in ["products", "transactions", "audit_logs", "users"]:
    count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"  {table}: {count} rows")

# CREATE TABLE SQL
cur = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'")
create_sql = cur.fetchone()[0]
check("CREATE TABLE SQL has no UNIQUE", "UNIQUE" not in create_sql)
print(f"  CREATE TABLE excerpt: {create_sql[:120]}...")

# PRAGMA index_list
print("\n  Indexes on products:")
cur = conn.execute("PRAGMA index_list('products')")
indexes_before = [(r[1], r[2]) for r in cur.fetchall()]
for name, uniq in indexes_before:
    cols = conn.execute(f"PRAGMA index_info('{name}')").fetchall()
    col_names = [c[2] for c in cols]
    print(f"    {name}: unique={uniq}, columns={col_names}")

# Find sku UNIQUE indexes
sku_uniq_before = [name for name, uniq in indexes_before
                   if uniq == 1 and [c[2] for c in conn.execute(f"PRAGMA index_info('{name}')").fetchall()] == ['sku']]
check(f"Pre-migration: found {len(sku_uniq_before)} sku UNIQUE index(es)", len(sku_uniq_before) >= 1)
print(f"    -> {sku_uniq_before}")

conn.close()

# === Step 3: Run the migration on the copy ===
print("\n=== Step 3: Run migrate_products_sku_nonunique on copy ===")
sys.path.insert(0, API_DIR)
import database
database.BASE_DIR = temp_dir
database.migrate_products_sku_nonunique()

# === Step 4: Check post-migration state ===
print("\n=== Step 4: Post-migration state ===")
conn = sqlite3.connect(temp_db)

# Table row counts
print("  Row counts:")
for table in ["products", "transactions", "audit_logs", "users"]:
    count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"    {table}: {count} rows")

# PRAGMA index_list
print("\n  Indexes on products:")
cur = conn.execute("PRAGMA index_list('products')")
indexes_after = [(r[1], r[2]) for r in cur.fetchall()]
for name, uniq in indexes_after:
    cols = conn.execute(f"PRAGMA index_info('{name}')").fetchall()
    col_names = [c[2] for c in cols]
    print(f"    {name}: unique={uniq}, columns={col_names}")

sku_uniq_after = [name for name, uniq in indexes_after
                  if uniq == 1 and [c[2] for c in conn.execute(f"PRAGMA index_info('{name}')").fetchall()] == ['sku']]
check("Post-migration: 0 sku UNIQUE indexes", len(sku_uniq_after) == 0)

# ix_products_sku exists and is non-unique
sku_idx_exists = any(
    name == 'ix_products_sku' and uniq == 0 for name, uniq in indexes_after
)
check("ix_products_sku exists with unique=0", sku_idx_exists)

# === Step 5: Try inserting same SKU twice ===
print("\n=== Step 5: Insert same SKU, different locations ===")
try:
    conn.execute("""
        INSERT INTO products (sku, name, category, current_stock, min_stock, unit, location, status)
        VALUES ('CL420', 'Test A', 'A区', 10, 5, '支', 'Shelf-1', '正常')
    """)
    conn.execute("""
        INSERT INTO products (sku, name, category, current_stock, min_stock, unit, location, status)
        VALUES ('CL420', 'Test A', 'B区', 20, 5, '支', 'Shelf-2', '正常')
    """)
    conn.commit()
    check("Inserted 2 rows with same SKU CL420", True)
    p1_id, p2_id = conn.execute("SELECT id FROM products ORDER BY id").fetchall()
    check("Row 1 id != Row 2 id", p1_id[0] != p2_id[0])
    check("Both have sku='CL420'", True)
    print(f"    p1.id={p1_id[0]}, p2.id={p2_id[0]}")
except sqlite3.IntegrityError as e:
    conn.rollback()
    check(f"Inserted 2 rows with same SKU CL420 (no error)", False)
    print(f"    FAILED: {e}")

conn.close()

# === Summary ===
print(f"\n{'='*40}")
print(f"Results: {passed} passed, {failed} failed")
if failed == 0:
    print("ALL CHECKS PASSED")
else:
    print("SOME CHECKS FAILED")

# Cleanup
try:
    os.unlink(temp_db)
    os.rmdir(temp_dir)
except OSError:
    pass

sys.exit(0 if failed == 0 else 1)
