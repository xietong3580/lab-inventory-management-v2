"""
产品主图功能自动测试（使用临时 SQLite 数据库与临时图片目录，不触碰真实本地数据库）。

运行：
    python apps/api/tests/test_product_images.py
"""

import asyncio
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path

# ── 必须先设置环境变量，再导入应用模块 ────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_TMP = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
_TMP_DIR = Path(_TMP.name)
os.environ["INVENTORY_DB_PATH"] = str(_TMP_DIR / "test_inventory.db")
os.environ["INVENTORY_IMAGE_DIR"] = str(_TMP_DIR / "uploads" / "product-images")

import httpx  # noqa: E402
from PIL import Image  # noqa: E402

from database import get_db, get_db_path, SessionLocal, User, Product, Transaction, migrate_products_image  # noqa: E402
from auth import get_password_hash  # noqa: E402
import image_store  # noqa: E402
import main  # noqa: E402  (导入时调用 init_db 建表)
from main import app  # noqa: E402


def make_image_bytes(fmt="PNG", color=(180, 40, 40), size=(64, 64)) -> bytes:
    """用 Pillow 生成一张真实图片的字节（用于合法上传）"""
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def _request(method, url, **kwargs):
    """通过 ASGI 应用同步发起请求（httpx 0.28 ASGITransport 仅支持异步）"""
    async def _do():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, url, **kwargs)
    return asyncio.run(_do())


class ProductImageTestBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._seed_user("admin", "admin")
        cls._seed_user("viewer", "viewer")
        cls.admin_token = cls._login("admin", "admin123")
        cls.viewer_token = cls._login("viewer", "viewer123")

    @staticmethod
    def _auth(token):
        return {"Authorization": f"Bearer {token}"} if token else {}

    def _use_fresh_image_dir(self):
        """切换到独立临时图片目录，返回目录 Path"""
        new_dir = _TMP_DIR / "images_fresh" / "product-images"
        new_dir.mkdir(parents=True, exist_ok=True)
        for f in new_dir.iterdir():
            if f.is_file():
                f.unlink()
        self._old_image_dir = os.environ.get("INVENTORY_IMAGE_DIR")
        os.environ["INVENTORY_IMAGE_DIR"] = str(new_dir)
        return new_dir

    def _restore_image_dir(self):
        if getattr(self, "_old_image_dir", None) is None:
            os.environ.pop("INVENTORY_IMAGE_DIR", None)
        else:
            os.environ["INVENTORY_IMAGE_DIR"] = self._old_image_dir

    @staticmethod
    def _seed_user(username, role):
        db = SessionLocal()
        if db.query(User).filter(User.username == username).first():
            db.close()
            return
        db.add(User(
            username=username,
            password_hash=get_password_hash("admin123" if role == "admin" else "viewer123"),
            display_name=username,
            email=f"{username}@test.local",
            role=role,
            is_active=True,
            status="活跃",
        ))
        db.commit()
        db.close()

    @classmethod
    def _login(cls, username, password):
        r = _request("POST", "/api/auth/login", json={"username": username, "password": password})
        assert r.status_code == 200, r.text
        return r.json()["access_token"]

    # ── 同步请求封装 ──
    def _get(self, url, token=None):
        return _request("GET", url, headers=self._auth(token))

    def _post_json(self, url, payload, token=None):
        return _request("POST", url, json=payload, headers=self._auth(token))

    def _post_files(self, url, files, token=None):
        return _request("POST", url, files=files, headers=self._auth(token))

    def _delete(self, url, token=None):
        return _request("DELETE", url, headers=self._auth(token))

    def _create_product(self, sku="SKU-001", name="测试产品", token=None):
        token = token or self.admin_token
        r = self._post_json("/api/products/", {
            "sku": sku,
            "name": name,
            "category": "耗材",
            "currentStock": 10,
            "minStock": 5,
            "unit": "个",
        }, token)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["id"]


class TestMigration(ProductImageTestBase):
    def test_migration_adds_nullable_columns(self):
        import sqlite3
        conn = sqlite3.connect(get_db_path())
        cols = {row[1] for row in conn.execute("PRAGMA table_info(products)")}
        conn.close()
        self.assertIn("image_path", cols)
        self.assertIn("image_updated_at", cols)

    def test_migration_idempotent(self):
        migrate_products_image(get_db_path())
        migrate_products_image(get_db_path())

    def test_existing_product_image_field_empty(self):
        pid = self._create_product(sku="SKU-MIG-1", name="迁移测试产品")
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        self.assertIsNone(p.image_path)
        self.assertIsNone(p.image_updated_at)
        db.close()


class TestProductImageAPI(ProductImageTestBase):
    def test_create_product_without_image_ok(self):
        pid = self._create_product(sku="SKU-NOIMG-1", name="无图产品")
        r = self._get("/api/products/", self.admin_token)
        self.assertEqual(r.status_code, 200)
        item = next(p for p in r.json() if p["id"] == pid)
        self.assertFalse(item["hasImage"])
        self.assertEqual(item["imageUpdatedAt"], "")

    def test_admin_upload_valid_png(self):
        pid = self._create_product(sku="SKU-IMG-1", name="有图产品")
        r = self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["has_image"])
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        self.assertTrue(p.image_path)
        db.close()
        self.assertTrue(image_store.resolve_image_path(p.image_path).exists())

    def test_upload_valid_webp_and_jpeg(self):
        for fmt, mime in [("WEBP", "image/webp"), ("JPEG", "image/jpeg")]:
            pid = self._create_product(sku=f"SKU-{fmt}", name=f"{fmt}产品")
            r = self._post_files(
                f"/api/products/{pid}/image",
                {"file": (f"x.{fmt.lower()}", make_image_bytes(fmt), mime)},
                self.admin_token,
            )
            self.assertEqual(r.status_code, 200, r.text)

    def test_viewer_upload_forbidden(self):
        pid = self._create_product(sku="SKU-V1", name="viewer上传测试")
        r = self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.viewer_token,
        )
        self.assertEqual(r.status_code, 403, r.text)

    def test_viewer_delete_forbidden(self):
        pid = self._create_product(sku="SKU-V2", name="viewer删除测试")
        r = self._delete(f"/api/products/{pid}/image", self.viewer_token)
        self.assertEqual(r.status_code, 403, r.text)

    def test_admin_replace_and_clean_old_file(self):
        pid = self._create_product(sku="SKU-REP-1", name="替换测试")
        r1 = self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG", color=(1, 2, 3)), "image/png")},
            self.admin_token,
        )
        self.assertEqual(r1.status_code, 200)
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        old_name = p.image_path
        db.close()

        r2 = self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("b.png", make_image_bytes("PNG", color=(200, 200, 200)), "image/png")},
            self.admin_token,
        )
        self.assertEqual(r2.status_code, 200)
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        new_name = p.image_path
        db.close()
        self.assertNotEqual(old_name, new_name)
        self.assertFalse(image_store.resolve_image_path(old_name).exists())
        self.assertTrue(image_store.resolve_image_path(new_name).exists())

    def test_admin_delete_then_idempotent(self):
        pid = self._create_product(sku="SKU-DEL-1", name="删除测试")
        self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        fname = p.image_path
        db.close()

        r = self._delete(f"/api/products/{pid}/image", self.admin_token)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(image_store.resolve_image_path(fname).exists())
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        self.assertIsNone(p.image_path)
        db.close()

        r2 = self._delete(f"/api/products/{pid}/image", self.admin_token)
        self.assertEqual(r2.status_code, 200)
        self.assertFalse(r2.json()["has_image"])

    def test_product_not_found_404(self):
        missing = "prod-999999"
        self.assertEqual(
            self._post_files(
                f"/api/products/{missing}/image",
                {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
                self.admin_token,
            ).status_code,
            404,
        )
        self.assertEqual(self._get(f"/api/products/{missing}/image", self.admin_token).status_code, 404)
        self.assertEqual(self._delete(f"/api/products/{missing}/image", self.admin_token).status_code, 404)

    def test_over_5mb_rejected(self):
        pid = self._create_product(sku="SKU-BIG-1", name="超大图测试")
        big = b"x" * (5 * 1024 * 1024 + 1)
        r = self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("big.png", big, "image/png")},
            self.admin_token,
        )
        self.assertEqual(r.status_code, 400, r.text)
        self.assertIn("5MB", r.text)

    def test_fake_image_rejected(self):
        pid = self._create_product(sku="SKU-FAKE-1", name="伪造图测试")
        r = self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("fake.png", b"this is not an image at all", "image/png")},
            self.admin_token,
        )
        self.assertEqual(r.status_code, 400, r.text)

    def test_svg_and_gif_rejected(self):
        pid = self._create_product(sku="SKU-SVG-1", name="SVG测试")
        r = self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("evil.svg", b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', "image/svg+xml")},
            self.admin_token,
        )
        self.assertEqual(r.status_code, 400, r.text)

        pid2 = self._create_product(sku="SKU-GIF-1", name="GIF测试")
        r2 = self._post_files(
            f"/api/products/{pid2}/image",
            {"file": ("anim.gif", make_image_bytes("GIF"), "image/gif")},
            self.admin_token,
        )
        self.assertEqual(r2.status_code, 400, r2.text)

    def test_get_image_permission_and_no_image(self):
        pid = self._create_product(sku="SKU-GET-1", name="读图测试")
        r = self._get(f"/api/products/{pid}/image", self.admin_token)
        self.assertEqual(r.status_code, 404)

        self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        r = self._get(f"/api/products/{pid}/image", self.viewer_token)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers["content-type"], "image/webp")

        r = self._get(f"/api/products/{pid}/image", None)
        # 未登录按现有系统规则拒绝（HTTPBearer 缺 token 返回 403）
        self.assertEqual(r.status_code, 403)

    def test_oversized_bounded_read_rejected(self):
        # 超过 5MB 的大文件：只进行有界读取并立即拒绝，不把全部内容读入内存
        pid = self._create_product(sku="SKU-BIGREAD-1", name="有界读取测试")
        big = b"x" * (6 * 1024 * 1024)  # 6MB
        r = self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("big.png", big, "image/png")},
            self.admin_token,
        )
        self.assertEqual(r.status_code, 400, r.text)
        self.assertIn("5MB", r.text)

    def test_replace_cleanup_failure_still_succeeds(self):
        # 数据库已成功，旧文件清理抛异常时，接口仍返回成功，不影响已完成的替换
        from unittest import mock
        pid = self._create_product(sku="SKU-CLF-1", name="替换清理失败测试")
        self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        with mock.patch.object(image_store, "delete_image", side_effect=OSError("disk error")):
            r = self._post_files(
                f"/api/products/{pid}/image",
                {"file": ("b.png", make_image_bytes("PNG", color=(9, 9, 9)), "image/png")},
                self.admin_token,
            )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["has_image"])

    def test_delete_cleanup_failure_still_succeeds(self):
        from unittest import mock
        pid = self._create_product(sku="SKU-DCF-1", name="删除清理失败测试")
        self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        with mock.patch.object(image_store, "delete_image", side_effect=OSError("disk error")):
            r = self._delete(f"/api/products/{pid}/image", self.admin_token)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()["has_image"])


class TestImageStoreValidation(ProductImageTestBase):
    def test_path_traversal_impossible(self):
        for bad in ["../../etc/passwd", "sub/dir/file.png", "..\\..\\x.png", "/abs/path.png", ".hidden"]:
            with self.assertRaises(image_store.ImageValidationError):
                image_store.resolve_image_path(bad)

    def test_validate_rejects_bad_content(self):
        for bad in (b"", b"not-an-image", b"<svg></svg>", make_image_bytes("GIF")):
            with self.assertRaises(image_store.ImageValidationError):
                image_store.validate_and_process_image(bad)

    def test_validate_outputs_webp_and_caps_dimension(self):
        out = image_store.validate_and_process_image(make_image_bytes("PNG", size=(3000, 3000)))
        img = Image.open(io.BytesIO(out))
        self.assertEqual(img.format, "WEBP")
        self.assertLessEqual(max(img.size), image_store.MAX_DIMENSION)


class TestProductDeleteImageCleanup(ProductImageTestBase):
    def _upload_image(self, pid):
        """上传图片并返回该产品在数据库中的 image_path 文件名"""
        r = self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        self.assertEqual(r.status_code, 200, r.text)
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        fname = p.image_path
        db.close()
        self.assertTrue(fname)
        self.assertTrue(image_store.resolve_image_path(fname).exists())
        return fname

    def test_delete_product_with_image_removes_file(self):
        pid = self._create_product(sku="SKU-DELIMG-1", name="删除带图产品")
        fname = self._upload_image(pid)

        r = self._delete(f"/api/products/{pid}", self.admin_token)
        self.assertEqual(r.status_code, 200, r.text)

        # 数据库产品已消失
        db = SessionLocal()
        self.assertIsNone(db.query(Product).filter(Product.id == int(pid[5:])).first())
        db.close()
        # 图片文件已被删除
        self.assertFalse(image_store.resolve_image_path(fname).exists())

    def test_delete_blocked_by_transactions_keeps_image(self):
        pid = self._create_product(sku="SKU-DELIMG-2", name="有关联交易产品")
        fname = self._upload_image(pid)

        # 创建关联交易，使删除被禁止
        db = SessionLocal()
        db.add(Transaction(
            product_id=int(pid[5:]),
            product_name="有关联交易产品",
            type="入库",
            quantity=1,
            unit="个",
            date="2026-08-17 10:00",
            operator="admin",
            status="completed",
            notes="",
        ))
        db.commit()
        db.close()

        r = self._delete(f"/api/products/{pid}", self.admin_token)
        self.assertEqual(r.status_code, 409, r.text)

        # 产品仍存在
        db = SessionLocal()
        self.assertIsNotNone(db.query(Product).filter(Product.id == int(pid[5:])).first())
        db.close()
        # 图片文件仍保留
        self.assertTrue(image_store.resolve_image_path(fname).exists())

    def test_delete_product_with_missing_file_succeeds(self):
        pid = self._create_product(sku="SKU-DELIMG-3", name="图片文件缺失产品")
        fname = self._upload_image(pid)
        # 手动删除图片文件，模拟"数据库引用但文件缺失"
        image_store.resolve_image_path(fname).unlink()

        r = self._delete(f"/api/products/{pid}", self.admin_token)
        self.assertEqual(r.status_code, 200, r.text)

        db = SessionLocal()
        self.assertIsNone(db.query(Product).filter(Product.id == int(pid[5:])).first())
        db.close()

    def test_malicious_image_path_does_not_delete_outside_file(self):
        pid = self._create_product(sku="SKU-DELIMG-4", name="恶意路径产品")
        # 在图片目录之外创建哨兵文件
        sentinel = _TMP_DIR / "sentinel.txt"
        sentinel.write_text("do-not-delete")
        malicious_path = f"../sentinel.txt"

        # 直接写入恶意 image_path（绕过上传，模拟异常数据）
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        p.image_path = malicious_path
        p.image_updated_at = "2026-08-17T00:00:00"
        db.commit()
        db.close()

        # 删除产品：数据库删除成功，图片清理因路径非法被安全拦截（仅记录警告，不报 500）
        r = self._delete(f"/api/products/{pid}", self.admin_token)
        self.assertEqual(r.status_code, 200, r.text)

        # 哨兵文件仍在，未被越界删除
        self.assertTrue(sentinel.exists())
        self.assertEqual(sentinel.read_text(), "do-not-delete")


class TestBackupAndPreflight(ProductImageTestBase):
    def test_backup_generates_db_and_image_backup(self):
        pid = self._create_product(sku="SKU-BAK-1", name="备份测试")
        self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        r = self._post_json("/api/maintenance/backups", {}, self.admin_token)
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(data["image_count"], 1)
        self.assertTrue(data["image_backup_filename"].endswith(".zip"))
        self.assertGreater(data["image_backup_size_bytes"], 0)
        zip_path = image_store.get_backup_dir() / data["image_backup_filename"]
        self.assertTrue(zip_path.exists())

    def test_preflight_image_stats(self):
        pid = self._create_product(sku="SKU-PF-1", name="预检测试")
        self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        r = self._get("/api/maintenance/preflight", self.admin_token)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data["image_dir_exists"])
        self.assertTrue(data["image_dir_writable"])
        self.assertGreaterEqual(data["image_referenced_count"], 1)
        self.assertGreaterEqual(data["image_files_count"], 1)
        self.assertEqual(data["image_missing_count"], 0)
        self.assertEqual(data["image_orphan_count"], 0)


class TestImageStoreFileFiltering(ProductImageTestBase):
    """list_image_files / 备份 / 预检 必须排除 .gitkeep 与非法文件"""

    def test_gitkeep_only_no_images(self):
        img_dir = self._use_fresh_image_dir()
        try:
            (img_dir / ".gitkeep").write_text("")
            (img_dir / "not-an-image.txt").write_text("junk")
            files = image_store.list_image_files()
            self.assertEqual(files, [])

            backup = image_store.create_images_backup("20260817_000000")
            self.assertEqual(backup["count"], 0)
            self.assertEqual(backup["filename"], "")
        finally:
            self._restore_image_dir()

    def test_mixed_files_only_valid_counted(self):
        img_dir = self._use_fresh_image_dir()
        try:
            (img_dir / ".gitkeep").write_text("")
            (img_dir / "junk.zip").write_bytes(b"PK\x03\x04")
            (img_dir / "tmp.tmp").write_bytes(b"x")
            valid = image_store.generate_filename()  # UUID32.webp
            (img_dir / valid).write_bytes(make_image_bytes("WEBP"))

            files = image_store.list_image_files()
            self.assertEqual(files, [valid])

            backup = image_store.create_images_backup("20260817_000001")
            self.assertEqual(backup["count"], 1)
            self.assertTrue(backup["filename"].endswith(".zip"))
        finally:
            self._restore_image_dir()

    def test_preflight_gitkeep_not_orphan(self):
        img_dir = self._use_fresh_image_dir()
        try:
            (img_dir / ".gitkeep").write_text("")
            r = self._get("/api/maintenance/preflight", self.admin_token)
            self.assertEqual(r.status_code, 200)
            data = r.json()
            self.assertEqual(data["image_files_count"], 0)
            self.assertEqual(data["image_orphan_count"], 0)
        finally:
            self._restore_image_dir()


class TestPreflightReadonly(ProductImageTestBase):
    def test_preflight_does_not_create_image_dir_or_write_test(self):
        non_exist = _TMP_DIR / "nonexistent-images" / "product-images"
        self.assertFalse(non_exist.exists())
        old = os.environ.get("INVENTORY_IMAGE_DIR")
        os.environ["INVENTORY_IMAGE_DIR"] = str(non_exist)
        try:
            r = self._get("/api/maintenance/preflight", self.admin_token)
            self.assertEqual(r.status_code, 200)
            data = r.json()
            self.assertFalse(data["image_dir_exists"])
            self.assertFalse(data["image_dir_writable"])
            # 目录与 .write_test 均未被创建
            self.assertFalse(non_exist.exists())
            self.assertFalse((non_exist / ".write_test").exists())
        finally:
            if old is None:
                os.environ.pop("INVENTORY_IMAGE_DIR", None)
            else:
                os.environ["INVENTORY_IMAGE_DIR"] = old


class TestPreflightReferencedCount(ProductImageTestBase):
    def test_two_products_reference_same_file_counted_twice(self):
        r0 = self._get("/api/maintenance/preflight", self.admin_token)
        before_ref = r0.json()["image_referenced_count"]
        before_files = r0.json()["image_files_count"]
        before_missing = r0.json()["image_missing_count"]
        before_orphan = r0.json()["image_orphan_count"]

        pid1 = self._create_product(sku="SKU-REF1", name="引用1")
        pid2 = self._create_product(sku="SKU-REF2", name="引用2")
        self._post_files(
            f"/api/products/{pid1}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        # 让第二个产品引用同一文件名
        db = SessionLocal()
        p1 = db.query(Product).filter(Product.id == int(pid1[5:])).first()
        fname = p1.image_path
        p2 = db.query(Product).filter(Product.id == int(pid2[5:])).first()
        p2.image_path = fname
        p2.image_updated_at = "2026-08-17T00:00:00"
        db.commit()
        db.close()
        self.assertTrue(fname)

        r = self._get("/api/maintenance/preflight", self.admin_token)
        data = r.json()
        # 引用图片的产品行数 +2，但文件数只 +1
        self.assertEqual(data["image_referenced_count"] - before_ref, 2)
        self.assertEqual(data["image_files_count"] - before_files, 1)
        # 新增文件被正确引用，无新增缺失/孤立
        self.assertEqual(data["image_missing_count"] - before_missing, 0)
        self.assertEqual(data["image_orphan_count"] - before_orphan, 0)


class TestAtomicImageBackup(ProductImageTestBase):
    def test_backup_failure_leaves_no_tmp_or_corrupt_zip(self):
        from unittest import mock
        backup_dir = image_store.get_backup_dir()
        backup_dir.mkdir(parents=True, exist_ok=True)
        ts = "20990101_000000"
        tmp = backup_dir / f"product_images_backup_{ts}.zip.tmp"
        final = backup_dir / f"product_images_backup_{ts}.zip"
        for p in (tmp, final):
            if p.exists():
                p.unlink()

        # 返回一个合法文件名但实际文件不存在的列表，使压缩中途失败
        with mock.patch.object(
            image_store, "list_image_files",
            return_value=["0123456789abcdef0123456789abcdef.webp"],
        ):
            with self.assertRaises(image_store.ImageBackupError):
                image_store.create_images_backup(ts)

        # 不留下 .tmp 和损坏的正式 ZIP
        self.assertFalse(tmp.exists())
        self.assertFalse(final.exists())

    def test_os_replace_failure_normalized_to_backup_error(self):
        from unittest import mock
        img_dir = self._use_fresh_image_dir()
        try:
            # 准备一张合法图片
            valid = image_store.generate_filename()
            (img_dir / valid).write_bytes(make_image_bytes("WEBP"))

            backup_dir = image_store.get_backup_dir()
            backup_dir.mkdir(parents=True, exist_ok=True)
            ts = "20990101_000001"
            tmp = backup_dir / f"product_images_backup_{ts}.zip.tmp"
            final = backup_dir / f"product_images_backup_{ts}.zip"
            for p in (tmp, final):
                if p.exists():
                    p.unlink()

            # 模拟 os.replace 抛出 OSError
            with mock.patch.object(
                image_store.os, "replace",
                side_effect=OSError("simulated replace failure"),
            ):
                with self.assertRaises(image_store.ImageBackupError):
                    image_store.create_images_backup(ts)

            # 不留下 .tmp
            self.assertFalse(tmp.exists())
            # 不产生损坏的新正式 ZIP
            self.assertFalse(final.exists())
            # 原始图片仍存在
            self.assertTrue((img_dir / valid).exists())
        finally:
            self._restore_image_dir()

    def test_existing_final_zip_preserved_on_failure(self):
        from unittest import mock
        img_dir = self._use_fresh_image_dir()
        try:
            valid = image_store.generate_filename()
            (img_dir / valid).write_bytes(make_image_bytes("WEBP"))

            backup_dir = image_store.get_backup_dir()
            backup_dir.mkdir(parents=True, exist_ok=True)
            ts = "20990101_000002"
            tmp = backup_dir / f"product_images_backup_{ts}.zip.tmp"
            final = backup_dir / f"product_images_backup_{ts}.zip"
            # 已存在同名正式 ZIP
            final.write_bytes(b"PREEXISTING")
            if tmp.exists():
                tmp.unlink()

            with mock.patch.object(
                image_store.os, "replace",
                side_effect=OSError("simulated replace failure"),
            ):
                with self.assertRaises(image_store.ImageBackupError):
                    image_store.create_images_backup(ts)

            # 已存在正式 ZIP 内容保持不变
            self.assertTrue(final.exists())
            self.assertEqual(final.read_bytes(), b"PREEXISTING")
            self.assertFalse(tmp.exists())
            # 原始图片仍存在
            self.assertTrue((img_dir / valid).exists())
        finally:
            self._restore_image_dir()


class TestBackupPartialSuccess(ProductImageTestBase):
    def test_db_backup_succeeds_image_backup_fails(self):
        from unittest import mock
        pid = self._create_product(sku="SKU-PART-1", name="部分成功测试")
        self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )

        with mock.patch.object(
            image_store, "create_images_backup",
            side_effect=image_store.ImageBackupError("forced image backup failure"),
        ):
            r = self._post_json("/api/maintenance/backups", {}, self.admin_token)

        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        self.assertTrue(data["success"])
        self.assertTrue(data["image_backup_failed"])
        self.assertIn("数据库备份已创建", data["message"])
        self.assertIn("图片备份失败", data["message"])
        # 数据库备份文件仍存在，未被删除
        db_backup = image_store.get_backup_dir() / data["filename"]
        self.assertTrue(db_backup.exists())


class TestDeleteImageCommitFailure(ProductImageTestBase):
    def test_delete_commit_failure_keeps_file(self):
        pid = self._create_product(sku="SKU-CF-1", name="删除提交失败测试")
        self._post_files(
            f"/api/products/{pid}/image",
            {"file": ("a.png", make_image_bytes("PNG"), "image/png")},
            self.admin_token,
        )
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        fname = p.image_path
        db.close()
        self.assertTrue(fname)

        # 覆盖 get_db，使 commit 抛出异常；同时兼容鉴权依赖（get_current_user 也走 get_db）
        class FailingSession:
            def __init__(self):
                self._model = None
            def query(self, model, *a, **k):
                self._model = model
                return self
            def filter(self, *a, **k):
                return self
            def first(self):
                real_db = SessionLocal()
                if self._model is User:
                    obj = real_db.query(User).filter(User.username == "admin").first()
                else:
                    obj = real_db.query(self._model).first()
                real_db.close()
                return obj
            def add(self, obj):
                pass
            def commit(self):
                raise Exception("forced commit failure")
            def rollback(self):
                self.rolled_back = True
            def refresh(self, obj):
                pass
            def close(self):
                pass

        app.dependency_overrides[get_db] = lambda: FailingSession()
        try:
            r = self._delete(f"/api/products/{pid}/image", self.admin_token)
        finally:
            app.dependency_overrides.clear()

        self.assertEqual(r.status_code, 500, r.text)
        self.assertIn("删除图片信息失败", r.text)
        # 图片文件保留
        self.assertTrue(image_store.resolve_image_path(fname).exists())
        # 数据库字段仍保留（回滚生效）
        db = SessionLocal()
        p = db.query(Product).filter(Product.id == int(pid[5:])).first()
        self.assertEqual(p.image_path, fname)
        db.close()


class TestIsolation(ProductImageTestBase):
    def test_uses_temp_db_and_dir(self):
        self.assertTrue(get_db_path().endswith("test_inventory.db"))
        self.assertEqual(image_store.get_upload_dir().name, "product-images")
        self.assertIn(_TMP_DIR.name, str(image_store.get_upload_dir()))


def tearDownModule():
    """释放 SQLAlchemy 引擎连接，避免 Windows 下临时数据库文件句柄占用"""
    from database import engine
    engine.dispose()


if __name__ == "__main__":
    unittest.main(verbosity=2)
