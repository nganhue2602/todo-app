/* =====================================================================
   TodoFlow – phần giao diện (JavaScript thuần, không cần build)
   Giao tiếp với backend Flask qua các API /api/...
   ===================================================================== */
(() => {
  'use strict';

  /* ---------- Hằng số ---------- */
  const STATUS = {
    todo:  { label: 'Chưa làm' },
    doing: { label: 'Đang làm' },
    done:  { label: 'Hoàn thành' },
  };
  const STATUS_ORDER = ['todo', 'doing', 'done'];
  const PRIORITY = {
    high:   { label: 'Cao' },
    medium: { label: 'Trung bình' },
    low:    { label: 'Thấp' },
  };

  /* ---------- Biểu tượng (SVG nội tuyến, không phụ thuộc thư viện ngoài) ---------- */
  const svg = (paths) =>
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const icon = {
    plus:     svg('<path d="M12 5v14M5 12h14"/>'),
    check:    svg('<path d="M20 6 9 17l-5-5"/>'),
    edit:     svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    trash:    svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>'),
    calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    flag:     svg('<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>'),
    list:     svg('<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>'),
    board:    svg('<rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="10" rx="1.5"/>'),
    chart:    svg('<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>'),
    left:     svg('<path d="m15 18-6-6 6-6"/>'),
    right:    svg('<path d="m9 18 6-6-6-6"/>'),
    search:   svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
    moon:     svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'),
    sun:      svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    empty:    '<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="20" y="14" width="56" height="70" rx="9"/><path d="M34 14v-3a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v3"/><path d="m34 44 7 7 13-14" opacity=".9"/><path d="M34 66h28" opacity=".45"/></svg>',
  };

  /* ---------- Hàm tiện ích ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Chống XSS: luôn escape dữ liệu người dùng trước khi chèn vào HTML
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const parseDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmtDate = (s) => {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };
  const diffDays = (s) => Math.round((parseDate(s) - parseDate(todayStr())) / 86400000);

  const store = {
    get(k, fallback) { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } },
  };

  async function api(path, options = {}) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    let data = null;
    try { data = await res.json(); } catch { /* không có nội dung JSON */ }
    if (!res.ok) throw new Error((data && data.error) || 'Có lỗi xảy ra, vui lòng thử lại');
    return data;
  }

  function toast(message, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${type === 'err' ? 'err' : ''}`;
    el.textContent = message;
    $('#toasts').append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 2600);
  }

  /* ---------- Trạng thái ứng dụng ---------- */
  const state = {
    tasks: [],
    stats: null,
    categories: [],
    view: store.get('view', 'list'),
    page: 'tasks',
    editingId: null,
    filters: { q: '', status: '', category_id: '', priority: '', sort: 'newest' },
  };

  /* =====================================================================
     TẢI DỮ LIỆU
     ===================================================================== */
  async function loadCategories() {
    state.categories = await api('/api/categories');
    const opts = state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    $('#fCategory').innerHTML = `<option value="">Mọi danh mục</option>${opts}`;
    $('#f_category').innerHTML = `<option value="">Không phân loại</option>${opts}`;
  }

  function fetchTasks() {
    const f = state.filters;
    const p = new URLSearchParams();
    // Ở dạng Kanban luôn hiển thị đủ 3 cột nên không lọc theo trạng thái
    if (state.view === 'list' && f.status) p.set('status', f.status);
    if (f.category_id) p.set('category_id', f.category_id);
    if (f.priority) p.set('priority', f.priority);
    if (f.q) p.set('q', f.q);
    p.set('sort', f.sort);
    return api('/api/tasks?' + p.toString());
  }

  async function refresh() {
    try {
      const [tasks, stats] = await Promise.all([fetchTasks(), api('/api/stats')]);
      state.tasks = tasks;
      state.stats = stats;
      renderSummary();
      renderTasks();
      renderStats();
    } catch (err) {
      toast(err.message || 'Không kết nối được máy chủ', 'err');
    }
  }

  /* =====================================================================
     HIỂN THỊ – TRANG CÔNG VIỆC
     ===================================================================== */
  function renderSummary() {
    const s = state.stats;
    const cards = [
      ['Tổng công việc', s.total, ''],
      ['Chưa làm', s.todo, 'todo'],
      ['Đang làm', s.doing, 'doing'],
      ['Hoàn thành', s.done, 'done'],
    ];
    $('#summary').innerHTML =
      cards.map(([label, n, cls]) => `<div class="sum-card ${cls}"><span class="sum-label">${label}</span><strong>${n}</strong></div>`).join('') +
      `<div class="progress-line"><span>Tiến độ chung</span><div class="track"><div class="fill" style="width:${s.completion_rate}%"></div></div><b>${s.completion_rate}%</b></div>`;

    let sub = 'Hôm nay bạn chưa có công việc nào. Hãy thêm công việc đầu tiên nhé!';
    if (s.total) {
      const parts = [];
      if (s.due_today) parts.push(`${s.due_today} việc đến hạn hôm nay`);
      if (s.overdue) parts.push(`${s.overdue} việc quá hạn`);
      sub = parts.length ? parts.join(' · ') : (s.done === s.total ? 'Tuyệt vời! Bạn đã hoàn thành tất cả công việc 🎉' : 'Mọi thứ đang đúng tiến độ.');
    }
    $('#subtitle').textContent = sub;
    $('#clearDone').hidden = !(s.done > 0 && state.view === 'list');
  }

  const catChip = (t) =>
    t.category_name
      ? `<span class="chip" style="--c:${esc(t.category_color)}"><i class="dot"></i>${esc(t.category_name)}</span>`
      : '';

  const priorityChip = (t) =>
    `<span class="chip prio-${t.priority}" title="Độ ưu tiên">${icon.flag}${PRIORITY[t.priority].label}</span>`;

  function dueChip(t) {
    if (!t.due_date) return '';
    let text = fmtDate(t.due_date);
    let cls = '';
    if (t.status !== 'done') {
      const n = diffDays(t.due_date);
      if (n < 0) { text = `Quá hạn ${-n} ngày`; cls = 'overdue'; }
      else if (n === 0) { text = 'Hôm nay'; cls = 'soon'; }
      else if (n === 1) { text = 'Ngày mai'; cls = 'soon'; }
    }
    return `<span class="chip due ${cls}" title="Hạn: ${fmtDate(t.due_date)}">${icon.calendar}${text}</span>`;
  }

  function taskRow(t) {
    const options = STATUS_ORDER
      .map((s) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${STATUS[s].label}</option>`)
      .join('');
    return `
      <article class="task ${t.status === 'done' ? 'is-done' : ''}" data-id="${t.id}">
        <button class="check" data-action="toggle" title="${t.status === 'done' ? 'Đánh dấu chưa làm' : 'Đánh dấu hoàn thành'}" aria-label="Đổi trạng thái hoàn thành">${icon.check}</button>
        <div>
          <div class="task-title">${esc(t.title)}</div>
          ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ''}
          <div class="task-meta">${catChip(t)}${priorityChip(t)}${dueChip(t)}</div>
        </div>
        <div class="task-side">
          <select class="input status-select status-${t.status}" data-action="status" aria-label="Trạng thái">${options}</select>
          <button class="icon-btn" data-action="edit" title="Sửa" aria-label="Sửa">${icon.edit}</button>
          <button class="icon-btn danger" data-action="delete" title="Xóa" aria-label="Xóa">${icon.trash}</button>
        </div>
      </article>`;
  }

  function taskCard(t) {
    const idx = STATUS_ORDER.indexOf(t.status);
    return `
      <article class="card-task ${t.status === 'done' ? 'is-done' : ''}" draggable="true" data-id="${t.id}">
        <div class="ct-top">${catChip(t)}${priorityChip(t)}</div>
        <div class="task-title">${esc(t.title)}</div>
        ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ''}
        <div class="ct-foot">
          ${dueChip(t)}
          <span class="spacer"></span>
          <button class="icon-btn sm" data-action="move" data-dir="-1" title="Chuyển sang cột trước" aria-label="Chuyển sang cột trước" ${idx === 0 ? 'disabled' : ''}>${icon.left}</button>
          <button class="icon-btn sm" data-action="move" data-dir="1" title="Chuyển sang cột sau" aria-label="Chuyển sang cột sau" ${idx === STATUS_ORDER.length - 1 ? 'disabled' : ''}>${icon.right}</button>
          <button class="icon-btn sm" data-action="edit" title="Sửa" aria-label="Sửa">${icon.edit}</button>
          <button class="icon-btn sm danger" data-action="delete" title="Xóa" aria-label="Xóa">${icon.trash}</button>
        </div>
      </article>`;
  }

  function emptyHTML() {
    const f = state.filters;
    const filtering = f.q || f.status || f.category_id || f.priority;
    return `
      <div class="empty">
        ${icon.empty}
        <h3>${filtering ? 'Không tìm thấy công việc phù hợp' : 'Chưa có công việc nào'}</h3>
        <p>${filtering ? 'Thử đổi từ khóa hoặc bỏ bớt bộ lọc.' : 'Bắt đầu bằng việc thêm công việc đầu tiên của bạn.'}</p>
        ${filtering ? '' : `<button class="btn primary" data-action="add-first">${icon.plus}Thêm công việc</button>`}
      </div>`;
  }

  function renderTasks() {
    // đồng bộ trạng thái các nút lọc / chế độ xem
    $$('#viewSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    $$('#statusSeg button').forEach((b) => b.classList.toggle('active', b.dataset.status === state.filters.status));
    $('#statusSeg').hidden = state.view === 'board';

    const box = $('#taskView');
    if (state.view === 'board') {
      box.innerHTML = '<div class="board">' + STATUS_ORDER.map((s) => {
        const items = state.tasks.filter((t) => t.status === s);
        return `
          <section class="column col-${s}" data-status="${s}">
            <header class="col-head">
              <i class="dot"></i><h3>${STATUS[s].label}</h3><span class="count">${items.length}</span>
              <button class="icon-btn sm" data-action="add-in" data-status="${s}" title="Thêm vào cột này" aria-label="Thêm vào cột ${STATUS[s].label}">${icon.plus}</button>
            </header>
            <div class="col-body">${items.map(taskCard).join('') || '<p class="col-empty">Kéo thả công việc vào đây</p>'}</div>
          </section>`;
      }).join('') + '</div>';
    } else {
      box.innerHTML = state.tasks.length
        ? `<div class="task-list">${state.tasks.map(taskRow).join('')}</div>`
        : emptyHTML();
    }
  }

  /* =====================================================================
     HIỂN THỊ – TRANG THỐNG KÊ
     ===================================================================== */
  function meterHTML(name, color, done, total) {
    const pct = total ? Math.round((done * 100) / total) : 0;
    return `
      <div class="meter" style="--c:${esc(color)}">
        <div class="row"><span><i></i>${esc(name)}</span><small>${done}/${total} hoàn thành · ${pct}%</small></div>
        <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      </div>`;
  }

  function renderStats() {
    const s = state.stats;
    if (!s) return;

    $('#statCards').innerHTML = [
      ['Tổng công việc', s.total, 'Tất cả công việc đang quản lý', 'var(--accent)'],
      ['Đã hoàn thành', s.done, `Đạt ${s.completion_rate}% tổng số việc`, 'var(--done)'],
      ['Đang thực hiện', s.doing, `${s.todo} việc chưa bắt đầu`, 'var(--doing)'],
      ['Quá hạn', s.overdue, s.due_today ? `${s.due_today} việc đến hạn hôm nay` : 'Không có việc nào đến hạn hôm nay', 'var(--danger)'],
    ].map(([label, value, hint, c]) => `
      <div class="stat-card" style="--c:${c}">
        <div class="label"><i></i>${label}</div>
        <div class="value">${value}</div>
        <div class="hint">${hint}</div>
      </div>`).join('');

    // Biểu đồ tròn theo trạng thái
    let bg = 'var(--track)';
    if (s.total) {
      const a = (s.done / s.total) * 100;
      const b = a + (s.doing / s.total) * 100;
      bg = `conic-gradient(var(--done) 0 ${a}%, var(--doing) ${a}% ${b}%, var(--todo) ${b}% 100%)`;
    }
    $('#donutBox').innerHTML = `
      <div class="donut" style="background:${bg}">
        <div class="donut-center"><b>${s.completion_rate}%</b><span>hoàn thành</span></div>
      </div>
      <div class="legend">
        <div style="--c:var(--done)"><i></i>Hoàn thành<b>${s.done}</b></div>
        <div style="--c:var(--doing)"><i></i>Đang làm<b>${s.doing}</b></div>
        <div style="--c:var(--todo)"><i></i>Chưa làm<b>${s.todo}</b></div>
      </div>`;

    // Biểu đồ cột 7 ngày
    const max = Math.max(1, ...s.last7.flatMap((d) => [d.created, d.completed]));
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const bar = (n, c, label) =>
      `<span class="bar" style="--c:${c};height:${(n / max) * 100}%" title="${label}: ${n}">${n ? `<em>${n}</em>` : ''}</span>`;
    $('#week').innerHTML = `
      <div class="week">${s.last7.map((d) => {
        const dt = parseDate(d.date);
        const isToday = d.date === todayStr();
        return `
          <div class="day ${isToday ? 'today' : ''}">
            <div class="bars">${bar(d.created, 'var(--doing)', 'Công việc mới')}${bar(d.completed, 'var(--done)', 'Đã hoàn thành')}</div>
            <div class="lbl">${isToday ? 'Nay' : days[dt.getDay()]}</div>
            <div class="sub">${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}</div>
          </div>`;
      }).join('')}</div>
      <div class="week-legend">
        <span style="--c:var(--doing)"><i></i>Công việc mới</span>
        <span style="--c:var(--done)"><i></i>Đã hoàn thành</span>
      </div>`;

    // Theo danh mục / độ ưu tiên
    $('#byCategory').innerHTML = s.by_category.length
      ? s.by_category.map((c) => meterHTML(c.name, c.color, c.done, c.total)).join('')
      : '<p class="no-data">Chưa có dữ liệu</p>';
    const prioColor = { high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)' };
    $('#byPriority').innerHTML = s.by_priority
      .map((p) => meterHTML('Ưu tiên ' + PRIORITY[p.priority].label.toLowerCase(), prioColor[p.priority], p.done, p.total))
      .join('');
  }

  /* =====================================================================
     HÀNH ĐỘNG: ĐỔI TRẠNG THÁI / XÓA
     ===================================================================== */
  async function setStatus(task, status) {
    if (!task || task.status === status) return;
    try {
      await api(`/api/tasks/${task.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast(`Đã chuyển sang “${STATUS[status].label}”`);
    } catch (err) {
      toast(err.message, 'err');
    }
    await refresh();
  }

  function confirmBox(message, okText = 'Xóa') {
    return new Promise((resolve) => {
      const d = $('#confirmDialog');
      $('#confirmText').textContent = message;
      $('#confirmOk').textContent = okText;
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.showModal();
    });
  }

  async function removeTask(task) {
    if (!task) return;
    if (!(await confirmBox(`Xóa công việc “${task.title}”? Hành động này không thể hoàn tác.`))) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      toast('Đã xóa công việc');
    } catch (err) {
      toast(err.message, 'err');
    }
    await refresh();
  }

  /* =====================================================================
     FORM THÊM / SỬA
     ===================================================================== */
  const dlg = $('#taskDialog');

  function openDialog(task = null, presetStatus = 'todo') {
    state.editingId = task ? task.id : null;
    $('#dialogTitle').textContent = task ? 'Sửa công việc' : 'Thêm công việc';
    $('#f_title').value = task ? task.title : '';
    $('#f_desc').value = task ? task.description : '';
    $('#f_category').value = task && task.category_id ? String(task.category_id) : '';
    $('#f_priority').value = task ? task.priority : 'medium';
    $('#f_status').value = task ? task.status : presetStatus;
    $('#f_due').value = task && task.due_date ? task.due_date : '';
    $('#formError').textContent = '';
    dlg.showModal();
    $('#f_title').focus();
  }

  async function submitForm(e) {
    e.preventDefault();
    const body = {
      title: $('#f_title').value.trim(),
      description: $('#f_desc').value.trim(),
      category_id: $('#f_category').value || null,
      priority: $('#f_priority').value,
      status: $('#f_status').value,
      due_date: $('#f_due').value || null,
    };
    if (!body.title) {
      $('#formError').textContent = 'Vui lòng nhập tiêu đề công việc';
      $('#f_title').focus();
      return;
    }
    const editing = state.editingId;
    $('#saveBtn').disabled = true;
    try {
      await api(editing ? `/api/tasks/${editing}` : '/api/tasks', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      dlg.close();
      toast(editing ? 'Đã cập nhật công việc' : 'Đã thêm công việc mới');
      await refresh();
    } catch (err) {
      $('#formError').textContent = err.message;
    } finally {
      $('#saveBtn').disabled = false;
    }
  }

  /* =====================================================================
     ĐIỀU HƯỚNG / GIAO DIỆN SÁNG TỐI
     ===================================================================== */
  function showPage(page) {
    state.page = page;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.page === page));
    $('#page-tasks').hidden = page !== 'tasks';
    $('#page-stats').hidden = page !== 'stats';
    $('#addBtn').hidden = page !== 'tasks';
    history.replaceState(null, '', page === 'stats' ? '#stats' : location.pathname + location.search);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    store.set('theme', theme);
    $('#themeBtn').innerHTML = theme === 'dark' ? icon.sun : icon.moon;
  }

  /* =====================================================================
     GẮN SỰ KIỆN
     ===================================================================== */
  function bindEvents() {
    // Chuyển trang
    $$('.tab').forEach((t) => t.addEventListener('click', () => showPage(t.dataset.page)));
    $('.brand').addEventListener('click', (e) => { e.preventDefault(); showPage('tasks'); });

    // Giao diện sáng / tối
    $('#themeBtn').addEventListener('click', () =>
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

    // Thêm công việc
    $('#addBtn').addEventListener('click', () => openDialog());

    // Bộ lọc
    let timer;
    $('#q').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.filters.q = e.target.value.trim(); refresh(); }, 250);
    });
    $('#fCategory').addEventListener('change', (e) => { state.filters.category_id = e.target.value; refresh(); });
    $('#fPriority').addEventListener('change', (e) => { state.filters.priority = e.target.value; refresh(); });
    $('#fSort').addEventListener('change', (e) => { state.filters.sort = e.target.value; refresh(); });
    $('#statusSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      state.filters.status = b.dataset.status;
      refresh();
    });
    $('#viewSwitch').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      state.view = b.dataset.view;
      store.set('view', state.view);
      refresh();
    });
    $('#clearDone').addEventListener('click', async () => {
      const n = state.stats ? state.stats.done : 0;
      if (!(await confirmBox(`Xóa toàn bộ ${n} công việc đã hoàn thành?`))) return;
      try {
        const r = await api('/api/tasks/completed', { method: 'DELETE' });
        toast(`Đã xóa ${r.deleted} công việc`);
      } catch (err) { toast(err.message, 'err'); }
      refresh();
    });

    // Các nút trong danh sách / bảng (ủy quyền sự kiện)
    const view = $('#taskView');
    view.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const row = btn.closest('[data-id]');
      const task = row ? state.tasks.find((t) => t.id === Number(row.dataset.id)) : null;
      switch (btn.dataset.action) {
        case 'toggle': setStatus(task, task && task.status === 'done' ? 'todo' : 'done'); break;
        case 'edit': if (task) openDialog(task); break;
        case 'delete': removeTask(task); break;
        case 'move': {
          const next = task && STATUS_ORDER[STATUS_ORDER.indexOf(task.status) + Number(btn.dataset.dir)];
          if (next) setStatus(task, next);
          break;
        }
        case 'add-in': openDialog(null, btn.dataset.status); break;
        case 'add-first': openDialog(); break;
      }
    });
    view.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-action="status"]');
      if (!sel) return;
      const task = state.tasks.find((t) => t.id === Number(sel.closest('[data-id]').dataset.id));
      setStatus(task, sel.value);
    });

    // Kéo thả giữa các cột Kanban để cập nhật trạng thái
    view.addEventListener('dragstart', (e) => {
      const card = e.target.closest && e.target.closest('.card-task');
      if (!card) return;
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    view.addEventListener('dragend', () => {
      $$('.dragging, .drag-over', view).forEach((el) => el.classList.remove('dragging', 'drag-over'));
    });
    view.addEventListener('dragover', (e) => {
      const col = e.target.closest('.column');
      if (!col) return;
      e.preventDefault();
      col.classList.add('drag-over');
    });
    view.addEventListener('dragleave', (e) => {
      const col = e.target.closest('.column');
      if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });
    view.addEventListener('drop', (e) => {
      const col = e.target.closest('.column');
      if (!col) return;
      e.preventDefault();
      col.classList.remove('drag-over');
      const task = state.tasks.find((t) => t.id === Number(e.dataTransfer.getData('text/plain')));
      setStatus(task, col.dataset.status);
    });

    // Form thêm / sửa
    $('#taskForm').addEventListener('submit', submitForm);
    $('#cancelBtn').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });  // bấm ra ngoài để đóng
  }

  /* =====================================================================
     KHỞI TẠO
     ===================================================================== */
  async function init() {
    $$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon[el.dataset.icon] || ''));
    applyTheme(document.documentElement.dataset.theme || 'light');
    bindEvents();
    showPage(location.hash === '#stats' ? 'stats' : 'tasks');
    try {
      await loadCategories();
    } catch (err) {
      toast('Không kết nối được máy chủ', 'err');
    }
    await refresh();
  }

  init();
})();
