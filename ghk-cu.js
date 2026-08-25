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
      // every night. On tretinoin nights azelaic acid comes immediately after it.
      if (!tasks.some(task => task.id === "azelaic-acid")) {
        const tretinoinIndex = tasks.findIndex(task => task.id === "tretinoin");
        const moisturizerIndex = tasks.findIndex(task => task.id === "night-moisturizer");
        const insertAt = tretinoinIndex >= 0
          ? tretinoinIndex + 1
          : moisturizerIndex >= 0
            ? moisturizerIndex
            : tasks.length;

        tasks.splice(insertAt, 0, { id: "azelaic-acid", title: "Apply azelaic acid" });
      }

      const lipCareIndex = tasks.findIndex(task => task.id === "lip-care");
      const thumbTask = { id: "thumb-pulling-night", title: "Thumb pulling" };
      if (lipCareIndex >= 0) tasks.splice(lipCareIndex, 0, thumbTask);
      else tasks.push(thumbTask);

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
