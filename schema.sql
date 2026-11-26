-- =====================================================================
--  CƠ SỞ DỮ LIỆU: TodoFlow (SQLite)
--  File này được chạy tự động mỗi lần khởi động ứng dụng (an toàn,
--  vì dùng IF NOT EXISTS / INSERT OR IGNORE).
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
--  Bảng 1: categories – Danh mục công việc
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT    NOT NULL UNIQUE,
    color  TEXT    NOT NULL DEFAULT '#6366f1'      -- mã màu hiển thị trên giao diện
);

-- ---------------------------------------------------------------------
--  Bảng 2: tasks – Công việc
--    status   : todo (Chưa làm) | doing (Đang làm) | done (Hoàn thành)
--    priority : low (Thấp) | medium (Trung bình) | high (Cao)
--    due_date : hạn hoàn thành, dạng YYYY-MM-DD (có thể để trống)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL CHECK (length(trim(title)) > 0),
    description   TEXT    NOT NULL DEFAULT '',
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    priority      TEXT    NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low', 'medium', 'high')),
    status        TEXT    NOT NULL DEFAULT 'todo'
                          CHECK (status IN ('todo', 'doing', 'done')),
    due_date      TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    completed_at  TEXT                               -- thời điểm chuyển sang 'done'
);

CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- ---------------------------------------------------------------------
--  Dữ liệu mặc định cho danh mục
-- ---------------------------------------------------------------------
INSERT OR IGNORE INTO categories (name, color) VALUES
    ('Học tập',   '#6366f1'),
    ('Công việc', '#0ea5e9'),
    ('Cá nhân',   '#f59e0b'),
    ('Gia đình',  '#ec4899'),
    ('Sức khỏe',  '#10b981');
