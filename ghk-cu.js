"use strict";

/*
  LOCKED OS — gym cleanup / persistence fix v3
  Base: exact deployed ghk-cu.js from commit 9cab339e5fc5847ff936a2b9f13bd71b60fc99bd.
  Changes:
  - durable gym backup + merge protection
  - Save Workout persists without wiping the visible form
  - prev/next arrows jump between scheduled workouts, not calendar days
  - gym schedule editor moves from Admin into a small Gym-page popup
  - schedule stays effective from Friday 2026-09-11
  - tretinoin 2x/week = Tuesday + Friday
  - newly added looks tasks force an immediate UI refresh
*/
(() => {
  const baseUrl = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@9cab339e5fc5847ff936a2b9f13bd71b60fc99bd/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", baseUrl, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-gym-v2-base.js");
  } catch (error) {
    console.error("LOCKED OS: could not load the deployed gym-v2 base.", error);
  }
})();

(() => {
  "use strict";

  const FLAG = "__lockedOsGymCleanupV3";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const SCHEDULE_START = "2026-09-11";
  const GYM_SAFE_KEY = "locked_os_gym_safe_v1";
  const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const EDITOR_ORDER = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
  const ALLOWED_WORKOUTS = ["Chest + side delts", "Back + rear delts", "Arms", "Legs + Abs"];
  const ALLOWED = new Set(ALLOWED_WORKOUTS);

  const FALLBACK_SCHEDULE = {
    Monday: "Chest + side delts",
    Wednesday: "Back + rear delts",
    Friday: "Arms",
    Saturday: "Legs + Abs"
  };

  const TRETINOIN_FRIDAY_ANCHORED = {
    1: ["Friday"],
    2: ["Tuesday", "Friday"],
    3: ["Monday", "Wednesday", "Friday"],
    4: ["Sunday", "Monday", "Wednesday", "Friday"],
    5: ["Sunday", "Monday", "Tuesday", "Thursday", "Friday"],
    6: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    7: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  };

  const clone = value => JSON.parse(JSON.stringify(value));

  function validDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function ensureGymState(target = state) {
    if (!target || typeof target !== "object") return;
    target.meta = target.meta && typeof target.meta === "object" ? target.meta : {};
    if (!Array.isArray(target.meta.gymScheduleChanges)) target.meta.gymScheduleChanges = [];
    if (!target.meta.gymTrackerV2 || typeof target.meta.gymTrackerV2 !== "object" || Array.isArray(target.meta.gymTrackerV2)) {
      target.meta.gymTrackerV2 = { sessions: [], dateOverrides: {} };
    }
    if (!Array.isArray(target.meta.gymTrackerV2.sessions)) target.meta.gymTrackerV2.sessions = [];
    if (!target.meta.gymTrackerV2.dateOverrides || typeof target.meta.gymTrackerV2.dateOverrides !== "object" || Array.isArray(target.meta.gymTrackerV2.dateOverrides)) {
      target.meta.gymTrackerV2.dateOverrides = {};
    }
  }

  function cleanSchedule(schedule) {
    const out = {};
    if (!schedule || typeof schedule !== "object") return out;
    for (const day of DAY_ORDER) {
      const workout = String(schedule[day] || "").trim();
      if (ALLOWED.has(workout)) out[day] = workout;
    }
    return out;
  }

  function scheduleChangesFrom(snapshot = state) {
    ensureGymState(snapshot);
    return snapshot.meta.gymScheduleChanges
      .filter(change => change && validDateKey(change.effectiveDayKey))
      .map(change => ({
        effectiveDayKey: change.effectiveDayKey,
        schedule: cleanSchedule(change.schedule)
      }))
      .sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));
  }

  function scheduleForDate(dayKey, snapshot = state) {
    let schedule = {};
    for (const change of scheduleChangesFrom(snapshot)) {
      if (change.effectiveDayKey <= dayKey) schedule = { ...change.schedule };
      else break;
    }
    if (!Object.keys(schedule).length && dayKey >= SCHEDULE_START) schedule = { ...FALLBACK_SCHEDULE };
    return schedule;
  }

  function workoutForDate(dayKey, snapshot = state) {
    ensureGymState(snapshot);
    const manual = snapshot.meta.gymTrackerV2.dateOverrides?.[dayKey];
    if (manual === "Rest") return "";
    if (ALLOWED.has(manual)) return manual;
    const dayName = typeof getRoutineDayName === "function"
      ? getRoutineDayName(dayKey)
      : DAY_ORDER[keyToLocalDate(dayKey).getDay()];
    return scheduleForDate(dayKey, snapshot)[dayName] || "";
  }

  function sessionScore(session) {
    if (!session || typeof session !== "object") return 0;
    let score = session.completed ? 1000 : 0;
    for (const exercise of Array.isArray(session.exercises) ? session.exercises : []) {
      for (const set of Array.isArray(exercise?.sets) ? exercise.sets : []) {
        if (Number(set?.weight) > 0) score += 2;
        if (Number(set?.reps) > 0) score += 2;
      }
    }
    return score;
  }

  function chooseSession(a, b) {
    if (!a) return b ? clone(b) : null;
    if (!b) return clone(a);
    const at = String(a.updatedAt || "");
    const bt = String(b.updatedAt || "");
    if (at && bt && at !== bt) return clone(at > bt ? a : b);
    return clone(sessionScore(a) >= sessionScore(b) ? a : b);
  }

  function mergeSessionLists(...lists) {
    const byDate = new Map();
    for (const list of lists) {
      for (const session of Array.isArray(list) ? list : []) {
        const date = String(session?.date || "");
        if (!validDateKey(date)) continue;
        byDate.set(date, chooseSession(byDate.get(date), session));
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function readGymSafe() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GYM_SAFE_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeGymSafe() {
    try {
      ensureGymState();
      localStorage.setItem(GYM_SAFE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        gymTrackerV2: clone(state.meta.gymTrackerV2),
        gymScheduleChanges: clone(state.meta.gymScheduleChanges)
      }));
    } catch (error) {
      console.warn("LOCKED OS: could not write gym-safe backup.", error);
    }
  }

  function mergeGymProtectionInto(snapshot) {
    const merged = clone(snapshot || {});
    ensureGymState(merged);
    ensureGymState();

    const safe = readGymSafe();
    const safeTracker = safe?.gymTrackerV2 && typeof safe.gymTrackerV2 === "object"
      ? safe.gymTrackerV2
      : { sessions: [], dateOverrides: {} };

    merged.meta.gymTrackerV2.sessions = mergeSessionLists(
      merged.meta.gymTrackerV2.sessions,
      safeTracker.sessions,
      state.meta.gymTrackerV2.sessions
    );

    merged.meta.gymTrackerV2.dateOverrides = {
      ...(merged.meta.gymTrackerV2.dateOverrides || {}),
      ...(safeTracker.dateOverrides || {}),
      ...(state.meta.gymTrackerV2.dateOverrides || {})
    };

    const byStart = new Map();
    for (const source of [
      merged.meta.gymScheduleChanges,
      safe?.gymScheduleChanges,
      state.meta.gymScheduleChanges
    ]) {
      for (const change of Array.isArray(source) ? source : []) {
        if (!validDateKey(change?.effectiveDayKey)) continue;
        byStart.set(change.effectiveDayKey, {
          effectiveDayKey: change.effectiveDayKey,
          schedule: cleanSchedule(change.schedule)
        });
      }
    }
    merged.meta.gymScheduleChanges = [...byStart.values()]
      .sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));

    return merged;
  }

  function restoreGymSafeIfNeeded() {
    const safe = readGymSafe();
    if (!safe) {
      writeGymSafe();
      return false;
    }

    ensureGymState();
    const before = JSON.stringify({
      tracker: state.meta.gymTrackerV2,
      schedule: state.meta.gymScheduleChanges
    });

    const merged = mergeGymProtectionInto(state);
    state.meta.gymTrackerV2 = merged.meta.gymTrackerV2;
    state.meta.gymScheduleChanges = merged.meta.gymScheduleChanges;

    const after = JSON.stringify({
      tracker: state.meta.gymTrackerV2,
      schedule: state.meta.gymScheduleChanges
    });

    if (before !== after) {
      if (typeof saveLocalState === "function") saveLocalState();
      return true;
    }
    return false;
  }

  if (typeof applyRemoteState === "function" && !applyRemoteState.__gymV3Wrapped) {
    const baseApplyRemoteState = applyRemoteState;
    const wrappedApplyRemoteState = function(remoteState, ...args) {
      const protectedState = mergeGymProtectionInto(remoteState);
      const result = baseApplyRemoteState(protectedState, ...args);
      writeGymSafe();
      return result;
    };
    wrappedApplyRemoteState.__gymV3Wrapped = true;
    applyRemoteState = wrappedApplyRemoteState;
  }

  if (typeof saveState === "function" && !saveState.__gymV3Wrapped) {
    const baseSaveState = saveState;
    const wrappedSaveState = function(...args) {
      writeGymSafe();
      return baseSaveState(...args);
    };
    wrappedSaveState.__gymV3Wrapped = true;
    saveState = wrappedSaveState;
  }

  if (typeof getTretinoinFrequency === "function") {
    getTretinoinDays = function(dayKey = getTodayKey()) {
      const frequency = Number(getTretinoinFrequency(dayKey)) || 1;
      return TRETINOIN_FRIDAY_ANCHORED[frequency] || TRETINOIN_FRIDAY_ANCHORED[1];
    };
  }

  function forceLooksRefresh() {
    setTimeout(() => {
      try { if (typeof render === "function") render(); } catch (_) {}
      try { if (typeof renderRotationCalendar === "function") renderRotationCalendar(); } catch (_) {}
      try { if (typeof renderWeeklyReview === "function") renderWeeklyReview(); } catch (_) {}
    }, 0);
  }

  try {
    if (typeof addLooksTask === "function" && !addLooksTask.__gymV3Wrapped) {
      const baseAddLooksTask = addLooksTask;
      const wrappedAddLooksTask = function(...args) {
        const result = baseAddLooksTask(...args);
        forceLooksRefresh();
        return result;
      };
      wrappedAddLooksTask.__gymV3Wrapped = true;
      addLooksTask = wrappedAddLooksTask;
    }
  } catch (_) {}

  function selectedGymDate() {
    const input = document.getElementById("gymDateInput");
    const value = String(input?.value || getTodayKey());
    return validDateKey(value) ? value : getTodayKey();
  }

  function setGymDate(dayKey) {
    const input = document.getElementById("gymDateInput");
    if (!input || !validDateKey(dayKey)) return;
    input.value = dayKey;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findAdjacentWorkout(fromKey, direction) {
    let cursor = keyToLocalDate(fromKey);
    for (let step = 0; step < 90; step += 1) {
      cursor = addDays(cursor, direction);
      const key = formatDateKey(cursor);
      if (direction < 0 && key < SCHEDULE_START) return null;
      if (workoutForDate(key)) return key;
    }
    return null;
  }

  function installWorkoutNavigation() {
    const prevOld = document.getElementById("gymPrevDayBtn");
    const nextOld = document.getElementById("gymNextDayBtn");

    if (prevOld && prevOld.dataset.gymV3Bound !== "true") {
      const prev = prevOld.cloneNode(true);
      prev.dataset.gymV3Bound = "true";
      prev.setAttribute("aria-label", "Previous workout");
      prev.title = "Previous workout";
      prevOld.replaceWith(prev);
      prev.addEventListener("click", () => {
        const target = findAdjacentWorkout(selectedGymDate(), -1);
        if (target) setGymDate(target);
        else if (typeof toast === "function") toast("No earlier workout in this schedule.");
      });
    }

    if (nextOld && nextOld.dataset.gymV3Bound !== "true") {
      const next = nextOld.cloneNode(true);
      next.dataset.gymV3Bound = "true";
      next.setAttribute("aria-label", "Next workout");
      next.title = "Next workout";
      nextOld.replaceWith(next);
      next.addEventListener("click", () => {
        const target = findAdjacentWorkout(selectedGymDate(), 1);
        if (target) setGymDate(target);
      });
    }

    const dateInput = document.getElementById("gymDateInput");
    if (dateInput) dateInput.min = SCHEDULE_START;
  }

  function collectGymForm() {
    const rows = [...document.querySelectorAll("#gymWorkoutBody .gym-exercise-row")];
    const exercises = [];
    let invalid = false;

    for (const row of rows) {
      const name = String(row.dataset.exercise || "");
      if (!name) continue;
      const sets = [0, 1].map(index => {
        const weight = Number(row.querySelector(`[data-set="${index}"][data-field="weight"]`)?.value || 0);
        const reps = Number(row.querySelector(`[data-set="${index}"][data-field="reps"]`)?.value || 0);
        return {
          weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
          reps: Number.isFinite(reps) ? Math.max(0, Math.round(reps)) : 0
        };
      });
      if (sets.some(set => (set.weight > 0) !== (set.reps > 0))) invalid = true;
      exercises.push({ name, sets });
    }

    return { exercises, invalid };
  }

  function saveGymForm(markComplete) {
    ensureGymState();
    const date = selectedGymDate();
    const workout = workoutForDate(date);
    const status = document.getElementById("gymSaveStatus");
    if (!workout) {
      if (status) status.textContent = "This is a rest day.";
      return;
    }

    const collected = collectGymForm();
    if (collected.invalid) {
      if (status) status.textContent = "Each entered set needs both weight and reps.";
      return;
    }

    if (markComplete) {
      const missing = collected.exercises.some(exercise =>
        exercise.sets.length < 2 ||
        exercise.sets.some(set => !(set.weight > 0 && set.reps > 0))
      );
      if (missing) {
        if (status) status.textContent = "Fill both working sets for every exercise before completing.";
        return;
      }
    }

    let session = state.meta.gymTrackerV2.sessions.find(item => item?.date === date);
    if (!session) {
      session = {
        id: `gym-v3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        workout,
        completed: false,
        exercises: []
      };
      state.meta.gymTrackerV2.sessions.push(session);
    }

    session.workout = workout;
    session.exercises = collected.exercises;
    if (markComplete) session.completed = true;
    session.updatedAt = new Date().toISOString();

    writeGymSafe();
    if (typeof saveState === "function") saveState();
    else if (typeof saveLocalState === "function") saveLocalState();

    if (status) status.textContent = markComplete
      ? "Workout saved and marked complete."
      : "Workout saved.";
    if (typeof toast === "function") toast(markComplete ? "Workout completed." : "Workout saved.");
  }

  function replaceGymSaveButtons() {
    const bindings = [
      ["gymSaveBtn", false],
      ["gymCompleteBtn", true]
    ];
    for (const [id, complete] of bindings) {
      const old = document.getElementById(id);
      if (!old || old.dataset.gymV3Bound === "true") continue;
      const fresh = old.cloneNode(true);
      fresh.dataset.gymV3Bound = "true";
      old.replaceWith(fresh);
      fresh.addEventListener("click", () => saveGymForm(complete));
    }
  }

  function savePopupSchedule(modal) {
    ensureGymState();
    const schedule = {};

    for (const row of modal.querySelectorAll(".gym-v3-day-row.active")) {
      const day = row.dataset.day;
      const select = row.querySelector("select");
      const workout = String(select?.value || "");
      if (!ALLOWED.has(workout)) {
        select?.focus();
        return;
      }
      schedule[day] = workout;
    }

    if (!Object.keys(schedule).length) return;

    state.meta.gymScheduleChanges = scheduleChangesFrom()
      .filter(change => change.effectiveDayKey < SCHEDULE_START);
    state.meta.gymScheduleChanges.push({
      effectiveDayKey: SCHEDULE_START,
      schedule: clone(schedule)
    });
    state.meta.gymScheduleChanges.sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));

    for (const key of Object.keys(state.meta.gymTrackerV2.dateOverrides || {})) {
      if (key >= SCHEDULE_START) delete state.meta.gymTrackerV2.dateOverrides[key];
    }

    writeGymSafe();
    saveState();
    modal.closest(".gym-v3-modal-backdrop")?.remove();

    setGymDate(selectedGymDate());
    forceLooksRefresh();
    if (typeof toast === "function") toast("Gym schedule saved.");
  }

  function openGymScheduleModal() {
    document.querySelector(".gym-v3-modal-backdrop")?.remove();
    const current = scheduleForDate(SCHEDULE_START);

    const backdrop = document.createElement("div");
    backdrop.className = "gym-v3-modal-backdrop";

    const rows = EDITOR_ORDER.map(day => {
      const active = Boolean(current[day]);
      const selected = current[day] || ALLOWED_WORKOUTS[0];
      return `
        <div class="gym-v3-day-row ${active ? "active" : ""}" data-day="${day}">
          <button type="button" class="gym-v3-day-toggle" aria-pressed="${active ? "true" : "false"}">
            <strong>${day.slice(0, 3)}</strong>
            <span>${active ? "On" : "Off"}</span>
          </button>
          <select ${active ? "" : "disabled"}>
            ${ALLOWED_WORKOUTS.map(workout =>
              `<option value="${escapeHtml(workout)}"${workout === selected ? " selected" : ""}>${escapeHtml(workout)}</option>`
            ).join("")}
          </select>
        </div>`;
    }).join("");

    backdrop.innerHTML = `
      <section class="gym-v3-modal" role="dialog" aria-modal="true" aria-labelledby="gymV3ScheduleTitle">
        <div class="gym-v3-modal-head">
          <div>
            <p class="eyebrow blue">Gym</p>
            <h3 id="gymV3ScheduleTitle">Gym schedule</h3>
          </div>
          <button type="button" class="gym-v3-close" aria-label="Close">×</button>
        </div>
        <div class="gym-v3-days">${rows}</div>
        <div class="gym-v3-modal-actions">
          <button type="button" class="btn secondary gym-v3-cancel">Cancel</button>
          <button type="button" class="btn blue gym-v3-save">Save</button>
        </div>
      </section>`;

    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) backdrop.remove();
    });
    backdrop.querySelector(".gym-v3-close")?.addEventListener("click", () => backdrop.remove());
    backdrop.querySelector(".gym-v3-cancel")?.addEventListener("click", () => backdrop.remove());
    backdrop.querySelector(".gym-v3-save")?.addEventListener("click", () => savePopupSchedule(backdrop.querySelector(".gym-v3-modal")));

    backdrop.querySelectorAll(".gym-v3-day-toggle").forEach(button => {
      button.addEventListener("click", () => {
        const row = button.closest(".gym-v3-day-row");
        const next = !row.classList.contains("active");
        row.classList.toggle("active", next);
        button.setAttribute("aria-pressed", next ? "true" : "false");
        button.querySelector("span").textContent = next ? "On" : "Off";
        row.querySelector("select").disabled = !next;
      });
    });
  }

  function installGymScheduleButton() {
    const adminCard = document.getElementById("gymScheduleAdminCard");
    if (adminCard) adminCard.classList.add("gym-v3-admin-hidden");

    const weekCard = document.querySelector("#gymPage .gym-week-card");
    const panelTitle = weekCard?.querySelector(".panel-title");
    if (!panelTitle || document.getElementById("gymV3ScheduleButton")) return;

    const button = document.createElement("button");
    button.id = "gymV3ScheduleButton";
    button.type = "button";
    button.className = "gym-v3-schedule-button";
    button.textContent = "⚙";
    button.title = "Edit gym schedule";
    button.setAttribute("aria-label", "Edit gym schedule");
    panelTitle.appendChild(button);
    button.addEventListener("click", openGymScheduleModal);
  }

  function installStyles() {
    if (document.getElementById("lockedOsGymV3Styles")) return;
    const style = document.createElement("style");
    style.id = "lockedOsGymV3Styles";
    style.textContent = `
      .gym-v3-admin-hidden{display:none!important}
      .gym-v3-schedule-button{
        width:32px;height:32px;border-radius:999px;border:1px solid var(--line);
        background:rgba(255,255,255,.45);color:var(--muted);font:inherit;font-weight:900;
        display:grid;place-items:center;cursor:pointer;margin-left:6px
      }
      .gym-v3-schedule-button:hover{background:rgba(255,255,255,.8);color:var(--text)}
      .gym-v3-modal-backdrop{
        position:fixed;inset:0;z-index:9999;background:rgba(20,16,12,.42);
        display:grid;place-items:center;padding:18px;backdrop-filter:blur(8px)
      }
      .gym-v3-modal{
        width:min(620px,100%);max-height:min(760px,92vh);overflow:auto;
        border:1px solid var(--line);border-radius:24px;background:var(--card);
        box-shadow:0 24px 80px rgba(30,20,10,.26);padding:20px
      }
      .gym-v3-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
      .gym-v3-modal-head h3{margin:0;font-size:1.8rem;letter-spacing:-.035em}
      .gym-v3-close{width:36px;height:36px;border-radius:999px;background:rgba(42,30,18,.07);color:var(--text);font-size:1.4rem}
      .gym-v3-days{display:grid;gap:8px}
      .gym-v3-day-row{display:grid;grid-template-columns:92px 1fr;gap:8px;align-items:center}
      .gym-v3-day-toggle{
        min-height:46px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.42);
        color:var(--text);display:flex;align-items:center;justify-content:space-between;padding:0 12px
      }
      .gym-v3-day-toggle span{font-size:.7rem;color:var(--muted);font-weight:900}
      .gym-v3-day-row.active .gym-v3-day-toggle{border-color:rgba(37,132,184,.35);background:var(--blue-soft)}
      .gym-v3-day-row select{
        min-height:46px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.62);
        color:var(--text);font:inherit;font-weight:800;padding:0 12px
      }
      .gym-v3-day-row select:disabled{opacity:.45}
      .gym-v3-modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}
      @media(max-width:560px){
        .gym-v3-day-row{grid-template-columns:82px 1fr}
        .gym-v3-modal{padding:15px;border-radius:20px}
      }
    `;
    document.head.appendChild(style);
  }

  function installAll() {
    if (typeof state === "undefined" || typeof getTodayKey !== "function") return;

    ensureGymState();
    restoreGymSafeIfNeeded();
    writeGymSafe();

    installStyles();
    installWorkoutNavigation();
    replaceGymSaveButtons();
    installGymScheduleButton();
    forceLooksRefresh();

    document.querySelectorAll('[data-tab="gymPage"], [data-tab="adminPage"], [data-admin-panel="adminRoutinePanel"]').forEach(button => {
      if (button.dataset.gymV3UiHook === "true") return;
      button.dataset.gymV3UiHook = "true";
      button.addEventListener("click", () => setTimeout(() => {
        restoreGymSafeIfNeeded();
        installWorkoutNavigation();
        replaceGymSaveButtons();
        installGymScheduleButton();
      }, 25));
    });

    window.addEventListener("focus", () => {
      const restored = restoreGymSafeIfNeeded();
      if (restored) {
        writeGymSafe();
        forceLooksRefresh();
      }
    });
  }

  const start = () => setTimeout(installAll, 35);
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start);
  else start();
})();
