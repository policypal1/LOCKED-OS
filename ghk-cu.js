"use strict";

/*
  LOCKED OS — Sept 11 gym/UI fix v2
  Loads the exact previous deployed behavior, then:
  - fixes the Gym tab so it uses the same new split as Admin
  - removes the schedule-start UI and extra gym-schedule copy
  - makes the schedule effective from Friday, Sep 11
  - keeps rotation-chip text the normal text color; only chip backgrounds vary
*/
(() => {
  const previousDeploy = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@5efbb26c0ba2f5a8551991d6fdb8134c6dbccb09/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", previousDeploy, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-before-gym-v2.js");
  } catch (error) {
    console.error("LOCKED OS: could not load the previous deployed ghk-cu.js.", error);
  }
})();

(() => {
  "use strict";

  const FLAG = "__lockedOsGymUiFixV2";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const SCHEDULE_START = "2026-09-11"; // Friday night — fixed, no UI control.
  const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const EDITOR_DAY_ORDER = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
  const ALLOWED_WORKOUTS = ["Chest + side delts", "Back + rear delts", "Arms", "Legs + Abs"];
  const ALLOWED_WORKOUT_SET = new Set(ALLOWED_WORKOUTS);

  const WORKOUT_EXERCISES = {
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
    Arms: [
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

  let selectedGymDate = "";

  const clone = value => JSON.parse(JSON.stringify(value));

  function ensureState() {
    state.meta = state.meta || {};
    if (!Array.isArray(state.meta.gymScheduleChanges)) state.meta.gymScheduleChanges = [];
    if (!state.meta.gymTrackerV2 || typeof state.meta.gymTrackerV2 !== "object" || Array.isArray(state.meta.gymTrackerV2)) {
      state.meta.gymTrackerV2 = { sessions: [], dateOverrides: {} };
    }
    if (!Array.isArray(state.meta.gymTrackerV2.sessions)) state.meta.gymTrackerV2.sessions = [];
    if (!state.meta.gymTrackerV2.dateOverrides || typeof state.meta.gymTrackerV2.dateOverrides !== "object" || Array.isArray(state.meta.gymTrackerV2.dateOverrides)) {
      state.meta.gymTrackerV2.dateOverrides = {};
    }
  }

  function normalizeSchedule(schedule) {
    const output = {};
    if (!schedule || typeof schedule !== "object") return output;
    for (const day of DAY_ORDER) {
      const value = String(schedule[day] || "").trim();
      if (ALLOWED_WORKOUT_SET.has(value)) output[day] = value;
    }
    return output;
  }

  function getScheduleChanges() {
    ensureState();
    return state.meta.gymScheduleChanges
      .filter(change => change && isDateKey(change.effectiveDayKey))
      .map(change => ({
        effectiveDayKey: change.effectiveDayKey,
        schedule: normalizeSchedule(change.schedule)
      }))
      .sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));
  }

  function scheduleForDay(dayKey = getTodayKey()) {
    let schedule = {};
    for (const change of getScheduleChanges()) {
      if (change.effectiveDayKey <= dayKey) schedule = { ...change.schedule };
      else break;
    }

    /* If older data has no valid schedule yet, preserve the requested 4-day split. */
    if (!Object.keys(schedule).length && dayKey >= SCHEDULE_START) {
      schedule = {
        Monday: "Chest + side delts",
        Wednesday: "Back + rear delts",
        Friday: "Arms",
        Saturday: "Legs + Abs"
      };
    }
    return schedule;
  }

  function workoutForDay(dayKey = getTodayKey()) {
    ensureState();
    const manual = state.meta.gymTrackerV2.dateOverrides[dayKey];
    if (manual === "Rest") return "";
    if (ALLOWED_WORKOUT_SET.has(manual)) return manual;
    return scheduleForDay(dayKey)[getRoutineDayName(dayKey)] || "";
  }

  function collectAdminSchedule() {
    const editor = document.getElementById("gymScheduleEditor");
    if (!editor) return { ok: false, error: "Gym schedule editor is not available." };

    const schedule = {};
    const activeRows = [...editor.querySelectorAll(".gym-day-editor-row.active")];
    if (!activeRows.length) return { ok: false, error: "Choose at least one gym day." };

    for (const row of activeRows) {
      const day = row.dataset.day;
      const value = String(row.querySelector(".gym-day-workout")?.value || "").trim();
      if (!ALLOWED_WORKOUT_SET.has(value)) {
        return { ok: false, error: `Choose a workout for ${day}.`, focus: row.querySelector(".gym-day-workout") };
      }
      schedule[day] = value;
    }
    return { ok: true, schedule };
  }

  function saveAdminSchedule() {
    ensureState();
    const result = collectAdminSchedule();
    const error = document.getElementById("gymScheduleError");
    if (!result.ok) {
      if (error) error.textContent = result.error;
      result.focus?.focus();
      return;
    }
    if (error) error.textContent = "";

    /* One authoritative schedule from Friday night forward. */
    state.meta.gymScheduleChanges = getScheduleChanges().filter(change => change.effectiveDayKey < SCHEDULE_START);
    state.meta.gymScheduleChanges.push({
      effectiveDayKey: SCHEDULE_START,
      schedule: clone(result.schedule)
    });
    state.meta.gymScheduleChanges.sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));

    saveState();
    populateAdminEditor();
    renderGymV2();
    try { render(); } catch (_) {}
    try { if (typeof renderRotationCalendar === "function") renderRotationCalendar(); } catch (_) {}
    try { if (typeof renderWeeklyReview === "function") renderWeeklyReview(); } catch (_) {}
    if (typeof toast === "function") toast("Gym schedule saved.");
  }

  function simplifyAdminGymCard() {
    const card = document.getElementById("gymScheduleAdminCard");
    const editor = document.getElementById("gymScheduleEditor");
    if (!card || !editor) return;

    document.getElementById("gymScheduleStartWrap")?.remove();

    /* Remove the long explanation; keep only the title, editor, errors, and Save button. */
    [...card.children].forEach(child => {
      if (
        child.tagName === "P" &&
        !child.classList.contains("eyebrow") &&
        child.id !== "gymScheduleError"
      ) child.remove();
    });

    const count = document.getElementById("gymScheduleCount");
    if (count) count.style.display = "none";

    for (const day of EDITOR_DAY_ORDER) {
      const row = editor.querySelector(`.gym-day-editor-row[data-day="${day}"]`);
      if (row) editor.appendChild(row);
    }

    const oldSave = document.getElementById("saveGymScheduleBtn");
    if (oldSave && oldSave.dataset.gymV2Bound !== "true") {
      const button = oldSave.cloneNode(true);
      button.dataset.gymV2Bound = "true";
      oldSave.replaceWith(button);
      button.addEventListener("click", saveAdminSchedule);
    }
  }

  function populateAdminEditor() {
    const editor = document.getElementById("gymScheduleEditor");
    if (!editor) return;
    const schedule = scheduleForDay(SCHEDULE_START);

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
  }

  function installRoutineAuthority() {
    if (typeof window.getLooksRoutine !== "function") return;
    const previousGetLooksRoutine = window.getLooksRoutine;

    window.getLooksRoutine = function(dayKey = getTodayKey()) {
      const routine = previousGetLooksRoutine(dayKey);
      if (!routine || typeof routine !== "object") return routine;
      routine.midday = Array.isArray(routine.midday) ? routine.midday.filter(task => task?.id !== "gym") : [];
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
      const session = getSession(dayKey);
      const done = new Set(day?.looksDone || []);
      if (session?.completed || done.has("gym")) return "Done";
      if (dayKey === getTodayKey()) return "Not yet";
      return "Didn't go";
    };

    window.getRotationTasksForDay = function(dayKey) {
      const dayName = getRoutineDayName(dayKey);
      const items = [];
      const workout = workoutForDay(dayKey);
      if (workout) items.push({ label: `Gym: ${workout}`, type: "gym" });

      const jsDay = keyToLocalDate(dayKey).getDay();
      if (jsDay >= 1 && jsDay <= 5) items.push({ label: "MK-677", type: "mk677" });

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
      if (dayName === "Sunday") items.push({ label: "Lip exfoliation", type: "lips" });

      const customTasks = Array.isArray(state?.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [];
      const existing = new Set(items.map(item => String(item.label || "").trim().toLowerCase()));
      for (const task of customTasks) {
        const days = Array.isArray(task?.days) ? task.days.filter(day => DAY_ORDER.includes(day)) : [];
        if (!days.length || days.length >= 7 || !days.includes(dayName)) continue;
        const label = String(task?.title || "").trim();
        if (!label || existing.has(label.toLowerCase())) continue;
        items.push({ label, type: "custom" });
        existing.add(label.toLowerCase());
      }
      return items;
    };
  }

  function getSession(dateKey) {
    ensureState();
    return state.meta.gymTrackerV2.sessions.find(session => session?.date === dateKey) || null;
  }

  function getSessionForWrite(dateKey) {
    ensureState();
    let session = getSession(dateKey);
    if (!session) {
      session = {
        id: `gym-v2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date: dateKey,
        workout: workoutForDay(dateKey),
        completed: false,
        updatedAt: new Date().toISOString(),
        exercises: []
      };
      state.meta.gymTrackerV2.sessions.push(session);
    }
    return session;
  }

  function exerciseData(session, name) {
    return session?.exercises?.find(exercise => exercise?.name === name) || null;
  }

  function previousExercise(name, beforeDate) {
    ensureState();
    return [...state.meta.gymTrackerV2.sessions]
      .filter(session => session?.date < beforeDate)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map(session => exerciseData(session, name))
      .find(Boolean) || null;
  }

  function setText(set) {
    return set && Number(set.weight) > 0 && Number(set.reps) > 0
      ? `${Number(set.weight)} lb × ${Number(set.reps)}`
      : "—";
  }

  function selectedDate() {
    const input = document.getElementById("gymDateInput");
    const value = String(input?.value || selectedGymDate || getTodayKey());
    return isDateKey(value) ? value : getTodayKey();
  }

  function weekDates(dateKey) {
    const selected = keyToLocalDate(dateKey);
    const mondayOffset = (selected.getDay() + 6) % 7;
    const monday = addDays(selected, -mondayOffset);
    return Array.from({ length: 7 }, (_, index) => formatDateKey(addDays(monday, index)));
  }

  function renderGymWeekV2() {
    const grid = document.getElementById("gymWeekGrid");
    if (!grid) return;
    const today = getTodayKey();
    grid.innerHTML = "";

    for (const dateKey of weekDates(selectedGymDate)) {
      const workout = workoutForDay(dateKey);
      if (!workout) continue;
      const session = getSession(dateKey);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `gym-day-card${dateKey === today ? " today" : ""}${dateKey === selectedGymDate ? " selected" : ""}`;
      button.dataset.gymDate = dateKey;
      const date = keyToLocalDate(dateKey);
      const dayName = DAY_ORDER[date.getDay()];
      button.innerHTML = `<strong>${dayName.slice(0, 3)} · ${date.getMonth() + 1}/${date.getDate()}</strong><span>${escapeHtml(workout)}${session?.completed ? " ✓" : ""}</span>`;
      button.addEventListener("click", () => {
        selectedGymDate = dateKey;
        renderGymV2();
      });
      grid.appendChild(button);
    }
  }

  function renderGymWorkoutV2() {
    const body = document.getElementById("gymWorkoutBody");
    const title = document.getElementById("gymWorkoutTitle");
    const meta = document.getElementById("gymWorkoutMeta");
    const input = document.getElementById("gymDateInput");
    const actions = document.getElementById("gymLogActions");
    const deleteBtn = document.getElementById("gymDeleteLogBtn");
    if (!body || !title || !meta || !input || !actions) return;

    const dateKey = selectedGymDate;
    const workout = workoutForDay(dateKey);
    const date = keyToLocalDate(dateKey);
    const dayName = DAY_ORDER[date.getDay()];
    const session = getSession(dateKey);
    input.value = dateKey;
    title.textContent = workout || "Rest day";

    if (deleteBtn) deleteBtn.classList.toggle("hidden", !session);

    if (!workout) {
      meta.textContent = `${dayName} · recovery day`;
      body.innerHTML = `<div class="gym-rest"><strong>Rest day</strong><span>No lifting scheduled.</span></div>`;
      actions.classList.add("hidden");
      return;
    }

    const exercises = WORKOUT_EXERCISES[workout] || [];
    meta.textContent = `${dayName} · ${exercises.length * 2} working sets · 2 sets each · 6–10 reps`;
    if (session?.completed) meta.textContent += " · Workout completed ✓";
    actions.classList.remove("hidden");

    const list = document.createElement("div");
    list.className = "gym-exercise-list";

    for (const exerciseName of exercises) {
      const current = exerciseData(session, exerciseName) || { name: exerciseName, sets: [] };
      const previous = previousExercise(exerciseName, dateKey);
      const row = document.createElement("div");
      row.className = "gym-exercise-row";
      row.dataset.exercise = exerciseName;

      const setMarkup = [0, 1].map(index => {
        const set = current.sets?.[index] || { weight: 0, reps: 0 };
        return `<div class="gym-set-box">
          <label><span>Set ${index + 1} lb</span><input class="gym-set-input" data-set="${index}" data-field="weight" inputmode="decimal" min="0" max="2000" step="0.5" type="number" value="${set.weight || ""}" placeholder="Weight"/></label>
          <label><span>Reps</span><input class="gym-set-input" data-set="${index}" data-field="reps" inputmode="numeric" min="0" max="100" step="1" type="number" value="${set.reps || ""}" placeholder="6–10"/></label>
        </div>`;
      }).join("");

      row.innerHTML = `
        <div class="gym-exercise-name"><strong>${escapeHtml(exerciseName)}</strong><span>2 × 6–10</span></div>
        <div class="gym-prev"><strong>Previous</strong>${previous ? `${setText(previous.sets?.[0])}<br>${setText(previous.sets?.[1])}` : "No previous log"}</div>
        ${setMarkup}
        <div class="gym-row-progress neutral">Track the next clean progression.</div>`;
      list.appendChild(row);
    }

    body.innerHTML = "";
    body.appendChild(list);
  }

  function collectGymInputs() {
    const exercises = [];
    let invalid = false;
    document.querySelectorAll("#gymWorkoutBody .gym-exercise-row").forEach(row => {
      const name = row.dataset.exercise || "";
      const sets = [0, 1].map(index => {
        const weight = Number(row.querySelector(`[data-set="${index}"][data-field="weight"]`)?.value || 0);
        const reps = Number(row.querySelector(`[data-set="${index}"][data-field="reps"]`)?.value || 0);
        return {
          weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
          reps: Number.isFinite(reps) ? Math.max(0, Math.round(reps)) : 0
        };
      });
      if (sets.some(set => (set.weight > 0) !== (set.reps > 0))) invalid = true;
      if (sets.some(set => set.weight > 0 || set.reps > 0)) exercises.push({ name, sets });
    });
    return { exercises, invalid };
  }

  function saveGymLog(markComplete) {
    const workout = workoutForDay(selectedGymDate);
    if (!workout) return;
    const collected = collectGymInputs();
    const status = document.getElementById("gymSaveStatus");
    if (collected.invalid) {
      if (status) status.textContent = "Each logged set needs both a weight and rep count.";
      return;
    }
    if (!collected.exercises.length) {
      if (status) status.textContent = "Log at least one set before saving.";
      return;
    }

    if (markComplete) {
      const byName = new Map(collected.exercises.map(exercise => [exercise.name, exercise]));
      const missing = (WORKOUT_EXERCISES[workout] || []).some(name => {
        const exercise = byName.get(name);
        return !exercise || exercise.sets.some(set => !(set.weight > 0 && set.reps > 0));
      });
      if (missing) {
        if (status) status.textContent = "Fill in both working sets for every exercise before marking complete.";
        return;
      }
    }

    const session = getSessionForWrite(selectedGymDate);
    session.workout = workout;
    session.exercises = (WORKOUT_EXERCISES[workout] || []).map(name => {
      return collected.exercises.find(exercise => exercise.name === name) || { name, sets: [] };
    });
    if (markComplete) session.completed = true;
    session.updatedAt = new Date().toISOString();
    saveState();
    renderGymV2();
    if (status) status.textContent = markComplete ? "Workout saved and marked complete." : "Workout saved.";
    if (typeof toast === "function") toast(markComplete ? "Workout completed." : "Workout saved.");
  }

  function deleteGymLogV2() {
    ensureState();
    const before = state.meta.gymTrackerV2.sessions.length;
    state.meta.gymTrackerV2.sessions = state.meta.gymTrackerV2.sessions.filter(session => session?.date !== selectedGymDate);
    if (state.meta.gymTrackerV2.sessions.length !== before) saveState();
    renderGymV2();
  }

  function replaceGymControls() {
    const ids = ["gymPrevDayBtn", "gymNextDayBtn", "gymTodayBtn", "gymDateInput", "gymSaveBtn", "gymCompleteBtn", "gymDeleteLogBtn"];
    const replacements = {};
    for (const id of ids) {
      const old = document.getElementById(id);
      if (!old || old.dataset.gymV2Bound === "true") {
        if (old) replacements[id] = old;
        continue;
      }
      const fresh = old.cloneNode(true);
      fresh.dataset.gymV2Bound = "true";
      old.replaceWith(fresh);
      replacements[id] = fresh;
    }

    replacements.gymPrevDayBtn?.addEventListener("click", () => {
      selectedGymDate = formatDateKey(addDays(keyToLocalDate(selectedGymDate), -1));
      renderGymV2();
    });
    replacements.gymNextDayBtn?.addEventListener("click", () => {
      selectedGymDate = formatDateKey(addDays(keyToLocalDate(selectedGymDate), 1));
      renderGymV2();
    });
    replacements.gymTodayBtn?.addEventListener("click", () => {
      selectedGymDate = getTodayKey();
      renderGymV2();
    });
    replacements.gymDateInput?.addEventListener("change", event => {
      const value = String(event.target.value || "");
      if (isDateKey(value)) {
        selectedGymDate = value;
        renderGymV2();
      }
    });
    replacements.gymSaveBtn?.addEventListener("click", () => saveGymLog(false));
    replacements.gymCompleteBtn?.addEventListener("click", () => saveGymLog(true));
    replacements.gymDeleteLogBtn?.addEventListener("click", deleteGymLogV2);
  }

  function renderGymV2() {
    const page = document.getElementById("gymPage");
    if (!page) return;
    ensureState();
    if (!isDateKey(selectedGymDate)) selectedGymDate = getTodayKey();

    replaceGymControls();

    const todayBadge = document.getElementById("gymTodayBadge");
    if (todayBadge) {
      const workout = workoutForDay(getTodayKey());
      todayBadge.textContent = workout ? `Today · ${workout}` : "Today · Rest";
    }

    const weekBadge = page.querySelector(".gym-week-card .badge");
    if (weekBadge) weekBadge.textContent = `${Object.keys(scheduleForDay(selectedGymDate)).length} days / week`;

    const heroCopy = page.querySelector(".gym-hero p:not(.eyebrow)");
    if (heroCopy) heroCopy.textContent = "Chest + side delts · Back + rear delts · Arms · Legs + abs.";

    /* The old override control only understands Push/Pull. Keep it out of this version. */
    page.querySelector(".gym-day-override")?.remove();
    page.querySelector(".gym-history-card")?.remove();

    renderGymWeekV2();
    renderGymWorkoutV2();
  }

  function installChipStyles() {
    let style = document.getElementById("lockedOsGymUiV2Styles");
    if (!style) {
      style = document.createElement("style");
      style.id = "lockedOsGymUiV2Styles";
      document.head.appendChild(style);
    }
    style.textContent = `
      /* Only the bubble backgrounds are color-coded. Text stays the normal app color. */
      .rotation-chip.gym{background:rgba(47,143,86,.13)!important;color:var(--text)!important}
      .rotation-chip.mk677{background:rgba(37,132,184,.13)!important;color:var(--text)!important}
      .rotation-chip.tretinoin{background:rgba(104,91,180,.13)!important;color:var(--text)!important}
      .rotation-chip.microneedle{background:rgba(139,92,170,.14)!important;color:var(--text)!important}
      .rotation-chip.sheets{background:rgba(65,145,157,.13)!important;color:var(--text)!important}
      .rotation-chip.shave{background:rgba(92,104,120,.11)!important;color:var(--text)!important}
      .rotation-chip.lips{background:rgba(190,92,130,.12)!important;color:var(--text)!important}
      .rotation-chip.custom{background:rgba(42,30,18,.07)!important;color:var(--text)!important}
    `;
  }

  function bindPageTabs() {
    document.querySelectorAll('[data-tab="gymPage"]').forEach(button => {
      if (button.dataset.gymV2TabBound === "true") return;
      button.dataset.gymV2TabBound = "true";
      button.addEventListener("click", () => setTimeout(renderGymV2, 0));
    });

    document.querySelectorAll('[data-tab="adminPage"], [data-admin-panel="adminRoutinePanel"]').forEach(button => {
      if (button.dataset.gymV2AdminBound === "true") return;
      button.dataset.gymV2AdminBound = "true";
      button.addEventListener("click", () => setTimeout(() => {
        simplifyAdminGymCard();
        populateAdminEditor();
      }, 50));
    });
  }

  function install() {
    if (
      typeof state === "undefined" ||
      typeof saveState !== "function" ||
      typeof getTodayKey !== "function" ||
      typeof getRoutineDayName !== "function"
    ) return;

    ensureState();
    installChipStyles();
    installRoutineAuthority();
    simplifyAdminGymCard();
    populateAdminEditor();
    bindPageTabs();

    selectedGymDate = getTodayKey();
    setTimeout(renderGymV2, 0);

    try { render(); } catch (_) {}
    try { if (typeof renderRotationCalendar === "function") renderRotationCalendar(); } catch (_) {}
    try { if (typeof renderWeeklyReview === "function") renderWeeklyReview(); } catch (_) {}
  }

  const start = () => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      install();
      if (document.getElementById("gymPage") && document.getElementById("gymScheduleEditor")) {
        clearInterval(timer);
      } else if (attempts >= 20) {
        clearInterval(timer);
      }
    }, 120);
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start);
  else start();
})();
