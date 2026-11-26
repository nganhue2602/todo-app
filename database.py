"""
database.py – Kết nối và khởi tạo cơ sở dữ liệu SQLite.

- get_db()  : mở kết nối (tự commit / rollback / đóng).
- init_db() : tạo bảng từ schema.sql; nếu database mới tinh thì nạp thêm seed.sql.
"""
import os
import sqlite3
import unicodedata
from contextlib import contextmanager
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("TODO_DB", BASE_DIR / "data" / "todo.db"))
SCHEMA_PATH = BASE_DIR / "schema.sql"
SEED_PATH = BASE_DIR / "seed.sql"


def fold_text(value):
    """Chuyển về chữ thường, bỏ dấu tiếng Việt: 'Học Tập' -> 'hoc tap'.
    Dùng để tìm kiếm không phân biệt hoa/thường và có/không dấu."""
    if value is None:
        return ""
    text = str(value).lower().replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # Đăng ký hàm fold() để dùng trực tiếp trong câu lệnh SQL
    conn.create_function("fold", 1, fold_text, deterministic=True)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    is_new = not DB_PATH.exists()
    with get_db() as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        if is_new and SEED_PATH.exists():
            conn.executescript(SEED_PATH.read_text(encoding="utf-8"))
