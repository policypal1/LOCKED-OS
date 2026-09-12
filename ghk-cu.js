"use strict";

/*
  LOCKED OS — Gym navigation + workout log fix
  Base: deployed build da69fb13012b5f276558e39146d9085bab4857bb

  Changes:
  - Stable one-row workout strip with selected-card highlight.
  - Previous/Next/Today and card clicks use one selected date.
  - Selected workout card auto-scrolls into view.
  - Recent workouts open a read-only log modal with all saved sets.
  - Existing gymClean sessions / vault / Supabase recovery stay intact.
*/

(() => {
  const baseUrl = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@da69fb13012b5f276558e39146d9085bab4857bb/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", baseUrl, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-gym-ui-base-da69fb.js");
  } catch (error) {
    console.error("LOCKED OS: could not load current Gym UI base.", error);
  }
})();

(() => {
  "use strict";

  const FLAG = "__lockedOsGymLogNavFix20260911";
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

  let uiSelectedDate = "";
  let stripAnchorDate = "";

  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function ensureGym() {
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean = state.meta.gymClean && typeof state.meta.gymClean === "object"
      ? state.meta.gymClean
      : {};
    state.meta.gymClean.sessions = Array.isArray(state.meta.gymClean.sessions)
      ? state.meta.gymClean.sessions
      : [];
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
        id: `gym-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
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
    for (let step = 0; step < 90; step += 1) {
      cursor = addDays(cursor, direction);
      const key = formatDateKey(cursor);
      if (key < START) return null;
      if (workoutFor(key)) return key;
    }
    return null;
  }

  function firstWorkoutOnOrAfter(dayKey) {
    if (validDateKey(dayKey) && workoutFor(dayKey)) return dayKey;
    let cursor = keyToLocalDate(validDateKey(dayKey) ? dayKey : getTodayKey());
    for (let step = 0; step < 30; step += 1) {
      const key = formatDateKey(cursor);
      if (workoutFor(key)) return key;
      cursor = addDays(cursor, 1);
    }
    return START;
  }

  function stripDates(anchorKey, count = 5) {
    const items = [];
    let key = firstWorkoutOnOrAfter(anchorKey);

    while (key && items.length < count) {
      items.push({ date: key, workout: workoutFor(key) });
      key = adjacentWorkout(key, 1);
    }
    return items;
  }

  function stripContains(dayKey) {
    return stripDates(stripAnchorDate || getTodayKey(), 5).some(item => item.date === dayKey);
  }

  function ensureSelectedVisible() {
    if (!validDateKey(uiSelectedDate)) uiSelectedDate = firstWorkoutOnOrAfter(getTodayKey());
    if (!validDateKey(stripAnchorDate)) stripAnchorDate = firstWorkoutOnOrAfter(getTodayKey());

    if (!stripContains(uiSelectedDate)) {
      /*
        When moving outside the current 5 cards, shift the window so the
        selected workout is visible as the first card.
      */
      stripAnchorDate = uiSelectedDate;
    }
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

  function formatDate(dayKey) {
    const date = keyToLocalDate(dayKey);
    return `${DAYS[date.getDay()]}, ${date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric"
    })}`;
  }

  function renderStableStrip({ scroll = true } = {}) {
    const grid = document.getElementById("cleanGymWeekGrid");
    if (!grid) return;

    ensureSelectedVisible();

    const heading = grid.closest(".clean-gym-week-card")?.querySelector(".panel-title h3");
    if (heading) heading.textContent = "Next workouts";

    const items = stripDates(stripAnchorDate, 5);
    grid.innerHTML = "";

    for (const item of items) {
      const date = keyToLocalDate(item.date);
      const session = sessionFor(item.date);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.gymStripDate = item.date;
      button.className =
        `clean-gym-day gym-strip-card` +
        `${item.date === uiSelectedDate ? " selected gym-strip-selected" : ""}` +
        `${item.date === getTodayKey() ? " today" : ""}`;

      button.innerHTML = `
        <strong>${DAYS[date.getDay()].slice(0, 3)} · ${date.getMonth() + 1}/${date.getDate()}</strong>
        <span>${escapeHtml(item.workout)}${session?.completed ? " ✓" : ""}</span>`;

      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        uiSelectedDate = item.date;
        renderGymUi();
      });

      grid.appendChild(button);
    }

    if (scroll) {
      requestAnimationFrame(() => {
        const selected = grid.querySelector(`[data-gym-strip-date="${CSS.escape(uiSelectedDate)}"]`);
        selected?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center"
        });
      });
    }
  }

  function renderWorkoutForm() {
    const body = document.getElementById("cleanGymWorkoutBody");
    const title = document.getElementById("cleanGymWorkoutTitle");
    const dateLabel = document.getElementById("cleanGymDateLabel");
    const actions = document.getElementById("cleanGymActions");
    const status = document.getElementById("cleanGymSaveStatus");
    if (!body || !title || !dateLabel || !actions) return;

    if (!validDateKey(uiSelectedDate)) {
      uiSelectedDate = firstWorkoutOnOrAfter(getTodayKey());
    }

    const workout = workoutFor(uiSelectedDate);
    const session = sessionFor(uiSelectedDate);

    dateLabel.textContent = formatDate(uiSelectedDate);
    if (status) status.textContent = "";

    if (!workout) {
      title.textContent = "Rest day";
      body.innerHTML = '<div class="clean-gym-rest"><strong>Rest day</strong></div>';
      actions.hidden = true;
      return;
    }

    actions.hidden = false;
    title.textContent = workout;

    const list = document.createElement("div");
    list.className = "clean-gym-exercises";

    for (const name of EXERCISES[workout] || []) {
      const current = session?.exercises?.find(exercise => exercise?.name === name) || { sets: [] };
      const previous = previousExercise(name, uiSelectedDate);

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
        ${[0, 1].map(index => {
          const set = current.sets?.[index] || {};
          return `
            <div class="clean-gym-set">
              <label>
                <span>Set ${index + 1} lb</span>
                <input data-set="${index}" data-field="weight" type="number" min="0" max="2000" step="0.5"
                  value="${Number(set.weight) || ""}" placeholder="Weight">
              </label>
              <label>
                <span>Reps</span>
                <input data-set="${index}" data-field="reps" type="number" min="0" max="100" step="1"
                  value="${Number(set.reps) || ""}" placeholder="Reps">
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
      .slice(0, 12);

    if (!sessions.length) {
      list.innerHTML = '<div class="clean-gym-empty">No saved workout logs yet.</div>';
      return;
    }

    list.innerHTML = "";

    for (const session of sessions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clean-gym-history-row gym-log-row";

      const setCount = (session.exercises || []).reduce(
        (total, exercise) =>
          total + (exercise.sets || []).filter(set => Number(set?.weight) > 0 && Number(set?.reps) > 0).length,
        0
      );

      button.innerHTML = `
        <div class="gym-log-row-copy">
          <span>${escapeHtml(session.date)}</span>
          <strong>${escapeHtml(session.workout || workoutFor(session.date) || "Workout")}${session.completed ? " ✓" : ""}</strong>
          <small>${setCount ? `${setCount} logged set${setCount === 1 ? "" : "s"}` : "Open workout log"}</small>
        </div>
        <span class="gym-log-open">View log →</span>`;

      button.addEventListener("click", event => {
        event.preventDefault();
        openWorkoutLog(session.date);
      });

      list.appendChild(button);
    }
  }

  function renderGymUi() {
    ensureGym();
    ensureSelectedVisible();

    const badge = document.getElementById("cleanGymTodayBadge");
    if (badge) badge.textContent = workoutFor(getTodayKey()) || "Rest day";

    renderStableStrip();
    renderWorkoutForm();
    renderHistory();
  }

  function collectForm() {
    const exercises = [];
    let invalid = false;

    document.querySelectorAll("#cleanGymWorkoutBody .clean-gym-exercise").forEach(row => {
      const sets = [0, 1].map(index => {
        const weight = Number(
          row.querySelector(`[data-set="${index}"][data-field="weight"]`)?.value || 0
        );
        const reps = Number(
          row.querySelector(`[data-set="${index}"][data-field="reps"]`)?.value || 0
        );

        if ((weight > 0) !== (reps > 0)) invalid = true;

        return {
          weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
          reps: Number.isFinite(reps) ? Math.max(0, Math.round(reps)) : 0
        };
      });

      exercises.push({
        name: row.dataset.exercise || "",
        sets
      });
    });

    return { exercises, invalid };
  }

  function saveWorkout(markComplete) {
    const workout = workoutFor(uiSelectedDate);
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

    const session = sessionForWrite(uiSelectedDate);
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

    renderStableStrip({ scroll: false });
    renderHistory();
    try { renderWeeklyReview(); } catch (_) {}
  }

  function openWorkoutLog(dayKey) {
    const session = sessionFor(dayKey);
    if (!session) return;

    document.querySelector(".gym-log-modal-backdrop")?.remove();

    const modal = document.createElement("div");
    modal.className = "gym-log-modal-backdrop";

    const exerciseRows = (session.exercises || []).map(exercise => {
      const sets = (exercise.sets || []).slice(0, 2);
      return `
        <div class="gym-log-exercise">
          <div class="gym-log-exercise-name">${escapeHtml(exercise.name || "Exercise")}</div>
          <div class="gym-log-sets">
            ${[0, 1].map(index => {
              const set = sets[index];
              return `
                <div class="gym-log-set">
                  <span>Set ${index + 1}</span>
                  <strong>${escapeHtml(setText(set))}</strong>
                </div>`;
            }).join("")}
          </div>
        </div>`;
    }).join("");

    modal.innerHTML = `
      <section class="gym-log-modal" role="dialog" aria-modal="true" aria-labelledby="gymLogModalTitle">
        <div class="gym-log-modal-head">
          <div>
            <p class="eyebrow blue">Workout log</p>
            <h3 id="gymLogModalTitle">${escapeHtml(session.workout || workoutFor(dayKey) || "Workout")}</h3>
            <p>${escapeHtml(formatDate(dayKey))}</p>
          </div>
          <button class="gym-log-close" type="button" aria-label="Close">×</button>
        </div>

        <div class="gym-log-status ${session.completed ? "complete" : ""}">
          ${session.completed ? "✓ Completed workout" : "Saved workout"}
        </div>

        <div class="gym-log-exercises">
          ${exerciseRows || '<div class="clean-gym-empty">This saved log has no set data.</div>'}
        </div>

        <div class="gym-log-modal-actions">
          <button class="btn secondary gym-log-edit" type="button">Open in workout editor</button>
          <button class="btn blue gym-log-done" type="button">Done</button>
        </div>
      </section>`;

    document.body.appendChild(modal);

    const close = () => modal.remove();

    modal.addEventListener("click", event => {
      if (event.target === modal) close();
    });

    modal.querySelector(".gym-log-close")?.addEventListener("click", close);
    modal.querySelector(".gym-log-done")?.addEventListener("click", close);
    modal.querySelector(".gym-log-edit")?.addEventListener("click", () => {
      uiSelectedDate = dayKey;
      if (!stripContains(dayKey)) stripAnchorDate = dayKey;
      close();
      renderGymUi();
      document.querySelector(".clean-gym-log-card")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function replaceControl(id, handler) {
    const old = document.getElementById(id);
    if (!old) return;

    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);

    fresh.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handler();
    }, { capture: true });
  }

  function installControls() {
    replaceControl("cleanGymPrev", () => {
      const target = adjacentWorkout(uiSelectedDate || firstWorkoutOnOrAfter(getTodayKey()), -1);
      if (!target) {
        if (typeof toast === "function") toast("No earlier workout.");
        return;
      }

      uiSelectedDate = target;

      /*
        Keep the selected workout in the current 5-card window if possible.
        If it falls outside, shift the strip window.
      */
      if (!stripContains(target)) stripAnchorDate = target;
      renderGymUi();
    });

    replaceControl("cleanGymNext", () => {
      const target = adjacentWorkout(uiSelectedDate || firstWorkoutOnOrAfter(getTodayKey()), 1);
      if (!target) return;

      uiSelectedDate = target;
      if (!stripContains(target)) stripAnchorDate = target;
      renderGymUi();
    });

    replaceControl("cleanGymToday", () => {
      uiSelectedDate = firstWorkoutOnOrAfter(getTodayKey());
      stripAnchorDate = firstWorkoutOnOrAfter(getTodayKey());
      renderGymUi();
    });

    replaceControl("cleanGymSave", () => saveWorkout(false));
    replaceControl("cleanGymComplete", () => saveWorkout(true));
  }

  function keepLooksGymReadOnly() {
    for (const id of [
      "workoutPrevBtn",
      "workoutNextBtn",
      "setWorkoutBtn",
      "workoutRotationStatus"
    ]) {
      const element = document.getElementById(id);
      if (element) element.style.display = "none";
    }

    const preview = document.getElementById("workoutPreviewName");
    if (preview) preview.textContent = workoutFor(getTodayKey()) || "Rest day";
  }

  function installStyles() {
    if (document.getElementById("gymLogNavFixStyles")) return;

    const style = document.createElement("style");
    style.id = "gymLogNavFixStyles";
    style.textContent = `
      #cleanGymWeekGrid {
        display:flex!important;
        flex-wrap:nowrap!important;
        overflow-x:auto!important;
        overflow-y:hidden!important;
        gap:9px!important;
        scroll-behavior:smooth;
        scrollbar-width:thin;
        padding:2px 2px 7px;
      }

      #cleanGymWeekGrid .gym-strip-card {
        flex:0 0 160px!important;
        min-width:160px!important;
        max-width:160px!important;
        transition:border-color .15s ease, background .15s ease, transform .15s ease;
      }

      #cleanGymWeekGrid .gym-strip-card.gym-strip-selected {
        background:var(--blue-soft)!important;
        border-color:rgba(37,132,184,.65)!important;
        box-shadow:0 0 0 2px rgba(37,132,184,.12);
        transform:translateY(-1px);
      }

      @media(min-width:1050px){
        #cleanGymWeekGrid .gym-strip-card {
          flex:1 1 0!important;
          min-width:0!important;
          max-width:none!important;
        }
      }

      .gym-log-row {
        align-items:center!important;
        text-align:left;
      }

      .gym-log-row-copy {
        display:grid;
        gap:2px;
      }

      .gym-log-row-copy span,
      .gym-log-row-copy small {
        color:var(--muted);
        font-weight:800;
      }

      .gym-log-row-copy small {
        font-size:.72rem;
      }

      .gym-log-open {
        color:var(--blue);
        font-size:.76rem;
        font-weight:900!important;
        white-space:nowrap;
      }

      .gym-log-modal-backdrop {
        position:fixed;
        inset:0;
        z-index:10020;
        display:grid;
        place-items:center;
        padding:18px;
        background:rgba(20,16,12,.48);
        backdrop-filter:blur(8px);
      }

      .gym-log-modal {
        width:min(680px,100%);
        max-height:90vh;
        overflow:auto;
        padding:20px;
        border:1px solid var(--line);
        border-radius:24px;
        background:var(--card);
        box-shadow:0 26px 90px rgba(20,14,8,.28);
      }

      .gym-log-modal-head {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:15px;
      }

      .gym-log-modal-head h3 {
        margin:0;
        font-size:1.75rem;
      }

      .gym-log-modal-head p:not(.eyebrow) {
        margin:5px 0 0;
        color:var(--muted);
        font-weight:800;
      }

      .gym-log-close {
        width:36px;
        height:36px;
        border:0;
        border-radius:999px;
        background:rgba(42,30,18,.07);
        color:var(--text);
        font-size:1.4rem;
        cursor:pointer;
      }

      .gym-log-status {
        display:inline-flex;
        margin:15px 0 12px;
        padding:7px 10px;
        border-radius:999px;
        background:rgba(42,30,18,.07);
        font-size:.75rem;
        font-weight:900;
      }

      .gym-log-status.complete {
        background:var(--blue-soft);
      }

      .gym-log-exercises {
        display:grid;
        gap:8px;
      }

      .gym-log-exercise {
        display:grid;
        grid-template-columns:minmax(160px,1fr) minmax(220px,1fr);
        gap:12px;
        align-items:center;
        padding:12px 13px;
        border:1px solid var(--line);
        border-radius:15px;
        background:rgba(255,255,255,.42);
      }

      .gym-log-exercise-name {
        font-weight:900;
      }

      .gym-log-sets {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
      }

      .gym-log-set {
        display:grid;
        gap:2px;
        padding:8px 9px;
        border-radius:11px;
        background:rgba(42,30,18,.045);
      }

      .gym-log-set span {
        color:var(--muted);
        font-size:.68rem;
        font-weight:900;
      }

      .gym-log-set strong {
        font-size:.82rem;
      }

      .gym-log-modal-actions {
        display:flex;
        justify-content:flex-end;
        gap:8px;
        margin-top:17px;
      }

      @media(max-width:600px){
        .gym-log-exercise {
          grid-template-columns:1fr;
        }

        .gym-log-modal-actions {
          display:grid;
          grid-template-columns:1fr 1fr;
        }
      }

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

    uiSelectedDate = firstWorkoutOnOrAfter(getTodayKey());
    stripAnchorDate = firstWorkoutOnOrAfter(getTodayKey());

    installStyles();
    installControls();
    keepLooksGymReadOnly();
    renderGymUi();

    document.querySelectorAll('[data-tab="gymPage"],[data-tab="looksPage"]').forEach(button => {
      if (button.dataset.gymLogNavFixBound === "true") return;
      button.dataset.gymLogNavFixBound = "true";

      button.addEventListener("click", () => {
        setTimeout(() => {
          keepLooksGymReadOnly();

          if (button.dataset.tab === "gymPage") {
            installControls();
            renderGymUi();
          }
        }, 0);
      });
    });

    window.addEventListener("focus", keepLooksGymReadOnly);
  }

  const start = () => setTimeout(install, 120);

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();