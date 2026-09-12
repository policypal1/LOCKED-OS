"use strict";

/*
  LOCKED OS — task scheduling + gym navigation fix v4
  Base: exact ghk-cu.js deployed at commit 74e910bb3bae7636d181485e8bd443b3cc3699f8.

  Fixes:
  - custom tasks obey their selected weekdays everywhere
  - non-daily custom tasks appear in Rotation Calendar on the correct days
  - Rotation Calendar updates immediately after task changes
  - Rotation Calendar is placed above Data Protection in Admin
  - Gym prev/next controls have one handler only and move one scheduled workout per click
  - Gym navigation is clamped to a safe date range
*/
(() => {
  const baseUrl = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@74e910bb3bae7636d181485e8bd443b3cc3699f8/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", baseUrl, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-v4-base.js");
  } catch (error) {
    console.error("LOCKED OS: could not load the v4 base file.", error);
  }
})();

(() => {
  "use strict";

  const FLAG = "__lockedOsTaskRotationGymNavV4";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const SCHEDULE_START = "2026-09-11";
  const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const NAV_FUTURE_LIMIT_DAYS = 120;
  let rotationRefreshTimer = null;
  let navigationLocked = false;

  const isDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function normalizeTaskDays(value) {
    if (!Array.isArray(value)) return [];
    const allowed = new Set(DAY_ORDER);
    return DAY_ORDER.filter(day => value.includes(day) && allowed.has(day));
  }

  function customTaskMap() {
    const tasks = Array.isArray(state?.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [];
    return new Map(tasks.map(task => [String(task?.id || ""), task]).filter(([id]) => id));
  }

  function customTaskTitles() {
    const tasks = Array.isArray(state?.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [];
    return new Set(
      tasks
        .map(task => String(task?.title || "").trim().toLowerCase())
        .filter(Boolean)
    );
  }

  function taskScheduledOn(task, dayName) {
    const days = normalizeTaskDays(task?.days);
    /*
      No days[] means legacy/every-day task.
      A populated days[] is authoritative.
    */
    return !days.length || days.includes(dayName);
  }

  function scheduleRotationRefresh() {
    clearTimeout(rotationRefreshTimer);
    rotationRefreshTimer = setTimeout(() => {
      try {
        if (typeof renderRotationCalendar === "function") renderRotationCalendar();
      } catch (_) {}
    }, 0);
  }

  /*
    Final scheduling authority for custom Looksmaxxing tasks.
    Older layers may add custom tasks every day; this removes them on days that
    are not selected in the task's days[] schedule.
  */
  if (typeof window.getLooksRoutine === "function" && !window.getLooksRoutine.__scheduledDaysV4) {
    const baseGetLooksRoutine = window.getLooksRoutine;
    const wrappedGetLooksRoutine = function(dayKey = getTodayKey()) {
      const routine = baseGetLooksRoutine(dayKey);
      if (!routine || typeof routine !== "object") return routine;

      const dayName = getRoutineDayName(dayKey);
      const taskMap = customTaskMap();

      for (const section of ["morning", "midday", "night"]) {
        if (!Array.isArray(routine[section])) continue;
        routine[section] = routine[section].filter(task => {
          const custom = taskMap.get(String(task?.id || ""));
          return !custom || taskScheduledOn(custom, dayName);
        });
      }
      return routine;
    };
    wrappedGetLooksRoutine.__scheduledDaysV4 = true;
    window.getLooksRoutine = wrappedGetLooksRoutine;
  }

  /*
    Keep built-in rotating items from the existing calendar, but completely
    rebuild custom-task chips from days[] so a Sun-Thu task never shows Friday.
  */
  if (typeof window.getRotationTasksForDay === "function" && !window.getRotationTasksForDay.__scheduledDaysV4) {
    const baseGetRotationTasksForDay = window.getRotationTasksForDay;
    const wrappedGetRotationTasksForDay = function(dayKey) {
      const dayName = getRoutineDayName(dayKey);
      const customTasks = Array.isArray(state?.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [];
      const customTitles = customTaskTitles();

      let items = baseGetRotationTasksForDay(dayKey) || [];
      items = items.filter(item => {
        const label = String(item?.label || "").trim().toLowerCase();
        return !customTitles.has(label);
      });

      const existing = new Set(items.map(item => String(item?.label || "").trim().toLowerCase()));

      for (const task of customTasks) {
        const days = normalizeTaskDays(task?.days);

        /* Rotation calendar is for non-daily items only. */
        if (!days.length || days.length >= 7 || !days.includes(dayName)) continue;

        const label = String(task?.title || "").trim();
        if (!label || existing.has(label.toLowerCase())) continue;

        items.push({ label, type: "custom" });
        existing.add(label.toLowerCase());
      }

      return items;
    };
    wrappedGetRotationTasksForDay.__scheduledDaysV4 = true;
    window.getRotationTasksForDay = wrappedGetRotationTasksForDay;
  }

  /*
    New tasks should appear immediately. The base app saves first; then we
    redraw the current routine and rotation calendar without requiring reload.
  */
  try {
    if (typeof addLooksTask === "function" && !addLooksTask.__scheduledDaysV4) {
      const baseAddLooksTask = addLooksTask;
      const wrappedAddLooksTask = function(...args) {
        const result = baseAddLooksTask(...args);
        setTimeout(() => {
          try { if (typeof render === "function") render(); } catch (_) {}
          scheduleRotationRefresh();
        }, 0);
        return result;
      };
      wrappedAddLooksTask.__scheduledDaysV4 = true;
      addLooksTask = wrappedAddLooksTask;
    }
  } catch (_) {}

  /*
    Any later edit to task days/titles saves state. Refresh just the rotation
    calendar after saves so Admin always reflects the current schedule.
  */
  if (typeof saveState === "function" && !saveState.__rotationRefreshV4) {
    const baseSaveState = saveState;
    const wrappedSaveState = function(...args) {
      const result = baseSaveState(...args);
      scheduleRotationRefresh();
      return result;
    };
    wrappedSaveState.__rotationRefreshV4 = true;
    saveState = wrappedSaveState;
  }

  function reorderAdminCards() {
    const grid = document.querySelector("#adminRoutinePanel .admin-grid");
    const rotation = grid?.querySelector(".rotation-admin-card");
    const backup = document.getElementById("lockedOsBackupCard");
    if (!grid || !rotation || !backup) return;

    /*
      Rotation should occupy the earlier slot; Data Protection moves below it.
    */
    grid.insertBefore(rotation, backup);
  }

  function dateKey(date) {
    return formatDateKey(date);
  }

  function futureLimitKey() {
    return dateKey(addDays(keyToLocalDate(getTodayKey()), NAV_FUTURE_LIMIT_DAYS));
  }

  function currentGymDate() {
    const input = document.getElementById("gymDateInput");
    const value = String(input?.value || getTodayKey());
    if (!isDateKey(value)) return getTodayKey();

    if (value < SCHEDULE_START) return SCHEDULE_START;
    const max = futureLimitKey();
    if (value > max) return max;
    return value;
  }

  function currentWorkout(dayKey) {
    /*
      V3/V2 already made getWorkoutName the authoritative gym schedule.
      Treat "Rest day" as no scheduled workout.
    */
    if (typeof getWorkoutName !== "function") return "";
    const value = String(getWorkoutName(dayKey) || "");
    return value && value !== "Rest day" ? value : "";
  }

  function adjacentWorkout(fromKey, direction) {
    let cursor = keyToLocalDate(fromKey);
    const max = futureLimitKey();

    for (let step = 0; step < NAV_FUTURE_LIMIT_DAYS + 14; step += 1) {
      cursor = addDays(cursor, direction);
      const key = dateKey(cursor);

      if (key < SCHEDULE_START) return null;
      if (key > max) return null;
      if (currentWorkout(key)) return key;
    }
    return null;
  }

  function setGymDate(target) {
    const input = document.getElementById("gymDateInput");
    if (!input || !isDateKey(target)) return;

    input.value = target;
    /*
      The base Gym page owns rendering. One change event updates its internal
      selected date exactly once.
    */
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function installSingleWorkoutNavigation() {
    const input = document.getElementById("gymDateInput");
    if (input) {
      input.min = SCHEDULE_START;
      input.max = futureLimitKey();

      if (input.dataset.navClampV4 !== "true") {
        input.dataset.navClampV4 = "true";
        input.addEventListener("change", () => {
          const value = String(input.value || "");
          const clamped = value < SCHEDULE_START
            ? SCHEDULE_START
            : (value > futureLimitKey() ? futureLimitKey() : value);

          if (isDateKey(clamped) && clamped !== value) {
            input.value = clamped;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
      }
    }

    const specs = [
      ["gymPrevDayBtn", -1, "Previous workout"],
      ["gymNextDayBtn", 1, "Next workout"]
    ];

    for (const [id, direction, label] of specs) {
      const old = document.getElementById(id);
      if (!old || old.dataset.navV4 === "true") continue;

      /*
        Clone strips every handler from every older gym patch.
        Mark it as V2/V3-bound as well so older render code does not rebind it.
      */
      const button = old.cloneNode(true);
      button.dataset.navV4 = "true";
      button.dataset.gymV2Bound = "true";
      button.dataset.gymV3Bound = "true";
      button.setAttribute("aria-label", label);
      button.title = label;
      old.replaceWith(button);

      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (navigationLocked) return;

        navigationLocked = true;
        const target = adjacentWorkout(currentGymDate(), direction);

        if (target) setGymDate(target);
        else if (typeof toast === "function") {
          toast(direction < 0
            ? "No earlier workout in this schedule."
            : "No later workout in the current schedule window.");
        }

        /*
          Prevent rapid multi-handler/multi-click cascades from racing the Gym
          renderer and jumping dozens of dates.
        */
        setTimeout(() => { navigationLocked = false; }, 300);
      }, { capture: true });
    }
  }

  function install() {
    if (typeof state === "undefined") return;

    reorderAdminCards();
    installSingleWorkoutNavigation();
    scheduleRotationRefresh();

    document.querySelectorAll(
      '[data-tab="gymPage"],[data-tab="adminPage"],[data-admin-panel="adminRoutinePanel"]'
    ).forEach(button => {
      if (button.dataset.v4UiRefresh === "true") return;
      button.dataset.v4UiRefresh = "true";
      button.addEventListener("click", () => {
        setTimeout(() => {
          reorderAdminCards();
          installSingleWorkoutNavigation();
          scheduleRotationRefresh();
        }, 30);
      });
    });

    /*
      The Gym renderer can replace controls. Watch only that page and restore
      the single-handler navigation if necessary.
    */
    const gymPage = document.getElementById("gymPage");
    if (gymPage && gymPage.dataset.navObserverV4 !== "true") {
      gymPage.dataset.navObserverV4 = "true";
      const observer = new MutationObserver(() => {
        installSingleWorkoutNavigation();
      });
      observer.observe(gymPage, { childList: true, subtree: true });
    }
  }

  const start = () => setTimeout(install, 40);
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();