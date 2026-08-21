"""
审计日志分页与筛选 API 自动测试（使用临时 SQLite 数据库，不触碰真实 inventory.db）。

运行：
    python apps/api/tests/test_audit_logs.py
"""

import asyncio
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

# ── 必须先设置环境变量，再导入应用模块 ────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_TMP = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
_TMP_DIR = Path(_TMP.name)
os.environ["INVENTORY_DB_PATH"] = str(_TMP_DIR / "test_audit_inventory.db")

import httpx  # noqa: E402

from database import SessionLocal, AuditLog, User  # noqa: E402
from auth import get_password_hash  # noqa: E402
import main  # noqa: E402  (导入时调用 init_db 建表)
from main import app  # noqa: E402


def _request(method, url, **kwargs):
    """通过 ASGI 应用同步发起请求"""
    async def _do():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, url, **kwargs)
    return asyncio.run(_do())


def _seed_logs(n, action_type="PRODUCT_UPDATE", base=None, extra=None):
    """直接写入 n 条审计日志，返回写入的 AuditLog 列表（id 已刷新）。

    timestamp 随 i 递增，保证最后写入的日志时间最新。
    extra: 可选 dict，用于覆盖最后一条日志的属性（如 action_type）。
    """
    base = base or datetime(2026, 8, 1, 8, 0, 0)
    db = SessionLocal()
    created = []
    for i in range(1, n + 1):
        ts = base + timedelta(minutes=i)
        log = AuditLog(
            action_type=action_type,
            product_name=f"产品-{i}",
            product_id=f"prod-{i:06d}",
            operator=f"操作人-{i}",
            timestamp=ts.strftime("%Y-%m-%d %H:%M:%S"),
            details=f"日志详情 {i}",
        )
        db.add(log)
        created.append(log)
    db.commit()

    # 覆盖最后一条
    if extra:
        last = created[-1]
        for k, v in extra.items():
            setattr(last, k, v)
        db.commit()

    # 刷新 id，便于断言
    for log in created:
        db.refresh(log)
    db.close()
    return created


class AuditLogTestBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._seed_user("admin", "admin")
        cls._seed_user("viewer", "viewer")
        cls.admin_token = cls._login("admin", "admin123")
        cls.viewer_token = cls._login("viewer", "viewer123")

    @staticmethod
    def _auth(token):
        return {"Authorization": f"Bearer {token}"} if token else {}

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

    def _get(self, url, token=None):
        return _request("GET", url, headers=self._auth(token))

    def _clear_logs(self):
        db = SessionLocal()
        db.query(AuditLog).delete()
        db.commit()
        db.close()


class TestPagination(AuditLogTestBase):
    def setUp(self):
        self._clear_logs()

    def test_first_page_returns_latest_over_100(self):
        _seed_logs(120)
        r = self._get("/api/audit-logs/?page=1&page_size=20", self.admin_token)
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        self.assertEqual(data["total"], 120)
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["page_size"], 20)
        self.assertEqual(data["total_pages"], 6)
        self.assertEqual(len(data["items"]), 20)
        # 最新一条（时间最晚、id 最大）排在最前
        self.assertEqual(data["items"][0]["id"], "log-000120")

    def test_752_logs_transaction_add_on_first_page(self):
        _seed_logs(752, extra={"action_type": "TRANSACTION_ADD"})
        r = self._get("/api/audit-logs/?page=1&page_size=20", self.admin_token)
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        self.assertEqual(data["total"], 752)
        self.assertEqual(data["total_pages"], 38)  # ceil(752/20)
        # 第 752 条 TRANSACTION_ADD 出现在第一页第一项
        self.assertEqual(data["items"][0]["id"], "log-000752")
        self.assertEqual(data["items"][0]["actionType"], "TRANSACTION_ADD")

    def test_pagination_fields_correct(self):
        _seed_logs(45)
        r = self._get("/api/audit-logs/?page=2&page_size=10", self.admin_token)
        data = r.json()
        self.assertEqual(data["total"], 45)
        self.assertEqual(data["page"], 2)
        self.assertEqual(data["page_size"], 10)
        self.assertEqual(data["total_pages"], 5)
        self.assertEqual(len(data["items"]), 10)
        # 第 2 页第一条应是 id = 45 - 10 = 35
        self.assertEqual(data["items"][0]["id"], "log-000035")

    def test_last_page_correct(self):
        _seed_logs(752)
        r = self._get("/api/audit-logs/?page=38&page_size=20", self.admin_token)
        data = r.json()
        self.assertEqual(data["total_pages"], 38)
        self.assertEqual(len(data["items"]), 12)  # 752 - 37*20
        # 最后一页第一条应为最旧的日志
        self.assertEqual(data["items"][-1]["id"], "log-000001")

    def test_out_of_range_page_returns_empty_but_total_ok(self):
        _seed_logs(10)
        r = self._get("/api/audit-logs/?page=999&page_size=20", self.admin_token)
        data = r.json()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(data["total"], 10)
        self.assertEqual(data["items"], [])

    def test_page_size_clamped_to_max(self):
        _seed_logs(10)
        r = self._get("/api/audit-logs/?page=1&page_size=1000", self.admin_token)
        # page_size 超过上限被拒绝（FastAPI Query le 校验 -> 422）
        self.assertEqual(r.status_code, 422)

    def test_same_timestamp_sorted_by_id_desc(self):
        db = SessionLocal()
        db.query(AuditLog).delete()
        ts = "2026-08-10 10:00:00"
        db.add(AuditLog(action_type="PRODUCT_UPDATE", product_name="A", operator="x", timestamp=ts, details=""))
        db.add(AuditLog(action_type="PRODUCT_UPDATE", product_name="B", operator="x", timestamp=ts, details=""))
        db.commit()
        ids = [log.id for log in db.query(AuditLog).order_by(AuditLog.id).all()]
        db.close()

        r = self._get("/api/audit-logs/?page=1&page_size=20", self.admin_token)
        data = r.json()
        # 同一 timestamp 时，id 大的在前
        self.assertEqual(data["items"][0]["id"], f"log-{max(ids):06d}")
        self.assertEqual(data["items"][1]["id"], f"log-{min(ids):06d}")


class TestFilters(AuditLogTestBase):
    def setUp(self):
        self._clear_logs()

    def test_filter_by_action_type(self):
        _seed_logs(100, action_type="PRODUCT_UPDATE")
        _seed_logs(5, action_type="TRANSACTION_ADD", base=datetime(2026, 9, 1, 8, 0, 0))
        r = self._get("/api/audit-logs/?action_type=TRANSACTION_ADD&page=1&page_size=20", self.admin_token)
        data = r.json()
        self.assertEqual(data["total"], 5)
        self.assertTrue(all(item["actionType"] == "TRANSACTION_ADD" for item in data["items"]))

    def test_filter_by_product_name(self):
        _seed_logs(20)
        r = self._get("/api/audit-logs/?product_name=产品-1&page=1&page_size=20", self.admin_token)
        data = r.json()
        self.assertGreaterEqual(data["total"], 1)
        self.assertTrue(all("产品-1" in item["productName"] for item in data["items"]))

    def test_filter_by_operator(self):
        _seed_logs(20)
        r = self._get("/api/audit-logs/?operator=操作人-2&page=1&page_size=20", self.admin_token)
        data = r.json()
        self.assertGreaterEqual(data["total"], 1)
        self.assertTrue(all("操作人-2" in item["operator"] for item in data["items"]))

    def test_filter_by_time_range_today(self):
        now = datetime.now()
        _seed_logs(3, base=now.replace(hour=0, minute=0, second=1))
        r = self._get("/api/audit-logs/?time_range=today&page=1&page_size=20", self.admin_token)
        data = r.json()
        self.assertEqual(data["total"], 3)

    def test_filter_by_custom_date_range(self):
        # 2026-08-10 到 2026-08-12 之间的日志
        db = SessionLocal()
        db.query(AuditLog).delete()
        for day, hour in [(10, 10), (11, 10), (12, 10), (13, 10)]:
            db.add(AuditLog(
                action_type="PRODUCT_UPDATE", product_name="x", operator="x",
                timestamp=f"2026-08-{day} {hour}:00:00", details="",
            ))
        db.commit()
        db.close()

        r = self._get("/api/audit-logs/?start_date=2026-08-10&end_date=2026-08-12&page=1&page_size=20", self.admin_token)
        data = r.json()
        self.assertEqual(data["total"], 3)  # 10/11/12 三天，13 号被排除


class TestPermissions(AuditLogTestBase):
    def setUp(self):
        self._clear_logs()

    def test_unauthenticated_rejected(self):
        r = self._get("/api/audit-logs/?page=1&page_size=20", None)
        self.assertEqual(r.status_code, 403)

    def test_viewer_can_view(self):
        _seed_logs(3)
        r = self._get("/api/audit-logs/?page=1&page_size=20", self.viewer_token)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["total"], 3)

    def test_admin_can_view(self):
        _seed_logs(3)
        r = self._get("/api/audit-logs/?page=1&page_size=20", self.admin_token)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["total"], 3)


def tearDownModule():
    from database import engine
    engine.dispose()


if __name__ == "__main__":
    unittest.main(verbosity=2)
