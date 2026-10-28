/* ============================================================
   Хэмнэл — хувийн цаг төлөвлөгч (хувилбар 1)
   HTML + CSS + JavaScript + Supabase
   ============================================================ */
(function () {
  'use strict';

  // ---------- Тогтмолууд ----------
  const DAY_START = 6;            // цагийн хуваарь 06:00-оос
  const DAY_END = 24;             // 24:00 хүртэл
  const HOUR_PX = 52;             // нэг цагийн өндөр
  const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
  const QUADS = {
    q1: { code: 'Q1', name: 'Одоо хий' },
    q2: { code: 'Q2', name: 'Төлөвлө' },
    q3: { code: 'Q3', name: 'Хурдан дуусга' },
    q4: { code: 'Q4', name: 'Хойшлуул' }
  };
  const THEME_LABEL = { auto: 'Горим: автомат', light: 'Горим: цайвар', dark: 'Горим: бараан' };

  // ---------- Төлөв ----------
  const state = {
    user: null,
    settings: { theme: 'auto', urgent_hours: 48 },
    tasks: [],
    editing: null,          // засаж буй ажил (null = шинэ)
    overlapAck: false,      // давхцлын анхааруулгыг харсан эсэх
    showUpcoming: false,
    scrolledTimeline: false
  };

  // ---------- Туслах функцууд ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const toDate = (v) => (v ? new Date(v) : null);
  const localDateTime = (date, time) => new Date(date + 'T' + (time || '00:00'));

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function dueLabel(due) {
    const today = startOfDay(new Date());
    const day = startOfDay(due);
    const diff = Math.round((day - today) / 86400000);
    const time = hm(due);
    if (diff === 0) return 'Өнөөдөр ' + time;
    if (diff === 1) return 'Маргааш ' + time;
    if (diff === -1) return 'Өчигдөр ' + time;
    return (due.getMonth() + 1) + '/' + due.getDate() + ' ' + time;
  }

  function translateAuthError(msg) {
    const m = String(msg || '');
    if (/Invalid login credentials/i.test(m)) return 'Имэйл эсвэл нууц үг буруу байна.';
    if (/Email not confirmed/i.test(m)) return 'Имэйлээ баталгаажуулна уу. Ирсэн захидлын холбоос дээр дарна.';
    if (/already registered/i.test(m)) return 'Энэ имэйлээр бүртгэл үүссэн байна. Нэвтэрнэ үү.';
    if (/at least 6/i.test(m)) return 'Нууц үг хамгийн багадаа 6 тэмдэгт байна.';
    if (/rate limit/i.test(m)) return 'Хэт олон оролдлого хийлээ. Хэдэн минутын дараа дахин оролдоно уу.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Сүлжээний алдаа. Интернэтээ шалгана уу.';
    return m || 'Алдаа гарлаа.';
  }

  // ============================================================
  // ЭРЭМБЭЛЭЛТ (SRS, хэсэг 6)
  // ============================================================
  function isOverdue(t, now) {
    return t.status === 'todo' && t.due_at && new Date(t.due_at) < now;
  }
  function isUrgent(t, now) {
    if (t.urgent) return true;
    if (!t.due_at) return false;
    const hoursLeft = (new Date(t.due_at) - now) / 3600000;
    return hoursLeft <= state.settings.urgent_hours;    // хэтэрсэн ажил ч яаралтай
  }
  function quadrantOf(t, now) {
    const u = isUrgent(t, now);
    if (t.important) return u ? 'q1' : 'q2';
    return u ? 'q3' : 'q4';
  }
  function compareTasks(a, b, now) {
    const qa = quadrantOf(a, now), qb = quadrantOf(b, now);
    if (qa !== qb) return qa < qb ? -1 : 1;
    const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    if (da !== db) return da - db;
    const sa = a.start_at ? new Date(a.start_at).getTime() : Infinity;
    const sb = b.start_at ? new Date(b.start_at).getTime() : Infinity;
    return sa - sb;
  }

  // ============================================================
  // ЭХЛҮҮЛЭХ
  // ============================================================
  let sb = null;

  function showScreen(name) {
    $('#config-screen').hidden = name !== 'config';
    $('#auth-screen').hidden = name !== 'auth';
    $('#app').hidden = name !== 'app';
  }

  function init() {
    const cfg = window.HEMNEL_CONFIG || {};
    let url = String(cfg.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    const key = String(cfg.SUPABASE_KEY || '').trim();
    if (!url || !key || url.includes('YOUR-PROJECT') || key.endsWith('...') || !window.supabase) {
      showScreen('config');
      return;
    }
    sb = window.supabase.createClient(url, key);
    bindUi();
    applyTheme(localTheme());

    sb.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        if (!state.user || state.user.id !== session.user.id) enterApp(session.user);
      } else {
        state.user = null;
        state.tasks = [];
        showScreen('auth');
      }
    });
  }

  async function enterApp(user) {
    state.user = user;
    const name = (user.user_metadata && user.user_metadata.name) || user.email.split('@')[0];
    $('#user-name').textContent = name;
    $('#user-email').textContent = user.email;
    $('#avatar').textContent = name.charAt(0).toUpperCase();
    showScreen('app');
    await loadSettings();
    await loadTasks();
  }

  // ============================================================
  // НЭВТРЭХ / БҮРТГҮҮЛЭХ
  // ============================================================
  let authMode = 'login';

  function setAuthMode(mode) {
    authMode = mode;
    $('#tab-login').setAttribute('aria-selected', String(mode === 'login'));
    $('#tab-register').setAttribute('aria-selected', String(mode === 'register'));
    $('#name-field').hidden = mode !== 'register';
    $('#auth-submit').textContent = mode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх';
    $('#auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    setMsg('#auth-msg', '');
  }

  function setMsg(sel, text, kind) {
    const el = $(sel);
    el.textContent = text;
    el.className = 'form-msg' + (kind ? ' ' + kind : '');
  }

  async function onAuthSubmit(e) {
    e.preventDefault();
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const name = $('#auth-name').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg('#auth-msg', 'Имэйл хаяг буруу байна.');
    if (password.length < 6) return setMsg('#auth-msg', 'Нууц үг хамгийн багадаа 6 тэмдэгт байна.');
    if (authMode === 'register' && !name) return setMsg('#auth-msg', 'Нэрээ оруулна уу.');

    const btn = $('#auth-submit');
    btn.disabled = true;
    setMsg('#auth-msg', '');
    try {
      if (authMode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: { data: { name }, emailRedirectTo: location.origin + location.pathname }
        });
        if (error) throw error;
        if (!data.session) {
          setMsg('#auth-msg', 'Бүртгэл үүслээ. Имэйл рүү тань ирсэн холбоос дээр дарж баталгаажуулаад нэвтэрнэ үү.', 'ok');
          setAuthMode('login');
          setMsg('#auth-msg', 'Бүртгэл үүслээ. Имэйл рүү тань ирсэн холбоос дээр дарж баталгаажуулаад нэвтэрнэ үү.', 'ok');
        }
      }
    } catch (err) {
      setMsg('#auth-msg', translateAuthError(err.message));
    } finally {
      btn.disabled = false;
    }
  }

  async function logout() {
    await sb.auth.signOut();
    toast('Гарлаа');
  }

  // ============================================================
  // ӨГӨГДӨЛ
  // ============================================================
  async function loadSettings() {
    const { data, error } = await sb.from('user_settings').select('theme, urgent_hours').eq('user_id', state.user.id).maybeSingle();
    if (error) { console.error(error); return; }
    if (data) {
      state.settings = data;
    } else {
      await sb.from('user_settings').insert({ user_id: state.user.id });
    }
    applyTheme(state.settings.theme);
  }

  async function loadTasks() {
    const since = startOfDay(new Date()).toISOString();
    const { data, error } = await sb
      .from('tasks')
      .select('*')
      .or('status.eq.todo,completed_at.gte.' + since)
      .order('due_at', { ascending: true, nullsFirst: false });
    if (error) {
      console.error(error);
      toast('Ажлуудыг ачаалж чадсангүй: ' + error.message);
      return;
    }
    state.tasks = data || [];
    render();
  }

  async function toggleDone(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const done = t.status !== 'done';
    const patch = { status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null };
    Object.assign(t, patch);          // шууд харагдуулна
    render();
    const { error } = await sb.from('tasks').update(patch).eq('id', id);
    if (error) {
      toast('Хадгалж чадсангүй: ' + error.message);
      await loadTasks();
    } else {
      toast(done ? 'Дууссан гэж тэмдэглэлээ' : 'Буцаалаа');
    }
  }

  // ============================================================
  // ДҮРСЛЭЛ
  // ============================================================
  function render() {
    const now = new Date();
    renderHeader(now);
    renderTasks(now);
    renderTimeline(now);
  }

  function renderHeader(now) {
    $('#today-label').textContent = WEEKDAYS[now.getDay()] + ', ' + (now.getMonth() + 1) + '-р сарын ' + now.getDate();
    const h = now.getHours();
    const greet = h < 12 ? 'Өглөөний мэнд' : h < 18 ? 'Өдрийн мэнд' : 'Оройн мэнд';
    $('#greeting').textContent = greet + ', ' + $('#user-name').textContent;
  }

  function bucketTasks(now) {
    const tomorrow = addDays(startOfDay(now), 1);
    const overdue = [], today = [], upcoming = [], done = [];
    for (const t of state.tasks) {
      if (t.status === 'done') {
        if (t.completed_at && sameDay(new Date(t.completed_at), now)) done.push(t);
        continue;
      }
      if (isOverdue(t, now)) { overdue.push(t); continue; }
      const due = toDate(t.due_at), start = toDate(t.start_at);
      const forToday = !due || due < tomorrow || (start && sameDay(start, now)) || isUrgent(t, now);
      (forToday ? today : upcoming).push(t);
    }
    const cmp = (a, b) => compareTasks(a, b, now);
    overdue.sort(cmp); today.sort(cmp); upcoming.sort(cmp);
    done.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    return { overdue, today, upcoming, done };
  }

  function taskMeta(t) {
    const parts = [];
    if (t.due_at) parts.push(dueLabel(new Date(t.due_at)));
    parts.push(t.category);
    if (t.start_at && t.end_at) parts.push(hm(new Date(t.start_at)) + '–' + hm(new Date(t.end_at)));
    return parts.join(' · ');
  }

  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';

  function taskHtml(t, now, extraClass) {
    const q = quadrantOf(t, now);
    const done = t.status === 'done';
    return (
      '<div class="task ' + (extraClass || '') + (done ? ' done' : '') + '">' +
        '<button type="button" class="check" data-check="' + t.id + '" aria-label="' + (done ? 'Дуусаагүй болгох: ' : 'Дууссан гэж тэмдэглэх: ') + esc(t.title) + '">' + CHECK_SVG + '</button>' +
        '<button type="button" class="task-open" data-open="' + t.id + '">' +
          '<span class="task-title">' + esc(t.title) + '</span>' +
          '<span class="task-meta">' + esc(taskMeta(t)) + '</span>' +
        '</button>' +
        (done ? '' : '<span class="pill ' + q + '" title="' + QUADS[q].name + '">' + QUADS[q].code + '</span>') +
      '</div>'
    );
  }

  function renderTasks(now) {
    const b = bucketTasks(now);
    const total = b.overdue.length + b.today.length + b.done.length;
    const pct = total ? Math.round((b.done.length / total) * 100) : 0;
    $('#progress-label').textContent = total + ' ажлаас ' + b.done.length + ' нь дууссан';
    $('#progress-bar').style.width = pct + '%';
    $('#m-progress').textContent = b.done.length + ' / ' + total;
    $('#m-progress-bar').style.width = pct + '%';

    let html = '';
    if (b.overdue.length) {
      html += '<div class="group"><h2 class="group-title danger">Хоцорсон · ' + b.overdue.length + '</h2>' +
        b.overdue.map((t) => taskHtml(t, now, 'overdue')).join('') + '</div>';
    }
    html += '<div class="group"><h2 class="group-title">Өнөөдөр · эрэмбээр</h2>';
    html += b.today.length
      ? b.today.map((t) => taskHtml(t, now)).join('')
      : '<div class="empty">Өнөөдөр хийх ажил алга. «Шинэ ажил» дээр дарж нэмээрэй.</div>';
    html += '</div>';

    if (b.upcoming.length) {
      html += '<div class="group"><h2 class="group-title">Удахгүй · ' + b.upcoming.length + '</h2>';
      if (state.showUpcoming) html += b.upcoming.map((t) => taskHtml(t, now)).join('');
      html += '<button type="button" class="more-btn" data-action="toggle-upcoming">' + (state.showUpcoming ? 'Нуух' : 'Харах') + '</button></div>';
    }
    if (b.done.length) {
      html += '<div class="group"><h2 class="group-title">Дууссан · ' + b.done.length + '</h2>' +
        b.done.map((t) => taskHtml(t, now)).join('') + '</div>';
    }
    $('#task-col').innerHTML = html;
  }

  // Давхцсан блокуудыг хажуу тийш нь багана болгон байрлуулна
  function layoutBlocks(items) {
    items.sort((a, b) => a.s - b.s || b.e - a.e);
    const clusters = [];
    let cur = null, curEnd = -1;
    for (const it of items) {
      if (!cur || it.s >= curEnd) { cur = []; clusters.push(cur); curEnd = it.e; }
      cur.push(it);
      curEnd = Math.max(curEnd, it.e);
    }
    for (const cl of clusters) {
      const colEnds = [];
      for (const it of cl) {
        let c = colEnds.findIndex((end) => end <= it.s);
        if (c === -1) { c = colEnds.length; colEnds.push(it.e); } else colEnds[c] = it.e;
        it.col = c;
      }
      cl.forEach((it) => { it.cols = colEnds.length; });
    }
    return items;
  }

  function renderTimeline(now) {
    const tl = $('#timeline');
    const hours = DAY_END - DAY_START;
    tl.style.height = hours * HOUR_PX + 'px';
    let html = '';
    for (let i = 0; i < hours; i++) {
      html += '<div class="hour" style="top:' + i * HOUR_PX + 'px"><span>' + pad(DAY_START + i) + ':00</span></div>';
    }
    const dayStart = startOfDay(now);
    const minOf = (d) => (d - dayStart) / 60000 - DAY_START * 60;   // хуваарийн эхнээс хэдэн минут
    const items = state.tasks
      .filter((t) => t.start_at && t.end_at && sameDay(new Date(t.start_at), now))
      .map((t) => ({ t, s: Math.max(0, minOf(new Date(t.start_at))), e: Math.min(hours * 60, minOf(new Date(t.end_at))) }))
      .filter((it) => it.e > it.s);
    layoutBlocks(items);

    for (const it of items) {
      const t = it.t;
      const top = (it.s / 60) * HOUR_PX + 2;
      const h = Math.max(22, ((it.e - it.s) / 60) * HOUR_PX - 4);
      const leftPct = it.col / it.cols, wPct = 1 / it.cols;
      const q = quadrantOf(t, now);
      const time = hm(new Date(t.start_at)) + ' – ' + hm(new Date(t.end_at));
      const cls = 'block ' + q + (t.status === 'done' ? ' done' : '') + (h < 44 ? ' short' : '');
      html += '<button type="button" class="' + cls + '" data-open="' + t.id + '" ' +
        'style="top:' + top + 'px;height:' + h + 'px;left:calc(56px + (100% - 56px) * ' + leftPct + ');width:calc((100% - 56px) * ' + wPct + ' - 4px)">' +
        '<span class="b-title">' + esc(t.title) + '</span><span class="b-time">' + time + '</span></button>';
    }
    if (!items.length) html += '<div class="tl-empty">Өнөөдөр цаг оноосон ажил алга.<br>Ажил нэмэхдээ «Цаг оноох»-ыг сонгоно.</div>';

    const nowMin = minOf(now);
    if (nowMin >= 0 && nowMin <= hours * 60) {
      html += '<div class="now-line" style="top:' + ((nowMin / 60) * HOUR_PX - 8) + 'px"><span>' + hm(now) + '</span><i></i></div>';
    }
    tl.innerHTML = html;

    if (!state.scrolledTimeline) {
      state.scrolledTimeline = true;
      const target = Math.max(0, ((nowMin / 60) - 1) * HOUR_PX);
      requestAnimationFrame(() => { $('#timeline-scroll').scrollTop = target; });
    }
  }

  // ============================================================
  // АЖИЛ НЭМЭХ / ЗАСАХ ФОРМ
  // ============================================================
  const form = () => $('#task-form');

  function openDialog(task) {
    state.editing = task || null;
    state.overlapAck = false;
    const f = form();
    f.reset();
    setMsg('#task-msg', '');
    $('#task-dialog-title').textContent = task ? 'Ажил засах' : 'Шинэ ажил';
    $('#delete-btn').hidden = !task;
    const today = ymd(new Date());

    if (task) {
      f.title.value = task.title;
      f.description.value = task.description || '';
      f.querySelector('input[name="category"][value="' + task.category + '"]').checked = true;
      if (task.due_at) {
        const d = new Date(task.due_at);
        f.dueDate.value = ymd(d);
        f.dueTime.value = hm(d);
      }
      f.important.checked = task.important;
      f.urgent.checked = task.urgent;
      const has = !!(task.start_at && task.end_at);
      f.schedule.checked = has;
      if (has) {
        const s = new Date(task.start_at), e = new Date(task.end_at);
        f.blockDate.value = ymd(s); f.start.value = hm(s); f.end.value = hm(e);
      } else {
        f.blockDate.value = today;
      }
    } else {
      f.blockDate.value = today;
      const n = new Date();
      const startH = Math.min(22, n.getHours() + 1);
      f.start.value = pad(startH) + ':00';
      f.end.value = pad(startH + 1) + ':00';
    }
    $('#schedule-fields').hidden = !f.schedule.checked;
    updateQuadPreview();
    $('#task-dialog').showModal();
    if (!matchMedia('(max-width: 900px)').matches) f.title.focus();
  }

  function closeDialog() {
    $('#task-dialog').close();
  }

  function readForm() {
    const f = form();
    const due = f.dueDate.value ? localDateTime(f.dueDate.value, f.dueTime.value || '23:59') : null;
    let start = null, end = null;
    if (f.schedule.checked) {
      start = f.blockDate.value && f.start.value ? localDateTime(f.blockDate.value, f.start.value) : null;
      end = f.blockDate.value && f.end.value ? localDateTime(f.blockDate.value, f.end.value) : null;
    }
    return {
      title: f.title.value.trim(),
      description: f.description.value.trim() || null,
      category: (f.querySelector('input[name="category"]:checked') || {}).value || 'Хувийн',
      due_at: due ? due.toISOString() : null,
      important: f.important.checked,
      urgent: f.urgent.checked,
      start_at: start ? start.toISOString() : null,
      end_at: end ? end.toISOString() : null,
      _schedule: f.schedule.checked
    };
  }

  function updateQuadPreview() {
    const v = readForm();
    const q = quadrantOf(v, new Date());
    const box = $('#quad-preview');
    box.className = 'quad-preview ' + q;
    $('#qp-code').textContent = QUADS[q].code;
    $('#qp-name').textContent = QUADS[q].name;
    const auto = !v.urgent && isUrgent(v, new Date());
    $('#qp-hint').textContent = auto
      ? 'Хугацаа ' + state.settings.urgent_hours + ' цагаас бага үлдсэн тул автоматаар яаралтай'
      : 'Хугацаа ' + state.settings.urgent_hours + ' цагаас бага үлдвэл автоматаар яаралтай болно';
  }

  function findOverlap(v) {
    if (!v.start_at) return null;
    const s = new Date(v.start_at), e = new Date(v.end_at);
    return state.tasks.find((t) =>
      t.id !== (state.editing && state.editing.id) && t.status === 'todo' && t.start_at && t.end_at &&
      new Date(t.start_at) < e && new Date(t.end_at) > s);
  }

  async function onTaskSubmit(e) {
    e.preventDefault();
    const v = readForm();
    if (!v.title) return setMsg('#task-msg', 'Ажлын нэрийг бичнэ үү.');
    if (v.title.length > 120) return setMsg('#task-msg', 'Нэр 120 тэмдэгтээс урт байж болохгүй.');
    if (v._schedule) {
      if (!v.start_at || !v.end_at) return setMsg('#task-msg', 'Цаг оноохдоо өдөр, эхлэх, дуусах цагийг бүгдийг бөглөнө үү.');
      if (new Date(v.end_at) <= new Date(v.start_at)) return setMsg('#task-msg', 'Дуусах цаг эхлэх цагаас хойш байх ёстой.');
      const other = findOverlap(v);
      if (other && !state.overlapAck) {
        state.overlapAck = true;
        return setMsg('#task-msg', '«' + other.title + '» ажилтай цаг давхцаж байна. Тийм хэвээр хадгалах бол дахин «Хадгалах» дарна уу.', 'warn');
      }
    }
    delete v._schedule;

    const btn = $('#save-btn');
    btn.disabled = true;
    try {
      if (state.editing) {
        const { error } = await sb.from('tasks').update(v).eq('id', state.editing.id);
        if (error) throw error;
        toast('Хадгаллаа');
      } else {
        const { error } = await sb.from('tasks').insert(v);
        if (error) throw error;
        toast('Ажил нэмэгдлээ');
      }
      closeDialog();
      await loadTasks();
    } catch (err) {
      setMsg('#task-msg', 'Хадгалж чадсангүй: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function onDelete() {
    const t = state.editing;
    if (!t) return;
    if (!confirm('«' + t.title + '» ажлыг устгах уу? Буцаах боломжгүй.')) return;
    const { error } = await sb.from('tasks').delete().eq('id', t.id);
    if (error) return setMsg('#task-msg', 'Устгаж чадсангүй: ' + error.message);
    closeDialog();
    toast('Устгалаа');
    await loadTasks();
  }

  // ============================================================
  // ГОРИМ (Light / Dark)
  // ============================================================
  function localTheme() {
    try { return localStorage.getItem('hemnel-theme') || 'auto'; } catch (e) { return 'auto'; }
  }
  function applyTheme(theme) {
    const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $$('.theme-label').forEach((el) => { el.textContent = THEME_LABEL[theme]; });
    document.querySelector('meta[name="theme-color"]').content = dark ? '#191B23' : '#F7F4EF';
    try { localStorage.setItem('hemnel-theme', theme); } catch (e) {}
  }
  async function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(state.settings.theme) + 1) % order.length];
    state.settings.theme = next;
    applyTheme(next);
    toast(THEME_LABEL[next]);
    if (state.user) await sb.from('user_settings').update({ theme: next }).eq('user_id', state.user.id);
  }

  // ============================================================
  // ҮЙЛДЛҮҮД
  // ============================================================
  function setView(view) {
    document.body.classList.toggle('show-timeline', view === 'time');
    $('#view-list').setAttribute('aria-selected', String(view !== 'time'));
    $('#view-time').setAttribute('aria-selected', String(view === 'time'));
    if (view === 'time') { state.scrolledTimeline = false; render(); }
  }

  function bindUi() {
    $('#tab-login').addEventListener('click', () => setAuthMode('login'));
    $('#tab-register').addEventListener('click', () => setAuthMode('register'));
    $('#auth-form').addEventListener('submit', onAuthSubmit);
    $('#task-form').addEventListener('submit', onTaskSubmit);
    $('#task-form').addEventListener('input', () => { state.overlapAck = false; updateQuadPreview(); });
    $('#f-schedule').addEventListener('change', (e) => { $('#schedule-fields').hidden = !e.target.checked; });
    $('#delete-btn').addEventListener('click', onDelete);
    $('#view-list').addEventListener('click', () => setView('list'));
    $('#view-time').addEventListener('click', () => setView('time'));

    // Утсан дээр dialog-ын гадна (scrim) дарахад хаагдана
    $('#task-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action], [data-check], [data-open]');
      if (!el) return;
      if (el.dataset.check) return toggleDone(el.dataset.check);
      if (el.dataset.open) return openDialog(state.tasks.find((t) => t.id === el.dataset.open));
      switch (el.dataset.action) {
        case 'new': e.preventDefault(); return openDialog(null);
        case 'close-dialog': return closeDialog();
        case 'logout': return logout();
        case 'theme': return cycleTheme();
        case 'toggle-upcoming': state.showUpcoming = !state.showUpcoming; return render();
      }
    });

    // Утас ↔ компьютер синхрон: апп руу буцаж ороход дахин ачаална (NFR-04)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.user) loadTasks();
    });
    // Минут тутам цаг, квадрантыг шинэчилнэ
    setInterval(() => { if (state.user && !$('#task-dialog').open) render(); }, 60000);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.settings.theme === 'auto') applyTheme('auto');
    });
  }

  init();
})();
