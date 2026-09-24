/* LOCKED OS UPDATE: append this block to the bottom of the existing app.js.
   Adds an independent Daily Checklist before Looksmaxxing. */
(() => {
  "use strict";

  // Install a separate first tab using the existing app.js/styles.css file names.
  function installChecklistPage() {
    const looksTab = document.querySelector('.tab[data-tab="looksPage"]');
    const looksPage = document.getElementById("looksPage");
    if (!looksTab || !looksPage || document.getElementById("lockedOsChecklistPage")) return;


    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab active";
    tab.dataset.tab = "lockedOsChecklistPage";
    tab.textContent = "Daily Checklist";
    looksTab.insertAdjacentElement("beforebegin", tab);

    const page = document.createElement("section");
    page.id = "lockedOsChecklistPage";
    page.className = "page active";
    page.innerHTML = `
      <section class="card locked-os-day-header">
        <div><p class="eyebrow">LOCKED OS · DAILY CHECKLIST</p>
          <h2 id="lockedOsDayLabel">Today</h2></div>
        <div class="locked-os-day-controls">
          <button class="btn secondary compact" id="lockedOsPreviousDay" type="button" aria-label="Previous day">← Previous</button>
          <button class="btn secondary compact" id="lockedOsToday" type="button">Today</button>
          <button class="btn secondary compact" id="lockedOsNextDay" type="button" aria-label="Next day">Next →</button>
        </div>
      </section>
      <div class="layout">
        <div>
          <section class="card summary">
            <div class="circle" id="lockedOsProgressCircle"><div class="circle-inner">
              <div class="percent" id="lockedOsPercent">0%</div><div class="done-count" id="lockedOsDoneCount">0 / 0</div>
            </div></div>
            <div><p class="quote">Your day, your plan.</p><p class="tasks-left" id="lockedOsTasksLeft">Loading your daily tasks…</p></div>
          </section>
          ${["morning", "afternoon", "night"].map(section => {
            const label = section[0].toUpperCase() + section.slice(1);
            return `<section class="card section"><div class="section-header locked-os-header-row">
              <h3>${label}</h3><button class="btn green compact" id="lockedOsAdd${label}" type="button">+ Add task</button>
              </div><div class="checklist" id="lockedOs${label}List"></div></section>`;
          }).join("")}
        </div>
        <aside class="mini-side"><section class="card panel-card day-streak-card">
          <div class="panel-title"><h3>Daily checklist streak</h3></div>
          <div class="day-streak-value"><strong id="lockedOsStreak">0</strong><span id="lockedOsStreakLabel">days</span></div>
          <p class="rank-copy">Finish or skip each task for the day to maintain this checklist's own streak.</p>
        </section></aside>
      </div>`;
    looksPage.insertAdjacentElement("beforebegin", page);
    looksTab.classList.remove("active");
    looksPage.classList.remove("active");

    // Existing tab listeners captured their tab/page lists before this add-on loaded.
    // Clear the new page and tab whenever one of those original tabs is selected.
    document.querySelectorAll(".tab").forEach(existingTab => {
      if (existingTab === tab) return;
      existingTab.addEventListener("click", () => {
        tab.classList.remove("active");
        page.classList.remove("active");
      });
    });

    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
      document.querySelectorAll(".page").forEach(item => item.classList.remove("active"));
      tab.classList.add("active");
      page.classList.add("active");
      render();
    });
  }

  installChecklistPage();

  const SECTION_NAMES = ["morning", "afternoon", "night"];
  const DAY_KEY = "lockedOsDone";
  const SKIP_KEY = "lockedOsSkipped";
  const COMPLETE_KEY = "lockedOsCompleted";
  let selectedDayKey = getTodayKey();
  let lastTodayKey = selectedDayKey;

  const el = id => document.getElementById(id);
  const validDay = key => /^\d{4}-\d{2}-\d{2}$/.test(String(key || ""));

  function catalog() {
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    let data = state.meta.lockedOsChecklist;
    if (!data || !Array.isArray(data.tasks)) {
      // Seed only once from the pre-existing main checklist, without linking future edits
      // or completion to either the original checklist or Looksmaxxing.
      data = { tasks: TASKS.map(task => ({ id: task.id, section: task.section, title: task.title })) };
      state.meta.lockedOsChecklist = data;
      for (const day of Object.values(state.days || {})) {
        if (!day || typeof day !== "object") continue;
        day[DAY_KEY] = Array.isArray(day.done) ? [...new Set(day.done)] : [];
        day[SKIP_KEY] = [];
      }
      recalculateDays(data.tasks);
      saveState();
    }
    return data;
  }

  function tasksFor(section) {
    return catalog().tasks.filter(task => task.section === section);
  }

  function getDay(key = selectedDayKey) {
    const day = ensureDay(key);
    if (!Array.isArray(day[DAY_KEY])) day[DAY_KEY] = [];
    if (!Array.isArray(day[SKIP_KEY])) day[SKIP_KEY] = [];
    return day;
  }

  function recalculateDays(tasks = catalog().tasks) {
    const validIds = new Set(tasks.map(task => task.id));
    for (const day of Object.values(state.days || {})) {
      if (!day || typeof day !== "object") continue;
      day[DAY_KEY] = [...new Set(Array.isArray(day[DAY_KEY]) ? day[DAY_KEY] : [])].filter(id => validIds.has(id));
      const doneSet = new Set(day[DAY_KEY]);
      day[SKIP_KEY] = [...new Set(Array.isArray(day[SKIP_KEY]) ? day[SKIP_KEY] : [])]
        .filter(id => validIds.has(id) && !doneSet.has(id));
      day[COMPLETE_KEY] = tasks.length > 0 && day[DAY_KEY].length + day[SKIP_KEY].length === tasks.length;
    }
  }

  function persistAndRender() {
    recalculateDays();
    saveState();
    renderDailyChecklist();
  }

  function changeStatus(task, kind) {
    const day = getDay();
    const done = new Set(day[DAY_KEY]);
    const skipped = new Set(day[SKIP_KEY]);
    if (kind === "done") {
      if (done.has(task.id)) done.delete(task.id);
      else { done.add(task.id); skipped.delete(task.id); }
    } else {
      if (skipped.has(task.id)) skipped.delete(task.id);
      else { skipped.add(task.id); done.delete(task.id); }
    }
    day[DAY_KEY] = [...done];
    day[SKIP_KEY] = [...skipped];
    persistAndRender();
  }

  function editTask(task, nextTitle) {
    const cleaned = String(nextTitle || "").trim().slice(0, 160);
    if (!cleaned) return;
    const existing = catalog().tasks.find(item => item.id === task.id);
    if (!existing) return;
    existing.title = cleaned;
    persistAndRender();
    toast("Task updated.");
  }

  function addTask(section, name, afterTaskId = null) {
    if (!SECTION_NAMES.includes(section)) return;
    const title = String(name || "").trim().slice(0, 160);
    if (!title) return;
    const data = catalog();
    const task = {
      id: `locked-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      section,
      title
    };
    const index = afterTaskId ? data.tasks.findIndex(item => item.id === afterTaskId) : -1;
    if (index >= 0 && data.tasks[index].section === section) data.tasks.splice(index + 1, 0, task);
    else {
      const lastIndex = data.tasks.reduce((value, item, i) => item.section === section ? i : value, -1);
      data.tasks.splice(lastIndex + 1, 0, task);
    }
    persistAndRender();
    toast("Task added.");
  }

  function deleteTask(task) {
    const data = catalog();
    data.tasks = data.tasks.filter(item => item.id !== task.id);
    for (const day of Object.values(state.days || {})) {
      if (!day || typeof day !== "object") continue;
      day[DAY_KEY] = (day[DAY_KEY] || []).filter(id => id !== task.id);
      day[SKIP_KEY] = (day[SKIP_KEY] || []).filter(id => id !== task.id);
    }
    persistAndRender();
    toast("Task deleted.");
  }

  function moveTask(section, taskId, offset) {
    const data = catalog();
    const grouped = data.tasks.filter(task => task.section === section);
    const index = grouped.findIndex(task => task.id === taskId);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= grouped.length) return;
    [grouped[index], grouped[next]] = [grouped[next], grouped[index]];
    updateSectionOrder(section, grouped.map(task => task.id));
  }

  function updateSectionOrder(section, ids) {
    const data = catalog();
    const reordered = ids.map(id => data.tasks.find(task => task.id === id))
      .filter(task => task && task.section === section);
    const originals = data.tasks.filter(task => task.section === section);
    if (reordered.length !== originals.length) return;
    const first = data.tasks.findIndex(task => task.section === section);
    data.tasks = data.tasks.filter(task => task.section !== section);
    data.tasks.splice(first, 0, ...reordered);
    persistAndRender();
  }

  function showAddForm(section, afterTaskId = null) {
    const list = el(`lockedOs${section[0].toUpperCase() + section.slice(1)}List`);
    if (!list) return;
    el("lockedOsAddForm")?.remove();
    const form = document.createElement("form");
    form.id = "lockedOsAddForm";
    form.className = "locked-os-add-form";
    const input = document.createElement("input");
    input.className = "task-inline-input";
    input.type = "text";
    input.maxLength = 160;
    input.placeholder = "New daily task";
    input.setAttribute("aria-label", `New ${section} task`);
    const add = document.createElement("button");
    add.type = "submit";
    add.className = "btn green compact";
    add.textContent = "Add";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn secondary compact";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => form.remove());
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      addTask(section, input.value, afterTaskId);
    });
    form.append(input, add, cancel);
    if (afterTaskId) {
      const row = [...list.querySelectorAll(".task-row")].find(item => item.dataset.taskId === afterTaskId);
      if (row) row.insertAdjacentElement("afterend", form);
      else list.prepend(form);
    } else list.appendChild(form);
    input.focus();
  }

  function renderSection(section, day) {
    const list = el(`lockedOs${section[0].toUpperCase() + section.slice(1)}List`);
    if (!list) return;
    list.replaceChildren();
    const done = new Set(day[DAY_KEY]);
    const skipped = new Set(day[SKIP_KEY]);
    const tasks = tasksFor(section);
    if (!tasks.length) {
      const empty = document.createElement("p");
      empty.className = "locked-os-empty";
      empty.textContent = "No tasks here yet. Add one to get started.";
      list.appendChild(empty);
    }
    for (const task of tasks) {
      const row = createTaskRow(
        { ...task, defaultTitle: task.title },
        done.has(task.id), skipped.has(task.id), "locked-os-task",
        () => changeStatus(task, "done"),
        () => changeStatus(task, "skipped"),
        title => editTask(task, title),
        { section, onDelete: () => deleteTask(task) }
      );
      row.dataset.taskId = task.id;
      row.draggable = true;
      row.addEventListener("dragstart", event => {
        if (row.classList.contains("editing")) { event.preventDefault(); return; }
        row.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
      });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
      const menu = row.querySelector(".task-menu-popover");
      if (menu) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "task-menu-action add-action";
        add.textContent = "Add task below";
        add.addEventListener("click", () => { row.querySelector("details").open = false; showAddForm(section, task.id); });
        menu.appendChild(add);
        for (const [text, delta] of [["Move up", -1], ["Move down", 1]]) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "task-menu-action";
          button.textContent = text;
          button.disabled = delta === -1 ? task.id === tasks[0].id : task.id === tasks[tasks.length - 1].id;
          button.addEventListener("click", () => moveTask(section, task.id, delta));
          menu.appendChild(button);
        }
      }
      list.appendChild(row);
    }
    list.ondragover = event => {
      const dragging = list.querySelector(".task-row.dragging");
      if (!dragging) return;
      event.preventDefault();
      const next = [...list.querySelectorAll(".task-row:not(.dragging)")]
        .find(row => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
      if (next) list.insertBefore(dragging, next);
      else list.appendChild(dragging);
    };
    list.ondrop = event => {
      if (!list.querySelector(".task-row.dragging")) return;
      event.preventDefault();
      updateSectionOrder(section, [...list.querySelectorAll(".task-row")].map(row => row.dataset.taskId));
    };
  }

  function countStreak() {
    let date = keyToLocalDate(getTodayKey());
    if (!state.days[getTodayKey()]?.[COMPLETE_KEY]) date = addDays(date, -1);
    let value = 0;
    while (value < 100000 && state.days[formatDateKey(date)]?.[COMPLETE_KEY]) {
      value += 1;
      date = addDays(date, -1);
    }
    return value;
  }

  function renderDailyChecklist() {
    if (!el("lockedOsChecklistPage")) return;
    const todayKey = getTodayKey();
    if (todayKey !== lastTodayKey) {
      if (selectedDayKey === lastTodayKey) selectedDayKey = todayKey;
      lastTodayKey = todayKey;
    }
    if (!validDay(selectedDayKey) || selectedDayKey > todayKey) selectedDayKey = todayKey;
    const data = catalog();
    const day = getDay(selectedDayKey);
    const tasks = data.tasks;
    const done = day[DAY_KEY].filter(id => tasks.some(task => task.id === id)).length;
    const skipped = day[SKIP_KEY].filter(id => tasks.some(task => task.id === id)).length;
    const total = tasks.length;
    const resolved = done + skipped;
    const percent = total ? Math.round(100 * resolved / total) : 0;
    el("lockedOsDayLabel").textContent = keyToLocalDate(selectedDayKey).toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
    el("lockedOsPercent").textContent = `${percent}%`;
    el("lockedOsDoneCount").textContent = skipped ? `${done} done · ${skipped} skipped` : `${done} / ${total}`;
    el("lockedOsTasksLeft").textContent = !total ? "Add tasks to build your daily checklist."
      : resolved === total ? "Daily checklist resolved." : `${total - resolved} task${total - resolved === 1 ? "" : "s"} left for this day.`;
    el("lockedOsProgressCircle").style.background = `conic-gradient(var(--green) ${percent * 3.6}deg, rgba(42,30,18,.09) 0deg)`;
    const streak = countStreak();
    el("lockedOsStreak").textContent = streak;
    el("lockedOsStreakLabel").textContent = streak === 1 ? "day" : "days";
    el("lockedOsNextDay").disabled = selectedDayKey >= getTodayKey();
    el("lockedOsToday").disabled = selectedDayKey === getTodayKey();
    SECTION_NAMES.forEach(section => renderSection(section, day));
  }

  // The existing app's renderer and Supabase sync continue to own persistence.
  const renderApp = render;
  render = function() {
    const result = renderApp.apply(this, arguments);
    renderDailyChecklist();
    return result;
  };

  SECTION_NAMES.forEach(section => {
    const button = el(`lockedOsAdd${section[0].toUpperCase() + section.slice(1)}`);
    button?.addEventListener("click", () => showAddForm(section));
  });
  el("lockedOsPreviousDay")?.addEventListener("click", () => {
    selectedDayKey = formatDateKey(addDays(keyToLocalDate(selectedDayKey), -1));
    renderDailyChecklist();
  });
  el("lockedOsNextDay")?.addEventListener("click", () => {
    if (selectedDayKey >= getTodayKey()) return;
    selectedDayKey = formatDateKey(addDays(keyToLocalDate(selectedDayKey), 1));
    renderDailyChecklist();
  });
  el("lockedOsToday")?.addEventListener("click", () => {
    selectedDayKey = getTodayKey();
    renderDailyChecklist();
  });
})();
