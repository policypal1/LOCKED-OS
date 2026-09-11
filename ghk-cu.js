"use strict";

/*
  LOCKED OS hotfix — Sept 11
  Loads the exact current site behavior, then fixes gym schedule persistence,
  immediate Gym-tab syncing, rotation-calendar filtering/colors, and MK-677 chips.
*/
(() => {
  const pinnedCurrentFile = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@956e7d4a72fc88ba31158ce9338ac793b58b8c31/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", pinnedCurrentFile, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-pre-gym-hotfix.js");
  } catch (error) {
    console.error("LOCKED OS: could not load the pinned pre-hotfix ghk-cu.js.", error);
  }
})();

(() => {
  "use strict";

  const FLAG = "__lockedOsSept11GymPersistenceHotfix";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const FIRST_SUPPORTED_DAY = "2026-09-11";
  const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const EDITOR_DAY_ORDER = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
  const ALLOWED_WORKOUTS = new Set(["Chest + side delts", "Back + rear delts", "Arms", "Legs + Abs"]);
  const ALLOWED_OVERRIDES = new Set([...ALLOWED_WORKOUTS, "Rest"]);
  const FALLBACK_SCHEDULE = {
    Monday: "Chest + side delts",
    Wednesday: "Back + rear delts",
    Friday: "Arms",
    Saturday: "Legs + Abs"
  };
  const LEGACY_GYM_DAY_PLAN = {
    Sunday: "Legs + Abs",
    Monday: "Rest",
    Tuesday: "Chest + side delts",
    Wednesday: "Back + rear delts",
    Thursday: "Rest",
    Friday: "Arms",
    Saturday: "Rest"
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureGymState() {
    state.meta = state.meta || {};
    if (!Array.isArray(state.meta.gymScheduleChanges)) state.meta.gymScheduleChanges = [];
    if (!state.meta.gymTracker || typeof state.meta.gymTracker !== "object" || Array.isArray(state.meta.gymTracker)) {
      state.meta.gymTracker = { sessions: [], overrides: {} };
    }
    if (!Array.isArray(state.meta.gymTracker.sessions)) state.meta.gymTracker.sessions = [];
    if (!state.meta.gymTracker.overrides || typeof state.meta.gymTracker.overrides !== "object" || Array.isArray(state.meta.gymTracker.overrides)) {
      state.meta.gymTracker.overrides = {};
    }
    if (!Array.isArray(state.meta.gymRecurringManagedKeys)) state.meta.gymRecurringManagedKeys = [];
  }

  function normalizeSchedule(schedule) {
    const output = {};
    if (!schedule || typeof schedule !== "object") return output;
    for (const day of DAY_ORDER) {
      const value = String(schedule[day] || "").trim();
      if (ALLOWED_WORKOUTS.has(value)) output[day] = value;
    }
    return output;
  }

  function getScheduleChanges() {
    ensureGymState();
    return state.meta.gymScheduleChanges
      .filter(change => change && isDateKey(change.effectiveDayKey))
      .map(change => ({
        effectiveDayKey: change.effectiveDayKey,
        schedule: normalizeSchedule(change.schedule)
      }))
      .sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));
  }

  function scheduleForDay(dayKey = getTodayKey()) {
    let schedule = dayKey >= FIRST_SUPPORTED_DAY ? { ...FALLBACK_SCHEDULE } : {};
    for (const change of getScheduleChanges()) {
      if (change.effectiveDayKey <= dayKey) schedule = { ...change.schedule };
      else break;
    }
    return schedule;
  }

  function isManualOverride(dayKey) {
    ensureGymState();
    const managed = new Set(state.meta.gymRecurringManagedKeys);
    return Object.prototype.hasOwnProperty.call(state.meta.gymTracker.overrides, dayKey) && !managed.has(dayKey);
  }

  function workoutForDay(dayKey = getTodayKey()) {
    ensureGymState();
    if (isManualOverride(dayKey)) {
      const manual = state.meta.gymTracker.overrides[dayKey];
      if (manual === "Rest") return "";
      if (ALLOWED_WORKOUTS.has(manual)) return manual;
    }
    const schedule = scheduleForDay(dayKey);
    return schedule[getRoutineDayName(dayKey)] || "";
  }

  function clearManagedOverridesFrom(startKey) {
    ensureGymState();
    const managed = new Set(state.meta.gymRecurringManagedKeys);
    for (const key of [...managed]) {
      if (key < startKey) continue;
      delete state.meta.gymTracker.overrides[key];
      managed.delete(key);
    }
    state.meta.gymRecurringManagedKeys = [...managed].sort();
  }

  function syncRecurringSchedule(startKey = getTodayKey()) {
    ensureGymState();
    clearManagedOverridesFrom(startKey);

    const managed = new Set(state.meta.gymRecurringManagedKeys);
    const overrides = state.meta.gymTracker.overrides;
    const startDate = keyToLocalDate(startKey);

    for (let offset = 0; offset < 400; offset += 1) {
      const dayKey = formatDateKey(addDays(startDate, offset));
      if (Object.prototype.hasOwnProperty.call(overrides, dayKey) && !managed.has(dayKey)) {
        /* A date the user manually changed in the Gym tab always wins. */
        continue;
      }

      const desired = scheduleForDay(dayKey)[getRoutineDayName(dayKey)] || "Rest";
      const legacy = LEGACY_GYM_DAY_PLAN[getRoutineDayName(dayKey)] || "Rest";

      if (desired !== legacy) {
        overrides[dayKey] = desired;
        managed.add(dayKey);
      } else {
        delete overrides[dayKey];
        managed.delete(dayKey);
      }
    }

    state.meta.gymRecurringManagedKeys = [...managed].sort();
  }

  function collectEditorSchedule() {
    const editor = document.getElementById("gymScheduleEditor");
    if (!editor) return { ok: false, error: "Gym schedule editor is not available." };

    const schedule = {};
    const activeRows = [...editor.querySelectorAll(".gym-day-editor-row.active")];
    if (activeRows.length < 3 || activeRows.length > 4) {
      return { ok: false, error: "Choose 3 or 4 training days." };
    }

    for (const row of activeRows) {
      const day = row.dataset.day;
      const value = String(row.querySelector(".gym-day-workout")?.value || "").trim();
      if (!ALLOWED_WORKOUTS.has(value)) {
        return { ok: false, error: `Choose a workout for ${day}.`, focus: row.querySelector(".gym-day-workout") };
      }
      schedule[day] = value;
    }
    return { ok: true, schedule };
  }

  function saveEditorSchedule() {
    ensureGymState();
    const result = collectEditorSchedule();
    const errorEl = document.getElementById("gymScheduleError");
    if (!result.ok) {
      if (errorEl) errorEl.textContent = result.error;
      result.focus?.focus();
      return;
    }

    const startInput = document.getElementById("gymScheduleStartDate");
    const startKey = isDateKey(startInput?.value) ? startInput.value : getTodayKey();
    if (errorEl) errorEl.textContent = "";

    /*
      One schedule is authoritative from its start date forward. Any previously
      queued future schedule is removed so it cannot silently reset this one later.
    */
    state.meta.gymScheduleChanges = getScheduleChanges()
      .filter(change => change.effectiveDayKey < startKey);
    state.meta.gymScheduleChanges.push({
      effectiveDayKey: startKey,
      schedule: clone(result.schedule)
    });
    state.meta.gymScheduleChanges.sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));

    syncRecurringSchedule(startKey);
    saveState();

    populateEditorForDate(startKey);
    refreshGymTab();
    try { render(); } catch (_) {}
    try { if (typeof renderRotationCalendar === "function") renderRotationCalendar(); } catch (_) {}
    try { if (typeof renderWeeklyReview === "function") renderWeeklyReview(); } catch (_) {}
    if (typeof toast === "function") toast(`Gym schedule saved from ${startKey}.`);
  }

  function refreshGymTab() {
    const today = getTodayKey();
    const input = document.getElementById("gymDateInput");
    if (input) input.value = today;

    const todayButton = document.getElementById("gymTodayBtn");
    if (todayButton) {
      todayButton.click();
      return;
    }

    if (input) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function populateEditorForDate(dayKey = getTodayKey()) {
    const editor = document.getElementById("gymScheduleEditor");
    if (!editor) return;
    const schedule = scheduleForDay(dayKey);

    for (const row of editor.querySelectorAll(".gym-day-editor-row")) {
      const day = row.dataset.day;
      const active = Boolean(schedule[day]);
      row.classList.toggle("active", active);
      const button = row.querySelector(".gym-day-toggle");
      const select = row.querySelector(".gym-day-workout");
      if (button) {
        button.setAttribute("aria-pressed", active ? "true" : "false");
        const small = button.querySelector("small");
        if (small) small.textContent = active ? "Training" : "Rest";
      }
      if (select) {
        select.disabled = !active;
        select.value = schedule[day] || "";
      }
    }

    const count = Object.keys(schedule).length;
    const countEl = document.getElementById("gymScheduleCount");
    if (countEl) countEl.textContent = `${count} training day${count === 1 ? "" : "s"} selected`;
  }

  function reorderGymEditor() {
    const editor = document.getElementById("gymScheduleEditor");
    if (!editor) return;
    for (const day of EDITOR_DAY_ORDER) {
      const row = editor.querySelector(`.gym-day-editor-row[data-day="${day}"]`);
      if (row) editor.appendChild(row);
    }
  }

  function installStartDateControl() {
    const card = document.getElementById("gymScheduleAdminCard");
    const editor = document.getElementById("gymScheduleEditor");
    if (!card || !editor) return;

    let wrap = document.getElementById("gymScheduleStartWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "gymScheduleStartWrap";
      wrap.className = "gym-schedule-start-wrap";
      wrap.innerHTML = `
        <label for="gymScheduleStartDate">
          <span>Schedule starts</span>
          <input id="gymScheduleStartDate" type="date" />
        </label>
        <small>Pick the date this schedule should begin. Set to today for an immediate change.</small>`;
      card.insertBefore(wrap, editor);
    }

    const input = document.getElementById("gymScheduleStartDate");
    if (input && !input.value) input.value = getTodayKey();
    if (input && input.dataset.hotfixBound !== "true") {
      input.dataset.hotfixBound = "true";
      input.addEventListener("change", () => {
        if (isDateKey(input.value)) populateEditorForDate(input.value);
      });
    }
  }

  function replaceSaveButton() {
    const oldButton = document.getElementById("saveGymScheduleBtn");
    if (!oldButton || oldButton.dataset.hotfixBound === "true") return;

    /* Cloning intentionally removes the old handlers that delayed changes to Sep 13. */
    const button = oldButton.cloneNode(true);
    button.dataset.hotfixBound = "true";
    oldButton.replaceWith(button);
    button.addEventListener("click", saveEditorSchedule);
  }

  function installRoutineOverrides() {
    if (typeof window.getLooksRoutine !== "function") return;
    const previousGetLooksRoutine = window.getLooksRoutine;

    window.getLooksRoutine = function(dayKey = getTodayKey()) {
      const routine = previousGetLooksRoutine(dayKey);
      if (!routine || typeof routine !== "object") return routine;

      /* Final authority for gym: manual date override first, recurring schedule second. */
      routine.midday = Array.isArray(routine.midday)
        ? routine.midday.filter(task => task?.id !== "gym")
        : [];
      const workout = workoutForDay(dayKey);
      if (workout) routine.midday.unshift({ id: "gym", title: `Gym: ${workout}` });
      return routine;
    };

    window.getWorkoutName = function(dayKey = getTodayKey()) {
      return workoutForDay(dayKey) || "Rest day";
    };

    window.getWeeklyGymStatus = function(dayKey, day) {
      const workout = workoutForDay(dayKey);
      if (!workout) return "Rest day";
      const sessions = Array.isArray(state?.meta?.gymTracker?.sessions) ? state.meta.gymTracker.sessions : [];
      const logged = sessions.some(session => session?.date === dayKey && session?.completed);
      const done = new Set(day?.looksDone || []);
      if (logged || done.has("gym")) return "Done";
      if (dayKey === getTodayKey()) return "Not yet";
      return "Didn't go";
    };

    window.getRotationTasksForDay = function(dayKey) {
      const dayName = getRoutineDayName(dayKey);
      const items = [];
      const workout = workoutForDay(dayKey);
      if (workout) items.push({ label: `Gym: ${workout}`, type: "gym" });

      /* MK-677 is Mon-Fri, so it belongs in the rotation calendar. */
      const jsDay = keyToLocalDate(dayKey).getDay();
      if (jsDay >= 1 && jsDay <= 5) {
        items.push({ label: "MK-677", type: "mk677" });
      }

      if (typeof getTretinoinDays === "function" && getTretinoinDays(dayKey).includes(dayName)) {
        items.push({ label: "Tretinoin", type: "tretinoin" });
      }
      if (dayName === "Monday" || dayName === "Thursday") {
        items.push({ label: "Shave + manage eyebrows", type: "shave" });
      }
      if (dayName === "Wednesday" || dayName === "Sunday") {
        items.push({ label: "Microneedling", type: "microneedle" });
        items.push({ label: "Wash bed sheets", type: "sheets" });
      }
      if (dayName === "Sunday") {
        items.push({ label: "Lip exfoliation", type: "lips" });
      }

      const customTasks = Array.isArray(state?.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [];
      const existing = new Set(items.map(item => String(item.label || "").trim().toLowerCase()));
      for (const task of customTasks) {
        const days = Array.isArray(task?.days) ? task.days.filter(day => DAY_ORDER.includes(day)) : [];
        /* Every-day custom tasks do not belong in a rotation-only calendar. */
        if (!days.length || days.length >= 7 || !days.includes(dayName)) continue;
        const label = String(task?.title || "").trim();
        if (!label || existing.has(label.toLowerCase())) continue;
        items.push({ label, type: "custom" });
        existing.add(label.toLowerCase());
      }
      return items;
    };
  }

  function installStyles() {
    if (document.getElementById("lockedOsGymPersistenceStyles")) return;
    const style = document.createElement("style");
    style.id = "lockedOsGymPersistenceStyles";
    style.textContent = `
      .gym-schedule-start-wrap{margin:14px 0 12px;padding:12px 14px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.38)}
      .gym-schedule-start-wrap label{display:flex;align-items:center;justify-content:space-between;gap:14px;font-weight:900}
      .gym-schedule-start-wrap label span{color:var(--text)}
      .gym-schedule-start-wrap input{min-height:40px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.72);padding:0 11px;color:var(--text);font:inherit;font-weight:850}
      .gym-schedule-start-wrap small{display:block;margin-top:7px;color:var(--muted);font-weight:750;line-height:1.4}

      .rotation-chip.gym{background:#e3f4e8!important;color:#1f6f3f!important;border-color:#b9dec6!important}
      .rotation-chip.mk677{background:#fff1bf!important;color:#765109!important;border-color:#ecd47c!important}
      .rotation-chip.tretinoin{background:#e8edff!important;color:#435ca8!important;border-color:#c7d1fa!important}
      .rotation-chip.microneedle{background:#f2e7ff!important;color:#6d3da0!important;border-color:#dac0f4!important}
      .rotation-chip.sheets{background:#e2f4fb!important;color:#236d88!important;border-color:#b9dfe9!important}
      .rotation-chip.shave{background:#f2e8dd!important;color:#775231!important;border-color:#dfcbb5!important}
      .rotation-chip.lips{background:#ffe7ef!important;color:#9a4260!important;border-color:#f3bfd1!important}
      .rotation-chip.custom{background:#ece8e2!important;color:#5f5448!important;border-color:#d6cec4!important}

      @media(max-width:560px){
        .gym-schedule-start-wrap label{align-items:stretch;flex-direction:column}
        .gym-schedule-start-wrap input{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (
      typeof state === "undefined" ||
      typeof saveState !== "function" ||
      typeof getTodayKey !== "function" ||
      typeof getRoutineDayName !== "function"
    ) return;

    ensureGymState();
    installStyles();
    installRoutineOverrides();

    /* Repair stale recurring overrides immediately without touching manual Gym-tab overrides. */
    syncRecurringSchedule(getTodayKey());
    saveState();

    installStartDateControl();
    reorderGymEditor();
    replaceSaveButton();
    populateEditorForDate(getTodayKey());
    refreshGymTab();

    document.querySelectorAll('[data-tab="adminPage"], [data-admin-panel="adminRoutinePanel"]').forEach(button => {
      if (button.dataset.gymHotfixBound === "true") return;
      button.dataset.gymHotfixBound = "true";
      button.addEventListener("click", () => {
        setTimeout(() => {
          installStartDateControl();
          reorderGymEditor();
          replaceSaveButton();
          const startInput = document.getElementById("gymScheduleStartDate");
          populateEditorForDate(isDateKey(startInput?.value) ? startInput.value : getTodayKey());
        }, 80);
      });
    });

    try { render(); } catch (_) {}
    try { if (typeof renderRotationCalendar === "function") renderRotationCalendar(); } catch (_) {}
    try { if (typeof renderWeeklyReview === "function") renderWeeklyReview(); } catch (_) {}
  }

  const start = () => setTimeout(install, 140);
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start);
  else start();
})();
