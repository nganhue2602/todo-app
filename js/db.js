/* =====================================================================
   db.js – CƠ SỞ DỮ LIỆU của TodoFlow, chạy ngay trong trình duyệt

   Dùng IndexedDB (cơ sở dữ liệu có sẵn trong mọi trình duyệt), nên:
   - Không cần cài đặt, không cần server, mở index.html là chạy.
   - Dữ liệu được lưu lâu dài trên máy, tắt trình duyệt vẫn còn.
   Nếu trình duyệt chặn IndexedDB thì tự chuyển sang localStorage.

   Cấu trúc dữ liệu (tương đương 2 bảng SQL):
     categories : id, name, color
     tasks      : id, title, description, category_id, priority, status,
                  due_date, created_at, updated_at, completed_at
       status   = todo (Chưa làm) | doing (Đang làm) | done (Hoàn thành)
       priority = low (Thấp) | medium (Trung bình) | high (Cao)

   Mọi hàm công khai (TodoDB.xxx) đều trả về Promise.
   ===================================================================== */
const TodoDB = (() => {
  'use strict';

  const DB_NAME = 'todoflow';
  const DB_VERSION = 1;
  const STATUSES = ['todo', 'doing', 'done'];
  const PRIORITIES = ['low', 'medium', 'high'];
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

  /* ---------- Hàm tiện ích ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // "YYYY-MM-DD HH:MM:SS" theo giờ máy, lệch offsetDays ngày
  function nowStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  const today = (offsetDays = 0) => nowStr(offsetDays).slice(0, 10);

  // Bỏ dấu + chữ thường: "Học Tập" -> "hoc tap" (để tìm kiếm gõ không dấu vẫn ra)
  const fold = (s) =>
    String(s ?? '').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  /* ---------- Dữ liệu khởi tạo ---------- */
  const SEED_CATEGORIES = [
    { id: 1, name: 'Học tập',   color: '#6366f1' },
    { id: 2, name: 'Công việc', color: '#0ea5e9' },
    { id: 3, name: 'Cá nhân',   color: '#f59e0b' },
    { id: 4, name: 'Gia đình',  color: '#ec4899' },
    { id: 5, name: 'Sức khỏe',  color: '#10b981' },
  ];

  // Dữ liệu mẫu để demo – chỉ nạp 1 lần khi tạo database mới
  function seedTasks() {
    const T = (title, description, category_id, priority, status, dueIn, createdAgo, doneAgo) => ({
      title, description, category_id, priority, status,
      due_date: dueIn === null ? null : today(dueIn),
      created_at: nowStr(-createdAgo),
      updated_at: nowStr(-createdAgo),
      completed_at: doneAgo === null ? null : nowStr(-doneAgo),
    });
    return [
      T('Hoàn thành báo cáo môn Quản trị dự án', 'Viết phần mở đầu, nội dung chính và kết luận.', 1, 'high', 'doing', 2, 3, null),
      T('Làm slide thuyết trình nhóm', 'Tối đa 12 slide, có phần demo hệ thống.', 1, 'high', 'todo', 4, 2, null),
      T('Nộp bài tập Database', 'Thiết kế ERD và viết các câu truy vấn SQL.', 1, 'medium', 'done', -1, 6, 2),
      T('Họp nhóm đồ án', 'Phân công công việc và chốt tiến độ tuần này.', 2, 'medium', 'todo', 0, 1, null),
      T('Gửi email xác nhận lịch hẹn', '', 2, 'low', 'done', 0, 4, 1),
      T('Chạy bộ 30 phút', 'Chạy quanh công viên vào buổi sáng.', 5, 'low', 'doing', 1, 1, null),
      T('Mua quà sinh nhật cho mẹ', 'Nhớ gói quà thật đẹp.', 4, 'high', 'todo', -1, 5, null),
      T('Đọc xong cuốn sách đang đọc dở', '', 3, 'low', 'todo', null, 3, null),
      T('Dọn dẹp góc học tập', '', 3, 'low', 'done', null, 3, 0),
    ];
  }

  /* =====================================================================
     TẦNG LƯU TRỮ (2 cách lưu, cùng một giao diện)
       all(store) · get(store,id) · add(store,obj)->id · put(store,obj)
       remove(store,id) · removeMany(store,ids)
     ===================================================================== */
  function idbBackend() {
    let dbPromise = null;

    function open() {
      if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => {
            // Chạy khi database được tạo lần đầu: tạo "bảng" + chỉ mục + nạp dữ liệu mẫu
            const db = req.result;
            const cats = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
            cats.createIndex('name', 'name', { unique: true });
            const tasks = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
            tasks.createIndex('status', 'status');
            tasks.createIndex('category_id', 'category_id');
            tasks.createIndex('due_date', 'due_date');
            SEED_CATEGORIES.forEach((c) => cats.add(c));
            seedTasks().forEach((t) => tasks.add(t));
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
          req.onblocked = () => reject(new Error('IndexedDB bị chặn'));
        });
      }
      return dbPromise;
    }

    async function run(store, mode, fn) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        let result;
        const r = fn(t.objectStore(store));
        if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Giao dịch bị hủy'));
      });
    }

    return {
      kind: 'IndexedDB',
      ready: open,
      all: (store) => run(store, 'readonly', (s) => s.getAll()),
      get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
      add: (store, obj) => run(store, 'readwrite', (s) => s.add(obj)),
      put: (store, obj) => run(store, 'readwrite', (s) => s.put(obj)),
      remove: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
      removeMany: (store, ids) => run(store, 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); }),
    };
  }

  // Phương án dự phòng: lưu toàn bộ dưới dạng JSON trong localStorage
  function localBackend() {
    const KEY = 'todoflow_db_v1';
    let data = null;

    function load() {
      if (data) return data;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) { data = JSON.parse(raw); return data; }
      } catch { /* dữ liệu hỏng hoặc bị chặn -> tạo mới */ }
      const tasks = seedTasks().map((t, i) => ({ ...t, id: i + 1 }));
      data = { seq: { categories: SEED_CATEGORIES.length, tasks: tasks.length }, categories: [...SEED_CATEGORIES], tasks };
      save();
      return data;
    }
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* chỉ giữ trong bộ nhớ */ }
    }
    const copy = (o) => (o ? { ...o } : o);

    return {
      kind: 'localStorage',
      ready: async () => { load(); },
      all: async (store) => load()[store].map(copy),
      get: async (store, id) => copy(load()[store].find((x) => x.id === id)),
      add: async (store, obj) => {
        const d = load();
        const id = ++d.seq[store];
        d[store].push({ ...obj, id });
        save();
        return id;
      },
      put: async (store, obj) => {
        const d = load();
        const i = d[store].findIndex((x) => x.id === obj.id);
        if (i >= 0) d[store][i] = { ...obj };
        save();
      },
      remove: async (store, id) => { const d = load(); d[store] = d[store].filter((x) => x.id !== id); save(); },
      removeMany: async (store, ids) => { const d = load(); d[store] = d[store].filter((x) => !ids.includes(x.id)); save(); },
    };
  }

  let backendPromise = null;
  function backend() {
    if (!backendPromise) {
      backendPromise = (async () => {
        if (typeof indexedDB !== 'undefined') {
          try {
            const b = idbBackend();
            await b.ready();
            return b;
          } catch (err) {
            console.warn('IndexedDB không dùng được, chuyển sang localStorage:', err);
          }
        }
        const b = localBackend();
        await b.ready();
        return b;
      })();
    }
    return backendPromise;
  }

  /* =====================================================================
     NGHIỆP VỤ
     ===================================================================== */
  const fail = (msg) => { throw new Error(msg); };

  // Kiểm tra dữ liệu người dùng nhập, trả về bản đã làm sạch
  async function validate(data, b) {
    if (!data || typeof data !== 'object') fail('Dữ liệu không hợp lệ');

    const title = String(data.title ?? '').trim();
    if (!title) fail('Vui lòng nhập tiêu đề công việc');
    if (title.length > 200) fail('Tiêu đề tối đa 200 ký tự');

    const description = String(data.description ?? '').trim();
    if (description.length > 2000) fail('Mô tả tối đa 2000 ký tự');

    const priority = data.priority || 'medium';
    if (!PRIORITIES.includes(priority)) fail('Độ ưu tiên không hợp lệ');

    const status = data.status || 'todo';
    if (!STATUSES.includes(status)) fail('Trạng thái không hợp lệ');

    const due_date = data.due_date || null;
    if (due_date) {
      const d = new Date(`${due_date}T00:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date) || Number.isNaN(d.getTime()) || ymd(d) !== due_date) {
        fail('Hạn hoàn thành không hợp lệ');
      }
    }

    let category_id = null;
    if (data.category_id !== null && data.category_id !== undefined && data.category_id !== '' && data.category_id !== 0) {
      category_id = Number(data.category_id);
      if (!Number.isInteger(category_id)) fail('Danh mục không hợp lệ');
      if (!(await b.get('categories', category_id))) fail('Danh mục không tồn tại');
    }

    return { title, description, category_id, priority, status, due_date };
  }

  // Ghép thêm tên/màu danh mục và cờ "quá hạn" (giống phép JOIN trong SQL)
  function toView(t, catMap) {
    const c = t.category_id ? catMap.get(t.category_id) : null;
    return {
      ...t,
      category_name: c ? c.name : null,
      category_color: c ? c.color : null,
      is_overdue: t.status !== 'done' && !!t.due_date && t.due_date < today(),
    };
  }

  const SORTERS = {
    newest: (a, b) => cmp(b.created_at, a.created_at) || b.id - a.id,
    oldest: (a, b) => cmp(a.created_at, b.created_at) || a.id - b.id,
    due: (a, b) => (a.due_date ? 0 : 1) - (b.due_date ? 0 : 1) || cmp(a.due_date || '', b.due_date || '') || b.id - a.id,
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.id - a.id,
    title: (a, b) => a.title.localeCompare(b.title, 'vi', { sensitivity: 'base' }),
  };

  async function loadAll() {
    const b = await backend();
    const [tasks, cats] = await Promise.all([b.all('tasks'), b.all('categories')]);
    return { b, tasks, cats, catMap: new Map(cats.map((c) => [c.id, c])) };
  }

  /* ---------- Danh mục ---------- */
  async function listCategories() {
    const b = await backend();
    return (await b.all('categories')).sort((x, y) => x.id - y.id);
  }

  /* ---------- Công việc ---------- */
  // filters: { status, priority, category_id, q, sort }
  async function listTasks(filters = {}) {
    const { tasks, catMap } = await loadAll();
    let rows = tasks.map((t) => toView(t, catMap));

    if (STATUSES.includes(filters.status)) rows = rows.filter((t) => t.status === filters.status);
    if (PRIORITIES.includes(filters.priority)) rows = rows.filter((t) => t.priority === filters.priority);
    if (filters.category_id) rows = rows.filter((t) => t.category_id === Number(filters.category_id));

    const q = fold(String(filters.q || '').trim());
    if (q) rows = rows.filter((t) => fold(t.title).includes(q) || fold(t.description).includes(q));

    return rows.sort(SORTERS[filters.sort] || SORTERS.newest);
  }

  async function getTask(id) {
    const b = await backend();
    const cats = await b.all('categories');
    const t = await b.get('tasks', Number(id));
    return t ? toView(t, new Map(cats.map((c) => [c.id, c]))) : null;
  }

  async function createTask(data) {
    const b = await backend();
    const clean = await validate(data, b);
    const now = nowStr();
    const id = await b.add('tasks', {
      ...clean,
      created_at: now,
      updated_at: now,
      completed_at: clean.status === 'done' ? now : null,
    });
    return getTask(id);
  }

  async function updateTask(id, data) {
    const b = await backend();
    const old = await b.get('tasks', Number(id));
    if (!old) fail('Không tìm thấy công việc');
    const clean = await validate(data, b);
    const now = nowStr();
    await b.put('tasks', {
      ...old,
      ...clean,
      updated_at: now,
      completed_at: clean.status === 'done' ? old.completed_at || now : null,
    });
    return getTask(id);
  }

  // Cập nhật nhanh trạng thái (nút tích, kéo thả Kanban...)
  async function setStatus(id, status) {
    if (!STATUSES.includes(status)) fail('Trạng thái không hợp lệ');
    const b = await backend();
    const old = await b.get('tasks', Number(id));
    if (!old) fail('Không tìm thấy công việc');
    const now = nowStr();
    await b.put('tasks', {
      ...old,
      status,
      updated_at: now,
      completed_at: status === 'done' ? old.completed_at || now : null,
    });
    return getTask(id);
  }

  async function deleteTask(id) {
    const b = await backend();
    if (!(await b.get('tasks', Number(id)))) fail('Không tìm thấy công việc');
    await b.remove('tasks', Number(id));
    return { ok: true };
  }

  async function deleteCompleted() {
    const b = await backend();
    const ids = (await b.all('tasks')).filter((t) => t.status === 'done').map((t) => t.id);
    await b.removeMany('tasks', ids);
    return { ok: true, deleted: ids.length };
  }

  /* ---------- Thống kê ---------- */
  async function getStats() {
    const { tasks, catMap } = await loadAll();
    const t0 = today();
    const count = (fn) => tasks.filter(fn).length;
    const total = tasks.length;
    const done = count((t) => t.status === 'done');

    // Theo danh mục
    const groups = new Map();
    for (const t of tasks) {
      const key = t.category_id && catMap.has(t.category_id) ? t.category_id : 0;
      if (!groups.has(key)) {
        const c = catMap.get(key);
        groups.set(key, { name: c ? c.name : 'Không phân loại', color: c ? c.color : '#94a3b8', total: 0, done: 0 });
      }
      const g = groups.get(key);
      g.total += 1;
      if (t.status === 'done') g.done += 1;
    }
    const by_category = [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));

    // Theo độ ưu tiên
    const by_priority = ['high', 'medium', 'low'].map((p) => ({
      priority: p,
      total: count((t) => t.priority === p),
      done: count((t) => t.priority === p && t.status === 'done'),
    }));

    // 7 ngày gần nhất
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = today(-i);
      last7.push({
        date: d,
        created: count((t) => t.created_at.slice(0, 10) === d),
        completed: count((t) => t.completed_at && t.completed_at.slice(0, 10) === d),
      });
    }

    return {
      total,
      todo: count((t) => t.status === 'todo'),
      doing: count((t) => t.status === 'doing'),
      done,
      overdue: count((t) => t.status !== 'done' && t.due_date && t.due_date < t0),
      due_today: count((t) => t.status !== 'done' && t.due_date === t0),
      completion_rate: total ? Math.round((done * 100) / total) : 0,
      by_category,
      by_priority,
      last7,
    };
  }

  return {
    listCategories, listTasks, getTask, createTask, updateTask,
    setStatus, deleteTask, deleteCompleted, getStats,
  };
})();
