"use strict";

/*
  LOCKED OS — CLEAN REBUILD
  One stable feature base + one clean authority layer.
  This intentionally replaces the stacked gym/task patches that accumulated before it.
*/

(() => {
  const stableBase = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@48b687462247c682f2762c86028fdc0f21030f61/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", stableBase, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-stable-feature-base.js");
  } catch (error) {
    console.error("LOCKED OS: stable feature base failed to load.", error);
  }
})();

(() => {
  "use strict";

  const CLEAN_FLAG = "__lockedOsCleanRebuild20260911";
  if (window[CLEAN_FLAG]) return;
  window[CLEAN_FLAG] = true;

  const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const GYM_EDITOR_ORDER = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
  const GYM_START = "2026-09-11";
  const GYM_WORKOUTS = ["Chest + side delts", "Back + rear delts", "Arms", "Legs + Abs"];
  const GYM_WORKOUT_SET = new Set(GYM_WORKOUTS);
  const DEFAULT_GYM_SCHEDULE = {
    Monday: "Chest + side delts",
    Wednesday: "Back + rear delts",
    Friday: "Arms",
    Saturday: "Legs + Abs"
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

  const TRETINOIN_SCHEDULE_CLEAN = {
    1: ["Friday"],
    2: ["Tuesday", "Friday"],
    3: ["Monday", "Wednesday", "Friday"],
    4: ["Sunday", "Monday", "Wednesday", "Friday"],
    5: ["Sunday", "Monday", "Tuesday", "Thursday", "Friday"],
    6: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    7: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  };

  const CUSTOM_SCHEDULE_META = "customTaskSchedules";
  const DIRTY_KEY = "locked_os_supabase_dirty_clean";
  const RECOVERY_KEY = "locked_os_recovery_snapshots_clean";
  const RETRY_DELAYS = [1000, 2500, 5000, 10000, 20000, 30000];
  const POLL_MS = 5000;

  let cleanGymSelectedDate = "";
  let retryTimer = null;
  let retryIndex = 0;
  let pollTimer = null;
  let cleanRealtimeChannel = null;

  const clone = value => JSON.parse(JSON.stringify(value));
  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function validDays(value) {
    if (!Array.isArray(value)) return [];
    const set = new Set(value.map(day => String(day || "").trim()));
    return DAY_ORDER.filter(day => set.has(day));
  }

  function ensureMeta(target = state) {
    if (!target || typeof target !== "object") return;
    target.meta = target.meta && typeof target.meta === "object" ? target.meta : {};
    if (!target.meta[CUSTOM_SCHEDULE_META] || typeof target.meta[CUSTOM_SCHEDULE_META] !== "object" || Array.isArray(target.meta[CUSTOM_SCHEDULE_META])) {
      target.meta[CUSTOM_SCHEDULE_META] = {};
    }
  }

  function recoverTaskSchedulesFromSnapshots() {
    ensureMeta();
    const map = state.meta[CUSTOM_SCHEDULE_META];

    for (const task of Array.isArray(state.meta.looksCustomTasks) ? state.meta.looksCustomTasks : []) {
      const days = validDays(task?.days);
      if (task?.id && days.length) map[task.id] = days;
    }

    const snapshotKeys = [
      "locked_os_recovery_snapshots_v2",
      "locked_os_recovery_snapshots_clean"
    ];

    for (const key of snapshotKeys) {
      try {
        const entries = JSON.parse(localStorage.getItem(key) || "[]");
        for (const entry of Array.isArray(entries) ? entries : []) {
          let snapshot = entry?.state;
          if (!snapshot && entry?.serialized) {
            try { snapshot = JSON.parse(entry.serialized); } catch (_) {}
          }
          const tasks = snapshot?.meta?.looksCustomTasks;
          if (!Array.isArray(tasks)) continue;
          for (const task of tasks) {
            const days = validDays(task?.days);
            if (task?.id && days.length && !map[task.id]) map[task.id] = days;
          }
        }
      } catch (_) {}
    }
  }

  function scheduleForTask(task, targetState = state) {
    ensureMeta(targetState);
    const direct = validDays(task?.days);
    if (direct.length) return direct;
    const mapped = validDays(targetState.meta?.[CUSTOM_SCHEDULE_META]?.[task?.id]);
    return mapped.length ? mapped : [...DAY_ORDER];
  }

  /*
    Fix the actual startup bug: app.js's original normalizer discarded days[].
    Every normalization after this point preserves the day schedule, and the
    side-map keeps it recoverable across future reloads/devices.
  */
  normalizeLooksCustomTasks = function(original) {
    if (!Array.isArray(original)) return [];
    ensureMeta();
    const sections = new Set(["morning", "midday", "night"]);
    const seen = new Set();
    const normalized = [];

    for (const item of original) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.id || "").trim();
      const section = String(item.section || "").trim();
      const title = String(item.title || "").trim().slice(0, 160);
      if (!id || seen.has(id) || !sections.has(section) || !title) continue;
      seen.add(id);

      const days = validDays(item.days).length
        ? validDays(item.days)
        : validDays(state.meta[CUSTOM_SCHEDULE_META][id]);

      const task = { id, section, title, custom: true };
      if (days.length) {
        task.days = days;
        state.meta[CUSTOM_SCHEDULE_META][id] = days;
      }
      normalized.push(task);
    }
    return normalized;
  };

  recoverTaskSchedulesFromSnapshots();

  /* ------------------------- resilient save/sync ------------------------- */

  function archiveSnapshot(label, snapshot = state) {
    if (!snapshot || typeof snapshot !== "object") return;
    try {
      const serialized = JSON.stringify(snapshot);
      let entries = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "[]");
        if (Array.isArray(parsed)) entries = parsed;
      } catch (_) {}
      if (entries[0]?.serialized === serialized) return;
      entries.unshift({
        savedAt: new Date().toISOString(),
        label,
        serialized
      });
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(entries.slice(0, 20)));
    } catch (error) {
      console.warn("LOCKED OS: could not create local recovery snapshot.", error);
    }
  }

  function mergeById(localItems, remoteItems) {
    const map = new Map();
    for (const item of Array.isArray(localItems) ? localItems : []) {
      if (item?.id) map.set(String(item.id), clone(item));
    }
    for (const item of Array.isArray(remoteItems) ? remoteItems : []) {
      if (item?.id) map.set(String(item.id), clone(item));
    }
    return [...map.values()];
  }

  function sessionRichness(session) {
    let score = session?.completed ? 1000 : 0;
    for (const exercise of Array.isArray(session?.exercises) ? session.exercises : []) {
      for (const set of Array.isArray(exercise?.sets) ? exercise.sets : []) {
        if (Number(set?.weight) > 0) score += 2;
        if (Number(set?.reps) > 0) score += 2;
      }
    }
    return score;
  }

  function mergeGymSessions(localSessions, remoteSessions) {
    const map = new Map();
    const choose = (a, b) => {
      if (!a) return clone(b);
      const at = String(a?.updatedAt || "");
      const bt = String(b?.updatedAt || "");
      if (at && bt && at !== bt) return clone(bt > at ? b : a);
      return clone(sessionRichness(b) > sessionRichness(a) ? b : a);
    };
    for (const session of Array.isArray(localSessions) ? localSessions : []) {
      if (validDateKey(session?.date)) map.set(session.date, clone(session));
    }
    for (const session of Array.isArray(remoteSessions) ? remoteSessions : []) {
      if (validDateKey(session?.date)) map.set(session.date, choose(map.get(session.date), session));
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function deepMerge(localValue, remoteValue) {
    if (remoteValue === undefined) return clone(localValue);
    if (localValue === undefined) return clone(remoteValue);
    const localObj = localValue && typeof localValue === "object" && !Array.isArray(localValue);
    const remoteObj = remoteValue && typeof remoteValue === "object" && !Array.isArray(remoteValue);
    if (localObj && remoteObj) {
      const out = {};
      for (const key of new Set([...Object.keys(localValue), ...Object.keys(remoteValue)])) {
        out[key] = deepMerge(localValue[key], remoteValue[key]);
      }
      return out;
    }
    return clone(remoteValue);
  }

  function mergeStateSafely(localState, remoteState) {
    const local = localState && typeof localState === "object" ? localState : {};
    const remote = remoteState && typeof remoteState === "object" ? remoteState : {};
    const merged = deepMerge(local, remote);

    merged.days = { ...(local.days || {}), ...(remote.days || {}) };
    merged.weights = { ...(local.weights || {}), ...(remote.weights || {}) };

    merged.meta = deepMerge(local.meta || {}, remote.meta || {});
    merged.meta[CUSTOM_SCHEDULE_META] = {
      ...(local.meta?.[CUSTOM_SCHEDULE_META] || {}),
      ...(remote.meta?.[CUSTOM_SCHEDULE_META] || {})
    };

    merged.meta.looksCustomTasks = mergeById(
      local.meta?.looksCustomTasks,
      remote.meta?.looksCustomTasks
    ).map(task => {
      const days = validDays(task.days).length
        ? validDays(task.days)
        : validDays(merged.meta[CUSTOM_SCHEDULE_META][task.id]);
      return days.length ? { ...task, days } : task;
    });

    if (local.meta?.gymClean || remote.meta?.gymClean) {
      const lg = local.meta?.gymClean || {};
      const rg = remote.meta?.gymClean || {};
      merged.meta.gymClean = {
        version: 1,
        schedule: Object.keys(rg.schedule || {}).length ? clone(rg.schedule) : clone(lg.schedule || DEFAULT_GYM_SCHEDULE),
        sessions: mergeGymSessions(lg.sessions, rg.sessions)
      };
    }

    return merged;
  }

  const oldFocusRefresh = typeof refreshSupabaseState === "function" ? refreshSupabaseState : null;
  if (oldFocusRefresh) window.removeEventListener("focus", oldFocusRefresh);

  hasPendingLocalChanges = function() {
    return Boolean(
      saveTimer ||
      supabaseSaveInFlight ||
      localRevision > syncedRevision ||
      localStorage.getItem(DIRTY_KEY) === "1"
    );
  };

  fetchSupabaseState = async function({ silent = false } = {}) {
    if (!supabaseClient) return { ok: false, row: null, error: new Error("Supabase unavailable") };
    if (!silent && syncStatus) syncStatus.textContent = "Loading from Supabase…";

    try {
      const { data, error } = await supabaseClient
        .from(SUPABASE_TABLE)
        .select("state, updated_at")
        .eq("id", SUPABASE_ROW_ID)
        .maybeSingle();

      if (error) throw error;
      return { ok: true, row: data || null, error: null };
    } catch (error) {
      console.error(error);
      if (!silent && syncStatus) syncStatus.textContent = "Supabase load failed. Local data kept safe.";
      return { ok: false, row: null, error };
    }
  };

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry() {
    if (!supabaseClient) return;
    clearRetry();
    const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
    retryIndex += 1;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (mainApp.classList.contains("hidden")) {
        scheduleRetry();
        return;
      }
      if (hasPendingLocalChanges()) await saveSupabaseState();
      else await refreshSupabaseState({ force: true });
    }, delay);
  }

  function resetRetry() {
    clearRetry();
    retryIndex = 0;
  }

  applyRemoteState = function(remoteState, statusMessage = "Updated from Supabase.", { force = false, updatedAt = "" } = {}) {
    if (!remoteState || typeof remoteState !== "object") return false;
    if (!force && hasPendingLocalChanges()) return false;

    archiveSnapshot("before-remote-apply", state);
    state = mergeStateSafely(state, remoteState);
    ensureMeta();
    recoverTaskSchedulesFromSnapshots();
    normalizeState();
    saveLocalState();

    localRevision = 0;
    syncedRevision = 0;
    localStorage.removeItem(DIRTY_KEY);
    if (updatedAt) latestSupabaseWriteAt = updatedAt;
    resetRetry();

    if (!mainApp.classList.contains("hidden")) render();
    if (syncStatus) syncStatus.textContent = statusMessage;
    return true;
  };

  const coreSaveLocalState = saveLocalState;
  saveState = function() {
    localRevision += 1;
    localStorage.setItem(DIRTY_KEY, "1");
    archiveSnapshot("local-change", state);
    coreSaveLocalState();
    queueSupabaseSave();
  };

  queueSupabaseSave = function(delay = 180) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveSupabaseState();
    }, delay);
  };

  saveSupabaseState = async function() {
    if (!supabaseClient) {
      if (syncStatus) syncStatus.textContent = "Saved locally. Supabase is not connected.";
      return false;
    }
    if (supabaseSaveInFlight) {
      supabaseSaveQueued = true;
      return false;
    }

    supabaseSaveInFlight = true;
    supabaseSaveQueued = false;
    const revision = localRevision;
    const snapshot = clone(state);
    const writeTimestamp = new Date().toISOString();
    let success = false;

    if (syncStatus) syncStatus.textContent = "Saving…";
    try {
      const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert({
        id: SUPABASE_ROW_ID,
        state: snapshot,
        updated_at: writeTimestamp
      });
      if (error) throw error;

      syncedRevision = Math.max(syncedRevision, revision);
      latestSupabaseWriteAt = writeTimestamp;
      if (localRevision <= syncedRevision) localStorage.removeItem(DIRTY_KEY);
      archiveSnapshot("saved-to-supabase", snapshot);
      success = true;
      resetRetry();
      if (syncStatus) syncStatus.textContent = localRevision > syncedRevision ? "Saving newer changes…" : "Saved to Supabase.";
      return true;
    } catch (error) {
      console.error(error);
      localStorage.setItem(DIRTY_KEY, "1");
      if (syncStatus) syncStatus.textContent = "Supabase save failed. Local copy is safe; retrying…";
      return false;
    } finally {
      supabaseSaveInFlight = false;
      if (success && (supabaseSaveQueued || localRevision > syncedRevision)) queueSupabaseSave(0);
      if (!success) scheduleRetry();
    }
  };

  loadSupabaseState = async function() {
    if (!supabaseClient) {
      if (syncStatus) syncStatus.textContent = "Saved locally. Supabase is not connected.";
      return;
    }

    const localCopy = clone(state);
    archiveSnapshot("before-supabase-load", localCopy);
    const result = await fetchSupabaseState();

    if (!result.ok) {
      state = localCopy;
      normalizeState();
      coreSaveLocalState();
      subscribeToSupabaseState();
      startPolling();
      scheduleRetry();
      return;
    }

    if (result.row?.state && typeof result.row.state === "object") {
      const merged = mergeStateSafely(localCopy, result.row.state);
      state = merged;
      ensureMeta();
      normalizeState();
      coreSaveLocalState();

      const same = JSON.stringify(merged) === JSON.stringify(result.row.state);
      if (same) {
        applyRemoteState(result.row.state, "Synced with Supabase.", {
          force: true,
          updatedAt: result.row.updated_at || ""
        });
      } else {
        localRevision = Math.max(1, localRevision);
        localStorage.setItem(DIRTY_KEY, "1");
        await saveSupabaseState();
      }
    } else {
      state = localCopy;
      normalizeState();
      coreSaveLocalState();
      localRevision = Math.max(1, localRevision);
      localStorage.setItem(DIRTY_KEY, "1");
      await saveSupabaseState();
    }

    subscribeToSupabaseState();
    startPolling();
  };

  refreshSupabaseState = async function({ force = false } = {}) {
    if (!supabaseClient || mainApp.classList.contains("hidden")) return false;
    if (!force && hasPendingLocalChanges()) return false;

    const result = await fetchSupabaseState({ silent: true });
    if (!result.ok) {
      scheduleRetry();
      return false;
    }

    const row = result.row;
    if (!row?.state || typeof row.state !== "object") return false;
    if (!force && row.updated_at && latestSupabaseWriteAt && row.updated_at === latestSupabaseWriteAt) return false;

    return applyRemoteState(row.state, "Synced with Supabase.", {
      updatedAt: row.updated_at || ""
    });
  };

  subscribeToSupabaseState = function() {
    if (!supabaseClient || cleanRealtimeChannel) return;
    cleanRealtimeChannel = supabaseClient
      .channel(`locked-os-clean-${SUPABASE_ROW_ID}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: SUPABASE_TABLE, filter: `id=eq.${SUPABASE_ROW_ID}` },
        payload => {
          if (hasPendingLocalChanges()) return;
          const remote = payload?.new?.state;
          if (!remote || typeof remote !== "object") return;
          const updatedAt = payload?.new?.updated_at || "";
          if (updatedAt && latestSupabaseWriteAt && updatedAt === latestSupabaseWriteAt) return;
          applyRemoteState(remote, "Updated live from Supabase.", { updatedAt });
        }
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED" && syncStatus && !syncStatus.textContent.includes("Saving")) {
          syncStatus.textContent = "Live sync connected.";
        }
      });
  };

  function startPolling() {
    if (!supabaseClient || pollTimer) return;
    pollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (mainApp.classList.contains("hidden")) return;
      if (hasPendingLocalChanges()) return;
      refreshSupabaseState();
    }, POLL_MS);
  }

  window.addEventListener("focus", () => refreshSupabaseState());
  archiveSnapshot("clean-rebuild-start", state);

  /* ------------------------------ gym state ------------------------------ */

  function cleanGymSchedule(schedule) {
    const out = {};
    if (!schedule || typeof schedule !== "object") return out;
    for (const day of DAY_ORDER) {
      const workout = String(schedule[day] || "").trim();
      if (GYM_WORKOUT_SET.has(workout)) out[day] = workout;
    }
    return out;
  }

  function mapLegacyWorkout(value) {
    const name = String(value || "");
    if (GYM_WORKOUT_SET.has(name)) return name;
    if (name === "Push") return "Chest + side delts";
    if (name === "Pull") return "Back + rear delts";
    if (name === "Legs") return "Legs + Abs";
    if (name === "Arms + Abs") return "Arms";
    return "";
  }

  function migrateGymSessions() {
    ensureMeta();

    const current = Array.isArray(state.meta.gymClean?.sessions) ? state.meta.gymClean.sessions : [];
    const v2 = Array.isArray(state.meta.gymTrackerV2?.sessions) ? state.meta.gymTrackerV2.sessions : [];
    const old = Array.isArray(state.meta.gymTracker?.sessions) ? state.meta.gymTracker.sessions : [];

    const convertedOld = old
      .filter(session => validDateKey(session?.date))
      .map(session => ({
        ...session,
        workout: mapLegacyWorkout(session.workout) || "Chest + side delts",
        updatedAt: session.updatedAt || ""
      }));

    return mergeGymSessions(mergeGymSessions(current, v2), convertedOld);
  }

  function latestLegacyGymSchedule() {
    const changes = Array.isArray(state.meta?.gymScheduleChanges) ? state.meta.gymScheduleChanges : [];
    let schedule = {};
    for (const change of [...changes].sort((a, b) => String(a?.effectiveDayKey || "").localeCompare(String(b?.effectiveDayKey || "")))) {
      if (change?.effectiveDayKey <= GYM_START) {
        const normalized = cleanGymSchedule(change.schedule);
        if (Object.keys(normalized).length) schedule = normalized;
      }
    }
    return schedule;
  }

  function ensureGymClean() {
    ensureMeta();
    const legacySchedule = latestLegacyGymSchedule();

    if (!state.meta.gymClean || typeof state.meta.gymClean !== "object" || Array.isArray(state.meta.gymClean)) {
      state.meta.gymClean = {
        version: 1,
        schedule: Object.keys(legacySchedule).length ? legacySchedule : clone(DEFAULT_GYM_SCHEDULE),
        sessions: []
      };
    }

    const normalizedSchedule = cleanGymSchedule(state.meta.gymClean.schedule);
    state.meta.gymClean.schedule = Object.keys(normalizedSchedule).length
      ? normalizedSchedule
      : (Object.keys(legacySchedule).length ? legacySchedule : clone(DEFAULT_GYM_SCHEDULE));

    state.meta.gymClean.sessions = migrateGymSessions();
    state.meta.gymClean.version = 1;
  }

  function gymWorkout(dayKey) {
    ensureGymClean();
    if (dayKey < GYM_START) return "";
    const dayName = getRoutineDayName(dayKey);
    return state.meta.gymClean.schedule[dayName] || "";
  }

  function gymSession(dayKey) {
    ensureGymClean();
    return state.meta.gymClean.sessions.find(session => session?.date === dayKey) || null;
  }

  function gymSessionForWrite(dayKey) {
    ensureGymClean();
    let session = gymSession(dayKey);
    if (!session) {
      session = {
        id: `gym-clean-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date: dayKey,
        workout: gymWorkout(dayKey),
        completed: false,
        exercises: [],
        updatedAt: new Date().toISOString()
      };
      state.meta.gymClean.sessions.push(session);
    }
    return session;
  }

  function previousExercise(name, beforeDate) {
    ensureGymClean();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => session?.date < beforeDate)
      .sort((a, b) => b.date.localeCompare(a.date));

    for (const session of sessions) {
      const exercise = Array.isArray(session.exercises)
        ? session.exercises.find(item => item?.name === name)
        : null;
      if (exercise) return exercise;
    }
    return null;
  }

  /* ------------------------- final routine authority ------------------------- */

  getTretinoinDays = function(dayKey = getTodayKey()) {
    const frequency = Number(getTretinoinFrequency(dayKey)) || 1;
    return TRETINOIN_SCHEDULE_CLEAN[frequency] || TRETINOIN_SCHEDULE_CLEAN[1];
  };

  function installRoutineAuthority() {
    recoverTaskSchedulesFromSnapshots();
    ensureGymClean();

    const priorRoutine = getLooksRoutine;
    getLooksRoutine = function(dayKey = getTodayKey()) {
      const routine = priorRoutine(dayKey);
      const dayName = getRoutineDayName(dayKey);

      for (const section of ["morning", "midday", "night"]) {
        if (!Array.isArray(routine[section])) routine[section] = [];
        routine[section] = routine[section].filter(task => {
          if (!task?.custom) return true;
          return scheduleForTask(task).includes(dayName);
        });
      }

      /* Azelaic acid is every morning, not a night rotation. */
      routine.morning = routine.morning.filter(task => task?.id !== "azelaic-acid");
      routine.night = routine.night.filter(task => task?.id !== "azelaic-acid");
      if (!routine.morning.some(task => task?.id === "azelaic-acid")) {
        const vitaminIndex = routine.morning.findIndex(task => task?.id === "vitamin-c");
        const insertAt = vitaminIndex >= 0 ? vitaminIndex + 1 : routine.morning.length;
        routine.morning.splice(insertAt, 0, { id: "azelaic-acid", title: "Apply azelaic acid" });
      }

      /* Keep the voice task in the shower block. */
      routine.morning = routine.morning.filter(task => task?.id !== "voice-training");
      const conditionerIndex = routine.morning.findIndex(task => task?.id === "conditioner-soap");
      routine.morning.splice(
        conditionerIndex >= 0 ? conditionerIndex + 1 : 1,
        0,
        { id: "voice-training", title: "Train voice in shower" }
      );

      /* One and only one gym source of truth. */
      routine.midday = routine.midday.filter(task => task?.id !== "gym");
      const workout = gymWorkout(dayKey);
      if (workout) routine.midday.unshift({ id: "gym", title: `Gym: ${workout}` });

      return routine;
    };

    getWorkoutName = function(dayKey = getTodayKey()) {
      return gymWorkout(dayKey) || "Rest day";
    };

    getWeeklyGymStatus = function(dayKey, day) {
      const workout = gymWorkout(dayKey);
      if (!workout) return "Rest day";
      const session = gymSession(dayKey);
      if (session?.completed) return "Done";
      const done = new Set(day?.looksDone || []);
      if (done.has("gym")) return "Done";
      if (dayKey === getTodayKey()) return "Not yet";
      return "Didn't go";
    };

    getRotationTasksForDay = function(dayKey) {
      const dayName = getRoutineDayName(dayKey);
      const items = [];
      const workout = gymWorkout(dayKey);

      if (workout) items.push({ label: `Gym: ${workout}`, type: "gym" });

      const jsDay = keyToLocalDate(dayKey).getDay();
      if (jsDay >= 1 && jsDay <= 5) items.push({ label: "MK-677", type: "mk677" });

      if (getTretinoinDays(dayKey).includes(dayName)) {
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

      const customTasks = Array.isArray(state.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [];
      const existing = new Set(items.map(item => item.label.toLowerCase()));

      for (const task of customTasks) {
        const days = scheduleForTask(task);
        if (days.length >= 7 || !days.includes(dayName)) continue;
        const label = String(task?.title || "").trim();
        if (!label || existing.has(label.toLowerCase())) continue;
        items.push({ label, type: "custom" });
        existing.add(label.toLowerCase());
      }

      return items;
    };
  }

  function wrapAddTaskScheduling() {
    const baseAdd = addLooksTask;
    addLooksTask = function(section, title, afterTaskId = null, days = DAY_ORDER) {
      const before = new Set((state.meta?.looksCustomTasks || []).map(task => task.id));
      const result = baseAdd(section, title, afterTaskId, days);

      ensureMeta();
      const created = [...(state.meta.looksCustomTasks || [])]
        .reverse()
        .find(task => !before.has(task.id));

      if (created) {
        const chosen = validDays(days);
        created.days = chosen.length ? chosen : [...DAY_ORDER];
        state.meta[CUSTOM_SCHEDULE_META][created.id] = created.days;
        saveState();
      }

      try { render(); } catch (_) {}
      try { renderRotationCalendar(); } catch (_) {}
      return result;
    };
  }

  /* ------------------------------ clean gym UI ------------------------------ */

  function nextScheduledWorkout(fromKey, direction) {
    let cursor = keyToLocalDate(fromKey);
    for (let i = 0; i < 45; i += 1) {
      cursor = addDays(cursor, direction);
      const key = formatDateKey(cursor);
      if (key < GYM_START) return null;
      if (gymWorkout(key)) return key;
    }
    return null;
  }

  function weekStartMonday(dayKey) {
    const date = keyToLocalDate(dayKey);
    const offset = (date.getDay() + 6) % 7;
    return addDays(date, -offset);
  }

  function cleanGymWeekKeys(dayKey) {
    const monday = weekStartMonday(dayKey);
    return Array.from({ length: 7 }, (_, index) => formatDateKey(addDays(monday, index)));
  }

  function setGymSelectedDate(dayKey) {
    if (!validDateKey(dayKey)) return;
    cleanGymSelectedDate = dayKey;
    renderCleanGym();
  }

  function workoutSetText(set) {
    return set && Number(set.weight) > 0 && Number(set.reps) > 0
      ? `${Number(set.weight)} lb × ${Number(set.reps)}`
      : "—";
  }

  function renderCleanGymWeek() {
    const grid = document.getElementById("cleanGymWeekGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const today = getTodayKey();
    for (const dayKey of cleanGymWeekKeys(cleanGymSelectedDate || today)) {
      const workout = gymWorkout(dayKey);
      if (!workout) continue;
      const date = keyToLocalDate(dayKey);
      const session = gymSession(dayKey);

      const button = document.createElement("button");
      button.type = "button";
      button.className = `clean-gym-day${dayKey === today ? " today" : ""}${dayKey === cleanGymSelectedDate ? " selected" : ""}`;
      button.innerHTML = `
        <strong>${DAY_ORDER[date.getDay()].slice(0, 3)} · ${date.getMonth() + 1}/${date.getDate()}</strong>
        <span>${escapeHtml(workout)}${session?.completed ? " ✓" : ""}</span>`;
      button.addEventListener("click", () => setGymSelectedDate(dayKey));
      grid.appendChild(button);
    }
  }

  function renderCleanGymWorkout() {
    const body = document.getElementById("cleanGymWorkoutBody");
    const title = document.getElementById("cleanGymWorkoutTitle");
    const dateLabel = document.getElementById("cleanGymDateLabel");
    const actions = document.getElementById("cleanGymActions");
    const status = document.getElementById("cleanGymSaveStatus");
    if (!body || !title || !dateLabel || !actions) return;

    const dayKey = cleanGymSelectedDate || getTodayKey();
    const date = keyToLocalDate(dayKey);
    const workout = gymWorkout(dayKey);
    const session = gymSession(dayKey);

    dateLabel.textContent = `${DAY_ORDER[date.getDay()]}, ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
    if (status) status.textContent = "";

    if (!workout) {
      title.textContent = "Rest day";
      const next = nextScheduledWorkout(dayKey, 1);
      body.innerHTML = `<div class="clean-gym-rest"><strong>Rest day</strong><span>${next ? `Next workout: ${escapeHtml(gymWorkout(next))} · ${escapeHtml(next)}` : "No upcoming workout found."}</span></div>`;
      actions.hidden = true;
      return;
    }

    actions.hidden = false;
    title.textContent = workout;
    const list = document.createElement("div");
    list.className = "clean-gym-exercises";

    for (const name of EXERCISES[workout] || []) {
      const current = session?.exercises?.find(item => item?.name === name) || { sets: [] };
      const previous = previousExercise(name, dayKey);
      const row = document.createElement("div");
      row.className = "clean-gym-exercise";
      row.dataset.exercise = name;

      const inputs = [0, 1].map(index => {
        const set = current.sets?.[index] || {};
        return `
          <div class="clean-gym-set">
            <label><span>Set ${index + 1} lb</span><input data-set="${index}" data-field="weight" type="number" min="0" max="2000" step="0.5" value="${Number(set.weight) || ""}" placeholder="Weight"></label>
            <label><span>Reps</span><input data-set="${index}" data-field="reps" type="number" min="0" max="100" step="1" value="${Number(set.reps) || ""}" placeholder="Reps"></label>
          </div>`;
      }).join("");

      row.innerHTML = `
        <div class="clean-gym-exercise-name"><strong>${escapeHtml(name)}</strong><span>2 working sets</span></div>
        <div class="clean-gym-previous"><span>Previous</span><strong>${escapeHtml(workoutSetText(previous?.sets?.[0]))}<br>${escapeHtml(workoutSetText(previous?.sets?.[1]))}</strong></div>
        ${inputs}`;
      list.appendChild(row);
    }

    body.innerHTML = "";
    body.appendChild(list);
  }

  function renderCleanGymHistory() {
    const list = document.getElementById("cleanGymHistory");
    if (!list) return;
    ensureGymClean();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => validDateKey(session?.date))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);

    if (!sessions.length) {
      list.innerHTML = '<div class="clean-gym-empty">No saved workouts yet.</div>';
      return;
    }

    list.innerHTML = sessions.map(session => `
      <button type="button" class="clean-gym-history-row" data-date="${escapeHtml(session.date)}">
        <span>${escapeHtml(session.date)}</span>
        <strong>${escapeHtml(session.workout || gymWorkout(session.date) || "Workout")}${session.completed ? " ✓" : ""}</strong>
      </button>`).join("");

    list.querySelectorAll("[data-date]").forEach(button => {
      button.addEventListener("click", () => setGymSelectedDate(button.dataset.date));
    });
  }

  function renderCleanGym() {
    if (!document.getElementById("gymPage")) return;
    if (!validDateKey(cleanGymSelectedDate)) cleanGymSelectedDate = getTodayKey();

    const badge = document.getElementById("cleanGymTodayBadge");
    if (badge) badge.textContent = gymWorkout(getTodayKey()) || "Rest day";

    renderCleanGymWeek();
    renderCleanGymWorkout();
    renderCleanGymHistory();
  }

  function collectGymInputs() {
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

  function saveCleanGym(markComplete) {
    const workout = gymWorkout(cleanGymSelectedDate);
    const status = document.getElementById("cleanGymSaveStatus");
    if (!workout) return;

    const collected = collectGymInputs();
    if (collected.invalid) {
      if (status) status.textContent = "Each entered set needs both weight and reps.";
      return;
    }

    if (markComplete) {
      const missing = collected.exercises.some(exercise =>
        exercise.sets.some(set => !(set.weight > 0 && set.reps > 0))
      );
      if (missing) {
        if (status) status.textContent = "Fill both sets for every exercise before marking complete.";
        return;
      }
    }

    const session = gymSessionForWrite(cleanGymSelectedDate);
    session.workout = workout;
    session.exercises = collected.exercises;
    if (markComplete) session.completed = true;
    session.updatedAt = new Date().toISOString();

    saveState();
    if (status) status.textContent = markComplete ? "Workout saved and completed." : "Workout saved.";
    toast(markComplete ? "Workout completed." : "Workout saved.");
    renderCleanGymWeek();
    renderCleanGymHistory();
    try { renderWeeklyReview(); } catch (_) {}
  }

  function saveGymScheduleFromModal(modal) {
    const schedule = {};
    for (const row of modal.querySelectorAll(".clean-gym-schedule-row.active")) {
      const workout = String(row.querySelector("select")?.value || "");
      if (GYM_WORKOUT_SET.has(workout)) schedule[row.dataset.day] = workout;
    }
    if (!Object.keys(schedule).length) return;

    ensureGymClean();
    state.meta.gymClean.schedule = schedule;
    saveState();
    modal.closest(".clean-modal-backdrop")?.remove();

    renderCleanGym();
    try { render(); } catch (_) {}
    try { renderRotationCalendar(); } catch (_) {}
    toast("Gym schedule saved.");
  }

  function openGymScheduleModal() {
    document.querySelector(".clean-modal-backdrop")?.remove();
    ensureGymClean();

    const backdrop = document.createElement("div");
    backdrop.className = "clean-modal-backdrop";
    backdrop.innerHTML = `
      <section class="clean-modal" role="dialog" aria-modal="true">
        <div class="clean-modal-head">
          <div><p class="eyebrow blue">Gym</p><h3>Gym schedule</h3></div>
          <button type="button" class="clean-modal-close">×</button>
        </div>
        <div class="clean-gym-schedule-list">
          ${GYM_EDITOR_ORDER.map(day => {
            const active = Boolean(state.meta.gymClean.schedule[day]);
            const selected = state.meta.gymClean.schedule[day] || GYM_WORKOUTS[0];
            return `
              <div class="clean-gym-schedule-row ${active ? "active" : ""}" data-day="${day}">
                <button type="button" class="clean-gym-toggle" aria-pressed="${active ? "true" : "false"}">
                  <strong>${day.slice(0, 3)}</strong><span>${active ? "On" : "Off"}</span>
                </button>
                <select ${active ? "" : "disabled"}>
                  ${GYM_WORKOUTS.map(workout => `<option value="${escapeHtml(workout)}"${workout === selected ? " selected" : ""}>${escapeHtml(workout)}</option>`).join("")}
                </select>
              </div>`;
          }).join("")}
        </div>
        <div class="clean-modal-actions">
          <button type="button" class="btn secondary clean-modal-cancel">Cancel</button>
          <button type="button" class="btn blue clean-modal-save">Save</button>
        </div>
      </section>`;

    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) backdrop.remove();
    });
    backdrop.querySelector(".clean-modal-close")?.addEventListener("click", () => backdrop.remove());
    backdrop.querySelector(".clean-modal-cancel")?.addEventListener("click", () => backdrop.remove());
    backdrop.querySelector(".clean-modal-save")?.addEventListener("click", () => saveGymScheduleFromModal(backdrop.querySelector(".clean-modal")));

    backdrop.querySelectorAll(".clean-gym-toggle").forEach(button => {
      button.addEventListener("click", () => {
        const row = button.closest(".clean-gym-schedule-row");
        const active = !row.classList.contains("active");
        row.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.querySelector("span").textContent = active ? "On" : "Off";
        row.querySelector("select").disabled = !active;
      });
    });
  }

  function replaceGymPageCompletely() {
    const oldButton = document.querySelector('.tab[data-tab="gymPage"]');
    const page = document.getElementById("gymPage");
    if (!oldButton || !page) return;

    /* Clone strips every old Gym listener from the stable base. */
    const button = oldButton.cloneNode(true);
    oldButton.replaceWith(button);

    page.innerHTML = `
      <div class="clean-gym-page">
        <section class="card clean-gym-hero">
          <div><p class="eyebrow blue">Training</p><h2>Gym</h2><p>Simple workout logging with one weekly schedule.</p></div>
          <div class="clean-gym-today" id="cleanGymTodayBadge">Loading…</div>
        </section>

        <section class="card clean-gym-week-card">
          <div class="panel-title">
            <div><p class="eyebrow blue">Schedule</p><h3>Your week</h3></div>
            <button class="clean-gym-settings" id="cleanGymSettings" type="button" aria-label="Edit gym schedule" title="Edit gym schedule">⚙</button>
          </div>
          <div class="clean-gym-week" id="cleanGymWeekGrid"></div>
        </section>

        <section class="card clean-gym-log-card">
          <div class="clean-gym-log-head">
            <div>
              <p class="eyebrow blue">Workout</p>
              <h3 id="cleanGymWorkoutTitle">Loading…</h3>
              <p id="cleanGymDateLabel"></p>
            </div>
            <div class="clean-gym-nav">
              <button id="cleanGymPrev" type="button">← Previous workout</button>
              <button id="cleanGymToday" type="button">Today</button>
              <button id="cleanGymNext" type="button">Next workout →</button>
            </div>
          </div>
          <div id="cleanGymWorkoutBody"></div>
          <div class="clean-gym-actions" id="cleanGymActions">
            <p id="cleanGymSaveStatus"></p>
            <div>
              <button class="btn secondary" id="cleanGymSave" type="button">Save workout</button>
              <button class="btn blue" id="cleanGymComplete" type="button">Save + complete</button>
            </div>
          </div>
        </section>

        <section class="card clean-gym-history-card">
          <div class="panel-title"><div><p class="eyebrow blue">History</p><h3>Recent workouts</h3></div></div>
          <div class="clean-gym-history" id="cleanGymHistory"></div>
        </section>
      </div>`;

    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
      document.querySelectorAll(".page").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      page.classList.add("active");
      cleanGymSelectedDate = getTodayKey();
      renderCleanGym();
    });

    document.querySelectorAll(".tab").forEach(tab => {
      if (tab === button) return;
      tab.addEventListener("click", () => {
        button.classList.remove("active");
        page.classList.remove("active");
      });
    });

    document.getElementById("cleanGymSettings")?.addEventListener("click", openGymScheduleModal);
    document.getElementById("cleanGymToday")?.addEventListener("click", () => setGymSelectedDate(getTodayKey()));
    document.getElementById("cleanGymPrev")?.addEventListener("click", () => {
      const target = nextScheduledWorkout(cleanGymSelectedDate || getTodayKey(), -1);
      if (target) setGymSelectedDate(target);
      else toast("No earlier workout in this schedule.");
    });
    document.getElementById("cleanGymNext")?.addEventListener("click", () => {
      const target = nextScheduledWorkout(cleanGymSelectedDate || getTodayKey(), 1);
      if (target) setGymSelectedDate(target);
    });
    document.getElementById("cleanGymSave")?.addEventListener("click", () => saveCleanGym(false));
    document.getElementById("cleanGymComplete")?.addEventListener("click", () => saveCleanGym(true));

    cleanGymSelectedDate = getTodayKey();
    renderCleanGym();
  }

  /* -------------------------- backup/admin cleanup -------------------------- */

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `locked-os-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function updateBackupStatus() {
    const status = document.getElementById("cleanBackupStatus");
    if (!status) return;

    let localCount = 0;
    try {
      const entries = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "[]");
      localCount = Array.isArray(entries) ? entries.length : 0;
    } catch (_) {}

    if (!supabaseClient) {
      status.textContent = `${localCount} local recovery snapshots`;
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from("locked_os_state_backups")
        .select("backup_id, backed_up_at")
        .eq("id", SUPABASE_ROW_ID)
        .order("backup_id", { ascending: false })
        .limit(1);
      if (error) throw error;
      const latest = Array.isArray(data) ? data[0] : null;
      status.textContent = latest?.backed_up_at
        ? `${localCount} local snapshots · cloud history active`
        : `${localCount} local snapshots · cloud backup table ready`;
    } catch (_) {
      status.textContent = `${localCount} local snapshots`;
    }
  }

  function installBackupCardAndOrder() {
    const grid = document.querySelector("#adminRoutinePanel .admin-grid");
    const rotation = grid?.querySelector(".rotation-admin-card");
    if (!grid || !rotation) return;

    document.getElementById("gymScheduleAdminCard")?.remove();

    let backup = document.getElementById("cleanBackupCard");
    if (!backup) {
      backup = document.createElement("section");
      backup.className = "card admin-card clean-backup-card";
      backup.id = "cleanBackupCard";
      backup.innerHTML = `
        <p class="eyebrow blue">Data protection</p>
        <h2>Automatic backups</h2>
        <p id="cleanBackupStatus">Checking backup status…</p>
        <div class="clean-backup-actions">
          <button class="btn blue" id="cleanDownloadBackup" type="button">Download full backup</button>
          <button class="btn secondary" id="cleanRecoveryHistory" type="button">Recovery history</button>
        </div>`;
      grid.appendChild(backup);
      backup.querySelector("#cleanDownloadBackup")?.addEventListener("click", downloadBackup);
      backup.querySelector("#cleanRecoveryHistory")?.addEventListener("click", () => {
        window.location.href = "recover-data.html";
      });
    }

    /* Rotation comes before Data Protection. */
    if (rotation.nextSibling !== backup) grid.insertBefore(rotation, backup);
    updateBackupStatus();
  }

  function installStyles() {
    if (document.getElementById("cleanRebuildStyles")) return;
    const style = document.createElement("style");
    style.id = "cleanRebuildStyles";
    style.textContent = `
      .rotation-chip{color:var(--text)!important;border:1px solid rgba(42,30,18,.06)!important}
      .rotation-chip.gym{background:#dceef6!important}
      .rotation-chip.mk677{background:#e7edf9!important}
      .rotation-chip.tretinoin{background:#eadff4!important}
      .rotation-chip.microneedle{background:#e1f0ea!important}
      .rotation-chip.sheets{background:#e6eef0!important}
      .rotation-chip.shave{background:#f1e7e1!important}
      .rotation-chip.lips{background:#f3e3ea!important}
      .rotation-chip.custom{background:#e8e6f2!important}

      .clean-gym-page{display:grid;gap:16px}
      .clean-gym-hero{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:24px}
      .clean-gym-hero h2{margin:0;font-size:clamp(2rem,5vw,3rem)}
      .clean-gym-hero p:not(.eyebrow){margin:7px 0 0;color:var(--muted);font-weight:750}
      .clean-gym-today{padding:10px 14px;border-radius:999px;background:var(--blue-soft);font-weight:900}
      .clean-gym-week-card,.clean-gym-log-card,.clean-gym-history-card{padding:20px}
      .clean-gym-settings{width:34px;height:34px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.55);cursor:pointer;color:var(--text);font-size:1rem}
      .clean-gym-week{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}
      .clean-gym-day{border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.45);padding:12px;text-align:left;color:var(--text);cursor:pointer}
      .clean-gym-day strong,.clean-gym-day span{display:block}.clean-gym-day span{margin-top:4px;color:var(--muted);font-size:.78rem;font-weight:800}
      .clean-gym-day.today{border-color:rgba(37,132,184,.38)}.clean-gym-day.selected{background:var(--blue-soft)}
      .clean-gym-log-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.clean-gym-log-head h3{margin:0;font-size:1.65rem}.clean-gym-log-head p{color:var(--muted);font-weight:800}
      .clean-gym-nav{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.clean-gym-nav button{border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.56);padding:9px 11px;color:var(--text);font:inherit;font-size:.76rem;font-weight:900;cursor:pointer}
      .clean-gym-exercises{display:grid;gap:10px;margin-top:17px}.clean-gym-exercise{display:grid;grid-template-columns:minmax(170px,1.15fr) minmax(120px,.7fr) repeat(2,minmax(170px,1fr));gap:10px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.4)}
      .clean-gym-exercise-name strong,.clean-gym-exercise-name span,.clean-gym-previous span,.clean-gym-previous strong{display:block}.clean-gym-exercise-name span,.clean-gym-previous span{color:var(--muted);font-size:.72rem;font-weight:850;margin-top:3px}.clean-gym-previous strong{font-size:.78rem;line-height:1.55}
      .clean-gym-set{display:grid;grid-template-columns:1fr 1fr;gap:7px}.clean-gym-set label{display:grid;gap:4px}.clean-gym-set span{font-size:.68rem;color:var(--muted);font-weight:900}.clean-gym-set input{min-width:0;width:100%;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.72);padding:9px;color:var(--text);font:inherit;font-weight:800}
      .clean-gym-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:16px}.clean-gym-actions>div{display:flex;gap:8px}.clean-gym-actions p{min-height:18px;color:var(--muted);font-weight:800}
      .clean-gym-rest,.clean-gym-empty{padding:22px;border:1px dashed var(--line);border-radius:16px;color:var(--muted);display:grid;gap:5px;margin-top:14px}.clean-gym-rest strong{color:var(--text)}
      .clean-gym-history{display:grid;gap:8px;margin-top:12px}.clean-gym-history-row{display:flex;justify-content:space-between;gap:14px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.42);padding:11px 13px;color:var(--text);cursor:pointer}.clean-gym-history-row span{color:var(--muted);font-weight:800}
      .clean-modal-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(20,16,12,.44);display:grid;place-items:center;padding:18px;backdrop-filter:blur(8px)}
      .clean-modal{width:min(610px,100%);max-height:92vh;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:23px;padding:20px;box-shadow:0 24px 80px rgba(20,14,8,.25)}
      .clean-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;margin-bottom:15px}.clean-modal-head h3{margin:0;font-size:1.8rem}.clean-modal-close{width:36px;height:36px;border:0;border-radius:999px;background:rgba(42,30,18,.07);font-size:1.4rem;color:var(--text);cursor:pointer}
      .clean-gym-schedule-list{display:grid;gap:8px}.clean-gym-schedule-row{display:grid;grid-template-columns:88px 1fr;gap:8px}.clean-gym-toggle{border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.45);color:var(--text);display:flex;justify-content:space-between;align-items:center;padding:0 11px;cursor:pointer}.clean-gym-toggle span{font-size:.68rem;color:var(--muted);font-weight:900}.clean-gym-schedule-row.active .clean-gym-toggle{background:var(--blue-soft);border-color:rgba(37,132,184,.35)}.clean-gym-schedule-row select{min-height:46px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.7);padding:0 11px;color:var(--text);font:inherit;font-weight:800}.clean-gym-schedule-row select:disabled{opacity:.42}
      .clean-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:17px}
      .clean-backup-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
      @media(max-width:900px){.clean-gym-exercise{grid-template-columns:1fr 1fr}.clean-gym-week{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:600px){.clean-gym-hero,.clean-gym-log-head,.clean-gym-actions{display:grid}.clean-gym-nav{justify-content:start}.clean-gym-exercise{grid-template-columns:1fr}.clean-gym-week{grid-template-columns:1fr 1fr}.clean-gym-actions>div{display:grid;grid-template-columns:1fr 1fr}.clean-gym-schedule-row{grid-template-columns:78px 1fr}}
    `;
    document.head.appendChild(style);
  }

  function finalInstall() {
    if (typeof state === "undefined" || typeof render !== "function") return;

    ensureMeta();
    recoverTaskSchedulesFromSnapshots();
    ensureGymClean();
    coreSaveLocalState();

    installStyles();
    installRoutineAuthority();
    wrapAddTaskScheduling();
    replaceGymPageCompletely();
    installBackupCardAndOrder();

    try { render(); } catch (error) { console.error("LOCKED OS clean render:", error); }
    try { renderRotationCalendar(); } catch (_) {}

    document.querySelectorAll('[data-tab="adminPage"],[data-admin-panel="adminRoutinePanel"]').forEach(button => {
      button.addEventListener("click", () => setTimeout(() => {
        installBackupCardAndOrder();
        try { renderRotationCalendar(); } catch (_) {}
      }, 0));
    });
  }

  /*
    Wait until DOMContentLoaded + one task, so the current inline script has
    finished installing its own task-day UI. This clean layer then becomes the
    final authority instead of competing with it.
  */
  window.addEventListener("DOMContentLoaded", () => setTimeout(finalInstall, 25));
})();