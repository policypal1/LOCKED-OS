"use strict";

/* Drop-in LOCKED OS replacement. Loads the pinned original ghk-cu.js, then applies the requested update. */
(() => {
  const originalUrl = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@48b687462247c682f2762c86028fdc0f21030f61/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", originalUrl, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    let source = request.responseText;

    const upperArmsBlock = `    "Upper + Arms": [
      "Incline Dumbbell Bench Press",
      "Lat Pulldown",
      "Chest-Supported Row",
      "Cable Lateral Raise",
      "Triceps Pressdown",
      "Cable Curl"
    ],
`;
    source = source.replace('  const GYM_WORKOUTS = {\n    Push:', '  const GYM_WORKOUTS = {\n' + upperArmsBlock + '    Push:');
    source = source.replaceAll('["Push", "Pull", "Legs + Abs", "Rest"]', '["Push", "Pull", "Legs + Abs", "Upper + Arms", "Rest"]');
    source = source.replaceAll('["Push", "Pull", "Legs + Abs"]', '["Push", "Pull", "Legs + Abs", "Upper + Arms"]');

    (0, eval)(source + "\n//# sourceURL=locked-os-pinned-ghk-cu.js");
  } catch (error) {
    console.error("LOCKED OS: could not load the pinned ghk-cu.js base file.", error);
  }
})();

(() => {
  "use strict";

  const VOICE_TASK_START = "2026-09-09";
  const GYM_SCHEDULE_START = "2026-09-09";
  const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const DEFAULT_GYM_SCHEDULE = {
    Monday: "Push",
    Tuesday: "Pull",
    Thursday: "Legs + Abs",
    Saturday: "Upper + Arms"
  };
  const GYM_WORKOUT_CHOICES = new Set(["Push", "Pull", "Legs + Abs", "Upper + Arms"]);
  const LEGACY_GYM_DAY_PLAN = {
    Sunday: "Legs + Abs",
    Monday: "Push",
    Tuesday: "Pull",
    Wednesday: "Rest",
    Thursday: "Legs + Abs",
    Friday: "Push",
    Saturday: "Pull"
  };

  const DEFAULT_VOICE_INFO = `10-minute shower voice protocol

1. Relax — 1 minute
Keep your shoulders down, jaw loose, and neck neutral. Do not force your larynx downward.

2. Low pitch glides — 2 minutes
Hum “mmm” at your normal pitch, then slowly glide a little lower. Stay comfortable. Stop before it becomes gravelly or strained.

3. Resonance — 2 minutes
Hum “mmm,” then open into words such as “mom,” “morning,” and “more.” Aim for a fuller, relaxed sound instead of squeezing your throat.

4. Speaking practice — 4 minutes
Speak or read aloud at a pitch only slightly below your normal comfortable voice. Use steady airflow, slower pacing, and avoid forcing the bottom of your range.

5. Quick check — 1 minute
Say the same short paragraph or a few sentences. Focus on relaxed, consistent resonance.

Rule: no pain, burning, hoarseness, or throat strain. If your voice feels tired, stop for the day.`;

  const DEFAULT_LIP_INFO = `Sunday lip exfoliation

1. Wet your lips with warm water.
2. Gently exfoliate for about 20–30 seconds with a soft damp washcloth or very soft toothbrush.
3. Rinse and pat dry.
4. Apply a thin layer of Vaseline.

Keep it gentle. Do not scrub cracked, bleeding, or irritated lips, and avoid harsh acids or abrasive scrubs.`;

  function install() {
    if (window.__lockedOsSept09Installed) return;
    window.__lockedOsSept09Installed = true;

    if (
      typeof window.getTodayKey !== "function" ||
      typeof window.getLooksRoutine !== "function" ||
      typeof window.getRoutineDayName !== "function"
    ) return;

    function ensureMeta() {
      state.meta = state.meta || {};
      if (!state.meta.taskInfo || typeof state.meta.taskInfo !== "object" || Array.isArray(state.meta.taskInfo)) {
        state.meta.taskInfo = {};
      }
      if (!Array.isArray(state.meta.gymScheduleChanges)) {
        state.meta.gymScheduleChanges = [];
      }
    }

    function cleanInfo(value) {
      return String(value ?? "").trim().slice(0, 4000);
    }

    function getStoredInfo(taskId) {
      ensureMeta();
      return cleanInfo(state.meta.taskInfo[taskId]);
    }

    function getDefaultTaskInfo(task, dayKey = getTodayKey()) {
      if (task.id === "voice-training") return DEFAULT_VOICE_INFO;
      if (task.id === "lip-care" && getRoutineDayName(dayKey) === "Sunday") return DEFAULT_LIP_INFO;
      return cleanInfo(task.info || "");
    }

    function getTaskInfo(task, dayKey = getTodayKey()) {
      const stored = getStoredInfo(task.id);
      return stored || getDefaultTaskInfo(task, dayKey);
    }

    function saveTaskInfo(taskId, value) {
      ensureMeta();
      const cleaned = cleanInfo(value);
      if (cleaned) state.meta.taskInfo[taskId] = cleaned;
      else delete state.meta.taskInfo[taskId];
      saveState();
    }

    function openInfoEditor(row, task, panel, dayKey) {
      if (panel.querySelector(".task-info-editor")) return;

      const current = getTaskInfo(task, dayKey);
      const editor = document.createElement("div");
      editor.className = "task-info-editor";

      const textarea = document.createElement("textarea");
      textarea.className = "task-info-textarea";
      textarea.maxLength = 4000;
      textarea.rows = 8;
      textarea.value = current;
      textarea.placeholder = "Add instructions, a protocol, notes, or anything you want to remember about this task.";

      const actions = document.createElement("div");
      actions.className = "task-info-actions";

      const save = document.createElement("button");
      save.type = "button";
      save.className = "btn blue compact";
      save.textContent = "Save info";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn secondary compact";
      cancel.textContent = "Cancel";

      save.addEventListener("click", () => {
        saveTaskInfo(task.id, textarea.value);
        panel.querySelector(".task-more-info-text").textContent =
          getTaskInfo(task, dayKey) || "No extra info yet.";
        editor.remove();
        toast("Task info saved.");
      });

      cancel.addEventListener("click", () => editor.remove());

      actions.append(save, cancel);
      editor.append(textarea, actions);
      panel.appendChild(editor);
      requestAnimationFrame(() => textarea.focus());
    }

    const baseCreateTaskRow = window.createTaskRow;
    window.createTaskRow = function(task, done, skipped, theme, onToggle, onSkip, onEdit, controls = {}) {
      const row = baseCreateTaskRow(task, done, skipped, theme, onToggle, onSkip, onEdit, controls);
      const dayKey = typeof window.lockedOsLooksKey === "function" && theme === "looks-task"
        ? lockedOsLooksKey()
        : getTodayKey();

      let menu = row.querySelector("details.task-menu");
      if (!menu) {
        menu = document.createElement("details");
        menu.className = "task-menu";

        const summary = document.createElement("summary");
        summary.setAttribute("aria-label", `Options for ${task.title}`);
        summary.textContent = "⋯";

        const popover = document.createElement("div");
        popover.className = "task-menu-popover";
        menu.append(summary, popover);
        row.appendChild(menu);
        row.classList.remove("no-menu");
      }

      const popover = menu.querySelector(".task-menu-popover");
      if (popover && !popover.querySelector(".task-more-info-action")) {
        const infoButton = document.createElement("button");
        infoButton.type = "button";
        infoButton.className = "task-menu-action task-more-info-action";
        infoButton.textContent = "More info";

        const panel = document.createElement("div");
        panel.className = "task-more-info-panel";
        panel.hidden = true;

        const head = document.createElement("div");
        head.className = "task-more-info-head";
        const label = document.createElement("strong");
        label.textContent = "More info";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "task-info-close";
        close.textContent = "×";
        close.setAttribute("aria-label", "Close more info");
        head.append(label, close);

        const text = document.createElement("div");
        text.className = "task-more-info-text";
        text.textContent = getTaskInfo(task, dayKey) || "No extra info yet.";

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "task-info-edit";
        edit.textContent = getTaskInfo(task, dayKey) ? "Edit info" : "Add info";
        edit.addEventListener("click", () => openInfoEditor(row, task, panel, dayKey));

        close.addEventListener("click", () => {
          panel.hidden = true;
          row.classList.remove("showing-info");
        });

        infoButton.addEventListener("click", event => {
          event.stopPropagation();
          menu.open = false;
          panel.hidden = !panel.hidden;
          row.classList.toggle("showing-info", !panel.hidden);
          if (!panel.hidden) {
            text.textContent = getTaskInfo(task, dayKey) || "No extra info yet.";
            edit.textContent = getTaskInfo(task, dayKey) ? "Edit info" : "Add info";
          }
        });

        panel.append(head, text, edit);
        popover.insertBefore(infoButton, popover.firstChild);
        row.appendChild(panel);
      }

      return row;
    };

    /* Voice training starts now, so old history is not retroactively marked incomplete. */
    const baseGetLooksRoutine = window.getLooksRoutine;
    window.getLooksRoutine = function(dayKey = getTodayKey()) {
      const routine = baseGetLooksRoutine(dayKey);
      if (dayKey >= VOICE_TASK_START && !routine.morning.some(task => task.id === "voice-training")) {
        const voiceTask = {
          id: "voice-training",
          title: "Train voice in shower",
          subtitle: "10-minute pitch + resonance protocol"
        };
        const conditionerIndex = routine.morning.findIndex(task => task.id === "conditioner-soap");
        routine.morning.splice(conditionerIndex >= 0 ? conditionerIndex + 1 : 1, 0, voiceTask);
      }

      /* Keep the voice task next to the shower tasks even if a saved custom order exists. */
      if (dayKey >= VOICE_TASK_START) {
        const index = routine.morning.findIndex(task => task.id === "voice-training");
        if (index >= 0) {
          const [voiceTask] = routine.morning.splice(index, 1);
          const conditionerIndex = routine.morning.findIndex(task => task.id === "conditioner-soap");
          routine.morning.splice(conditionerIndex >= 0 ? conditionerIndex + 1 : 1, 0, voiceTask);
        }
      }

      /* Apply the editable gym schedule without changing older days. */
      if (dayKey >= GYM_SCHEDULE_START) {
        routine.midday = routine.midday.filter(task => task.id !== "gym");
        const workout = getGymWorkoutForDay(dayKey);
        if (workout) {
          routine.midday.unshift({ id: "gym", title: `Gym: ${workout}` });
        }
      }

      return routine;
    };

    function normalizeGymSchedule(schedule) {
      const output = {};
      if (!schedule || typeof schedule !== "object") return output;
      for (const day of DAY_ORDER) {
        const name = String(schedule[day] || "").trim().slice(0, 80);
        if (GYM_WORKOUT_CHOICES.has(name)) output[day] = name;
      }
      return output;
    }

    function getGymScheduleChanges() {
      ensureMeta();
      return state.meta.gymScheduleChanges
        .filter(change => change && isDateKey(change.effectiveDayKey))
        .map(change => ({
          effectiveDayKey: change.effectiveDayKey,
          schedule: normalizeGymSchedule(change.schedule)
        }))
        .sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));
    }

    function getGymScheduleForDay(dayKey = getTodayKey()) {
      if (dayKey < GYM_SCHEDULE_START) return null;
      let schedule = { ...DEFAULT_GYM_SCHEDULE };
      for (const change of getGymScheduleChanges()) {
        if (change.effectiveDayKey <= dayKey) schedule = { ...change.schedule };
        else break;
      }
      return schedule;
    }

    function getGymWorkoutForDay(dayKey = getTodayKey()) {
      const schedule = getGymScheduleForDay(dayKey);
      if (!schedule) return null;
      return schedule[getRoutineDayName(dayKey)] || "";
    }

    function isGymScheduled(dayKey = getTodayKey()) {
      if (dayKey < GYM_SCHEDULE_START) return true;
      return Boolean(getGymWorkoutForDay(dayKey));
    }

    function ensureGymTrackerBridgeState() {
      ensureMeta();
      if (!state.meta.gymTracker || typeof state.meta.gymTracker !== "object" || Array.isArray(state.meta.gymTracker)) {
        state.meta.gymTracker = { sessions: [], overrides: {} };
      }
      if (!state.meta.gymTracker.overrides || typeof state.meta.gymTracker.overrides !== "object" || Array.isArray(state.meta.gymTracker.overrides)) {
        state.meta.gymTracker.overrides = {};
      }
      if (!Array.isArray(state.meta.gymRecurringManagedKeys)) state.meta.gymRecurringManagedKeys = [];
    }

    function syncGymScheduleIntoGymTab(schedule, startKey = getTodayKey()) {
      ensureGymTrackerBridgeState();
      const normalized = normalizeGymSchedule(schedule);
      const managed = new Set(state.meta.gymRecurringManagedKeys);
      const overrides = state.meta.gymTracker.overrides;
      const startDate = keyToLocalDate(startKey < GYM_SCHEDULE_START ? GYM_SCHEDULE_START : startKey);

      for (let offset = 0; offset < 400; offset += 1) {
        const dayKey = formatDateKey(addDays(startDate, offset));
        const dayName = getRoutineDayName(dayKey);
        const desired = normalized[dayName] || "Rest";
        const legacy = LEGACY_GYM_DAY_PLAN[dayName] || "Rest";
        const hasManualOverride = Object.prototype.hasOwnProperty.call(overrides, dayKey) && !managed.has(dayKey);

        if (hasManualOverride) continue;

        if (desired === legacy) {
          if (managed.has(dayKey)) delete overrides[dayKey];
          managed.delete(dayKey);
        } else {
          overrides[dayKey] = desired;
          managed.add(dayKey);
        }
      }

      state.meta.gymRecurringManagedKeys = [...managed].filter(key => key >= GYM_SCHEDULE_START).sort();
    }

    function releaseGymDateFromRecurringControl(dayKey) {
      if (!isDateKey(dayKey)) return;
      ensureGymTrackerBridgeState();
      state.meta.gymRecurringManagedKeys = state.meta.gymRecurringManagedKeys.filter(key => key !== dayKey);
      saveState();
    }

    function refreshExistingGymUi() {
      const schedule = getGymScheduleForDay(getTodayKey()) || DEFAULT_GYM_SCHEDULE;
      const count = Object.keys(schedule).length;
      const badge = document.querySelector("#gymPage .gym-week-card .badge");
      if (badge) badge.textContent = `${count} training days`;
      const heroCopy = document.querySelector("#gymPage .gym-hero p:not(.eyebrow)");
      if (heroCopy) heroCopy.textContent = "Your editable 3–4 day schedule with set-by-set lift tracking and progression history.";
    }

    function installGymTabBridgeHandlers() {
      const select = document.getElementById("gymWorkoutOverrideSelect");
      if (select && select.dataset.recurringBridge !== "true") {
        select.dataset.recurringBridge = "true";
        select.addEventListener("change", () => {
          const dayKey = document.getElementById("gymDateInput")?.value;
          releaseGymDateFromRecurringControl(dayKey);
        });
      }
      const reset = document.getElementById("gymResetWorkoutBtn");
      if (reset && reset.dataset.recurringBridge !== "true") {
        reset.dataset.recurringBridge = "true";
        reset.addEventListener("click", () => {
          const dayKey = document.getElementById("gymDateInput")?.value;
          releaseGymDateFromRecurringControl(dayKey);
        });
      }
    }

    const baseGetWorkoutName = window.getWorkoutName;
    window.getWorkoutName = function(dayKey = getTodayKey()) {
      if (dayKey < GYM_SCHEDULE_START) return baseGetWorkoutName(dayKey);
      return getGymWorkoutForDay(dayKey) || "Rest day";
    };

    const baseGetWeeklyGymStatus = window.getWeeklyGymStatus;
    window.getWeeklyGymStatus = function(dayKey, day) {
      if (dayKey < GYM_SCHEDULE_START) {
        const done = new Set(day.looksDone || []);
        if (done.has("gym")) return "Done";
        if (dayKey === getTodayKey()) return "Not yet";
        return "Didn't go";
      }

      if (!isGymScheduled(dayKey)) return "Rest day";
      const done = new Set(day.looksDone || []);
      if (done.has("gym")) return "Done";
      if (dayKey === getTodayKey()) return "Not yet";
      return "Didn't go";
    };

    const baseGetRotationTasksForDay = window.getRotationTasksForDay;
    window.getRotationTasksForDay = function(dayKey) {
      let items = baseGetRotationTasksForDay(dayKey) || [];

      /* Replace the old every-day gym chip with the editable schedule. */
      items = items.filter(item => item.type !== "gym");
      if (isGymScheduled(dayKey)) {
        items.unshift({ label: `Gym: ${getWorkoutName(dayKey)}`, type: "gym" });
      }

      const dayName = getRoutineDayName(dayKey);
      const customTasks = Array.isArray(state?.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [];
      const existingLabels = new Set(items.map(item => String(item.label || "").trim().toLowerCase()));

      for (const task of customTasks) {
        const days = Array.isArray(task.days) && task.days.length ? task.days : DAY_ORDER;
        if (!days.includes(dayName)) continue;
        const label = String(task.title || "").trim();
        if (!label || existingLabels.has(label.toLowerCase())) continue;
        items.push({ label, type: "custom" });
        existingLabels.add(label.toLowerCase());
      }

      /* Teeth whitening should always appear in the rotation calendar. Avoid duplicate custom whitening chips. */
      const hasWhitening = items.some(item => /whit(e|ening)|white strips/i.test(String(item.label || "")));
      if (!hasWhitening) items.push({ label: "Teeth whitening", type: "treatment" });

      return items;
    };

    const baseDeleteLooksTask = window.deleteLooksTask;
    window.deleteLooksTask = function(task, section) {
      ensureMeta();
      delete state.meta.taskInfo[task.id];
      return baseDeleteLooksTask(task, section);
    };

    function saveGymSchedule(schedule) {
      ensureMeta();
      const normalized = normalizeGymSchedule(schedule);
      const selected = Object.keys(normalized).length;
      if (selected < 3 || selected > 4) {
        toast("Choose 3 or 4 gym days.");
        return false;
      }

      const today = getTodayKey();
      const changes = getGymScheduleChanges().filter(change => change.effectiveDayKey !== today);
      changes.push({ effectiveDayKey: today, schedule: normalized });
      changes.sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));
      state.meta.gymScheduleChanges = changes;
      syncGymScheduleIntoGymTab(normalized, today);
      saveState();
      refreshExistingGymUi();
      return true;
    }

    function installGymEditor() {
      const grid = document.querySelector("#adminRoutinePanel .admin-grid");
      if (!grid || document.getElementById("gymScheduleAdminCard")) return;

      const card = document.createElement("section");
      card.className = "card admin-card gym-plan-admin-card";
      card.id = "gymScheduleAdminCard";
      card.innerHTML = `
        <p class="eyebrow blue">Training</p>
        <h2>Gym schedule</h2>
        <p>Select 3 or 4 training days and edit what you do on each day. Saving only changes today and future days.</p>
        <div class="gym-schedule-editor" id="gymScheduleEditor"></div>
        <p class="gym-schedule-error" id="gymScheduleError" aria-live="polite"></p>
        <div class="gym-schedule-actions">
          <span id="gymScheduleCount"></span>
          <button class="btn blue" id="saveGymScheduleBtn" type="button">Save gym schedule</button>
        </div>`;

      const rotationCard = grid.querySelector(".rotation-admin-card");
      if (rotationCard) grid.insertBefore(card, rotationCard);
      else grid.appendChild(card);

      const editor = card.querySelector("#gymScheduleEditor");
      const schedule = getGymScheduleForDay(getTodayKey()) || { ...DEFAULT_GYM_SCHEDULE };

      for (const day of DAY_ORDER) {
        const active = Boolean(schedule[day]);
        const row = document.createElement("div");
        row.className = `gym-day-editor-row ${active ? "active" : ""}`;
        row.dataset.day = day;
        row.innerHTML = `
          <button class="gym-day-toggle" type="button" aria-pressed="${active ? "true" : "false"}">
            <span>${day.slice(0, 3)}</span>
            <small>${active ? "Training" : "Rest"}</small>
          </button>
          <input class="gym-day-workout" maxlength="80" type="text"
            value="${escapeHtml(schedule[day] || "")}"
            placeholder="Workout name"
            ${active ? "" : "disabled"} />`;
        editor.appendChild(row);
      }

      const updateCount = () => {
        const activeRows = [...editor.querySelectorAll(".gym-day-editor-row.active")];
        const count = activeRows.length;
        const countEl = card.querySelector("#gymScheduleCount");
        const error = card.querySelector("#gymScheduleError");
        if (countEl) countEl.textContent = `${count} training day${count === 1 ? "" : "s"} selected`;
        if (error) error.textContent = count >= 3 && count <= 4 ? "" : "Choose 3 or 4 training days.";
      };

      editor.querySelectorAll(".gym-day-toggle").forEach(button => {
        button.addEventListener("click", () => {
          const row = button.closest(".gym-day-editor-row");
          const input = row.querySelector(".gym-day-workout");
          const turningOn = !row.classList.contains("active");
          const activeCount = editor.querySelectorAll(".gym-day-editor-row.active").length;

          if (turningOn && activeCount >= 4) {
            toast("Maximum is 4 gym days.");
            return;
          }

          row.classList.toggle("active", turningOn);
          button.setAttribute("aria-pressed", turningOn ? "true" : "false");
          button.querySelector("small").textContent = turningOn ? "Training" : "Rest";
          input.disabled = !turningOn;

          if (turningOn && !input.value.trim()) {
            const suggestions = {
              Monday: "Push",
              Tuesday: "Pull",
              Wednesday: "Upper + Arms",
              Thursday: "Legs + Abs",
              Friday: "Upper + Arms",
              Saturday: "Upper + Arms",
              Sunday: "Legs + Abs"
            };
            input.value = suggestions[row.dataset.day] || "Workout";
            input.focus();
            input.select();
          }

          updateCount();
        });
      });

      card.querySelector("#saveGymScheduleBtn").addEventListener("click", () => {
        const next = {};
        for (const row of editor.querySelectorAll(".gym-day-editor-row.active")) {
          const value = row.querySelector(".gym-day-workout").value.trim();
          if (!value) {
            card.querySelector("#gymScheduleError").textContent = `Enter a workout for ${row.dataset.day}.`;
            row.querySelector(".gym-day-workout").focus();
            return;
          }
          if (!GYM_WORKOUT_CHOICES.has(value)) {
            card.querySelector("#gymScheduleError").textContent = "Use Push, Pull, Legs + Abs, or Upper + Arms.";
            row.querySelector(".gym-day-workout").focus();
            return;
          }
          next[row.dataset.day] = value;
        }

        if (saveGymSchedule(next)) {
          toast("Gym schedule saved for today forward.");
          render();
          renderGymEditorValues();
          document.getElementById("gymTodayBtn")?.click();
          refreshExistingGymUi();
        }
      });

      updateCount();
    }

    function renderGymEditorValues() {
      const editor = document.getElementById("gymScheduleEditor");
      if (!editor) return;
      const schedule = getGymScheduleForDay(getTodayKey()) || { ...DEFAULT_GYM_SCHEDULE };

      for (const row of editor.querySelectorAll(".gym-day-editor-row")) {
        const day = row.dataset.day;
        const active = Boolean(schedule[day]);
        row.classList.toggle("active", active);
        const button = row.querySelector(".gym-day-toggle");
        const input = row.querySelector(".gym-day-workout");
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.querySelector("small").textContent = active ? "Training" : "Rest";
        input.disabled = !active;
        input.value = schedule[day] || "";
      }

      const count = Object.keys(schedule).length;
      const countEl = document.getElementById("gymScheduleCount");
      if (countEl) countEl.textContent = `${count} training day${count === 1 ? "" : "s"} selected`;
    }

    function installWorkoutCardLink() {
      const card = document.querySelector(".workout-card");
      if (!card || document.getElementById("editGymScheduleBtn")) return;

      const hint = document.createElement("p");
      hint.className = "gym-card-schedule-hint";
      hint.textContent = "Your gym days and workouts are editable in Admin.";

      const button = document.createElement("button");
      button.id = "editGymScheduleBtn";
      button.type = "button";
      button.className = "btn secondary compact gym-edit-schedule-btn";
      button.textContent = "Edit gym schedule";

      button.addEventListener("click", () => {
        document.querySelector('[data-tab="adminPage"]')?.click();
        document.querySelector('[data-admin-panel="adminRoutinePanel"]')?.click();
        requestAnimationFrame(() => {
          document.getElementById("gymScheduleAdminCard")?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });

      card.append(hint, button);
    }

    function tightenUpTask(dayKeys) {
      const counts = new Map();
      const sampleTasks = new Map();
      const today = getTodayKey();

      for (const dayKey of dayKeys) {
        if (dayKey >= today) continue;
        const day = state.days?.[dayKey] || createDayRecord();
        const done = new Set(day.looksDone || []);
        const skipped = new Set(day.looksSkipped || []);

        for (const task of getLooksTasks(dayKey)) {
          const isMajor = typeof WEEKLY_REVIEW_MAJOR_TASK_IDS !== "undefined" &&
            WEEKLY_REVIEW_MAJOR_TASK_IDS.has(task.id);
          const isCustom = Boolean(task.custom) || String(task.id).startsWith("custom-");
          if (!isMajor && !isCustom && task.id !== "voice-training") continue;

          /* Explicit skips are intentionally ignored here. Unchecked past tasks are misses. */
          if (done.has(task.id) || skipped.has(task.id)) continue;
          counts.set(task.id, (counts.get(task.id) || 0) + 1);
          if (!sampleTasks.has(task.id)) sampleTasks.set(task.id, task);
        }
      }

      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const value = document.getElementById("weeklySkippedTask");
      const meta = document.getElementById("weeklySkippedMeta");
      if (!value || !meta) return;

      if (!top) {
        value.textContent = "None";
        meta.textContent = "No missed major routine tasks";
        return;
      }

      const task = sampleTasks.get(top[0]);
      value.textContent = task ? getLooksTaskTitle(task) : top[0];
      meta.textContent = `Missed ${top[1]} time${top[1] === 1 ? "" : "s"} this week`;
    }

    const baseRenderWeeklyReview = window.renderWeeklyReview;
    window.renderWeeklyReview = function() {
      baseRenderWeeklyReview();

      const dayKeys = getWeeklyReviewKeys();
      let scheduled = 0;
      let done = 0;
      let didntGo = 0;
      let restDays = 0;
      let notYet = 0;

      for (const dayKey of dayKeys) {
        const day = state.days?.[dayKey] || createDayRecord();
        const status = getWeeklyGymStatus(dayKey, day);

        if (status === "Rest day") {
          restDays += 1;
          continue;
        }

        scheduled += 1;
        if (status === "Done") done += 1;
        else if (status === "Didn't go") didntGo += 1;
        else if (status === "Not yet") notYet += 1;
      }

      const value = document.getElementById("weeklyGymDays");
      const meta = document.getElementById("weeklyGymMeta");
      if (value) value.textContent = `${done}/${scheduled}`;
      if (meta) {
        const parts = [];
        if (didntGo) parts.push(`${didntGo} didn't go`);
        if (notYet) parts.push("today not yet");
        if (restDays) parts.push(`${restDays} rest day${restDays === 1 ? "" : "s"}`);
        meta.textContent = parts.length ? parts.join(" · ") : "All scheduled gym days completed";
      }

      tightenUpTask(dayKeys);
    };

    const activeGymSchedule = getGymScheduleForDay(getTodayKey()) || { ...DEFAULT_GYM_SCHEDULE };
    syncGymScheduleIntoGymTab(activeGymSchedule, getTodayKey());
    saveState();

    installGymEditor();
    installWorkoutCardLink();
    installGymTabBridgeHandlers();
    refreshExistingGymUi();

    /* Old rotation-position controls no longer define the schedule. */
    document.querySelector(".workout-card .workout-rotation")?.setAttribute("hidden", "");

    /* Refresh once so the new task/schedule is visible immediately if the app is already open. */
    try {
      render();
      renderGymEditorValues();
      installGymTabBridgeHandlers();
      refreshExistingGymUi();
    } catch (_) {
      // App may still be on the lock screen; the normal render path will pick up the patch later.
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(install, 0);
  });
})();
