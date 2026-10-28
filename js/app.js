/* ============================================================
   Хэмнэл — хувийн цаг төлөвлөгч (хувилбар 1–3)
   HTML + CSS + JavaScript + Supabase
   ============================================================ */
(function () {
  'use strict';

  // ---------- Тогтмолууд ----------
  const DAY_START = 6;            // цагийн хуваарь 06:00-оос
  const DAY_END = 24;             // 24:00 хүртэл
  const HOUR_PX = 52;             // нэг цагийн өндөр
  const LOOKBACK_DAYS = 84;       // дууссан ажлыг хэдэн өдрийн өмнөөс ачаалах (статистикт)
  const POMO_WORK = 25, POMO_BREAK = 5;
  const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
  const WD_SHORT = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];
  const CATEGORIES = ['Хичээл', 'Ажил', 'Хувийн', 'Эрүүл мэнд', 'Бусад'];
  const QUADS = {
    q1: { code: 'Q1', name: 'Одоо хий', desc: 'Чухал бөгөөд яаралтай' },
    q2: { code: 'Q2', name: 'Төлөвлө', desc: 'Чухал, яаралтай биш' },
    q3: { code: 'Q3', name: 'Хурдан дуусга', desc: 'Яаралтай, чухал биш' },
    q4: { code: 'Q4', name: 'Хойшлуул', desc: 'Чухал ч биш, яаралтай ч биш' }
  };
  const THEME_LABEL = { auto: 'Горим: автомат', light: 'Горим: цайвар', dark: 'Горим: бараан' };

  // ---------- Төлөв ----------
  const state = {
    user: null,
    settings: { theme: 'auto', urgent_hours: 48 },
    tasks: [],
    view: 'today',
    weekOffset: 0,
    statsOffset: 0,
    filter: { q: '', cat: '', quad: '', status: '' },
    editing: null,
    prefillDate: null,
    overlapAck: false,
    showUpcoming: false,
    scrolledTimeline: false,
    pomoCache: {},
    pomo: null
  };

  // ---------- Туслах функцууд ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const md = (d) => (d.getMonth() + 1) + '/' + d.getDate();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const toDate = (v) => (v ? new Date(v) : null);
  const localDateTime = (date, time) => new Date(date + 'T' + (time || '00:00'));
  const fmtHours = (h) => (Math.round(h * 10) / 10).toString().replace('.', ',') + ' ц';

  function weekStart(offset) {
    const d = startOfDay(new Date());
    const diff = (d.getDay() + 6) % 7;           // Даваа гарагаас эхэлнэ
    return addDays(d, -diff + offset * 7);
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function dueLabel(due) {
    const diff = Math.round((startOfDay(due) - startOfDay(new Date())) / 86400000);
    const time = hm(due);
    if (diff === 0) return 'Өнөөдөр ' + time;
    if (diff === 1) return 'Маргааш ' + time;
    if (diff === -1) return 'Өчигдөр ' + time;
    return md(due) + ' ' + time;
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
  function isUrgent(t, at) {
    if (t.urgent) return true;
    if (!t.due_at) return false;
    return (new Date(t.due_at) - at) / 3600000 <= state.settings.urgent_hours;   // хэтэрсэн ажил ч яаралтай
  }
  function quadrantOf(t, at) {
    const u = isUrgent(t, at);
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

  // Шүүлт, хайлт (FR-12)
  function passesFilter(t, now) {
    const f = state.filter;
    if (f.q && !t.title.toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.cat && t.category !== f.cat) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.quad && quadrantOf(t, now) !== f.quad) return false;
    return true;
  }
  const visibleTasks = (now) => state.tasks.filter((t) => passesFilter(t, now));

  // ============================================================
  // ДАВТАГДАХ АЖИЛ (FR-11)
  // ============================================================
  function nextDate(base, t) {
    switch (t.repeat) {
      case 'daily': return addDays(base, 1);
      case 'weekdays': {
        let d = addDays(base, 1);
        while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
        return d;
      }
      case 'weekly': {
        const days = t.repeat_days && t.repeat_days.length ? t.repeat_days : [base.getDay()];
        for (let i = 1; i <= 7; i++) {
          const d = addDays(base, i);
          if (days.includes(d.getDay())) return d;
        }
        return addDays(base, 7);
      }
      case 'monthly': {
        const y = base.getFullYear(), m = base.getMonth() + 1;
        const last = new Date(y, m + 1, 0).getDate();
        return new Date(y, m, Math.min(base.getDate(), last), base.getHours(), base.getMinutes());
      }
      default: return null;
    }
  }

  async function createNextOccurrence(t) {
    const anchorIso = t.due_at || t.start_at;
    if (!t.repeat || t.repeat === 'none' || !anchorIso) return;
    const base = new Date(anchorIso);
    const today = startOfDay(new Date());
    let next = nextDate(base, t), guard = 0;
    while (next && next < today && guard++ < 400) next = nextDate(next, t);   // алгассан өдрүүдийг давна
    if (!next) return;
    const shift = next - base;
    const move = (iso) => (iso ? new Date(new Date(iso).getTime() + shift).toISOString() : null);
    const seriesId = t.series_id || t.id;
    const nextAnchor = move(anchorIso);
    const exists = state.tasks.some((x) => x.series_id === seriesId && x.id !== t.id &&
      (x.due_at || x.start_at) && new Date(x.due_at || x.start_at).getTime() === new Date(nextAnchor).getTime());
    if (exists) return;
    if (!t.series_id) await sb.from('tasks').update({ series_id: seriesId }).eq('id', t.id);
    const { error } = await sb.from('tasks').insert({
      title: t.title, description: t.description, category: t.category,
      important: t.important, urgent: t.urgent, repeat: t.repeat, repeat_days: t.repeat_days,
      series_id: seriesId, due_at: move(t.due_at), start_at: move(t.start_at), end_at: move(t.end_at)
    });
    if (error) toast('Дараагийн давталтыг үүсгэж чадсангүй: ' + error.message);
    else toast('Дараагийн давталт: ' + md(next));
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
    const url = String(cfg.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
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
        stopPomo();
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
    route();
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
    if ($('#settings-dialog').open) $('#settings-dialog').close();
    await sb.auth.signOut();
    toast('Гарлаа');
  }

  // ============================================================
  // ӨГӨГДӨЛ
  // ============================================================
  async function loadSettings() {
    const { data, error } = await sb.from('user_settings').select('theme, urgent_hours').eq('user_id', state.user.id).maybeSingle();
    if (error) { console.error(error); return; }
    if (data) state.settings = data;
    else await sb.from('user_settings').insert({ user_id: state.user.id });
    applyTheme(state.settings.theme);
  }

  async function loadTasks() {
    const since = addDays(startOfDay(new Date()), -LOOKBACK_DAYS).toISOString();
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
      return loadTasks();
    }
    if (done && t.repeat && t.repeat !== 'none') {
      await createNextOccurrence(t);
      return loadTasks();
    }
    toast(done ? 'Дууссан гэж тэмдэглэлээ' : 'Буцаалаа');
  }

  // Матрицад чирж зөөхөд (FR-10)
  async function moveToQuad(id, q) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const now = new Date();
    if (quadrantOf(t, now) === q) return;
    const patch = { important: q === 'q1' || q === 'q2', urgent: q === 'q1' || q === 'q3' };
    Object.assign(t, patch);
    render();
    const { error } = await sb.from('tasks').update(patch).eq('id', id);
    if (error) { toast('Хадгалж чадсангүй: ' + error.message); return loadTasks(); }
    if (quadrantOf(t, now) !== q) toast('Хугацаа ' + state.settings.urgent_hours + ' цагаас бага үлдсэн тул яаралтай хэвээр байна');
    else toast(QUADS[q].code + ' · ' + QUADS[q].name + ' руу зөөлөө');
  }

  // ============================================================
  // ХУУДАС СОЛИХ
  // ============================================================
  function route() {
    const v = (location.hash.replace(/^#\/?/, '') || 'today').split('/')[0];
    state.view = ['today', 'week', 'matrix', 'stats'].includes(v) ? v : 'today';
    $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + state.view; });
    $$('[data-nav]').forEach((a) => {
      const on = a.dataset.nav === state.view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('#progress-box').hidden = state.view !== 'today';
    $('#filter-bar').hidden = state.view === 'stats';
    $('#flt-status').hidden = state.view === 'matrix';
    window.scrollTo(0, 0);
    if (state.view === 'today') state.scrolledTimeline = false;
    render();
  }

  // ============================================================
  // ДҮРСЛЭЛ
  // ============================================================
  function render() {
    if (!state.user) return;
    const now = new Date();
    renderHeader(now);
    if (state.view === 'today') { renderTasks(now); renderTimeline(now); }
    else if (state.view === 'week') renderWeek(now);
    else if (state.view === 'matrix') renderMatrix(now);
    else renderStats(now);
    const f = state.filter;
    $('#flt-clear').hidden = !(f.q || f.cat || f.quad || f.status);
  }

  function renderHeader(now) {
    const kicker = $('#page-kicker'), title = $('#page-title');
    if (state.view === 'today') {
      kicker.textContent = WEEKDAYS[now.getDay()] + ', ' + (now.getMonth() + 1) + '-р сарын ' + now.getDate();
      const h = now.getHours();
      title.textContent = (h < 12 ? 'Өглөөний мэнд' : h < 18 ? 'Өдрийн мэнд' : 'Оройн мэнд') + ', ' + $('#user-name').textContent;
    } else if (state.view === 'week') {
      kicker.textContent = 'Долоо хоног';
      title.textContent = 'Долоо хоногийн төлөвлөгөө';
    } else if (state.view === 'matrix') {
      kicker.textContent = 'Дуусаагүй ' + state.tasks.filter((t) => t.status === 'todo').length + ' ажил';
      title.textContent = 'Яаралтай × Чухал';
    } else {
      kicker.textContent = 'Статистик';
      title.textContent = 'Цагаа хаашаа зарцуулав';
    }
  }

  // ---------- Өнөөдөр ----------
  function bucketTasks(now) {
    const tomorrow = addDays(startOfDay(now), 1);
    const overdue = [], today = [], upcoming = [], done = [];
    for (const t of visibleTasks(now)) {
      if (t.status === 'done') {
        if (t.completed_at && sameDay(new Date(t.completed_at), now)) done.push(t);
        continue;
      }
      if (isOverdue(t, now)) { overdue.push(t); continue; }
      const due = toDate(t.due_at), start = toDate(t.start_at);
      if (start && start >= tomorrow && (!due || due >= tomorrow) && !isUrgent(t, now)) { upcoming.push(t); continue; }
      const forToday = !due || due < tomorrow || (start && sameDay(start, now)) || isUrgent(t, now);
      (forToday ? today : upcoming).push(t);
    }
    const cmp = (a, b) => compareTasks(a, b, now);
    overdue.sort(cmp); today.sort(cmp); upcoming.sort(cmp);
    done.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    return { overdue, today, upcoming, done };
  }

  const REPEAT_LABEL = { daily: 'Өдөр бүр', weekdays: 'Ажлын өдөр', weekly: 'Долоо хоног бүр', monthly: 'Сар бүр' };

  function taskMeta(t) {
    const parts = [];
    if (t.due_at) parts.push(dueLabel(new Date(t.due_at)));
    parts.push(t.category);
    if (t.start_at && t.end_at) parts.push(hm(new Date(t.start_at)) + '–' + hm(new Date(t.end_at)));
    if (t.repeat && t.repeat !== 'none') parts.push(REPEAT_LABEL[t.repeat]);
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

    const filtered = !!(state.filter.q || state.filter.cat || state.filter.quad || state.filter.status);
    let html = '';
    if (b.overdue.length) {
      html += '<div class="group"><h2 class="group-title danger">Хоцорсон · ' + b.overdue.length + '</h2>' +
        b.overdue.map((t) => taskHtml(t, now, 'overdue')).join('') + '</div>';
    }
    if (state.filter.status !== 'done') {
      html += '<div class="group"><h2 class="group-title">Өнөөдөр · эрэмбээр</h2>';
      html += b.today.length
        ? b.today.map((t) => taskHtml(t, now)).join('')
        : '<div class="empty">' + (filtered ? 'Шүүлтэд тохирох ажил алга.' : 'Өнөөдөр хийх ажил алга. «Шинэ ажил» дээр дарж нэмээрэй.') + '</div>';
      html += '</div>';
    }
    if (b.upcoming.length) {
      const open = state.showUpcoming || filtered;
      html += '<div class="group"><h2 class="group-title">Удахгүй · ' + b.upcoming.length + '</h2>';
      if (open) html += b.upcoming.map((t) => taskHtml(t, now)).join('');
      if (!filtered) html += '<button type="button" class="more-btn" data-action="toggle-upcoming">' + (open ? 'Нуух' : 'Харах') + '</button>';
      html += '</div>';
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
    const minOf = (d) => (d - dayStart) / 60000 - DAY_START * 60;
    const items = visibleTasks(now)
      .filter((t) => t.start_at && t.end_at && sameDay(new Date(t.start_at), now))
      .map((t) => ({ t, s: Math.max(0, minOf(new Date(t.start_at))), e: Math.min(hours * 60, minOf(new Date(t.end_at))) }))
      .filter((it) => it.e > it.s);
    layoutBlocks(items);

    for (const it of items) {
      const t = it.t;
      const top = (it.s / 60) * HOUR_PX + 2;
      const h = Math.max(22, ((it.e - it.s) / 60) * HOUR_PX - 4);
      const q = quadrantOf(t, now);
      const time = hm(new Date(t.start_at)) + ' – ' + hm(new Date(t.end_at));
      const cls = 'block ' + q + (t.status === 'done' ? ' done' : '') + (h < 44 ? ' short' : '');
      html += '<button type="button" class="' + cls + '" data-open="' + t.id + '" ' +
        'style="top:' + top + 'px;height:' + h + 'px;left:calc(56px + (100% - 56px) * ' + (it.col / it.cols) + ');width:calc((100% - 56px) * ' + (1 / it.cols) + ' - 4px)">' +
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

  // ---------- Долоо хоног (FR-09) ----------
  function weekLabel(ws) {
    const we = addDays(ws, 6);
    return (ws.getMonth() + 1) + '-р сарын ' + ws.getDate() + ' – ' + (we.getMonth() !== ws.getMonth() ? (we.getMonth() + 1) + '-р сарын ' : '') + we.getDate();
  }

  function renderWeek(now) {
    const ws = weekStart(state.weekOffset);
    $('#week-label').textContent = weekLabel(ws);
    const tasks = visibleTasks(now);
    let html = '';
    for (let i = 0; i < 7; i++) {
      const day = addDays(ws, i);
      const items = tasks.filter((t) => {
        const d = toDate(t.start_at) || toDate(t.due_at);
        return d && sameDay(d, day);
      }).sort((a, b) => {
        const sa = new Date(a.start_at || a.due_at), sb2 = new Date(b.start_at || b.due_at);
        return (a.status === 'done') - (b.status === 'done') || sa - sb2;
      });
      const hours = items.reduce((s, t) => s + (t.start_at && t.end_at ? (new Date(t.end_at) - new Date(t.start_at)) / 3600000 : 0), 0);
      const loadPct = Math.min(100, Math.round((hours / 10) * 100));     // 10 цаг = дүүрэн
      html += '<section class="day' + (sameDay(day, now) ? ' today' : '') + '" aria-label="' + WEEKDAYS[day.getDay()] + ' ' + md(day) + '">' +
        '<div class="day-head"><span class="day-name">' + WD_SHORT[day.getDay()] + ' ' + md(day) + '</span>' +
        '<span class="day-sub">' + items.length + ' ажил' + (hours ? ' · ' + fmtHours(hours) : '') + '</span></div>' +
        '<div class="day-load" title="Цаг оноосон ачаалал"><span style="width:' + loadPct + '%"></span></div>';
      for (const t of items) {
        const q = quadrantOf(t, now);
        const time = t.start_at && t.end_at ? hm(new Date(t.start_at)) + '–' + hm(new Date(t.end_at)) : 'Хугацаа ' + hm(new Date(t.due_at));
        html += '<button type="button" class="mini ' + q + (t.status === 'done' ? ' done' : '') + '" data-open="' + t.id + '">' +
          '<span class="m-title">' + esc(t.title) + '</span><span class="m-time">' + time + ' · ' + QUADS[q].code + '</span></button>';
      }
      html += '<button type="button" class="day-add" data-add-date="' + ymd(day) + '">+ Нэмэх</button></section>';
    }
    $('#week-grid').innerHTML = html;
  }

  // ---------- Матриц (FR-10) ----------
  function renderMatrix(now) {
    const todo = visibleTasks(now).filter((t) => t.status === 'todo').sort((a, b) => compareTasks(a, b, now));
    const canDrag = !matchMedia('(max-width: 900px)').matches;
    let html = '';
    for (const q of ['q1', 'q2', 'q3', 'q4']) {
      const items = todo.filter((t) => quadrantOf(t, now) === q);
      html += '<section class="quad ' + q + '" data-quad="' + q + '" aria-label="' + QUADS[q].code + ' ' + QUADS[q].name + '">' +
        '<div class="quad-head"><span class="pill ' + q + '">' + QUADS[q].code + '</span>' +
        '<div class="stack-tight"><h2>' + QUADS[q].name + ' · ' + items.length + '</h2><span class="muted small strong-600">' + QUADS[q].desc + '</span></div></div>' +
        '<div class="quad-list">';
      html += items.length ? items.map((t) =>
        '<div class="qitem ' + q + '"' + (canDrag ? ' draggable="true"' : '') + ' data-drag="' + t.id + '">' +
          '<button type="button" class="check" data-check="' + t.id + '" aria-label="Дууссан гэж тэмдэглэх: ' + esc(t.title) + '">' + CHECK_SVG + '</button>' +
          '<button type="button" class="task-open" data-open="' + t.id + '"><span class="task-title">' + esc(t.title) + '</span>' +
          '<span class="task-meta">' + esc(taskMeta(t)) + '</span></button></div>').join('')
        : '<div class="quad-empty">Энд ажил алга.</div>';
      html += '</div></section>';
    }
    $('#matrix-grid').innerHTML = html;
  }

  // ---------- Статистик (FR-13) ----------
  async function loadPomoWeek(ws) {
    const key = ymd(ws);
    if (state.pomoCache[key]) return state.pomoCache[key];
    const { data, error } = await sb.from('pomodoro_sessions').select('minutes, started_at')
      .gte('started_at', ws.toISOString()).lt('started_at', addDays(ws, 7).toISOString());
    const rows = error ? [] : (data || []);
    state.pomoCache[key] = rows;
    return rows;
  }

  function hbar(label, value, max, valText, cls) {
    const pct = max ? Math.round((value / max) * 100) : 0;
    return '<div class="hbar ' + (cls || '') + '"><span class="lbl">' + esc(label) + '</span>' +
      '<span class="track" aria-hidden="true"><i style="width:' + pct + '%"></i></span><span class="val">' + valText + '</span></div>';
  }

  async function renderStats(now) {
    const ws = weekStart(state.statsOffset), we = addDays(ws, 7);
    $('#stats-week-label').textContent = weekLabel(ws);
    $$('#view-stats [data-week="-1"]').forEach((b) => { b.disabled = state.statsOffset <= -11; });
    const inWeek = (iso) => iso && new Date(iso) >= ws && new Date(iso) < we;
    const done = state.tasks.filter((t) => t.status === 'done' && inWeek(t.completed_at));
    const planned = state.tasks.filter((t) => t.start_at && t.end_at && inWeek(t.start_at));
    const dur = (t) => (new Date(t.end_at) - new Date(t.start_at)) / 3600000;
    const plannedHours = planned.reduce((s, t) => s + dur(t), 0);
    const withDue = done.filter((t) => t.due_at);
    const onTime = withDue.filter((t) => new Date(t.completed_at) <= new Date(t.due_at)).length;

    const perDay = Array.from({ length: 7 }, (_, i) => done.filter((t) => sameDay(new Date(t.completed_at), addDays(ws, i))).length);
    const maxDay = Math.max(1, ...perDay);
    const byCat = CATEGORIES.map((c) => ({
      c, n: done.filter((t) => t.category === c).length,
      h: planned.filter((t) => t.category === c).reduce((s, t) => s + dur(t), 0)
    }));
    const maxCatH = Math.max(0, ...byCat.map((x) => x.h));
    const byQuad = ['q1', 'q2', 'q3', 'q4'].map((q) => ({ q, n: done.filter((t) => quadrantOf(t, new Date(t.completed_at)) === q).length }));
    const maxQ = Math.max(1, ...byQuad.map((x) => x.n));

    const pomo = await loadPomoWeek(ws);
    if (state.view !== 'stats') return;
    const pomoMin = pomo.reduce((s, p) => s + p.minutes, 0);

    let html = '<div class="stat-tiles">' +
      '<div class="tile"><b>' + done.length + '</b><span>Дууссан ажил</span></div>' +
      '<div class="tile"><b>' + fmtHours(plannedHours) + '</b><span>Цаг оноож төлөвлөсөн</span></div>' +
      '<div class="tile"><b>' + (withDue.length ? Math.round((onTime / withDue.length) * 100) + '%' : '—') + '</b><span>Хугацаандаа дууссан</span></div>' +
      '<div class="tile"><b>' + pomo.length + '</b><span>Pomodoro · ' + pomoMin + ' мин</span></div>' +
      '</div><div class="stat-panels">';

    html += '<section class="panel wide"><h2>Өдөр бүр дуусгасан ажил</h2><div class="cols">';
    perDay.forEach((n, i) => {
      const d = addDays(ws, i);
      html += '<div class="col' + (sameDay(d, now) ? ' today' : '') + '"><b>' + n + '</b>' +
        '<i style="height:' + Math.round((n / maxDay) * 120) + 'px"></i><span>' + WD_SHORT[d.getDay()] + '</span></div>';
    });
    html += '</div></section>';

    html += '<section class="panel"><h2>Ангиллаар · цаг оноосон</h2>' +
      byCat.map((x) => hbar(x.c, x.h, maxCatH, fmtHours(x.h))).join('') + '</section>';
    html += '<section class="panel"><h2>Квадрантаар · дууссан ажил</h2>' +
      byQuad.map((x) => hbar(QUADS[x.q].code + ' ' + QUADS[x.q].name, x.n, maxQ, x.n + ' ажил', x.q)).join('') + '</section>';
    html += '</div>';
    if (!done.length && !planned.length) html += '<p class="muted strong-600">Энэ долоо хоногт мэдээлэл алга. Ажил дуусгах, цаг оноох тусам статистик бүрдэнэ.</p>';
    $('#stats-body').innerHTML = html;
  }

  // ============================================================
  // АЖИЛ НЭМЭХ / ЗАСАХ ФОРМ
  // ============================================================
  const form = () => $('#task-form');

  function openDialog(task, opts) {
    state.editing = task || null;
    state.overlapAck = false;
    const f = form();
    f.reset();
    setMsg('#task-msg', '');
    $('#task-dialog-title').textContent = task ? 'Ажил засах' : 'Шинэ ажил';
    $('#delete-btn').hidden = !task;
    $('#pomo-btn').hidden = !task || task.status === 'done';
    const today = ymd(new Date());

    if (task) {
      f.title.value = task.title;
      f.description.value = task.description || '';
      const cat = f.querySelector('input[name="category"][value="' + task.category + '"]');
      if (cat) cat.checked = true;
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
      f.repeat.value = task.repeat || 'none';
      $$('input[name="rday"]').forEach((c) => { c.checked = (task.repeat_days || []).includes(Number(c.value)); });
    } else {
      const date = (opts && opts.date) || today;
      f.blockDate.value = date;
      if (opts && opts.date) { f.dueDate.value = date; f.dueTime.value = '23:59'; }
      const startH = Math.min(22, new Date().getHours() + 1);
      f.start.value = pad(startH) + ':00';
      f.end.value = pad(startH + 1) + ':00';
      f.repeat.value = 'none';
    }
    $('#schedule-fields').hidden = !f.schedule.checked;
    $('#repeat-days').hidden = f.repeat.value !== 'weekly';
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
    const repeat = f.repeat.value;
    const days = $$('input[name="rday"]:checked').map((c) => Number(c.value));
    return {
      title: f.title.value.trim(),
      description: f.description.value.trim() || null,
      category: (f.querySelector('input[name="category"]:checked') || {}).value || 'Хувийн',
      due_at: due ? due.toISOString() : null,
      important: f.important.checked,
      urgent: f.urgent.checked,
      start_at: start ? start.toISOString() : null,
      end_at: end ? end.toISOString() : null,
      repeat,
      repeat_days: repeat === 'weekly' && days.length ? days : null,
      _schedule: f.schedule.checked
    };
  }

  function updateQuadPreview() {
    const v = readForm();
    const now = new Date();
    const q = quadrantOf(v, now);
    $('#quad-preview').className = 'quad-preview ' + q;
    $('#qp-code').textContent = QUADS[q].code;
    $('#qp-name').textContent = QUADS[q].name;
    const auto = !v.urgent && isUrgent(v, now);
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
    }
    if (v.repeat !== 'none' && !v.due_at && !v.start_at) {
      return setMsg('#task-msg', 'Давтагдах ажилд хугацаа эсвэл цаг оноох шаардлагатай.');
    }
    if (v._schedule) {
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
    if (state.pomo && state.pomo.taskId === t.id) stopPomo();
    closeDialog();
    toast('Устгалаа');
    await loadTasks();
  }

  // ============================================================
  // POMODORO (FR-14)
  // ============================================================
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35].forEach((delay) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; g.gain.value = 0.15;
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.2);
      });
    } catch (e) {}
  }

  function startPomo(task) {
    stopPomo();
    state.pomo = { taskId: task.id, title: task.title, phase: 'work', running: true, count: 0,
      remaining: POMO_WORK * 60, endsAt: Date.now() + POMO_WORK * 60000, phaseStart: new Date() };
    state.pomo.timer = setInterval(tickPomo, 1000);
    $('#pomo').hidden = false;
    document.body.classList.add('has-pomo');
    renderPomo();
    toast('Pomodoro эхэллээ · ' + POMO_WORK + ' минут');
  }

  function stopPomo() {
    if (!state.pomo) return;
    clearInterval(state.pomo.timer);
    state.pomo = null;
    $('#pomo').hidden = true;
    document.body.classList.remove('has-pomo');
    document.title = 'Хэмнэл — цаг төлөвлөгч';
  }

  function togglePomo() {
    const p = state.pomo;
    if (!p) return;
    if (p.running) {
      p.remaining = Math.max(0, Math.round((p.endsAt - Date.now()) / 1000));
      p.running = false;
    } else {
      if (p.phase === 'work' && p.remaining === POMO_WORK * 60) p.phaseStart = new Date();
      p.endsAt = Date.now() + p.remaining * 1000;
      p.running = true;
    }
    renderPomo();
  }

  async function tickPomo() {
    const p = state.pomo;
    if (!p || !p.running) return;
    p.remaining = Math.max(0, Math.round((p.endsAt - Date.now()) / 1000));
    if (p.remaining > 0) return renderPomo();
    beep();
    if (p.phase === 'work') {
      p.count++;
      const { error } = await sb.from('pomodoro_sessions').insert({ task_id: p.taskId, started_at: p.phaseStart.toISOString(), minutes: POMO_WORK });
      if (error) toast('Pomodoro хадгалж чадсангүй: ' + error.message);
      state.pomoCache = {};
      p.phase = 'break';
      p.remaining = POMO_BREAK * 60;
      p.endsAt = Date.now() + p.remaining * 1000;
      toast('Сайн байна! ' + POMO_BREAK + ' минут амар.');
    } else {
      p.phase = 'work';
      p.remaining = POMO_WORK * 60;
      p.running = false;
      toast('Амралт дууслаа. Бэлэн болмогц «Эхлүүлэх» дарна уу.');
    }
    renderPomo();
  }

  function renderPomo() {
    const p = state.pomo;
    if (!p) return;
    const mm = pad(Math.floor(p.remaining / 60)), ss = pad(p.remaining % 60);
    $('#pomo-time').textContent = mm + ':' + ss;
    $('#pomo-task').textContent = p.title;
    const phase = $('#pomo-phase');
    phase.textContent = p.phase === 'work' ? 'Ажил' : 'Амралт';
    phase.className = 'pill ' + (p.phase === 'work' ? 'work' : 'break');
    $('#pomo-toggle').textContent = p.running ? 'Түр зогсоох' : (p.remaining === POMO_WORK * 60 ? 'Эхлүүлэх' : 'Үргэлжлүүлэх');
    $('#pomo-count').textContent = p.count + ' удаа дууссан';
    document.title = (p.running ? mm + ':' + ss + ' · ' : '') + 'Хэмнэл';
  }

  // ============================================================
  // ГОРИМ, ТОХИРГОО
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

  function openSettings() {
    const f = $('#settings-form');
    f.querySelector('input[name="theme"][value="' + state.settings.theme + '"]').checked = true;
    f.urgentHours.value = state.settings.urgent_hours;
    $('#settings-user').textContent = 'Нэвтэрсэн: ' + (state.user ? state.user.email : '');
    setMsg('#settings-msg', '');
    $('#settings-dialog').showModal();
  }

  async function onSettingsSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const theme = (f.querySelector('input[name="theme"]:checked') || {}).value || 'auto';
    const hours = Number(f.urgentHours.value);
    if (!Number.isInteger(hours) || hours < 1 || hours > 336) return setMsg('#settings-msg', 'Цаг 1-ээс 336-ийн хооронд бүхэл тоо байна.');
    const { error } = await sb.from('user_settings').update({ theme, urgent_hours: hours }).eq('user_id', state.user.id);
    if (error) return setMsg('#settings-msg', 'Хадгалж чадсангүй: ' + error.message);
    state.settings = { theme, urgent_hours: hours };
    applyTheme(theme);
    $('#settings-dialog').close();
    toast('Тохиргоо хадгалагдлаа');
    render();
  }

  // ============================================================
  // ҮЙЛДЛҮҮД
  // ============================================================
  function setTodayTab(view) {
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
    $('#f-repeat').addEventListener('change', (e) => {
      $('#repeat-days').hidden = e.target.value !== 'weekly';
      if (e.target.value === 'weekly' && !$$('input[name="rday"]:checked').length) {
        const f = form();
        const anchor = f.dueDate.value || (f.schedule.checked && f.blockDate.value) || ymd(new Date());
        const wd = new Date(anchor + 'T12:00').getDay();
        const box = document.querySelector('input[name="rday"][value="' + wd + '"]');
        if (box) box.checked = true;
      }
    });
    $('#delete-btn').addEventListener('click', onDelete);
    $('#pomo-btn').addEventListener('click', () => { const t = state.editing; closeDialog(); if (t) startPomo(t); });
    $('#settings-form').addEventListener('submit', onSettingsSubmit);
    $('#view-list').addEventListener('click', () => setTodayTab('list'));
    $('#view-time').addEventListener('click', () => setTodayTab('time'));

    // Шүүлт
    const onFilter = () => {
      state.filter = { q: $('#flt-search').value.trim(), cat: $('#flt-category').value, quad: $('#flt-quad').value, status: $('#flt-status').value };
      render();
    };
    ['#flt-search', '#flt-category', '#flt-quad', '#flt-status'].forEach((s) => $(s).addEventListener('input', onFilter));
    $('#flt-toggle').addEventListener('click', (e) => {
      const open = $('#filter-bar').classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(open));
    });
    $('#flt-clear').addEventListener('click', () => {
      ['#flt-search', '#flt-category', '#flt-quad', '#flt-status'].forEach((s) => { $(s).value = ''; });
      onFilter();
    });

    // Dialog-ын гадна (scrim) дарахад хаагдана
    ['#task-dialog', '#settings-dialog'].forEach((s) => $(s).addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }));

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action], [data-check], [data-open], [data-week], [data-add-date]');
      if (!el) return;
      if (el.dataset.check) return toggleDone(el.dataset.check);
      if (el.dataset.open) return openDialog(state.tasks.find((t) => t.id === el.dataset.open));
      if (el.dataset.addDate) return openDialog(null, { date: el.dataset.addDate });
      if (el.dataset.week !== undefined) {
        const d = Number(el.dataset.week);
        const key = state.view === 'stats' ? 'statsOffset' : 'weekOffset';
        state[key] = d === 0 ? 0 : state[key] + d;
        if (key === 'statsOffset') state.statsOffset = Math.max(-11, state.statsOffset);
        return render();
      }
      switch (el.dataset.action) {
        case 'new': e.preventDefault(); return openDialog(null);
        case 'close-dialog': return closeDialog();
        case 'close-settings': return $('#settings-dialog').close();
        case 'settings': return openSettings();
        case 'logout': return logout();
        case 'theme': return cycleTheme();
        case 'toggle-upcoming': state.showUpcoming = !state.showUpcoming; return render();
        case 'pomo-toggle': return togglePomo();
        case 'pomo-stop': return stopPomo();
      }
    });

    // Матриц: чирж зөөх
    const grid = $('#matrix-grid');
    grid.addEventListener('dragstart', (e) => {
      const it = e.target.closest('[data-drag]');
      if (!it) return;
      e.dataTransfer.setData('text/plain', it.dataset.drag);
      e.dataTransfer.effectAllowed = 'move';
      it.classList.add('dragging');
    });
    grid.addEventListener('dragend', (e) => {
      const it = e.target.closest('[data-drag]');
      if (it) it.classList.remove('dragging');
      $$('.quad.drop').forEach((q) => q.classList.remove('drop'));
    });
    grid.addEventListener('dragover', (e) => {
      const q = e.target.closest('[data-quad]');
      if (!q) return;
      e.preventDefault();
      $$('.quad.drop').forEach((x) => { if (x !== q) x.classList.remove('drop'); });
      q.classList.add('drop');
    });
    grid.addEventListener('drop', (e) => {
      const q = e.target.closest('[data-quad]');
      if (!q) return;
      e.preventDefault();
      q.classList.remove('drop');
      moveToQuad(e.dataTransfer.getData('text/plain'), q.dataset.quad);
    });

    window.addEventListener('hashchange', route);
    // Утас ↔ компьютер синхрон: апп руу буцаж ороход дахин ачаална (NFR-04)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.user) { state.pomoCache = {}; loadTasks(); }
    });
    // Минут тутам цаг, квадрантыг шинэчилнэ
    setInterval(() => { if (state.user && !$('#task-dialog').open && state.view !== 'stats') render(); }, 60000);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.settings.theme === 'auto') applyTheme('auto');
    });
  }

  init();
})();
