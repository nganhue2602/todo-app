"""
Kiểm thử tự động cho các API chính (CRUD, cập nhật trạng thái, thống kê, tìm kiếm).

Chạy:   python -m unittest discover -s tests -v
"""
import os
import sys
import tempfile
import unittest

# Dùng database tạm để không ảnh hưởng dữ liệu thật
_tmp = tempfile.mkdtemp()
os.environ["TODO_DB"] = os.path.join(_tmp, "test.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402


class TodoApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def _create(self, **overrides):
        body = {"title": "Công việc thử nghiệm", "priority": "high", "status": "todo"}
        body.update(overrides)
        res = self.client.post("/api/tasks", json=body)
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        return res.get_json()

    def test_index_page(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("TodoFlow", res.get_data(as_text=True))

    def test_seed_data_and_categories(self):
        cats = self.client.get("/api/categories").get_json()
        self.assertGreaterEqual(len(cats), 5)
        self.assertGreater(len(self.client.get("/api/tasks").get_json()), 0)

    def test_create_read_update_delete(self):
        task = self._create(title="  Học Flask  ", description="Đọc tài liệu", category_id=1)
        self.assertEqual(task["title"], "Học Flask")
        self.assertEqual(task["status"], "todo")
        self.assertIsNone(task["completed_at"])

        got = self.client.get(f"/api/tasks/{task['id']}").get_json()
        self.assertEqual(got["category_name"], "Học tập")

        res = self.client.put(
            f"/api/tasks/{task['id']}",
            json={"title": "Học Flask nâng cao", "priority": "low", "status": "doing", "due_date": "2030-01-31"},
        )
        self.assertEqual(res.status_code, 200)
        updated = res.get_json()
        self.assertEqual(updated["title"], "Học Flask nâng cao")
        self.assertEqual(updated["priority"], "low")
        self.assertEqual(updated["due_date"], "2030-01-31")
        self.assertFalse(updated["is_overdue"])

        self.assertEqual(self.client.delete(f"/api/tasks/{task['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/tasks/{task['id']}").status_code, 404)

    def test_update_status_sets_completed_at(self):
        task = self._create()
        done = self.client.patch(f"/api/tasks/{task['id']}/status", json={"status": "done"}).get_json()
        self.assertEqual(done["status"], "done")
        self.assertIsNotNone(done["completed_at"])
        back = self.client.patch(f"/api/tasks/{task['id']}/status", json={"status": "doing"}).get_json()
        self.assertEqual(back["status"], "doing")
        self.assertIsNone(back["completed_at"])

    def test_validation_errors(self):
        self.assertEqual(self.client.post("/api/tasks", json={"title": "   "}).status_code, 400)
        self.assertEqual(self.client.post("/api/tasks", json={"title": "x", "status": "abc"}).status_code, 400)
        self.assertEqual(self.client.post("/api/tasks", json={"title": "x", "priority": "urgent"}).status_code, 400)
        self.assertEqual(self.client.post("/api/tasks", json={"title": "x", "due_date": "31/12/2030"}).status_code, 400)
        self.assertEqual(self.client.post("/api/tasks", json={"title": "x", "category_id": 9999}).status_code, 400)
        self.assertEqual(self.client.patch("/api/tasks/1/status", json={"status": "zzz"}).status_code, 400)
        self.assertEqual(self.client.put("/api/tasks/999999", json={"title": "x"}).status_code, 404)
        self.assertEqual(self.client.delete("/api/tasks/999999").status_code, 404)

    def test_overdue_flag(self):
        task = self._create(due_date="2000-01-01")
        self.assertTrue(task["is_overdue"])
        done = self.client.patch(f"/api/tasks/{task['id']}/status", json={"status": "done"}).get_json()
        self.assertFalse(done["is_overdue"])

    def test_search_without_accents_and_filters(self):
        self._create(title="Đồ án Quản Trị Dự Án", priority="high")
        titles = [t["title"] for t in self.client.get("/api/tasks?q=do an quan tri").get_json()]
        self.assertIn("Đồ án Quản Trị Dự Án", titles)
        # ký tự % không được hiểu là ký tự đại diện
        self.assertEqual(self.client.get("/api/tasks?q=%25").get_json(), [])
        for t in self.client.get("/api/tasks?status=done").get_json():
            self.assertEqual(t["status"], "done")
        for t in self.client.get("/api/tasks?priority=high&sort=priority").get_json():
            self.assertEqual(t["priority"], "high")

    def test_stats_consistent_with_tasks(self):
        s = self.client.get("/api/stats").get_json()
        tasks = self.client.get("/api/tasks").get_json()
        self.assertEqual(s["total"], len(tasks))
        self.assertEqual(s["todo"] + s["doing"] + s["done"], s["total"])
        self.assertEqual(s["done"], sum(1 for t in tasks if t["status"] == "done"))
        self.assertEqual(len(s["last7"]), 7)
        self.assertEqual(len(s["by_priority"]), 3)
        self.assertEqual(sum(c["total"] for c in s["by_category"]), s["total"])
        self.assertEqual(s["completion_rate"], round(s["done"] * 100 / s["total"]))

    def test_delete_completed(self):
        self._create(status="done")
        res = self.client.delete("/api/tasks/completed").get_json()
        self.assertTrue(res["ok"])
        self.assertEqual(self.client.get("/api/stats").get_json()["done"], 0)


if __name__ == "__main__":
    unittest.main()
