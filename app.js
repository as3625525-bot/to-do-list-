/* MISSION 33 - daily to-do tracker
 *
 * Works in two modes:
 *  - ONLINE: if Supabase config is filled in, tasks sync across devices.
 *  - OFFLINE: otherwise, tasks are saved in this browser's localStorage.
 */

(function () {
  'use strict';

  const cfg = window.MISSION33_CONFIG || {};
  const ONLINE = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  let sb = null;
  if (ONLINE && window.supabase) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  const LS_KEY = 'mission33_tasks';
  const $ = (sel) => document.querySelector(sel);
  const todayStr = () => new Date().toISOString().slice(0, 10);

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  async function loadAllTasks() {
    if (ONLINE) {
      const { data, error } = await sb.from('tasks').select('*').order('created_at');
      if (error) { console.error(error); return []; }
      return data || [];
    }
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch (e) { return []; }
  }

  function saveLocal(tasks) { localStorage.setItem(LS_KEY, JSON.stringify(tasks)); }

  async function addTask(title, priority) {
    const task = {
      id: uuid(), title: title, priority: priority,
      completed: false, task_date: todayStr(), created_at: new Date().toISOString()
    };
    if (ONLINE) {
      const { error } = await sb.from('tasks').insert({
        title: task.title, priority: task.priority, completed: false, task_date: task.task_date
      });
      if (error) console.error(error);
    } else {
      const tasks = await loadAllTasks();
      tasks.push(task);
      saveLocal(tasks);
    }
  }

  async function toggleTask(id, completed) {
    if (ONLINE) {
      const { error } = await sb.from('tasks').update({ completed }).eq('id', id);
      if (error) console.error(error);
    } else {
      const tasks = await loadAllTasks();
      const t = tasks.find((x) => x.id === id);
      if (t) t.completed = completed;
      saveLocal(tasks);
    }
  }

  async function deleteTask(id) {
    if (ONLINE) {
      const { error } = await sb.from('tasks').delete().eq('id', id);
      if (error) console.error(error);
    } else {
      let tasks = await loadAllTasks();
      tasks = tasks.filter((x) => x.id !== id);
      saveLocal(tasks);
    }
  }

  function completionForDate(tasks, dateStr) {
    const day = tasks.filter((t) => t.task_date === dateStr);
    if (day.length === 0) return null;
    const done = day.filter((t) => t.completed).length;
    return Math.round((done / day.length) * 100);
  }

  function computeStreak(tasks) {
    let streak = 0;
    const d = new Date();
    for (;;) {
      const ds = d.toISOString().slice(0, 10);
      const pct = completionForDate(tasks, ds);
      if (pct === 100) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  let chart = null;
  let currentRange = 'daily';

  function buildChartData(tasks, range) {
    const labels = [];
    const values = [];
    const today = new Date();

    if (range === 'daily') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const ds = d.toISOString().slice(0, 10);
        labels.push(ds.slice(5));
        const pct = completionForDate(tasks, ds);
        values.push(pct === null ? 0 : pct);
      }
    } else if (range === 'weekly') {
      for (let w = 3; w >= 0; w--) {
        let sum = 0, counted = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - (w * 7 + i));
          const pct = completionForDate(tasks, d.toISOString().slice(0, 10));
          if (pct !== null) { sum += pct; counted++; }
        }
        labels.push(w === 0 ? 'This wk' : w + 'w ago');
        values.push(counted ? Math.round(sum / counted) : 0);
      }
    } else {
      for (let m = 5; m >= 0; m--) {
        const ref = new Date(today.getFullYear(), today.getMonth() - m, 1);
        const year = ref.getFullYear(), month = ref.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let sum = 0, counted = 0;
        for (let day = 1; day <= daysInMonth; day++) {
          const ds = new Date(year, month, day).toISOString().slice(0, 10);
          const pct = completionForDate(tasks, ds);
          if (pct !== null) { sum += pct; counted++; }
        }
        labels.push(ref.toLocaleString('default', { month: 'short' }));
        values.push(counted ? Math.round(sum / counted) : 0);
      }
    }
    return { labels, values };
  }

  function renderChart(tasks) {
    const { labels, values } = buildChartData(tasks, currentRange);
    const ctx = $('#perf-chart').getContext('2d');
    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.update();
      return;
    }
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: [{
        label: 'Completion %', data: values,
        borderColor: '#6c7bff', backgroundColor: 'rgba(108,123,255,0.25)',
        borderWidth: 2, fill: true, tension: 0.3,
        pointRadius: 4, pointBackgroundColor: '#00d4a0'
      }] },
      options: {
        responsive: true,
        scales: {
          y: { min: 0, max: 100, ticks: { color: '#9aa0c8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          x: { ticks: { color: '#9aa0c8' }, grid: { display: false } }
        },
        plugins: { legend: { labels: { color: '#e8eaf6' } } }
      }
    });
  }

  function render(tasks) {
    const today = todayStr();
    const todays = tasks.filter((t) => t.task_date === today);
    const list = $('#task-list');
    list.innerHTML = '';
    $('#empty-msg').style.display = todays.length ? 'none' : 'block';

    todays.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'task-item prio-' + t.priority + (t.completed ? ' done' : '');
      li.innerHTML =
        '<input type="checkbox" ' + (t.completed ? 'checked' : '') + ' />' +
        '<span class="task-title"></span>' +
        '<span class="task-badge ' + t.priority + '">' + t.priority + '</span>' +
        '<button class="task-del" title="Delete">&times;</button>';
      li.querySelector('.task-title').textContent = t.title;
      li.querySelector('input').addEventListener('change', async (e) => {
        await toggleTask(t.id, e.target.checked); refresh();
      });
      li.querySelector('.task-del').addEventListener('click', async () => {
        await deleteTask(t.id); refresh();
      });
      list.appendChild(li);
    });

    const done = todays.filter((t) => t.completed).length;
    const pct = todays.length ? Math.round((done / todays.length) * 100) : 0;
    $('#stat-completion').textContent = pct + '%';
    $('#stat-count').textContent = done + ' / ' + todays.length;
    $('#stat-streak').textContent = computeStreak(tasks) + ' days';
    $('#today-label').textContent = new Date().toLocaleDateString();

    renderChart(tasks);
  }

  async function refresh() {
    const tasks = await loadAllTasks();
    render(tasks);
  }

  function init() {
    const pill = $('#sync-status');
    if (ONLINE) { pill.textContent = 'Synced'; pill.className = 'sync-pill online'; }
    else { pill.textContent = 'Offline (this device)'; pill.className = 'sync-pill offline'; }

    $('#add-btn').addEventListener('click', addFromInput);
    $('#task-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFromInput(); });

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        currentRange = tab.dataset.range;
        refresh();
      });
    });

    refresh();
  }

  async function addFromInput() {
    const input = $('#task-input');
    const title = input.value.trim();
    if (!title) return;
    const priority = $('#task-priority').value;
    await addTask(title, priority);
    input.value = '';
    input.focus();
    refresh();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
