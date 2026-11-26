-- =====================================================================
--  DỮ LIỆU MẪU – chỉ được nạp 1 lần, khi database được tạo mới.
--  Muốn nạp lại: xóa file data/todo.db rồi chạy lại ứng dụng.
-- =====================================================================

INSERT INTO tasks (title, description, category_id, priority, status, due_date, created_at, completed_at) VALUES
('Hoàn thành báo cáo môn Quản trị dự án',
 'Viết phần mở đầu, nội dung chính và kết luận.',
 (SELECT id FROM categories WHERE name = 'Học tập'), 'high', 'doing',
 date('now', 'localtime', '+2 days'), datetime('now', 'localtime', '-3 days'), NULL),

('Làm slide thuyết trình nhóm',
 'Tối đa 12 slide, có phần demo hệ thống.',
 (SELECT id FROM categories WHERE name = 'Học tập'), 'high', 'todo',
 date('now', 'localtime', '+4 days'), datetime('now', 'localtime', '-2 days'), NULL),

('Nộp bài tập Database',
 'Thiết kế ERD và viết các câu truy vấn SQL.',
 (SELECT id FROM categories WHERE name = 'Học tập'), 'medium', 'done',
 date('now', 'localtime', '-1 days'), datetime('now', 'localtime', '-6 days'), datetime('now', 'localtime', '-2 days')),

('Họp nhóm đồ án',
 'Phân công công việc và chốt tiến độ tuần này.',
 (SELECT id FROM categories WHERE name = 'Công việc'), 'medium', 'todo',
 date('now', 'localtime'), datetime('now', 'localtime', '-1 days'), NULL),

('Gửi email xác nhận lịch hẹn',
 '',
 (SELECT id FROM categories WHERE name = 'Công việc'), 'low', 'done',
 date('now', 'localtime'), datetime('now', 'localtime', '-4 days'), datetime('now', 'localtime', '-1 days')),

('Chạy bộ 30 phút',
 'Chạy quanh công viên vào buổi sáng.',
 (SELECT id FROM categories WHERE name = 'Sức khỏe'), 'low', 'doing',
 date('now', 'localtime', '+1 days'), datetime('now', 'localtime', '-1 days'), NULL),

('Mua quà sinh nhật cho mẹ',
 'Nhớ gói quà thật đẹp.',
 (SELECT id FROM categories WHERE name = 'Gia đình'), 'high', 'todo',
 date('now', 'localtime', '-1 days'), datetime('now', 'localtime', '-5 days'), NULL),

('Đọc xong cuốn sách đang đọc dở',
 '',
 (SELECT id FROM categories WHERE name = 'Cá nhân'), 'low', 'todo',
 NULL, datetime('now', 'localtime', '-3 days'), NULL),

('Dọn dẹp góc học tập',
 '',
 (SELECT id FROM categories WHERE name = 'Cá nhân'), 'low', 'done',
 NULL, datetime('now', 'localtime', '-3 days'), datetime('now', 'localtime'));
