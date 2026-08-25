"use strict";

(() => {
  const ROUTINE_UPDATE_START = "2026-08-24";
  const MK_STARTED_DAY = "2026-08-24";
  const WHITENING_DAYS = new Set(["Monday", "Wednesday", "Thursday"]);

  function setupAdminSubtabs() {
    const buttons = [...document.querySelectorAll(".admin-subtab")];
    const panels = [...document.querySelectorAll(".admin-subpanel")];
    if (!buttons.length || !panels.length) return;

    const activate = panelId => {
      buttons.forEach(button => button.classList.toggle("active", button.dataset.adminPanel === panelId));
      panels.forEach(panel => panel.classList.toggle("active", panel.id === panelId));
      if (panelId === "weeklyPage" && typeof renderWeeklyReview === "function") renderWeeklyReview();
    };

    buttons.forEach(button => {
      button.addEventListener("click", () => activate(button.dataset.adminPanel));
    });
  }

  function renderGhkWeekPlanner() {
    const today = new Date().getDay();
    document.querySelectorAll(".ghk-day").forEach(day => {
      day.classList.toggle("today", Number(day.dataset.ghkDay) === today);
    });

    const badge = document.getElementById("ghkTodayBadge");
    if (!badge) return;
    badge.textContent = today >= 1 && today <= 5 ? "Today · morning" : "Weekend · no reminder";
  }

  function installSyncGuard() {
    if (
      typeof saveState !== "function" ||
      typeof saveLocalState !== "function" ||
      typeof applyRemoteState !== "function"
    ) return;

    const clientId = `locked-os-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    let localRevision = Number(state?.meta?.syncGuard?.revision) || 0;
    let localDirty = false;
    let saveInFlight = false;

    const baseApplyRemoteState = applyRemoteState;

    applyRemoteState = function guardedApplyRemoteState(remoteState, statusMessage = "Updated from Supabase.") {
      if (!remoteState || typeof remoteState !== "object") return false;

      const remoteGuard = remoteState?.meta?.syncGuard;
      if (
        remoteGuard?.clientId === clientId &&
        Number(remoteGuard.revision) <= localRevision
      ) {
        return false;
      }

      if (localDirty || saveInFlight || saveTimer) {
        if (syncStatus) syncStatus.textContent = "Saving local changes…";
        return false;
      }

      return baseApplyRemoteState(remoteState, statusMessage);
    };

    queueSupabaseSave = function guardedQueueSupabaseSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void saveSupabaseState();
      }, 250);
    };

    saveState = function guardedSaveState() {
      state.meta = state.meta || {};
      localRevision += 1;
      state.meta.syncGuard = {
        clientId,
        revision: localRevision
      };
      localDirty = true;
      saveLocalState();
      queueSupabaseSave();
    };

    saveSupabaseState = async function guardedSaveSupabaseState() {
      if (!supabaseClient) {
        if (syncStatus) syncStatus.textContent = "Saved locally. Supabase is not connected.";
        return false;
      }

      const snapshot = JSON.parse(JSON.stringify(state));
      const snapshotGuard = snapshot?.meta?.syncGuard;
      saveInFlight = true;
      if (syncStatus) syncStatus.textContent = "Saving…";

      try {
        const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert({
          id: SUPABASE_ROW_ID,
          state: snapshot,
          updated_at: new Date().toISOString()
        });

        if (error) {
          console.error(error);
          if (syncStatus) syncStatus.textContent = "Supabase save failed. Saved locally only.";
          return false;
        }

        const currentGuard = state?.meta?.syncGuard;
        if (
          snapshotGuard?.clientId === clientId &&
          currentGuard?.clientId === clientId &&
          Number(currentGuard.revision) === Number(snapshotGuard.revision)
        ) {
          localDirty = false;
        }

        if (syncStatus) syncStatus.textContent = "Saved to Supabase.";
        return true;
      } finally {
        saveInFlight = false;
      }
    };
  }

  function installRoutineUpdates() {
    if (
      typeof makeMorning !== "function" ||
      typeof makeNight !== "function" ||
      typeof makeMidday !== "function" ||
      typeof getRoutineDayName !== "function"
    ) return;

    // At DOMContentLoaded this captures the repo's existing workout/supplement
    // wrappers first, then layers the new routine changes on top.
    const previousMorning = makeMorning;
    const previousNight = makeNight;

    const updatedMorning = dayName => {
      const tasks = previousMorning(dayName).filter(task => task.id !== "thumb-pulling-morning");
      tasks.push({ id: "thumb-pulling-morning", title: "Thumb pulling" });
      return tasks;
    };

    const updatedNight = (dayName, dayKey) => {
      let tasks = previousNight(dayName, dayKey)
        .filter(task => task.id !== "whitening-strips")
        .filter(task => task.id !== "thumb-pulling-night");

      if (WHITENING_DAYS.has(dayName)) {
        tasks.unshift({ id: "whitening-strips", title: "Use Crest 3D White Strips" });
      }

      // Keep tretinoin on its configured nights while adding azelaic acid
      // every night. On tretinoin nights the order is azelaic acid, then tretinoin.
      if (!tasks.some(task => task.id === "azelaic-acid")) {
        const tretinoinIndex = tasks.findIndex(task => task.id === "tretinoin");
        const moisturizerIndex = tasks.findIndex(task => task.id === "night-moisturizer");
        const insertAt = tretinoinIndex >= 0
          ? tretinoinIndex
          : moisturizerIndex >= 0
            ? moisturizerIndex
            : tasks.length;

        tasks.splice(insertAt, 0, { id: "azelaic-acid", title: "Apply azelaic acid" });
      }

      // Thumb pulling is always the final task of the night.
      tasks.push({ id: "thumb-pulling-night", title: "Thumb pulling" });

      return tasks;
    };

    makeMorning = updatedMorning;
    makeNight = updatedNight;

    // Keep days before this update on their old task list so historical
    // completion/streak data is not retroactively changed.
    getLooksRoutine = function updatedLooksRoutine(dayKey = getTodayKey()) {
      const dayName = getRoutineDayName(dayKey);
      const isUpdatedDay = dayKey >= ROUTINE_UPDATE_START;

      return {
        morning: isUpdatedDay ? updatedMorning(dayName) : previousMorning(dayName),
        midday: makeMidday(dayKey),
        night: isUpdatedDay ? updatedNight(dayName, dayKey) : previousNight(dayName, dayKey)
      };
    };

    if (typeof getRotationTasksForDay === "function") {
      const previousRotationTasks = getRotationTasksForDay;
      getRotationTasksForDay = function updatedRotationTasks(dayKey) {
        const items = previousRotationTasks(dayKey);
        if (dayKey < ROUTINE_UPDATE_START) return items;

        const dayName = getRoutineDayName(dayKey);
        if (WHITENING_DAYS.has(dayName) && !items.some(item => item.label === "Teeth whitening")) {
          items.push({ label: "Teeth whitening", type: "grooming" });
        }
        return items;
      };
    }
  }

  function installMk677Updates() {
    if (typeof normalizeMk677State !== "function") return;

    const baseNormalizeMk677State = normalizeMk677State;

    normalizeMk677State = function normalizeMk677StateWithGlucose(original) {
      const normalized = baseNormalizeMk677State(original);
      const sourceMonitoring = original?.monitoring || {};

      normalized.currentDoseMg = 25;
      normalized.cycleStart = MK_STARTED_DAY;
      normalized.monitoring = {
        ...normalized.monitoring,
        glucose: optionalNumber(sourceMonitoring.glucose, 20, 600)
      };

      return normalized;
    };

    renderMkMonitoring = function renderGlucoseMonitoring() {
      state.mk677 = normalizeMk677State(state.mk677);
      const monitor = state.mk677?.monitoring || {};

      const dateEl = $("mkMonitorDate");
      const glucoseEl = $("mkMonitorGlucose");
      const badge = $("mkMonitorSavedBadge");

      if (dateEl) dateEl.value = monitor.date || getTodayKey();
      if (glucoseEl) glucoseEl.value = Number.isFinite(monitor.glucose) ? String(monitor.glucose) : "";
      if (badge) badge.textContent = monitor.date && Number.isFinite(monitor.glucose)
        ? `${monitor.glucose} mg/dL · ${formatMkDate(monitor.date)}`
        : "Not saved";
    };

    saveMkMonitoring = function saveGlucoseMonitoring() {
      state.mk677 = normalizeMk677State(state.mk677);

      const date = $("mkMonitorDate")?.value || getTodayKey();
      const rawGlucose = $("mkMonitorGlucose")?.value ?? "";

      if (!isDateKey(date)) {
        setMkStatus("mkMonitoringStatus", "Choose a valid date.", "bad");
        return;
      }

      const glucose = optionalNumber(rawGlucose, 20, 600);
      if (!Number.isFinite(glucose)) {
        setMkStatus("mkMonitoringStatus", "Enter a glucose reading.", "bad");
        $("mkMonitorGlucose")?.focus();
        return;
      }

      state.mk677.monitoring = {
        ...state.mk677.monitoring,
        date,
        glucose
      };

      saveState();
      renderMk677();
      setMkStatus("mkMonitoringStatus", `Saved ${glucose} mg/dL for ${formatMkDate(date)}.`, "good");
      toast("Glucose check-in saved.");
    };
  }

  function configureMk677Ui() {
    const page = document.getElementById("mk677Page");
    if (!page) return;

    const heroCopy = page.querySelector(".mk-hero-copy > p:last-child");
    if (heroCopy) {
      heroCopy.textContent = "Weekly plan, current dose, glucose check-ins, and weight progress.";
    }

    const doseDisplay = document.getElementById("mkCurrentDoseDisplay");
    if (doseDisplay) doseDisplay.textContent = "25 mg";

    page.querySelector(".mk-notes-card")?.remove();
    page.querySelector(".mk-settings-card.mk-settings-bottom")?.remove();

    const compactGrid = page.querySelector(".mk-compact-grid");
    if (compactGrid) compactGrid.style.gridTemplateColumns = "1fr";

    const monitorCard = page.querySelector(".mk-monitor-card");
    if (!monitorCard) return;

    const heading = monitorCard.querySelector(".panel-title h3");
    if (heading) heading.textContent = "Glucose check-in";

    const eyebrow = monitorCard.querySelector(".panel-title .eyebrow");
    if (eyebrow) eyebrow.textContent = "Monitoring";

    const form = monitorCard.querySelector(".mk-monitor-form");
    if (!form) return;

    form.innerHTML = `
      <label class="mk-field">
        <span>Date</span>
        <input id="mkMonitorDate" type="date" />
      </label>
      <label class="mk-field">
        <span>Blood glucose</span>
        <div class="mk-input-unit">
          <input
            id="mkMonitorGlucose"
            inputmode="decimal"
            min="20"
            max="600"
            step="1"
            placeholder="Enter reading"
            type="number"
          />
          <span>mg/dL</span>
        </div>
      </label>
      <button class="btn blue" id="saveMkMonitoringBtn" type="button">Save glucose</button>
      <p aria-live="polite" class="mk-save-status" id="mkMonitoringStatus"></p>`;

    document.getElementById("saveMkMonitoringBtn")?.addEventListener("click", saveMkMonitoring);
    document.getElementById("mkMonitorGlucose")?.addEventListener("keydown", event => {
      if (event.key === "Enter") saveMkMonitoring();
    });
  }

  installSyncGuard();

  window.addEventListener("DOMContentLoaded", () => {
    // The inline workout/supplement compatibility layer in index.html runs
    // before this listener, so these updates preserve those existing changes.
    installRoutineUpdates();
    installMk677Updates();
    configureMk677Ui();

    state.mk677 = normalizeMk677State(state.mk677);
    saveLocalState();

    setupAdminSubtabs();
    renderGhkWeekPlanner();

    if (!mainApp.classList.contains("hidden")) render();
  });
})();
/*
 * Looksmaxxing custom task manager
 * Adds persistent custom tasks plus drag-and-drop ordering to Morning/Midday/Night.
 * Stored inside the existing state.meta object, so it follows the app's existing
 * localStorage + Supabase save path.
 */
(() => {
  const SECTION_BY_LIST_ID = {
    looksMorningList: "morning",
    looksMiddayList: "midday",
    looksNightList: "night"
  };
  const LIST_ID_BY_SECTION = {
    morning: "looksMorningList",
    midday: "looksMiddayList",
    night: "looksNightList"
  };
  const SECTION_LABEL = {
    morning: "Morning",
    midday: "Midday",
    night: "Night"
  };

  let activeReorderSection = null;
  let draggedTaskId = null;

  function ensureManagerState() {
    state.meta = state.meta || {};

    if (!Array.isArray(state.meta.looksCustomTasks)) {
      state.meta.looksCustomTasks = [];
    }

    if (!state.meta.looksTaskOrder || typeof state.meta.looksTaskOrder !== "object" || Array.isArray(state.meta.looksTaskOrder)) {
      state.meta.looksTaskOrder = {};
    }

    if (!state.meta.looksTaskDeletes || typeof state.meta.looksTaskDeletes !== "object" || Array.isArray(state.meta.looksTaskDeletes)) {
      state.meta.looksTaskDeletes = {};
    }

    for (const section of Object.keys(LIST_ID_BY_SECTION)) {
      if (!Array.isArray(state.meta.looksTaskOrder[section])) {
        state.meta.looksTaskOrder[section] = [];
      }
    }

    state.meta.looksCustomTasks = state.meta.looksCustomTasks
      .filter(task => task && typeof task === "object")
      .map(task => ({
        id: String(task.id || ""),
        title: String(task.title || "").trim().slice(0, 160),
        section: ["morning", "midday", "night"].includes(task.section) ? task.section : "morning",
        startDayKey: isDateKey(task.startDayKey) ? task.startDayKey : getTodayKey()
      }))
      .filter(task => task.id && task.title);
  }

  function isTaskDeletedOn(taskId, dayKey) {
    ensureManagerState();
    const deletedFrom = state.meta.looksTaskDeletes?.[taskId];
    return isDateKey(deletedFrom) && dayKey >= deletedFrom;
  }

  function getCustomTasksFor(section, dayKey) {
    ensureManagerState();
    return state.meta.looksCustomTasks
      .filter(task =>
        task.section === section &&
        task.startDayKey <= dayKey &&
        !isTaskDeletedOn(task.id, dayKey)
      )
      .map(task => ({
        id: task.id,
        title: task.title,
        customTask: true
      }));
  }

  function orderTasks(section, tasks) {
    ensureManagerState();

    const order = state.meta.looksTaskOrder[section];
    const index = new Map(order.map((id, i) => [id, i]));

    return tasks
      .map((task, originalIndex) => ({ task, originalIndex }))
      .sort((a, b) => {
        const ai = index.has(a.task.id) ? index.get(a.task.id) : Number.MAX_SAFE_INTEGER;
        const bi = index.has(b.task.id) ? index.get(b.task.id) : Number.MAX_SAFE_INTEGER;
        return ai - bi || a.originalIndex - b.originalIndex;
      })
      .map(item => item.task);
  }

  function persistVisibleOrder(section, element) {
    ensureManagerState();

    const visibleIds = [...element.querySelectorAll(".task-row[data-looks-task-id]")]
      .map(row => row.dataset.looksTaskId)
      .filter(Boolean);

    const hiddenOrFutureIds = state.meta.looksTaskOrder[section]
      .filter(id => !visibleIds.includes(id));

    state.meta.looksTaskOrder[section] = [...visibleIds, ...hiddenOrFutureIds];
    saveState();
  }

  function addCustomTask(section, rawTitle) {
    ensureManagerState();

    const title = String(rawTitle || "").trim().slice(0, 160);
    if (!title) return false;

    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    state.meta.looksCustomTasks.push({
      id,
      title,
      section,
      startDayKey: getTodayKey()
    });

    state.meta.looksTaskOrder[section].push(id);
    saveState();
    render();
    toast("Task added.");
    return true;
  }

  function deleteLooksTask(task) {
    ensureManagerState();

    const title = getLooksTaskTitle(task);
    const confirmed = window.confirm(`Delete "${title}" from your Looksmaxxing routine?`);
    if (!confirmed) return;

    state.meta.looksTaskDeletes[task.id] = getTodayKey();

    for (const section of Object.keys(LIST_ID_BY_SECTION)) {
      state.meta.looksTaskOrder[section] = state.meta.looksTaskOrder[section].filter(id => id !== task.id);
    }

    activeReorderSection = null;
    saveState();
    render();
    toast("Task deleted.");
  }

  function installStyles() {
    if (document.getElementById("looksTaskManagerStyles")) return;

    const style = document.createElement("style");
    style.id = "looksTaskManagerStyles";
    style.textContent = `
      .looks-task-manager-controls {
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .looks-add-task-btn {
        appearance: none;
        border: 1px dashed rgba(37,132,184,.42);
        background: rgba(37,132,184,.06);
        color: #176a98;
        border-radius: 12px;
        padding: 9px 13px;
        font: inherit;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      .looks-add-task-btn:hover {
        background: rgba(37,132,184,.11);
      }
      .looks-task-add-form {
        width: 100%;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 8px;
        align-items: center;
      }
      .looks-task-add-form input {
        width: 100%;
        min-width: 0;
        border: 1px solid rgba(42,30,18,.16);
        border-radius: 12px;
        background: #fffdf8;
        color: inherit;
        padding: 10px 12px;
        font: inherit;
        outline: none;
      }
      .looks-task-add-form input:focus {
        border-color: rgba(37,132,184,.65);
        box-shadow: 0 0 0 3px rgba(37,132,184,.10);
      }
      .looks-reorder-banner {
        margin: 10px 0 0;
        padding: 9px 11px;
        border-radius: 11px;
        background: rgba(37,132,184,.08);
        color: #176a98;
        font-size: 12px;
        font-weight: 800;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .looks-reorder-done {
        appearance: none;
        border: 0;
        border-radius: 9px;
        padding: 6px 10px;
        background: #2584b8;
        color: white;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .checklist.looks-reordering .task-row {
        cursor: grab;
        user-select: none;
        border-color: rgba(37,132,184,.28);
      }
      .checklist.looks-reordering .task-row:active {
        cursor: grabbing;
      }
      .checklist.looks-reordering .task-row.dragging {
        opacity: .45;
        transform: scale(.99);
      }
      .checklist.looks-reordering .task-row.drag-over {
        box-shadow: 0 -3px 0 #2584b8;
      }
      .task-menu-action.reorder-action {
        color: #176a98;
        font-weight: 800;
      }
      .task-menu-action.delete-custom-action {
        color: #a2372a;
      }
      @media (max-width: 620px) {
        .looks-task-add-form {
          grid-template-columns: 1fr 1fr;
        }
        .looks-task-add-form input {
          grid-column: 1 / -1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function installAddControls() {
    for (const [section, listId] of Object.entries(LIST_ID_BY_SECTION)) {
      const list = document.getElementById(listId);
      const card = list?.closest(".card.section");
      if (!list || !card || card.querySelector(`[data-task-manager-controls="${section}"]`)) continue;

      const controls = document.createElement("div");
      controls.className = "looks-task-manager-controls";
      controls.dataset.taskManagerControls = section;

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "looks-add-task-btn";
      addButton.textContent = "+ Add task";

      const showForm = () => {
        if (controls.querySelector(".looks-task-add-form")) return;

        addButton.hidden = true;

        const form = document.createElement("div");
        form.className = "looks-task-add-form";

        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 160;
        input.placeholder = `Add ${SECTION_LABEL[section].toLowerCase()} task`;
        input.setAttribute("aria-label", `Add ${SECTION_LABEL[section]} task`);

        const save = document.createElement("button");
        save.type = "button";
        save.className = "btn blue compact";
        save.textContent = "Add";

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "btn secondary compact";
        cancel.textContent = "Cancel";

        const close = () => {
          form.remove();
          addButton.hidden = false;
        };

        const submit = () => {
          if (!addCustomTask(section, input.value)) {
            input.focus();
            return;
          }
          close();
        };

        save.addEventListener("click", submit);
        cancel.addEventListener("click", close);
        input.addEventListener("keydown", event => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        });

        form.append(input, save, cancel);
        controls.appendChild(form);
        requestAnimationFrame(() => input.focus());
      };

      addButton.addEventListener("click", showForm);
      controls.appendChild(addButton);
      list.insertAdjacentElement("afterend", controls);
    }
  }

  function setReorderMode(section, enabled) {
    activeReorderSection = enabled ? section : null;
    render();
    if (enabled) toast("Drag tasks to reorder them.");
  }

  function decorateMenu(row, task, section) {
    const popover = row.querySelector(".task-menu-popover");
    if (!popover) return;

    const reorder = document.createElement("button");
    reorder.type = "button";
    reorder.className = "task-menu-action reorder-action";
    reorder.textContent = activeReorderSection === section ? "Finish reordering" : "Reorder this list";
    reorder.addEventListener("click", event => {
      event.stopPropagation();
      row.querySelector("details.task-menu")?.removeAttribute("open");
      setReorderMode(section, activeReorderSection !== section);
    });
    popover.appendChild(reorder);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task-menu-action delete-custom-action";
    remove.textContent = "Delete task";
    remove.addEventListener("click", event => {
      event.stopPropagation();
      row.querySelector("details.task-menu")?.removeAttribute("open");
      deleteLooksTask(task);
    });
    popover.appendChild(remove);
  }

  function enableDragForRow(row, section, element) {
    row.draggable = true;

    row.addEventListener("dragstart", event => {
      draggedTaskId = row.dataset.looksTaskId;
      row.classList.add("dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedTaskId || "");
      }
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      element.querySelectorAll(".drag-over").forEach(item => item.classList.remove("drag-over"));
      persistVisibleOrder(section, element);
      draggedTaskId = null;
      render();
    });

    row.addEventListener("dragover", event => {
      event.preventDefault();
      if (!draggedTaskId || row.dataset.looksTaskId === draggedTaskId) return;

      element.querySelectorAll(".drag-over").forEach(item => item.classList.remove("drag-over"));
      row.classList.add("drag-over");

      const dragging = element.querySelector(`.task-row[data-looks-task-id="${CSS.escape(draggedTaskId)}"]`);
      if (!dragging) return;

      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      element.insertBefore(dragging, before ? row : row.nextSibling);
    });

    row.addEventListener("drop", event => {
      event.preventDefault();
      row.classList.remove("drag-over");
    });
  }

  function addReorderBanner(section, element) {
    const card = element.closest(".card.section");
    const existing = card?.querySelector(".looks-reorder-banner");
    if (existing) existing.remove();

    if (activeReorderSection !== section || !card) return;

    const banner = document.createElement("div");
    banner.className = "looks-reorder-banner";
    banner.innerHTML = `<span>Drag any task to a new position.</span>`;

    const done = document.createElement("button");
    done.type = "button";
    done.className = "looks-reorder-done";
    done.textContent = "Done";
    done.addEventListener("click", () => setReorderMode(section, false));

    banner.appendChild(done);
    const header = card.querySelector(".section-header");
    header?.insertAdjacentElement("afterend", banner);
  }

  function installRoutineWrapper() {
    ensureManagerState();

    const baseGetLooksRoutine = getLooksRoutine;
    getLooksRoutine = function getLooksRoutineWithCustomTasks(dayKey = getTodayKey()) {
      const routine = baseGetLooksRoutine(dayKey);

      return {
        morning: orderTasks("morning", [
          ...routine.morning.filter(task => !isTaskDeletedOn(task.id, dayKey)),
          ...getCustomTasksFor("morning", dayKey)
        ]),
        midday: orderTasks("midday", [
          ...routine.midday.filter(task => !isTaskDeletedOn(task.id, dayKey)),
          ...getCustomTasksFor("midday", dayKey)
        ]),
        night: orderTasks("night", [
          ...routine.night.filter(task => !isTaskDeletedOn(task.id, dayKey)),
          ...getCustomTasksFor("night", dayKey)
        ])
      };
    };
  }

  function installRenderer() {
    renderLooksTaskList = function renderLooksTaskListWithManager(element, tasks, day) {
      element.innerHTML = "";

      const section = SECTION_BY_LIST_ID[element.id];
      const done = new Set(day.looksDone);
      const skipped = new Set(day.looksSkipped);
      const orderedTasks = section ? orderTasks(section, tasks) : tasks;

      element.classList.toggle("looks-reordering", activeReorderSection === section);

      for (const task of orderedTasks) {
        const displayTask = {
          ...task,
          title: getLooksTaskTitle(task),
          defaultTitle: task.title
        };

        const toggle = () => {
          if (activeReorderSection === section) return;

          if (task.meta === "waterTracked") {
            $("waterCard").scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
          setLooksStatus(task, "done");
        };

        const row = createTaskRow(
          displayTask,
          done.has(task.id),
          skipped.has(task.id),
          "looks-task",
          toggle,
          () => setLooksStatus(task, "skipped"),
          nextTitle => saveLooksTaskEdit(task, nextTitle)
        );

        row.dataset.looksTaskId = task.id;
        row.dataset.looksTaskSection = section || "";

        if (section) {
          decorateMenu(row, task, section);

          if (activeReorderSection === section) {
            enableDragForRow(row, section, element);
          }
        }

        element.appendChild(row);
      }

      if (section) addReorderBanner(section, element);
    };
  }

  function installMeaningfulStateWrapper() {
    if (typeof hasMeaningfulState !== "function") return;

    const baseHasMeaningfulState = hasMeaningfulState;
    hasMeaningfulState = function hasMeaningfulStateWithTaskManager(snapshot) {
      if (baseHasMeaningfulState(snapshot)) return true;
      return (
        Array.isArray(snapshot?.meta?.looksCustomTasks) &&
        snapshot.meta.looksCustomTasks.length > 0
      ) || (
        snapshot?.meta?.looksTaskOrder &&
        Object.values(snapshot.meta.looksTaskOrder).some(value => Array.isArray(value) && value.length > 0)
      ) || (
        snapshot?.meta?.looksTaskDeletes &&
        Object.keys(snapshot.meta.looksTaskDeletes).length > 0
      );
    };
  }

  window.addEventListener("DOMContentLoaded", () => {
    installStyles();
    ensureManagerState();
    installRoutineWrapper();
    installRenderer();
    installMeaningfulStateWrapper();
    installAddControls();

    saveLocalState();

    if (!mainApp.classList.contains("hidden")) render();
  });
})();
