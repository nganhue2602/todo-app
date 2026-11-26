"""
TodoFlow – Ứng dụng quản lý công việc (TODO list)
Backend: Flask + SQLite  |  Frontend: HTML/CSS/JavaScript thuần

Chạy:   python app.py     rồi mở   http://127.0.0.1:5000
"""
from datetime import date, datetime, timedelta

from flask import Flask, jsonify, render_template, request

import database as db

app = Flask(__name__)
app.json.ensure_ascii = False  # trả JSON tiếng Việt có dấu

VALID_STATUS = ("todo", "doing", "done")
VALID_PRIORITY = ("low", "medium", "high")

# Chỉ cho phép các kiểu sắp xếp nằm trong danh sách này (tránh SQL injection)
SORT_OPTIONS = {
    "newest": "t.created_at DESC, t.id DESC",
    "oldest": "t.created_at ASC, t.id ASC",
    "due": "t.due_date IS NULL, t.due_date ASC, t.id DESC",
    "priority": "CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.id DESC",
    "title": "t.title COLLATE NOCASE ASC",
}

BASE_SELECT = """
SELECT t.id, t.title, t.description, t.category_id,
       c.name  AS category_name,
       c.color AS category_color,
       t.priority, t.status, t.due_date,
       t.created_at, t.updated_at, t.completed_at,
       CASE WHEN t.status != 'done' AND t.due_date IS NOT NULL
                 AND t.due_date < date('now', 'localtime')
            THEN 1 ELSE 0 END AS is_overdue
FROM tasks t
LEFT JOIN categories c ON c.id = t.category_id
"""

# Tạo bảng (và nạp dữ liệu mẫu nếu là lần chạy đầu tiên)
db.init_db()


# ----------------------------------------------------------------------
#  Hàm hỗ trợ
# ----------------------------------------------------------------------
def row_to_task(row):
    task = dict(row)
    task["is_overdue"] = bool(task["is_overdue"])
    return task


def fetch_task(conn, task_id):
    row = conn.execute(BASE_SELECT + " WHERE t.id = ?", (task_id,)).fetchone()
    return row_to_task(row) if row else None


def validate_task(data):
    """Kiểm tra dữ liệu gửi lên. Trả về (dữ_liệu_sạch, thông_báo_lỗi)."""
    if not isinstance(data, dict):
        return None, "Dữ liệu gửi lên không hợp lệ"

    title = str(data.get("title") or "").strip()
    if not title:
        return None, "Vui lòng nhập tiêu đề công việc"
    if len(title) > 200:
        return None, "Tiêu đề tối đa 200 ký tự"

    description = str(data.get("description") or "").strip()
    if len(description) > 2000:
        return None, "Mô tả tối đa 2000 ký tự"

    priority = data.get("priority") or "medium"
    if priority not in VALID_PRIORITY:
        return None, "Độ ưu tiên không hợp lệ"

    status = data.get("status") or "todo"
    if status not in VALID_STATUS:
        return None, "Trạng thái không hợp lệ"

    due_date = data.get("due_date") or None
    if due_date:
        try:
            datetime.strptime(due_date, "%Y-%m-%d")
        except (TypeError, ValueError):
            return None, "Hạn hoàn thành không hợp lệ (định dạng YYYY-MM-DD)"

    category_id = data.get("category_id")
    if category_id in (None, "", 0, "0"):
        category_id = None
    else:
        try:
            category_id = int(category_id)
        except (TypeError, ValueError):
            return None, "Danh mục không hợp lệ"
        with db.get_db() as conn:
            found = conn.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone()
        if not found:
            return None, "Danh mục không tồn tại"

    return {
        "title": title,
        "description": description,
        "category_id": category_id,
        "priority": priority,
        "status": status,
        "due_date": due_date,
    }, None


def error(message, code=400):
    return jsonify(error=message), code


# ----------------------------------------------------------------------
#  Trang chủ
# ----------------------------------------------------------------------
@app.get("/")
def index():
    return render_template("index.html")


# ----------------------------------------------------------------------
#  API: Danh mục
# ----------------------------------------------------------------------
@app.get("/api/categories")
def list_categories():
    with db.get_db() as conn:
        rows = conn.execute("SELECT id, name, color FROM categories ORDER BY id").fetchall()
    return jsonify([dict(r) for r in rows])


# ----------------------------------------------------------------------
#  API: Công việc – CRUD
# ----------------------------------------------------------------------
@app.get("/api/tasks")
def list_tasks():
    where, params = [], []

    status = request.args.get("status")
    if status in VALID_STATUS:
        where.append("t.status = ?")
        params.append(status)

    priority = request.args.get("priority")
    if priority in VALID_PRIORITY:
        where.append("t.priority = ?")
        params.append(priority)

    category_id = request.args.get("category_id", type=int)
    if category_id:
        where.append("t.category_id = ?")
        params.append(category_id)

    q = request.args.get("q", "").strip()
    if q:
        # Tìm theo tiêu đề / mô tả, không phân biệt hoa thường và dấu
        keyword = db.fold_text(q).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("(fold(t.title) LIKE ? ESCAPE '\\' OR fold(t.description) LIKE ? ESCAPE '\\')")
        params += [f"%{keyword}%", f"%{keyword}%"]

    sql = BASE_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY " + SORT_OPTIONS.get(request.args.get("sort"), SORT_OPTIONS["newest"])

    with db.get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return jsonify([row_to_task(r) for r in rows])


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id):
    with db.get_db() as conn:
        task = fetch_task(conn, task_id)
    if not task:
        return error("Không tìm thấy công việc", 404)
    return jsonify(task)


@app.post("/api/tasks")
def create_task():
    clean, err = validate_task(request.get_json(silent=True))
    if err:
        return error(err)
    with db.get_db() as conn:
        cur = conn.execute(
            """INSERT INTO tasks (title, description, category_id, priority, status, due_date, completed_at)
               VALUES (:title, :description, :category_id, :priority, :status, :due_date,
                       CASE WHEN :status = 'done' THEN datetime('now', 'localtime') END)""",
            clean,
        )
        task = fetch_task(conn, cur.lastrowid)
    return jsonify(task), 201


@app.put("/api/tasks/<int:task_id>")
def update_task(task_id):
    clean, err = validate_task(request.get_json(silent=True))
    if err:
        return error(err)
    clean["id"] = task_id
    with db.get_db() as conn:
        cur = conn.execute(
            """UPDATE tasks
               SET title = :title, description = :description, category_id = :category_id,
                   priority = :priority, status = :status, due_date = :due_date,
                   updated_at   = datetime('now', 'localtime'),
                   completed_at = CASE WHEN :status = 'done'
                                       THEN COALESCE(completed_at, datetime('now', 'localtime'))
                                       ELSE NULL END
               WHERE id = :id""",
            clean,
        )
        if cur.rowcount == 0:
            return error("Không tìm thấy công việc", 404)
        task = fetch_task(conn, task_id)
    return jsonify(task)


@app.patch("/api/tasks/<int:task_id>/status")
def update_status(task_id):
    """Cập nhật nhanh trạng thái (dùng cho nút tích hoàn thành, kéo thả Kanban...)."""
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in VALID_STATUS:
        return error("Trạng thái không hợp lệ")
    with db.get_db() as conn:
        cur = conn.execute(
            """UPDATE tasks
               SET status = :status,
                   updated_at   = datetime('now', 'localtime'),
                   completed_at = CASE WHEN :status = 'done'
                                       THEN COALESCE(completed_at, datetime('now', 'localtime'))
                                       ELSE NULL END
               WHERE id = :id""",
            {"status": status, "id": task_id},
        )
        if cur.rowcount == 0:
            return error("Không tìm thấy công việc", 404)
        task = fetch_task(conn, task_id)
    return jsonify(task)


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    with db.get_db() as conn:
        cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    if cur.rowcount == 0:
        return error("Không tìm thấy công việc", 404)
    return jsonify(ok=True)


@app.delete("/api/tasks/completed")
def delete_completed():
    with db.get_db() as conn:
        cur = conn.execute("DELETE FROM tasks WHERE status = 'done'")
    return jsonify(ok=True, deleted=cur.rowcount)


# ----------------------------------------------------------------------
#  API: Thống kê
# ----------------------------------------------------------------------
@app.get("/api/stats")
def stats():
    with db.get_db() as conn:
        totals = conn.execute(
            """SELECT COUNT(*)                                          AS total,
                      COALESCE(SUM(status = 'todo'),  0)                AS todo,
                      COALESCE(SUM(status = 'doing'), 0)                AS doing,
                      COALESCE(SUM(status = 'done'),  0)                AS done,
                      COALESCE(SUM(status != 'done' AND due_date IS NOT NULL
                                   AND due_date < date('now', 'localtime')), 0) AS overdue,
                      COALESCE(SUM(status != 'done'
                                   AND due_date = date('now', 'localtime')), 0) AS due_today
               FROM tasks"""
        ).fetchone()

        by_category = conn.execute(
            """SELECT COALESCE(c.name,  'Không phân loại') AS name,
                      COALESCE(c.color, '#94a3b8')         AS color,
                      COUNT(t.id)                          AS total,
                      COALESCE(SUM(t.status = 'done'), 0)  AS done
               FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
               GROUP BY t.category_id
               ORDER BY total DESC, name"""
        ).fetchall()

        prio_rows = {
            r["priority"]: r
            for r in conn.execute(
                """SELECT priority, COUNT(*) AS total, COALESCE(SUM(status = 'done'), 0) AS done
                   FROM tasks GROUP BY priority"""
            )
        }

        completed_by_day = {
            r["d"]: r["n"]
            for r in conn.execute(
                """SELECT date(completed_at) AS d, COUNT(*) AS n FROM tasks
                   WHERE completed_at IS NOT NULL
                     AND date(completed_at) >= date('now', 'localtime', '-6 days')
                   GROUP BY d"""
            )
        }
        created_by_day = {
            r["d"]: r["n"]
            for r in conn.execute(
                """SELECT date(created_at) AS d, COUNT(*) AS n FROM tasks
                   WHERE date(created_at) >= date('now', 'localtime', '-6 days')
                   GROUP BY d"""
            )
        }

    total, done = totals["total"], totals["done"]
    today = date.today()
    last7 = []
    for i in range(6, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        last7.append({"date": d, "created": created_by_day.get(d, 0), "completed": completed_by_day.get(d, 0)})

    by_priority = []
    for p in ("high", "medium", "low"):
        r = prio_rows.get(p)
        by_priority.append({"priority": p, "total": r["total"] if r else 0, "done": r["done"] if r else 0})

    return jsonify(
        total=total,
        todo=totals["todo"],
        doing=totals["doing"],
        done=done,
        overdue=totals["overdue"],
        due_today=totals["due_today"],
        completion_rate=round(done * 100 / total) if total else 0,
        by_category=[dict(r) for r in by_category],
        by_priority=by_priority,
        last7=last7,
    )


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return error("Không tìm thấy dữ liệu", 404)
    return e


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
