/* LOCKED OS: persistent tasks and goals. Uses the existing state/save/sync path. */
(() => {
  'use strict';

  const KEY = 'killListV1';
  const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const safeId = value => typeof value === 'string' && value.length > 0 && value.length <= 180 &&
    !['__proto__', 'constructor', 'prototype'].includes(value);
  const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString() : '';
  const dateKey = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? value : '';
  };

  function normalizeItem(raw, key) {
    if (!object(raw) || !safeId(key)) return null;
    const deletedAt = timestamp(raw.deletedAt);
    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 180) : '';
    if (!title && !deletedAt) return null;
    return {
      id: key,
      title,
      notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) : '',
      kind: raw.kind === 'goal' ? 'goal' : 'task',
      priority: ['low', 'normal', 'high'].includes(raw.priority) ? raw.priority : 'normal',
      targetDate: dateKey(raw.targetDate),
      completed: raw.completed === true,
      createdAt: timestamp(raw.createdAt),
      updatedAt: timestamp(raw.updatedAt) || timestamp(raw.createdAt) || deletedAt,
      completedAt: raw.completed === true ? timestamp(raw.completedAt) : '',
      deletedAt
    };
  }

  function normalize(source) {
    const items = {};
    if (object(source?.items)) {
      for (const [key, value] of Object.entries(source.items)) {
        const item = normalizeItem(value, key);
        if (item) items[key] = item;
      }
    }
    return { version: 1, items };
  }

  // Merge records atomically: field-by-field merging could combine a completed
  // status with a stale completedAt. Tombstones retain deletions on old devices.
  function mergeKillList(before, local, remote) {
    const sources = [before, local, remote].map(normalize);
    const items = {};
    const ids = new Set(sources.flatMap(source => Object.keys(source.items)));
    for (const id of [...ids].sort()) {
      const candidates = sources.map(source => source.items[id]).filter(Boolean);
      const deleted = candidates.filter(item => item.deletedAt);
      const choices = deleted.length ? deleted : candidates;
      items[id] = { ...choices.sort((a, b) =>
        (b.deletedAt || b.updatedAt).localeCompare(a.deletedAt || a.updatedAt) ||
        JSON.stringify(b).localeCompare(JSON.stringify(a))
      )[0] };
    }
    return { version: 1, items };
  }

  const hasData = snapshot => Object.keys(normalize(snapshot?.meta?.[KEY]).items).length > 0;
  globalThis.lockedOsMergeKillList = mergeKillList;
  globalThis.lockedOsKillListHasData = hasData;
  // Keeping the merge helper independent of DOM makes conflict checks possible
  // without mounting the app or connecting to the user's database.
  if (typeof document === 'undefined') return;
  if (window.__lockedOsKillListV1) return;
  window.__lockedOsKillListV1 = true;

  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const fields = ['title', 'notes', 'kind', 'priority', 'targetDate'];
  const fieldIds = { title: 'klTitle', notes: 'klNotes', kind: 'klKind', priority: 'klPriority', targetDate: 'klTargetDate' };
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  let mounted = false, filter = 'active', editingId = '', editingBase = null, dirty = false, lastSignature = '';

  function getState() {
    return typeof state !== 'undefined' && object(state) ? state : null;
  }
  function data() { return normalize(getState()?.meta?.[KEY]); }
  function lookup(id) {
    const item = data().items[id];
    return item && !item.deletedAt ? item : null;
  }
  function currentDay() {
    if (typeof getTodayKey === 'function') return getTodayKey();
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function nextTimestamp(item) {
    return new Date(Math.max(Date.now(), (Date.parse(item?.updatedAt || '') || 0) + 1)).toISOString();
  }
  function newId() {
    return `kill-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
  }
  function visible() { return mounted && $('killListPage')?.classList.contains('active'); }
  function message(text, error = false) {
    const status = $('klStatus');
    if (!status) return;
    status.textContent = text;
    status.dataset.kind = error ? 'error' : 'info';
    status.hidden = !text;
  }

  function commit(item, success) {
    const current = getState();
    if (!current || typeof saveState !== 'function') {
      message('The app is not ready to save. Open the app again and try once more.', true);
      return false;
    }
    const draft = data();
    draft.items[item.id] = item;
    current.meta = object(current.meta) ? current.meta : {};
    current.meta[KEY] = draft;
    let stored = false;
    try { stored = saveState() !== false; }
    catch (error) { console.warn('Kill List could not save to device storage.', error); }
    render();
    message(stored ? success : 'This change is in memory, but device storage could not save it. Keep this tab open and use Sync now.', !stored);
    return true;
  }

  function readForm() {
    return {
      title: $('klTitle').value.trim(), notes: $('klNotes').value.trim(),
      kind: $('klKind').value, priority: $('klPriority').value, targetDate: $('klTargetDate').value
    };
  }
  function resetForm() {
    editingId = '';
    editingBase = null;
    dirty = false;
    $('klForm').reset();
    $('klFormHeading').textContent = 'Add a task or goal';
    $('klSubmit').textContent = 'Add item';
    $('klCancel').hidden = true;
  }
  function allowDiscard() { return !dirty || window.confirm('Discard your unsaved changes?'); }
  function startEdit(id) {
    const item = lookup(id);
    if (!item || !allowDiscard()) return;
    editingId = id;
    editingBase = { ...item };
    dirty = false;
    for (const field of fields) $(fieldIds[field]).value = item[field];
    $('klFormHeading').textContent = 'Edit item';
    $('klSubmit').textContent = 'Save changes';
    $('klCancel').hidden = false;
    message('');
    $('klTitle').focus();
    $('klFormCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function saveForm(event) {
    event.preventDefault();
    const values = readForm();
    if (!values.title) {
      message('Give your task or goal a title.', true);
      $('klTitle').focus();
      return;
    }
    if (values.targetDate && !dateKey(values.targetDate)) {
      message('Choose a valid target date, or leave it blank.', true);
      $('klTargetDate').focus();
      return;
    }
    let item;
    if (editingId) {
      const latest = lookup(editingId);
      if (!latest) {
        // A remote delete must never be undone by an open edit form. Keep all
        // draft inputs so the user can choose to add them as a separate item.
        editingId = '';
        editingBase = null;
        $('klFormHeading').textContent = 'Add a task or goal';
        $('klSubmit').textContent = 'Add item';
        $('klCancel').hidden = false;
        message('This item was deleted elsewhere. Your draft is still here. Choose Add item to save it as a new task or goal.', true);
        return;
      }
      item = { ...latest, updatedAt: nextTimestamp(latest) };
      // Keep remote changes to fields the user did not edit, including status.
      for (const field of fields) if (values[field] !== editingBase[field]) item[field] = values[field];
    } else {
      const time = nextTimestamp();
      item = { id: newId(), ...values, completed: false, createdAt: time, updatedAt: time, completedAt: '', deletedAt: '' };
    }
    if (commit(item, editingId ? 'Changes saved.' : `${values.kind === 'goal' ? 'Goal' : 'Task'} added.`)) {
      resetForm();
      $('klTitle').focus();
    }
  }
  function toggleItem(id) {
    const item = lookup(id);
    if (!item) return;
    const time = nextTimestamp(item), completed = !item.completed;
    commit({ ...item, completed, completedAt: completed ? time : '', updatedAt: time }, completed ? 'Marked complete.' : 'Moved back to active.');
  }
  function deleteItem(id) {
    const item = lookup(id);
    if (!item || !window.confirm(`Delete "${item.title}" from your Kill List?`)) return;
    const time = nextTimestamp(item);
    if (commit({ ...item, deletedAt: time, updatedAt: time }, 'Item deleted.') && editingId === id) resetForm();
  }
  function formatDay(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function itemMarkup(item, today) {
    const overdue = !item.completed && item.targetDate && item.targetDate < today;
    const dueToday = !item.completed && item.targetDate === today;
    const dateText = dueToday ? 'Due today' : `${overdue ? 'Overdue: ' : 'Target: '}${item.targetDate ? formatDay(item.targetDate) : ''}`;
    return `<li class="kl-item${item.completed ? ' kl-completed' : ''}">
      <button type="button" class="kl-check" data-kl-action="toggle" data-id="${escape(item.id)}" aria-label="${escape(`${item.completed ? 'Mark active' : 'Complete'}: ${item.title}`)}" aria-pressed="${item.completed}"><span aria-hidden="true">${item.completed ? '&#10003;' : ''}</span></button>
      <div class="kl-item-content"><div class="kl-item-meta"><span class="kl-kind">${item.kind === 'goal' ? 'Goal' : 'Task'}</span><span class="kl-priority kl-priority-${item.priority}">${item.priority === 'high' ? 'High priority' : item.priority === 'low' ? 'Low priority' : 'Normal priority'}</span>${item.targetDate ? `<span class="kl-date${overdue ? ' kl-overdue' : ''}${dueToday ? ' kl-due-today' : ''}">${escape(dateText)}</span>` : ''}</div>
        <h4>${escape(item.title)}</h4>${item.notes ? `<p class="kl-item-notes">${escape(item.notes)}</p>` : ''}
        ${item.completed && item.completedAt ? `<p class="kl-completed-date">Completed ${escape(new Date(item.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</p>` : ''}
      </div>
      <div class="kl-item-actions"><button type="button" class="kl-text-button" data-kl-action="edit" data-id="${escape(item.id)}" aria-label="${escape(`Edit: ${item.title}`)}">Edit</button><button type="button" class="kl-text-button kl-delete" data-kl-action="delete" data-id="${escape(item.id)}" aria-label="${escape(`Delete: ${item.title}`)}">Delete</button></div>
    </li>`;
  }
  function render() {
    if (!mounted) return;
    const source = data(), today = currentDay();
    const signature = JSON.stringify([source, filter, today]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    const items = Object.values(source.items).filter(item => !item.deletedAt);
    const active = items.filter(item => !item.completed), completed = items.filter(item => item.completed);
    $('klActiveCount').textContent = active.length;
    $('klCompletedCount').textContent = completed.length;
    $('klTotalCount').textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'} total`;
    $('klActiveFilterCount').textContent = active.length;
    $('klCompletedFilterCount').textContent = completed.length;
    for (const button of $('klFilters').querySelectorAll('button')) {
      const selected = button.dataset.filter === filter;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    const shown = (filter === 'active' ? active : filter === 'completed' ? completed : items).sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      if (a.completed) return (b.completedAt || b.updatedAt).localeCompare(a.completedAt || a.updatedAt);
      return priorityOrder[a.priority] - priorityOrder[b.priority] ||
        (a.targetDate || '9999-12-31').localeCompare(b.targetDate || '9999-12-31') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
    const focus = document.activeElement?.closest?.('[data-kl-action]');
    const focusInfo = focus ? { action: focus.dataset.klAction, id: focus.dataset.id } : null;
    const list = $('klItems');
    list.innerHTML = shown.map(item => itemMarkup(item, today)).join('');
    list.hidden = !shown.length;
    const empty = $('klEmpty');
    empty.hidden = Boolean(shown.length);
    if (!shown.length) {
      const title = filter === 'completed' ? 'Your finished work goes here.' : items.length ? 'All caught up.' : 'What do you want to accomplish?';
      const body = filter === 'completed' ? 'Complete a task or goal to keep a record of your progress.' : items.length ? 'Everything on your list is complete. Add your next task or goal when you are ready.' : 'Add your first task or goal. It stays here until you finish it.';
      $('klEmptyTitle').textContent = title;
      $('klEmptyText').textContent = body;
    }
    if (focusInfo) {
      const replacement = [...list.querySelectorAll('[data-kl-action]')].find(button => button.dataset.klAction === focusInfo.action && button.dataset.id === focusInfo.id);
      (replacement || $('klListHeading')).focus({ preventScroll: true });
    }
    // The form is intentionally outside the list render. Sync and tab changes
    // update saved items while leaving the user's unfinished draft untouched.
  }

  function mount() {
    if (mounted) return;
    const app = $('mainApp'), nav = app?.querySelector('.tabs');
    if (!app || !nav) return;
    let tab = nav.querySelector('[data-tab="killListPage"]');
    if (!tab) {
      tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab kill-list-tab';
      tab.dataset.tab = 'killListPage';
      tab.textContent = 'Kill List';
      nav.insertBefore(tab, nav.querySelector('[data-tab="adminPage"]'));
    }
    const page = document.createElement('section');
    page.className = 'page';
    page.id = 'killListPage';
    page.setAttribute('aria-labelledby', 'klHeading');
    page.innerHTML = `
      <header class="card kl-hero"><div><p class="eyebrow">Tasks &amp; goals</p><h2 id="klHeading">Kill List</h2><p>Keep track of what you want to accomplish.</p></div><div class="kl-stats"><div><strong id="klActiveCount">0</strong><span>Active</span></div><div><strong id="klCompletedCount">0</strong><span>Completed</span></div></div></header>
      <p id="klStatus" class="kl-status" role="status" aria-live="polite" hidden></p>
      <div class="kl-layout">
        <section class="card kl-form-card" id="klFormCard" aria-labelledby="klFormHeading"><h3 id="klFormHeading">Add a task or goal</h3><form id="klForm">
          <label for="klTitle">Title<input id="klTitle" name="title" required maxlength="180" autocomplete="off" placeholder="What do you want to get done?"></label>
          <div class="kl-form-row"><label for="klKind">Type<select id="klKind" name="kind"><option value="task">Task</option><option value="goal">Goal</option></select></label><label for="klPriority">Priority<select id="klPriority" name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label></div>
          <label for="klTargetDate">Target date <span class="kl-optional">optional</span><input id="klTargetDate" name="targetDate" type="date"></label>
          <label for="klNotes">Notes <span class="kl-optional">optional</span><textarea id="klNotes" name="notes" rows="3" maxlength="2000" placeholder="Add details or the next step."></textarea></label>
          <div class="kl-form-actions"><button type="submit" class="btn green" id="klSubmit">Add item</button><button type="button" class="btn secondary" id="klCancel" hidden>Cancel edit</button></div>
        </form></section>
        <section class="card kl-list-card" aria-labelledby="klListHeading"><div class="kl-list-heading"><h3 id="klListHeading" tabindex="-1">Your list</h3><span id="klTotalCount">0 items total</span></div>
          <div class="kl-filters" id="klFilters" role="group" aria-label="Filter your Kill List"><button type="button" data-filter="active" class="active" aria-pressed="true">Active <span id="klActiveFilterCount">0</span></button><button type="button" data-filter="completed" aria-pressed="false">Completed <span id="klCompletedFilterCount">0</span></button><button type="button" data-filter="all" aria-pressed="false">All</button></div>
          <ul class="kl-items" id="klItems"></ul><div id="klEmpty" class="kl-empty"><span aria-hidden="true" class="kl-empty-icon">&#10003;</span><h4 id="klEmptyTitle"></h4><p id="klEmptyText"></p></div>
        </section>
      </div>`;
    app.insertBefore(page, $('adminPage'));
    mounted = true;
    $('klForm').addEventListener('submit', saveForm);
    $('klForm').addEventListener('input', () => { dirty = true; });
    $('klForm').addEventListener('change', () => { dirty = true; });
    $('klCancel').addEventListener('click', () => { if (allowDiscard()) { resetForm(); message(''); } });
    $('klFilters').addEventListener('click', event => {
      const button = event.target.closest('button[data-filter]');
      if (!button) return;
      filter = button.dataset.filter;
      render();
    });
    $('klItems').addEventListener('click', event => {
      const button = event.target.closest('button[data-kl-action]');
      if (!button) return;
      const { klAction: action, id } = button.dataset;
      if (action === 'toggle') toggleItem(id);
      else if (action === 'edit') startEdit(id);
      else if (action === 'delete') deleteItem(id);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('[data-tab="killListPage"]')) queueMicrotask(render);
    });
    render();
  }

  window.lockedOsRenderKillList = () => { mount(); if (visible()) render(); };
  document.addEventListener('locked-os-day-changed', () => { if (visible()) render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible()) render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
