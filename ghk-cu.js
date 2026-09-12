"use strict";

/*
  LOCKED OS — Gym UI final cleanup
  Base: currently deployed gym recovery build.
  Fixes:
  - one horizontal next-workout row
  - Previous / Next / Today all use one selected workout date
  - Looksmaxxing Gym becomes read-only (no workout shifter / Set controls)
  - Friday Sep 11 remains Chest + side delts
  - current/recovered Gym sessions remain untouched and continue saving to gymClean
*/

(() => {
  const baseUrl = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@863c47dc88bb808d8f4960696774f18dd8f27fea/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", baseUrl, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-gym-recovery-base.js");
  } catch (error) {
    console.error("LOCKED OS: could not load current gym recovery base.", error);
  }
})();

(() => {
  "use strict";

  const FLAG = "__lockedOsGymUiFinal20260911";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const START = "2026-09-11";
  const SCHEDULE = {
    Friday: "Chest + side delts",
    Saturday: "Back + rear delts",
    Monday: "Arms",
    Wednesday: "Legs + Abs"
  };
  const EXERCISES = {
    "Chest + side delts": [
      "Incline Dumbbell Bench Press",
      "Machine Chest Press",
      "Cable Fly / Pec Deck",
      "Cable Lateral Raise",
      "Machine Lateral Raise"
    ],
    "Back + rear delts": [
      "Lat Pulldown",
      "Chest-Supported Row",
      "Seated Cable Row, both arms",
      "Reverse Pec Deck"
    ],
    "Arms": [
      "Triceps Pressdown",
      "Overhead Cable Triceps Extension",
      "Cable Curl",
      "Incline Dumbbell Curl"
    ],
    "Legs + Abs": [
      "Hack Squat",
      "Romanian Deadlift",
      "Leg Extension",
      "Leg Curl",
      "Calf Raise",
      "Cable Crunch / Ab Machine"
    ]
  };
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let selectedDate = "";

  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function ensureGym() {
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean = state.meta.gymClean && typeof state.meta.gymClean === "object"
      ? state.meta.gymClean
      : {};
    state.meta.gymClean.sessions = Array.isArray(state.meta.gymClean.sessions)
      ? state.meta.gymClean.sessions
      : [];

    /*
      Keep the requested training order authoritative. This also guarantees
      Friday 9/11 is Chest + side delts.
    */
    state.meta.gymClean.schedule = { ...SCHEDULE };
  }

  function workoutFor(dayKey) {
    ensureGym();
    if (!validDateKey(dayKey) || dayKey < START) return "";
    return state.meta.gymClean.schedule[getRoutineDayName(dayKey)] || "";
  }

  function sessionFor(dayKey) {
    ensureGym();
    return state.meta.gymClean.sessions.find(session => session?.date === dayKey) || null;
  }

  function sessionForWrite(dayKey) {
    ensureGym();
    let session = sessionFor(dayKey);
    if (!session) {
      session = {
        id: `gym-final-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date: dayKey,
        workout: workoutFor(dayKey),
        completed: false,
        exercises: [],
        updatedAt: new Date().toISOString()
      };
      state.meta.gymClean.sessions.push(session);
    }
    return session;
  }

  function adjacentWorkout(dayKey, direction) {
    let cursor = keyToLocalDate(dayKey);
    for (let step = 0; step < 60; step += 1) {
      cursor = addDays(cursor, direction);
      const key = formatDateKey(cursor);
      if (key < START) return null;
      if (workoutFor(key)) return key;
    }
    return null;
  }

  function sequenceFrom(dayKey, count = 5) {
    const items = [];
    let cursor = keyToLocalDate(dayKey);

    /*
      If selected date is a rest day, begin at the next actual workout.
    */
    for (let step = 0; step < 60 && items.length < count; step += 1) {
      const key = formatDateKey(cursor);
      const workout = workoutFor(key);
      if (workout) items.push({ date: key, workout });
      cursor = addDays(cursor, 1);
    }
    return items;
  }

  function previousExercise(name, beforeDate) {
    ensureGym();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => validDateKey(session?.date) && session.date < beforeDate)
      .sort((a, b) => b.date.localeCompare(a.date));

    for (const session of sessions) {
      const match = Array.isArray(session.exercises)
        ? session.exercises.find(exercise => exercise?.name === name)
        : null;
      if (match) return match;
    }
    return null;
  }

  function setText(set) {
    return Number(set?.weight) > 0 && Number(set?.reps) > 0
      ? `${Number(set.weight)} lb × ${Number(set.reps)}`
      : "—";
  }

  function renderSequence() {
    const grid = document.getElementById("cleanGymWeekGrid");
    if (!grid) return;

    const heading = grid.closest(".clean-gym-week-card")?.querySelector(".panel-title h3");
    if (heading) heading.textContent = "Next workouts";

    const items = sequenceFrom(selectedDate || getTodayKey(), 5);
    grid.innerHTML = "";

    for (const item of items) {
      const date = keyToLocalDate(item.date);
      const session = sessionFor(item.date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `clean-gym-day${item.date === selectedDate ? " selected" : ""}${item.date === getTodayKey() ? " today" : ""}`;
      button.innerHTML = `
        <strong>${DAYS[date.getDay()].slice(0, 3)} · ${date.getMonth() + 1}/${date.getDate()}</strong>
        <span>${escapeHtml(item.workout)}${session?.completed ? " ✓" : ""}</span>`;
      button.addEventListener("click", () => {
        selectedDate = item.date;
        renderAllGym();
      });
      grid.appendChild(button);
    }
  }

  function renderWorkoutForm() {
    const body = document.getElementById("cleanGymWorkoutBody");
    const title = document.getElementById("cleanGymWorkoutTitle");
    const dateLabel = document.getElementById("cleanGymDateLabel");
    const actions = document.getElementById("cleanGymActions");
    const status = document.getElementById("cleanGymSaveStatus");
    if (!body || !title || !dateLabel || !actions) return;

    if (!validDateKey(selectedDate)) selectedDate = getTodayKey();

    const date = keyToLocalDate(selectedDate);
    const workout = workoutFor(selectedDate);
    const session = sessionFor(selectedDate);

    dateLabel.textContent = `${DAYS[date.getDay()]}, ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
    if (status) status.textContent = "";

    if (!workout) {
      const next = adjacentWorkout(selectedDate, 1);
      title.textContent = "Rest day";
      body.innerHTML = `
        <div class="clean-gym-rest">
          <strong>Rest day</strong>
          <span>${next ? `Next workout: ${escapeHtml(workoutFor(next))}` : "No next workout found."}</span>
        </div>`;
      actions.hidden = true;
      return;
    }

    actions.hidden = false;
    title.textContent = workout;

    const list = document.createElement("div");
    list.className = "clean-gym-exercises";

    for (const name of EXERCISES[workout] || []) {
      const current = session?.exercises?.find(exercise => exercise?.name === name) || { sets: [] };
      const previous = previousExercise(name, selectedDate);

      const row = document.createElement("div");
      row.className = "clean-gym-exercise";
      row.dataset.exercise = name;
      row.innerHTML = `
        <div class="clean-gym-exercise-name">
          <strong>${escapeHtml(name)}</strong>
          <span>2 working sets</span>
        </div>
        <div class="clean-gym-previous">
          <span>Previous</span>
          <strong>${escapeHtml(setText(previous?.sets?.[0]))}<br>${escapeHtml(setText(previous?.sets?.[1]))}</strong>
        </div>
        ${[0,1].map(index => {
          const set = current.sets?.[index] || {};
          return `
            <div class="clean-gym-set">
              <label>
                <span>Set ${index + 1} lb</span>
                <input data-set="${index}" data-field="weight" type="number" min="0" max="2000" step="0.5" value="${Number(set.weight) || ""}" placeholder="Weight">
              </label>
              <label>
                <span>Reps</span>
                <input data-set="${index}" data-field="reps" type="number" min="0" max="100" step="1" value="${Number(set.reps) || ""}" placeholder="Reps">
              </label>
            </div>`;
        }).join("")}`;
      list.appendChild(row);
    }

    body.innerHTML = "";
    body.appendChild(list);
  }

  function renderHistory() {
    const list = document.getElementById("cleanGymHistory");
    if (!list) return;

    ensureGym();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => validDateKey(session?.date))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    if (!sessions.length) {
      list.innerHTML = '<div class="clean-gym-empty">No saved workouts yet.</div>';
      return;
    }

    list.innerHTML = "";
    for (const session of sessions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clean-gym-history-row";
      button.innerHTML = `
        <span>${escapeHtml(session.date)}</span>
        <strong>${escapeHtml(session.workout || workoutFor(session.date) || "Workout")}${session.completed ? " ✓" : ""}</strong>`;
      button.addEventListener("click", () => {
        selectedDate = session.date;
        renderAllGym();
      });
      list.appendChild(button);
    }
  }

  function renderAllGym() {
    ensureGym();
    const badge = document.getElementById("cleanGymTodayBadge");
    if (badge) badge.textContent = workoutFor(getTodayKey()) || "Rest day";

    renderSequence();
    renderWorkoutForm();
    renderHistory();
  }

  function collectForm() {
    const exercises = [];
    let invalid = false;

    document.querySelectorAll("#cleanGymWorkoutBody .clean-gym-exercise").forEach(row => {
      const sets = [0, 1].map(index => {
        const weight = Number(row.querySelector(`[data-set="${index}"][data-field="weight"]`)?.value || 0);
        const reps = Number(row.querySelector(`[data-set="${index}"][data-field="reps"]`)?.value || 0);
        if ((weight > 0) !== (reps > 0)) invalid = true;
        return {
          weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
          reps: Number.isFinite(reps) ? Math.max(0, Math.round(reps)) : 0
        };
      });
      exercises.push({ name: row.dataset.exercise || "", sets });
    });

    return { exercises, invalid };
  }

  function saveWorkout(markComplete) {
    const workout = workoutFor(selectedDate);
    const status = document.getElementById("cleanGymSaveStatus");
    if (!workout) return;

    const collected = collectForm();
    if (collected.invalid) {
      if (status) status.textContent = "Each entered set needs both weight and reps.";
      return;
    }

    if (markComplete) {
      const missing = collected.exercises.some(exercise =>
        exercise.sets.some(set => !(set.weight > 0 && set.reps > 0))
      );
      if (missing) {
        if (status) status.textContent = "Fill both sets for every exercise before completing.";
        return;
      }
    }

    const session = sessionForWrite(selectedDate);
    session.workout = workout;
    session.exercises = collected.exercises;
    if (markComplete) session.completed = true;
    session.updatedAt = new Date().toISOString();

    saveState();

    if (status) {
      status.textContent = markComplete
        ? "Workout saved and completed."
        : "Workout saved.";
    }

    if (typeof toast === "function") {
      toast(markComplete ? "Workout completed." : "Workout saved.");
    }

    renderSequence();
    renderHistory();
    try { renderWeeklyReview(); } catch (_) {}
  }

  function replaceControl(id, handler) {
    const old = document.getElementById(id);
    if (!old) return;
    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);
    fresh.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      handler();
    });
  }

  function installNavigation() {
    replaceControl("cleanGymPrev", () => {
      const target = adjacentWorkout(selectedDate || getTodayKey(), -1);
      if (target) {
        selectedDate = target;
        renderAllGym();
      } else if (typeof toast === "function") {
        toast("No earlier workout.");
      }
    });

    replaceControl("cleanGymNext", () => {
      const target = adjacentWorkout(selectedDate || getTodayKey(), 1);
      if (target) {
        selectedDate = target;
        renderAllGym();
      }
    });

    replaceControl("cleanGymToday", () => {
      selectedDate = getTodayKey();
      renderAllGym();
    });

    replaceControl("cleanGymSave", () => saveWorkout(false));
    replaceControl("cleanGymComplete", () => saveWorkout(true));
  }

  function makeLooksGymReadOnly() {
    /*
      User wants Gym scheduling controlled only from the Gym page.
      Keep the current workout name visible, but remove every shifter/Set action.
    */
    const ids = [
      "workoutPrevBtn",
      "workoutNextBtn",
      "setWorkoutBtn",
      "workoutRotationStatus"
    ];

    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) element.style.display = "none";
    }

    const preview = document.getElementById("workoutPreviewName");
    if (preview) {
      preview.textContent = workoutFor(getTodayKey()) || "Rest day";
      preview.setAttribute("aria-live", "polite");
    }

    /*
      If the old controls sit in their own toolbar/container, collapse the
      container only when it contains no other useful visible controls.
    */
    for (const id of ["workoutPrevBtn", "workoutNextBtn", "setWorkoutBtn"]) {
      const el = document.getElementById(id);
      const parent = el?.parentElement;
      if (!parent) continue;
      const visibleUseful = [...parent.children].some(child => {
        if (child === el) return false;
        const childId = child.id || "";
        if (["workoutPrevBtn","workoutNextBtn","setWorkoutBtn","workoutRotationStatus"].includes(childId)) return false;
        return child.offsetParent !== null;
      });
      if (!visibleUseful) parent.style.display = "none";
    }
  }

  function installStyles() {
    if (document.getElementById("gymUiFinalStyles")) return;
    const style = document.createElement("style");
    style.id = "gymUiFinalStyles";
    style.textContent = `
      /* Always one horizontal workout row. Never wrap Friday 9/18 underneath. */
      #cleanGymWeekGrid.clean-gym-week,
      #cleanGymWeekGrid {
        display:flex!important;
        flex-wrap:nowrap!important;
        gap:9px!important;
        overflow-x:auto!important;
        overflow-y:hidden!important;
        padding-bottom:3px;
        scrollbar-width:thin;
      }
      #cleanGymWeekGrid .clean-gym-day {
        flex:1 0 150px!important;
        min-width:150px!important;
        max-width:none!important;
      }
      @media(min-width:1050px){
        #cleanGymWeekGrid .clean-gym-day {
          flex:1 1 0!important;
          min-width:0!important;
        }
      }

      /* Looksmaxxing Gym is display-only. */
      #workoutPrevBtn,
      #workoutNextBtn,
      #setWorkoutBtn,
      #workoutRotationStatus {
        display:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (typeof state === "undefined") return;

    ensureGym();
    selectedDate = getTodayKey();

    installStyles();
    installNavigation();
    makeLooksGymReadOnly();
    renderAllGym();

    /*
      Re-apply read-only Looks Gym after full app renders, because renderLooks()
      can rewrite the workout preview text.
    */
    document.querySelectorAll('[data-tab="looksPage"],[data-tab="gymPage"]').forEach(button => {
      if (button.dataset.gymUiFinalBound === "true") return;
      button.dataset.gymUiFinalBound = "true";
      button.addEventListener("click", () => setTimeout(() => {
        makeLooksGymReadOnly();
        if (button.dataset.tab === "gymPage") {
          installNavigation();
          renderAllGym();
        }
      }, 0));
    });

    /*
      A save elsewhere in the app can trigger render(); keep the Looks controls
      hidden without observing the entire DOM.
    */
    window.addEventListener("focus", () => {
      makeLooksGymReadOnly();
    });
  }

  const start = () => setTimeout(install, 100);
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();