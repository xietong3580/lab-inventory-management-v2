"""
Step 10-27B-fix verification: ensure execute path sku is never None

Runs against an isolated temporary SQLite, never touches production data.
"""
import os
import sys
import tempfile
from datetime import datetime

# Add apps/api to sys.path
api_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "api")
sys.path.insert(0, api_dir)

# Monkey-patch database.py to use a temp database
import database
temp_dir = tempfile.mkdtemp(prefix="inv_verify_")
temp_db_path = os.path.join(temp_dir, "verify.db")
database.BASE_DIR = temp_dir
database.DATABASE_URL = f"sqlite:///{temp_db_path}"

# Re-create engine and session
database.engine = database.create_engine(
    database.DATABASE_URL,
    connect_args={"check_same_thread": False},
)
database.SessionLocal = database.sessionmaker(
    autocommit=False, autoflush=False, bind=database.engine,
)
database.Base.metadata.create_all(bind=database.engine)
print(f"[setup] temp db: {temp_db_path}")

# Now safe to import imports module
from routers.imports import _parse_and_validate_csv, _build_composite_key

CSV_TEXT = """产品货号,产品名称,当前库存,最低库存,单位,类别,存放位置,品牌,规格,供应商
,无货号产品A,100,10,个,耗材,A区-1排,,,
,无货号产品B,50,5,盒,试剂,B区-2排,品牌X,500mL,供应商Y
PRD-001,有货号产品,200,20,支,耗材,C区-3排,品牌Z,100g,供应商W
"""


def main():
    db = database.SessionLocal()
    try:
        print("\n=== Step 1: Run preview parse ===")
        result = _parse_and_validate_csv(
            text=CSV_TEXT,
            filename="verify.csv",
            encoding="utf-8",
            db=db,
        )

        if not result.get("can_import"):
            print(f"FAIL: can_import is False! errors: {result.get('errors', [])}")
            for row in result.get("rows", []):
                if row.get("errors"):
                    print(f"  Row {row['row_number']} errors: {row['errors']}")
            return 1

        print(f"PASS: can_import={result['can_import']}")
        print(f"  total_rows={result['total_rows']}, valid_rows={result['valid_rows']}")

        # === Step 2: Verify normalized.sku is never None ===
        print("\n=== Step 2: Verify normalized.sku != None ===")
        all_ok = True
        for row in result.get("rows", []):
            norm = row.get("normalized", {})
            sku = norm.get("sku")
            name = norm.get("name", "???")
            suggested = row.get("suggested_sku")

            if sku is None:
                print(f"FAIL: Row {row['row_number']} ({name}): normalized.sku is None!")
                all_ok = False
            else:
                status = "PASS" if suggested and sku == suggested else "INFO"
                print(f"{status}: Row {row['row_number']} ({name}): sku='{sku}'")
                if suggested and sku != suggested:
                    print(f"  WARN: suggested_sku='{suggested}' != sku='{sku}'")
                    all_ok = False

        if not all_ok:
            print("\nFAIL: Some rows have sku=None, execute would hit NOT NULL constraint!")
            return 1

        # === Step 3: Verify LEGACY-NOCODE counts ===
        print("\n=== Step 3: Verify LEGACY-NOCODE counts ===")
        nocode_rows = [r for r in result.get("rows", []) if r.get("suggested_sku")]
        print(f"  No-code rows: {len(nocode_rows)}")
        for r in nocode_rows:
            print(f"  Row {r['row_number']} -> {r['suggested_sku']}: {r.get('normalized', {}).get('name')}")

        if len(nocode_rows) != 2:
            print(f"FAIL: Expected 2 no-code rows, got {len(nocode_rows)}")
            return 1
        print("PASS: LEGACY-NOCODE count matches (2)")

        # === Step 4: Verify composite key logic intact ===
        print("\n=== Step 4: Verify composite key logic ===")
        for row in result.get("rows", []):
            ck = _build_composite_key(
                row.get("normalized", {}),
                row.get("p1_fields", {}),
            )
            print(f"  Row {row['row_number']} composite_key: {ck}")

        # === Step 5: Simulate execute-path Product construction ===
        print("\n=== Step 5: Simulate execute-path Product construction ===")
        try:
            for row in result.get("rows", []):
                norm = row["normalized"]
                sku = norm["sku"]
                assert sku is not None, f"Row {row['row_number']} sku is None"
                p1 = row.get("p1_fields") or {}
                product = database.Product(
                    sku=sku,
                    name=(norm.get("name") or "")[:100],
                    category=norm.get("category") or "耗材",
                    current_stock=norm.get("current_stock", 0),
                    min_stock=norm.get("min_stock", 0),
                    unit=norm.get("unit") or "个",
                    location=norm.get("location") or "",
                    status="正常",
                    last_updated=datetime.now().strftime("%Y-%m-%d"),
                    brand=(p1.get("brand") or None),
                    specification=(p1.get("specification") or None),
                    supplier=(p1.get("supplier") or None),
                )
                print(f"PASS: Product(sku={sku}, name={norm.get('name')})")
            print("PASS: All Product constructions succeeded")
        except Exception as exc:
            print(f"FAIL: Product construction failed: {exc}")
            return 1

        # === Step 6: Verify DB insert succeeds in temp ===
        print("\n=== Step 6: Verify DB insert in temp database ===")
        try:
            for row in result.get("rows", []):
                norm = row["normalized"]
                p1 = row.get("p1_fields") or {}
                product = database.Product(
                    sku=norm["sku"],
                    name=(norm.get("name") or "")[:100],
                    category=norm.get("category") or "耗材",
                    current_stock=norm.get("current_stock", 0),
                    min_stock=norm.get("min_stock", 0),
                    unit=norm.get("unit") or "个",
                    location=norm.get("location") or "",
                    status="正常",
                    last_updated=datetime.now().strftime("%Y-%m-%d"),
                    brand=(p1.get("brand") or None),
                    specification=(p1.get("specification") or None),
                    supplier=(p1.get("supplier") or None),
                )
                db.add(product)
            db.flush()  # Verify no IntegrityError
            db.rollback()  # Don't keep the data
            print("PASS: DB flush succeeded, no IntegrityError")
        except Exception as exc:
            db.rollback()
            print(f"FAIL: DB insert failed: {exc}")
            return 1

        print("\n=== ALL CHECKS PASSED ===")
        return 0

    finally:
        db.close()
        try:
            os.unlink(temp_db_path)
            os.rmdir(temp_dir)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
