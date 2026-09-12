"use strict";

/*
  LOCKED OS — Gym sequence + workout recovery fix
  Loads the clean rebuild that is currently deployed, then makes three focused changes:
  1) Friday 2026-09-11 is Chest + side delts, with the rotation continuing
     Sat Back -> Mon Arms -> Wed Legs + Abs -> Fri Chest.
  2) The top Gym strip shows the next scheduled workouts continuously, not a calendar week.
  3) Gym sessions are recovered/merged from every known old state format, local recovery
     snapshots, a dedicated session vault, and recent Supabase backups when available.
*/

(() => {
  const cleanBase = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@0f9a5024ddc995c3adeac4032481dac77d0d2c97/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", cleanBase, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-clean-base-0f9a502.js");
  } catch (error) {
    console.error("LOCKED OS: clean base failed to load.", error);
  }
})();

(() => {
  "use strict";

  const FLAG = "__lockedOsGymSequenceRecovery20260911";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const ANCHOR_DATE = "2026-09-11";
  const VAULT_KEY = "locked_os_gym_sessions_vault_v2";
  const ROTATION_FLAG = "gymChestRotationAnchored20260911";
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const ROTATION = [
    "Chest + side delts",
    "Back + rear delts",
    "Arms",
    "Legs + Abs"
  ];
  const DESIRED_SCHEDULE = {
    Friday: "Chest + side delts",
    Saturday: "Back + rear delts",
    Monday: "Arms",
    Wednesday: "Legs + Abs"
  };

  const CHEST_EXERCISES = new Set([
    "Incline Dumbbell Bench Press",
    "Machine Chest Press",
    "Cable Fly / Pec Deck",
    "Cable Lateral Raise",
    "Machine Lateral Raise"
  ]);

  let sequenceRefreshTimer = null;

  const clone = value => JSON.parse(JSON.stringify(value));
  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeWorkoutName(value) {
    const name = String(value || "").trim();
    if (ROTATION.includes(name)) return name;
    if (name === "Push") return "Chest + side delts";
    if (name === "Pull") return "Back + rear delts";
    if (name === "Legs") return "Legs + Abs";
    if (name === "Arms + Abs") return "Arms";
    return name;
  }

  function setCompleteness(set) {
    let score = 0;
    if (Number(set?.weight) > 0) score += 2;
    if (Number(set?.reps) > 0) score += 2;
    return score;
  }

  function exerciseCompleteness(exercise) {
    return safeArray(exercise?.sets).reduce((sum, set) => sum + setCompleteness(set), 0);
  }

  function sessionCompleteness(session) {
    let score = session?.completed ? 1000 : 0;
    score += safeArray(session?.exercises).reduce(
      (sum, exercise) => sum + exerciseCompleteness(exercise),
      0
    );
    return score;
  }

  function mergeSets(a, b) {
    const out = [];
    for (let index = 0; index < Math.max(safeArray(a).length, safeArray(b).length, 2); index += 1) {
      const left = safeArray(a)[index] || {};
      const right = safeArray(b)[index] || {};
      const chosen = setCompleteness(right) > setCompleteness(left) ? right : left;
      out.push({
        weight: Number(chosen?.weight) > 0 ? Number(chosen.weight) : 0,
        reps: Number(chosen?.reps) > 0 ? Math.round(Number(chosen.reps)) : 0
      });
    }
    return out.slice(0, 2);
  }

  function mergeExercises(a, b) {
    const map = new Map();

    const ingest = list => {
      for (const exercise of safeArray(list)) {
        const name = String(exercise?.name || "").trim();
        if (!name) continue;
        const current = map.get(name);
        if (!current) {
          map.set(name, { name, sets: mergeSets([], exercise.sets) });
        } else {
          current.sets = mergeSets(current.sets, exercise.sets);
        }
      }
    };

    ingest(a);
    ingest(b);
    return [...map.values()];
  }

  function mergeTwoSessions(a, b) {
    if (!a) return b ? clone(b) : null;
    if (!b) return clone(a);

    const richer = sessionCompleteness(b) > sessionCompleteness(a) ? b : a;
    const latestUpdatedAt = [String(a.updatedAt || ""), String(b.updatedAt || "")]
      .filter(Boolean)
      .sort()
      .at(-1) || "";

    return {
      ...clone(richer),
      id: richer.id || a.id || b.id || `gym-recovered-${richer.date}`,
      date: richer.date || a.date || b.date,
      workout: normalizeWorkoutName(richer.workout || a.workout || b.workout),
      completed: Boolean(a.completed || b.completed),
      exercises: mergeExercises(a.exercises, b.exercises),
      updatedAt: latestUpdatedAt
    };
  }

  function normalizeSession(raw, fallbackDate = "") {
    if (!raw || typeof raw !== "object") return null;

    const date = validDateKey(raw.date)
      ? raw.date
      : (validDateKey(raw.dayKey) ? raw.dayKey : fallbackDate);

    if (!validDateKey(date)) return null;

    return {
      id: String(raw.id || `gym-recovered-${date}`),
      date,
      workout: normalizeWorkoutName(raw.workout || raw.workoutName || ""),
      completed: Boolean(raw.completed || raw.done),
      exercises: safeArray(raw.exercises).map(exercise => ({
        name: String(exercise?.name || "").trim(),
        sets: mergeSets([], exercise?.sets)
      })).filter(exercise => exercise.name),
      updatedAt: String(raw.updatedAt || raw.updated_at || raw.savedAt || "")
    };
  }

  function mergeSessionCollection(...lists) {
    const byDate = new Map();

    for (const list of lists) {
      for (const raw of safeArray(list)) {
        const session = normalizeSession(raw);
        if (!session) continue;
        byDate.set(session.date, mergeTwoSessions(byDate.get(session.date), session));
      }
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function extractSessions(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return [];

    const meta = snapshot.meta && typeof snapshot.meta === "object" ? snapshot.meta : {};
    const sessions = [];

    sessions.push(...safeArray(meta.gymClean?.sessions));
    sessions.push(...safeArray(meta.gymTrackerV2?.sessions));
    sessions.push(...safeArray(meta.gymTracker?.sessions));

    /*
      Some very old copies may have date-keyed gym objects.
    */
    for (const source of [meta.gymSessions, snapshot.gymSessions]) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      for (const [date, value] of Object.entries(source)) {
        const session = normalizeSession(value, date);
        if (session) sessions.push(session);
      }
    }

    return sessions;
  }

  function inspectPossibleSnapshot(value, sessions, depth = 0) {
    if (depth > 3 || value == null) return;

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        inspectPossibleSnapshot(parsed, sessions, depth + 1);
      } catch (_) {}
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) inspectPossibleSnapshot(item, sessions, depth + 1);
      return;
    }

    if (typeof value !== "object") return;

    sessions.push(...extractSessions(value));

    if (value.state) inspectPossibleSnapshot(value.state, sessions, depth + 1);
    if (value.serialized) inspectPossibleSnapshot(value.serialized, sessions, depth + 1);
    if (value.snapshot) inspectPossibleSnapshot(value.snapshot, sessions, depth + 1);
  }

  function readVaultSessions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(VAULT_KEY) || "[]");
      return safeArray(parsed);
    } catch (_) {
      return [];
    }
  }

  function writeVaultSessions(sessions) {
    try {
      localStorage.setItem(VAULT_KEY, JSON.stringify(mergeSessionCollection(sessions)));
    } catch (error) {
      console.warn("LOCKED OS: gym vault write failed.", error);
    }
  }

  function localRecoverySessions() {
    const sessions = [];

    /*
      Current live state first.
    */
    sessions.push(...extractSessions(state));

    /*
      Dedicated gym vault.
    */
    sessions.push(...readVaultSessions());

    /*
      Scan every LOCKED OS localStorage entry. This catches:
      - v4-v17 app saves
      - clean recovery snapshots
      - older recovery-snapshot formats
      - gym-safe backups from the previous patch
    */
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.toLowerCase().includes("locked_os")) continue;

        let raw = "";
        try { raw = localStorage.getItem(key) || ""; } catch (_) {}
        if (!raw) continue;

        inspectPossibleSnapshot(raw, sessions);
      }
    } catch (error) {
      console.warn("LOCKED OS: local workout recovery scan failed.", error);
    }

    return mergeSessionCollection(sessions);
  }

  function ensureGymCleanState() {
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean = state.meta.gymClean && typeof state.meta.gymClean === "object"
      ? state.meta.gymClean
      : {};

    if (!state.meta.gymClean.schedule || typeof state.meta.gymClean.schedule !== "object") {
      state.meta.gymClean.schedule = clone(DESIRED_SCHEDULE);
    }
    state.meta.gymClean.sessions = safeArray(state.meta.gymClean.sessions);
  }

  function markCompletionFromLooks(sessions) {
    const byDate = new Map(sessions.map(session => [session.date, session]));

    for (const [date, day] of Object.entries(state.days || {})) {
      if (!validDateKey(date) || !day || typeof day !== "object") continue;
      const completedInLooks = safeArray(day.looksDone).includes("gym");
      if (!completedInLooks) continue;

      let session = byDate.get(date);
      if (!session) {
        session = {
          id: `gym-completion-recovered-${date}`,
          date,
          workout: date === ANCHOR_DATE ? "Chest + side delts" : "",
          completed: true,
          exercises: [],
          updatedAt: ""
        };
        byDate.set(date, session);
      } else {
        session.completed = true;
      }
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function forceAnchorSchedule() {
    ensureGymCleanState();

    if (state.meta[ROTATION_FLAG] === true) return false;

    state.meta.gymClean.schedule = clone(DESIRED_SCHEDULE);
    state.meta[ROTATION_FLAG] = true;
    return true;
  }

  function reconcileRecoveredSessions(extraSessions = []) {
    ensureGymCleanState();

    const before = JSON.stringify(state.meta.gymClean.sessions || []);
    const combined = mergeSessionCollection(
      state.meta.gymClean.sessions,
      localRecoverySessions(),
      extraSessions
    );
    state.meta.gymClean.sessions = markCompletionFromLooks(combined);

    /*
      If the recovered Sept 11 workout clearly contains chest exercises, label
      it Chest + side delts so the current workout form can populate the sets.
    */
    const todaySession = state.meta.gymClean.sessions.find(session => session.date === ANCHOR_DATE);
    if (todaySession) {
      const chestMatches = safeArray(todaySession.exercises)
        .filter(exercise => CHEST_EXERCISES.has(exercise.name))
        .length;

      if (chestMatches >= 2 || !todaySession.workout) {
        todaySession.workout = "Chest + side delts";
      }
    }

    writeVaultSessions(state.meta.gymClean.sessions);
    return before !== JSON.stringify(state.meta.gymClean.sessions);
  }

  /*
    Keep the vault updated before every future app save.
  */
  if (typeof saveState === "function" && !saveState.__gymVaultV2) {
    const baseSaveState = saveState;
    const wrappedSaveState = function(...args) {
      ensureGymCleanState();
      writeVaultSessions(state.meta.gymClean.sessions);
      return baseSaveState(...args);
    };
    wrappedSaveState.__gymVaultV2 = true;
    saveState = wrappedSaveState;
  }

  /*
    Never let a remote state discard a richer local/vault workout log.
  */
  if (typeof applyRemoteState === "function" && !applyRemoteState.__gymVaultV2) {
    const baseApplyRemoteState = applyRemoteState;
    const wrappedApplyRemoteState = function(remoteState, ...args) {
      try {
        const copy = clone(remoteState || {});
        copy.meta = copy.meta && typeof copy.meta === "object" ? copy.meta : {};
        copy.meta.gymClean = copy.meta.gymClean && typeof copy.meta.gymClean === "object"
          ? copy.meta.gymClean
          : {};

        copy.meta.gymClean.sessions = mergeSessionCollection(
          readVaultSessions(),
          state?.meta?.gymClean?.sessions,
          copy.meta.gymClean.sessions
        );

        if (!copy.meta.gymClean.schedule || typeof copy.meta.gymClean.schedule !== "object") {
          copy.meta.gymClean.schedule = clone(DESIRED_SCHEDULE);
        }

        const result = baseApplyRemoteState(copy, ...args);
        reconcileRecoveredSessions();
        return result;
      } catch (error) {
        console.error("LOCKED OS: gym-safe remote merge failed.", error);
        return baseApplyRemoteState(remoteState, ...args);
      }
    };
    wrappedApplyRemoteState.__gymVaultV2 = true;
    applyRemoteState = wrappedApplyRemoteState;
  }

  function workoutForDate(dayKey) {
    ensureGymCleanState();
    if (!validDateKey(dayKey) || dayKey < ANCHOR_DATE) return "";
    return String(state.meta.gymClean.schedule?.[getRoutineDayName(dayKey)] || "");
  }

  function sessionForDate(dayKey) {
    ensureGymCleanState();
    return state.meta.gymClean.sessions.find(session => session?.date === dayKey) || null;
  }

  function nextWorkoutDates(startKey = getTodayKey(), count = 5) {
    const output = [];
    let cursor = keyToLocalDate(startKey);

    /*
      Include the selected/start date when it is a training day.
    */
    for (let step = 0; step < 45 && output.length < count; step += 1) {
      const key = formatDateKey(cursor);
      const workout = workoutForDate(key);
      if (workout) output.push({ date: key, workout });
      cursor = addDays(cursor, 1);
    }
    return output;
  }

  function renderNextWorkoutStrip() {
    const grid = document.getElementById("cleanGymWeekGrid");
    if (!grid) return;

    const heading = grid.closest(".clean-gym-week-card")?.querySelector(".panel-title h3");
    if (heading) heading.textContent = "Next workouts";

    const today = getTodayKey();
    const items = nextWorkoutDates(today, 5);

    grid.innerHTML = "";
    for (const item of items) {
      const date = keyToLocalDate(item.date);
      const session = sessionForDate(item.date);
      const card = document.createElement("div");
      card.className = `clean-gym-day${item.date === today ? " today selected" : ""}`;
      card.innerHTML = `
        <strong>${DAY_NAMES[date.getDay()].slice(0, 3)} · ${date.getMonth() + 1}/${date.getDate()}</strong>
        <span>${escapeHtml(item.workout)}${session?.completed ? " ✓" : ""}</span>`;
      grid.appendChild(card);
    }
  }

  function scheduleStripRefresh(delay = 0) {
    clearTimeout(sequenceRefreshTimer);
    sequenceRefreshTimer = setTimeout(renderNextWorkoutStrip, delay);
  }

  /*
    The clean rebuild re-renders its week strip after navigation/save. Refresh
    the sequential strip immediately afterward without a MutationObserver.
  */
  document.addEventListener("click", event => {
    if (
      event.target.closest("#cleanGymPrev") ||
      event.target.closest("#cleanGymNext") ||
      event.target.closest("#cleanGymToday") ||
      event.target.closest("#cleanGymSave") ||
      event.target.closest("#cleanGymComplete") ||
      event.target.closest(".clean-modal-save") ||
      event.target.closest('[data-tab="gymPage"]')
    ) {
      scheduleStripRefresh(25);
    }

    if (
      event.target.closest("#cleanGymSave") ||
      event.target.closest("#cleanGymComplete")
    ) {
      setTimeout(() => {
        reconcileRecoveredSessions();
        writeVaultSessions(state.meta?.gymClean?.sessions || []);
      }, 30);
    }
  });

  /*
    Replace the Gym schedule gear's initial mapping once so Friday starts on
    Chest + side delts. After this one migration the user can edit the schedule
    normally and it will not be forced again.
  */
  function installAnchorAndRecover() {
    if (typeof state === "undefined" || typeof saveState !== "function") return;

    ensureGymCleanState();
    const scheduleChanged = forceAnchorSchedule();
    const recoveryChanged = reconcileRecoveredSessions();

    if (scheduleChanged || recoveryChanged) {
      saveState();
    }

    /*
      Ensure the Looksmaxxing workout label uses the same mapping even if it was
      rendered just before this patch initialized.
    */
    try { if (typeof render === "function") render(); } catch (_) {}
    scheduleStripRefresh(25);
  }

  async function recoverFromSupabaseBackups() {
    if (!supabaseClient || typeof state === "undefined") return;

    try {
      const { data, error } = await supabaseClient
        .from("locked_os_state_backups")
        .select("state, backed_up_at")
        .eq("id", SUPABASE_ROW_ID)
        .order("backup_id", { ascending: false })
        .limit(50);

      if (error || !Array.isArray(data) || !data.length) return;

      const sessions = [];
      for (const row of data) {
        sessions.push(...extractSessions(row?.state));
      }

      if (!sessions.length) return;

      const changed = reconcileRecoveredSessions(sessions);
      if (changed) {
        saveState();
        try { if (typeof render === "function") render(); } catch (_) {}
        scheduleStripRefresh(25);

        const today = state.meta?.gymClean?.sessions?.find(session => session.date === ANCHOR_DATE);
        if (today && sessionCompleteness(today) > 0 && typeof toast === "function") {
          toast("Recovered saved workout data from backup.");
        }
      }
    } catch (error) {
      /*
        Backup table is optional. Local recovery still works if it is absent.
      */
      console.warn("LOCKED OS: cloud workout-backup recovery unavailable.", error);
    }
  }

  const start = () => {
    setTimeout(() => {
      installAnchorAndRecover();
      recoverFromSupabaseBackups();
    }, 80);
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();