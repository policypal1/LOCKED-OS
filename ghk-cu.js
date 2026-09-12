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

/* ===== FLATTENED: gym sequence / recovery ===== */
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

    const current = state.meta.gymClean.schedule || {};
    const legacyDefault = {
      Monday: "Chest + side delts",
      Wednesday: "Back + rear delts",
      Friday: "Arms",
      Saturday: "Legs + Abs"
    };
    const sameAsLegacyDefault =
      Object.keys(current).length === Object.keys(legacyDefault).length &&
      Object.entries(legacyDefault).every(([day, workout]) => current[day] === workout);

    let changed = false;
    if (!Object.keys(current).length || sameAsLegacyDefault) {
      state.meta.gymClean.schedule = clone(DESIRED_SCHEDULE);
      changed = true;
    }

    /* A genuinely customized schedule is preserved. */
    state.meta[ROTATION_FLAG] = true;
    return changed;
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

/* ===== FLATTENED: gym UI ===== */
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
    if (
      !state.meta.gymClean.schedule ||
      typeof state.meta.gymClean.schedule !== "object" ||
      Array.isArray(state.meta.gymClean.schedule) ||
      !Object.keys(state.meta.gymClean.schedule).length
    ) {
      state.meta.gymClean.schedule = { ...SCHEDULE };
    }
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

/* ===== FLATTENED: gym log/navigation ===== */
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
    if (
      !state.meta.gymClean.schedule ||
      typeof state.meta.gymClean.schedule !== "object" ||
      Array.isArray(state.meta.gymClean.schedule) ||
      !Object.keys(state.meta.gymClean.schedule).length
    ) {
      state.meta.gymClean.schedule = { ...SCHEDULE };
    }
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

/* ===== FLATTENED: task stability ===== */
(() => {
  "use strict";

  const FLAG = "__lockedOsTaskStability20260911";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const VAULT_KEY = "locked_os_task_vault_v1";
  const CUSTOM_SCHEDULE_META = "customTaskSchedules";
  const ENTITY_VERSIONS = "taskEntityVersions";
  const TOMBSTONES = "taskTombstones";
  const DAY_VERSIONS = "taskDayVersions";
  const ORDER_VERSIONS = "taskOrderVersions";
  const SECTIONS = ["morning", "midday", "night"];
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let baseline = null;
  let lastMutationIso = "";
  let installFinished = false;

  const clone = value => JSON.parse(JSON.stringify(value));
  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function isoNow() {
    const now = new Date().toISOString();
    if (now > lastMutationIso) {
      lastMutationIso = now;
      return now;
    }
    // ISO timestamps have millisecond resolution; ensure strictly increasing
    // versions even if two actions occur in the same millisecond.
    const bumped = new Date(new Date(lastMutationIso).getTime() + 1).toISOString();
    lastMutationIso = bumped;
    return bumped;
  }

  function newer(a, b) {
    const left = String(a || "");
    const right = String(b || "");
    return left >= right ? left : right;
  }

  function isNewer(a, b) {
    return String(a || "") > String(b || "");
  }

  function ensureTaskMeta(target = state) {
    if (!target || typeof target !== "object") return;
    target.days = target.days && typeof target.days === "object" ? target.days : {};
    target.meta = target.meta && typeof target.meta === "object" ? target.meta : {};

    if (!Array.isArray(target.meta.looksCustomTasks)) target.meta.looksCustomTasks = [];
    if (!target.meta.looksTaskEdits || typeof target.meta.looksTaskEdits !== "object" || Array.isArray(target.meta.looksTaskEdits)) {
      target.meta.looksTaskEdits = {};
    }
    if (!Array.isArray(target.meta.looksDeletedTaskIds)) target.meta.looksDeletedTaskIds = [];
    if (!target.meta.looksTaskOrder || typeof target.meta.looksTaskOrder !== "object" || Array.isArray(target.meta.looksTaskOrder)) {
      target.meta.looksTaskOrder = { morning: [], midday: [], night: [] };
    }
    if (!target.meta[CUSTOM_SCHEDULE_META] || typeof target.meta[CUSTOM_SCHEDULE_META] !== "object" || Array.isArray(target.meta[CUSTOM_SCHEDULE_META])) {
      target.meta[CUSTOM_SCHEDULE_META] = {};
    }
    if (!target.meta[ENTITY_VERSIONS] || typeof target.meta[ENTITY_VERSIONS] !== "object" || Array.isArray(target.meta[ENTITY_VERSIONS])) {
      target.meta[ENTITY_VERSIONS] = {};
    }
    if (!target.meta[TOMBSTONES] || typeof target.meta[TOMBSTONES] !== "object" || Array.isArray(target.meta[TOMBSTONES])) {
      target.meta[TOMBSTONES] = {};
    }
    if (!target.meta[DAY_VERSIONS] || typeof target.meta[DAY_VERSIONS] !== "object" || Array.isArray(target.meta[DAY_VERSIONS])) {
      target.meta[DAY_VERSIONS] = {};
    }
    if (!target.meta[ORDER_VERSIONS] || typeof target.meta[ORDER_VERSIONS] !== "object" || Array.isArray(target.meta[ORDER_VERSIONS])) {
      target.meta[ORDER_VERSIONS] = {};
    }

    for (const section of SECTIONS) {
      if (!Array.isArray(target.meta.looksTaskOrder[section])) target.meta.looksTaskOrder[section] = [];
    }
  }

  function customTaskMap(snapshot = state) {
    ensureTaskMeta(snapshot);
    return new Map(
      snapshot.meta.looksCustomTasks
        .filter(task => task && task.id)
        .map(task => [String(task.id), task])
    );
  }

  function knownEntityIds(snapshot = state) {
    ensureTaskMeta(snapshot);
    const ids = new Set();

    for (const task of snapshot.meta.looksCustomTasks) {
      if (task?.id) ids.add(String(task.id));
    }
    Object.keys(snapshot.meta.looksTaskEdits || {}).forEach(id => ids.add(id));
    Object.keys(snapshot.meta[CUSTOM_SCHEDULE_META] || {}).forEach(id => ids.add(id));
    Object.keys(snapshot.meta[ENTITY_VERSIONS] || {}).forEach(id => ids.add(id));
    Object.keys(snapshot.meta[TOMBSTONES] || {}).forEach(id => ids.add(id));
    (snapshot.meta.looksDeletedTaskIds || []).forEach(id => ids.add(String(id)));

    return ids;
  }

  function normalizeDays(value) {
    if (!Array.isArray(value)) return [];
    const set = new Set(value.map(day => String(day || "").trim()));
    return DAY_NAMES.filter(day => set.has(day));
  }

  function entityDescriptor(snapshot, id) {
    ensureTaskMeta(snapshot);
    const task = snapshot.meta.looksCustomTasks.find(item => String(item?.id || "") === id) || null;
    const edit = Object.prototype.hasOwnProperty.call(snapshot.meta.looksTaskEdits, id)
      ? String(snapshot.meta.looksTaskEdits[id] ?? "")
      : null;
    const scheduled = normalizeDays(
      task?.days?.length
        ? task.days
        : snapshot.meta[CUSTOM_SCHEDULE_META]?.[id]
    );
    const deletedBuiltin = snapshot.meta.looksDeletedTaskIds.includes(id);

    return {
      task: task ? {
        id: String(task.id),
        section: String(task.section || ""),
        title: String(task.title || ""),
        custom: true,
        ...(scheduled.length ? { days: scheduled } : {})
      } : null,
      edit,
      days: scheduled,
      deletedBuiltin
    };
  }

  function entityFingerprint(snapshot, id) {
    return JSON.stringify(entityDescriptor(snapshot, id));
  }

  function orderFingerprint(snapshot, section) {
    ensureTaskMeta(snapshot);
    return JSON.stringify(snapshot.meta.looksTaskOrder?.[section] || []);
  }

  function dayFingerprint(snapshot, dayKey) {
    const day = snapshot?.days?.[dayKey];
    if (!day || typeof day !== "object") return "";
    return JSON.stringify({
      done: Array.isArray(day.done) ? day.done : [],
      skipped: Array.isArray(day.skipped) ? day.skipped : [],
      looksDone: Array.isArray(day.looksDone) ? day.looksDone : [],
      looksSkipped: Array.isArray(day.looksSkipped) ? day.looksSkipped : [],
      waterOz: Number(day.waterOz) || 0,
      completed: Boolean(day.completed),
      looksCompleted: Boolean(day.looksCompleted),
      missedReason: String(day.missedReason || "")
    });
  }

  function captureBaseline(snapshot = state) {
    ensureTaskMeta(snapshot);
    const entities = {};
    for (const id of knownEntityIds(snapshot)) {
      entities[id] = entityFingerprint(snapshot, id);
    }

    const orders = {};
    for (const section of SECTIONS) {
      orders[section] = orderFingerprint(snapshot, section);
    }

    const days = {};
    for (const key of Object.keys(snapshot.days || {})) {
      if (validDateKey(key)) days[key] = dayFingerprint(snapshot, key);
    }

    return { entities, orders, days };
  }

  function inferAndStampMutations() {
    ensureTaskMeta();
    if (!baseline) {
      baseline = captureBaseline();
      return false;
    }

    const now = isoNow();
    let changed = false;

    const currentIds = knownEntityIds(state);
    const previousIds = new Set(Object.keys(baseline.entities || {}));
    const allIds = new Set([...currentIds, ...previousIds]);

    for (const id of allIds) {
      const before = baseline.entities?.[id] ?? JSON.stringify({
        task: null, edit: null, days: [], deletedBuiltin: false
      });
      const after = entityFingerprint(state, id);

      if (before === after) continue;

      state.meta[ENTITY_VERSIONS][id] = now;
      changed = true;

      let beforeObject = null;
      let afterObject = null;
      try { beforeObject = JSON.parse(before); } catch (_) {}
      try { afterObject = JSON.parse(after); } catch (_) {}

      const customWasRemoved = Boolean(beforeObject?.task && !afterObject?.task);
      const builtinWasDeleted = Boolean(!beforeObject?.deletedBuiltin && afterObject?.deletedBuiltin);

      if (customWasRemoved || builtinWasDeleted) {
        state.meta[TOMBSTONES][id] = now;
      } else {
        const tombstone = String(state.meta[TOMBSTONES][id] || "");
        if (tombstone && String(now) > tombstone) {
          delete state.meta[TOMBSTONES][id];
        }
      }
    }

    for (const section of SECTIONS) {
      const before = baseline.orders?.[section] ?? "[]";
      const after = orderFingerprint(state, section);
      if (before !== after) {
        state.meta[ORDER_VERSIONS][section] = now;
        changed = true;
      }
    }

    const dayKeys = new Set([
      ...Object.keys(baseline.days || {}),
      ...Object.keys(state.days || {}).filter(validDateKey)
    ]);

    for (const dayKey of dayKeys) {
      const before = baseline.days?.[dayKey] ?? "";
      const after = dayFingerprint(state, dayKey);
      if (before !== after) {
        state.meta[DAY_VERSIONS][dayKey] = now;
        changed = true;
      }
    }

    baseline = captureBaseline();
    return changed;
  }

  function cleanTaskIdEverywhere(snapshot, id, { builtinDelete = false } = {}) {
    ensureTaskMeta(snapshot);

    snapshot.meta.looksCustomTasks = snapshot.meta.looksCustomTasks
      .filter(task => String(task?.id || "") !== id);

    delete snapshot.meta.looksTaskEdits[id];
    delete snapshot.meta[CUSTOM_SCHEDULE_META][id];

    if (builtinDelete && !snapshot.meta.looksDeletedTaskIds.includes(id)) {
      snapshot.meta.looksDeletedTaskIds.push(id);
    }

    for (const section of SECTIONS) {
      snapshot.meta.looksTaskOrder[section] = snapshot.meta.looksTaskOrder[section]
        .filter(taskId => String(taskId) !== id);
    }

    for (const day of Object.values(snapshot.days || {})) {
      if (!day || typeof day !== "object") continue;
      if (Array.isArray(day.looksDone)) day.looksDone = day.looksDone.filter(taskId => String(taskId) !== id);
      if (Array.isArray(day.looksSkipped)) day.looksSkipped = day.looksSkipped.filter(taskId => String(taskId) !== id);
    }
  }

  function enforceTombstones(snapshot = state) {
    ensureTaskMeta(snapshot);
    let changed = false;

    const customIds = new Set(
      snapshot.meta.looksCustomTasks
        .map(task => String(task?.id || ""))
        .filter(Boolean)
    );

    for (const [id, tombstoneVersion] of Object.entries(snapshot.meta[TOMBSTONES])) {
      if (!tombstoneVersion) continue;

      const entityVersion = String(snapshot.meta[ENTITY_VERSIONS][id] || "");
      if (entityVersion && entityVersion > tombstoneVersion) continue;

      const before = entityFingerprint(snapshot, id);
      cleanTaskIdEverywhere(snapshot, id, { builtinDelete: !customIds.has(id) });
      const after = entityFingerprint(snapshot, id);

      if (before !== after) changed = true;
    }

    return changed;
  }

  function vaultPayload() {
    ensureTaskMeta();
    return {
      savedAt: new Date().toISOString(),
      meta: {
        looksCustomTasks: clone(state.meta.looksCustomTasks),
        looksTaskEdits: clone(state.meta.looksTaskEdits),
        looksDeletedTaskIds: clone(state.meta.looksDeletedTaskIds),
        looksTaskOrder: clone(state.meta.looksTaskOrder),
        [CUSTOM_SCHEDULE_META]: clone(state.meta[CUSTOM_SCHEDULE_META]),
        [ENTITY_VERSIONS]: clone(state.meta[ENTITY_VERSIONS]),
        [TOMBSTONES]: clone(state.meta[TOMBSTONES]),
        [DAY_VERSIONS]: clone(state.meta[DAY_VERSIONS]),
        [ORDER_VERSIONS]: clone(state.meta[ORDER_VERSIONS])
      },
      days: clone(state.days || {})
    };
  }

  function writeVault() {
    try {
      localStorage.setItem(VAULT_KEY, JSON.stringify(vaultPayload()));
    } catch (error) {
      console.warn("LOCKED OS: task vault could not be written.", error);
    }
  }

  function readVault() {
    try {
      const parsed = JSON.parse(localStorage.getItem(VAULT_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function applyEntityFrom(source, target, id) {
    ensureTaskMeta(source);
    ensureTaskMeta(target);

    const sourceTask = source.meta.looksCustomTasks
      .find(task => String(task?.id || "") === id) || null;

    target.meta.looksCustomTasks = target.meta.looksCustomTasks
      .filter(task => String(task?.id || "") !== id);

    if (sourceTask) target.meta.looksCustomTasks.push(clone(sourceTask));

    if (Object.prototype.hasOwnProperty.call(source.meta.looksTaskEdits, id)) {
      target.meta.looksTaskEdits[id] = source.meta.looksTaskEdits[id];
    } else {
      delete target.meta.looksTaskEdits[id];
    }

    if (Object.prototype.hasOwnProperty.call(source.meta[CUSTOM_SCHEDULE_META], id)) {
      target.meta[CUSTOM_SCHEDULE_META][id] = clone(source.meta[CUSTOM_SCHEDULE_META][id]);
    } else {
      delete target.meta[CUSTOM_SCHEDULE_META][id];
    }

    const sourceDeleted = source.meta.looksDeletedTaskIds.includes(id);
    target.meta.looksDeletedTaskIds = target.meta.looksDeletedTaskIds.filter(taskId => String(taskId) !== id);
    if (sourceDeleted) target.meta.looksDeletedTaskIds.push(id);
  }

  function mergeTaskAwareRemote(remoteInput) {
    const remote = clone(remoteInput || {});
    ensureTaskMeta();
    ensureTaskMeta(remote);

    /*
      Merge version metadata first.
    */
    const mergedEntityVersions = {};
    const mergedTombstones = {};
    const allIds = new Set([
      ...knownEntityIds(state),
      ...knownEntityIds(remote)
    ]);

    for (const id of allIds) {
      mergedEntityVersions[id] = newer(
        state.meta[ENTITY_VERSIONS][id],
        remote.meta[ENTITY_VERSIONS][id]
      );
      mergedTombstones[id] = newer(
        state.meta[TOMBSTONES][id],
        remote.meta[TOMBSTONES][id]
      );
    }

    remote.meta[ENTITY_VERSIONS] = mergedEntityVersions;
    remote.meta[TOMBSTONES] = Object.fromEntries(
      Object.entries(mergedTombstones).filter(([, value]) => Boolean(value))
    );

    /*
      For each task/config entity, whichever device has the newer mutation
      version wins. If neither side has version metadata yet, keep the remote
      side as the legacy tie-breaker.
    */
    for (const id of allIds) {
      const localVersion = String(state.meta[ENTITY_VERSIONS][id] || "");
      const remoteVersion = String(remoteInput?.meta?.[ENTITY_VERSIONS]?.[id] || "");

      if (isNewer(localVersion, remoteVersion)) {
        applyEntityFrom(state, remote, id);
      }

      const tombstone = String(remote.meta[TOMBSTONES][id] || "");
      const winningEntityVersion = String(remote.meta[ENTITY_VERSIONS][id] || "");

      if (tombstone && (!winningEntityVersion || tombstone >= winningEntityVersion)) {
        const localCustom = customTaskMap(state).has(id);
        const remoteCustom = customTaskMap(remote).has(id);
        cleanTaskIdEverywhere(remote, id, {
          builtinDelete: !localCustom && !remoteCustom
        });
      }
    }

    /*
      Task order is versioned per section.
    */
    for (const section of SECTIONS) {
      const localVersion = String(state.meta[ORDER_VERSIONS][section] || "");
      const remoteVersion = String(remoteInput?.meta?.[ORDER_VERSIONS]?.[section] || "");

      if (isNewer(localVersion, remoteVersion)) {
        remote.meta.looksTaskOrder[section] = clone(state.meta.looksTaskOrder[section]);
      }

      remote.meta[ORDER_VERSIONS][section] = newer(localVersion, remoteVersion);
    }

    /*
      Daily checkbox/skip state is versioned per day. A stale remote event can
      no longer replace a day that was just changed locally.
    */
    const dayKeys = new Set([
      ...Object.keys(state.days || {}).filter(validDateKey),
      ...Object.keys(remote.days || {}).filter(validDateKey),
      ...Object.keys(state.meta[DAY_VERSIONS] || {}).filter(validDateKey),
      ...Object.keys(remote.meta[DAY_VERSIONS] || {}).filter(validDateKey)
    ]);

    for (const dayKey of dayKeys) {
      const localVersion = String(state.meta[DAY_VERSIONS][dayKey] || "");
      const remoteVersion = String(remoteInput?.meta?.[DAY_VERSIONS]?.[dayKey] || "");

      if (isNewer(localVersion, remoteVersion) && state.days?.[dayKey]) {
        remote.days[dayKey] = clone(state.days[dayKey]);
      }

      remote.meta[DAY_VERSIONS][dayKey] = newer(localVersion, remoteVersion);
    }

    enforceTombstones(remote);
    return remote;
  }

  function applyVaultIfNewer() {
    const vault = readVault();
    if (!vault?.meta) return false;

    ensureTaskMeta();
    ensureTaskMeta(vault);

    let changed = false;

    const allIds = new Set([
      ...knownEntityIds(state),
      ...knownEntityIds(vault)
    ]);

    for (const id of allIds) {
      const currentVersion = String(state.meta[ENTITY_VERSIONS][id] || "");
      const vaultVersion = String(vault.meta[ENTITY_VERSIONS][id] || "");

      if (isNewer(vaultVersion, currentVersion)) {
        applyEntityFrom(vault, state, id);
        state.meta[ENTITY_VERSIONS][id] = vaultVersion;
        changed = true;
      }

      const tombstone = newer(
        state.meta[TOMBSTONES][id],
        vault.meta[TOMBSTONES][id]
      );
      if (tombstone) state.meta[TOMBSTONES][id] = tombstone;
    }

    for (const section of SECTIONS) {
      const currentVersion = String(state.meta[ORDER_VERSIONS][section] || "");
      const vaultVersion = String(vault.meta[ORDER_VERSIONS][section] || "");

      if (isNewer(vaultVersion, currentVersion)) {
        state.meta.looksTaskOrder[section] = clone(vault.meta.looksTaskOrder?.[section] || []);
        state.meta[ORDER_VERSIONS][section] = vaultVersion;
        changed = true;
      }
    }

    for (const [dayKey, vaultVersionValue] of Object.entries(vault.meta[DAY_VERSIONS] || {})) {
      if (!validDateKey(dayKey)) continue;

      const currentVersion = String(state.meta[DAY_VERSIONS][dayKey] || "");
      const vaultVersion = String(vaultVersionValue || "");

      if (isNewer(vaultVersion, currentVersion) && vault.days?.[dayKey]) {
        state.days[dayKey] = clone(vault.days[dayKey]);
        state.meta[DAY_VERSIONS][dayKey] = vaultVersion;
        changed = true;
      }
    }

    if (enforceTombstones(state)) changed = true;
    return changed;
  }

  function parseRecoveryEntry(entry) {
    if (!entry) return null;
    if (entry.state && typeof entry.state === "object") return entry.state;

    for (const key of ["serialized", "snapshot"]) {
      if (typeof entry[key] === "string") {
        try {
          const parsed = JSON.parse(entry[key]);
          if (parsed && typeof parsed === "object") return parsed;
        } catch (_) {}
      } else if (entry[key] && typeof entry[key] === "object") {
        return entry[key];
      }
    }

    return null;
  }

  /*
    Recover a very recent local deletion that was already resurrected by the
    older union-merge bug before this fix loaded. We only infer removals from
    consecutive local-change snapshots within the last two hours.
  */
  function recoverRecentDeletionTombstones() {
    ensureTaskMeta();

    let changed = false;
    const candidateKeys = [
      "locked_os_recovery_snapshots_clean",
      "locked_os_recovery_snapshots_v2"
    ];

    for (const storageKey of candidateKeys) {
      let entries = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (Array.isArray(parsed)) entries = parsed;
      } catch (_) {}

      const localChanges = entries
        .filter(entry => {
          const label = String(entry?.label || "").toLowerCase();
          const savedAt = Date.parse(entry?.savedAt || "");
          return (
            label.includes("local-change") &&
            Number.isFinite(savedAt) &&
            Date.now() - savedAt <= 2 * 60 * 60 * 1000
          );
        })
        .map(entry => ({
          entry,
          savedAt: Date.parse(entry.savedAt),
          state: parseRecoveryEntry(entry)
        }))
        .filter(item => item.state)
        .sort((a, b) => a.savedAt - b.savedAt);

      for (let index = 1; index < localChanges.length; index += 1) {
        const before = localChanges[index - 1];
        const after = localChanges[index];

        const beforeIds = new Set(
          (before.state?.meta?.looksCustomTasks || [])
            .map(task => String(task?.id || ""))
            .filter(Boolean)
        );
        const afterIds = new Set(
          (after.state?.meta?.looksCustomTasks || [])
            .map(task => String(task?.id || ""))
            .filter(Boolean)
        );

        for (const id of beforeIds) {
          if (afterIds.has(id)) continue;
          if (!customTaskMap(state).has(id)) continue;

          const version = new Date(after.savedAt).toISOString();
          state.meta[TOMBSTONES][id] = newer(state.meta[TOMBSTONES][id], version);
          state.meta[ENTITY_VERSIONS][id] = newer(state.meta[ENTITY_VERSIONS][id], version);
          cleanTaskIdEverywhere(state, id);
          changed = true;
        }
      }
    }

    return changed;
  }

  /*
    Make the current routine incapable of displaying a tombstoned task even if
    another legacy layer somehow reintroduces it into an intermediate list.
  */
  if (typeof getLooksRoutine === "function" && !getLooksRoutine.__taskStabilityFilter) {
    const baseGetLooksRoutine = getLooksRoutine;
    const wrappedGetLooksRoutine = function(dayKey = getTodayKey()) {
      const routine = baseGetLooksRoutine(dayKey);
      ensureTaskMeta();

      const tombstones = state.meta[TOMBSTONES];
      for (const section of SECTIONS) {
        if (!Array.isArray(routine?.[section])) continue;
        routine[section] = routine[section].filter(task => {
          const id = String(task?.id || "");
          const tombstone = String(tombstones[id] || "");
          const entityVersion = String(state.meta[ENTITY_VERSIONS][id] || "");
          return !tombstone || (entityVersion && entityVersion > tombstone);
        });
      }

      return routine;
    };
    wrappedGetLooksRoutine.__taskStabilityFilter = true;
    getLooksRoutine = wrappedGetLooksRoutine;
  }

  /*
    Replace Looks checkbox/skip handling with one immediate state transaction.
  */
  setLooksStatus = function(task, status) {
    const dayKey = getTodayKey();
    const day = ensureDay(dayKey);
    const done = new Set(day.looksDone || []);
    const skipped = new Set(day.looksSkipped || []);

    if (status === "done") {
      if (done.has(task.id)) {
        done.delete(task.id);
      } else {
        done.add(task.id);
        skipped.delete(task.id);
      }
    } else if (status === "skipped") {
      if (skipped.has(task.id)) {
        skipped.delete(task.id);
      } else {
        skipped.add(task.id);
        done.delete(task.id);
      }
    } else {
      return;
    }

    if (
      task.meta === "morningWater" &&
      status === "done" &&
      done.has(task.id) &&
      day.waterOz < LOOKS_MORNING_WATER_OZ
    ) {
      day.waterOz = LOOKS_MORNING_WATER_OZ;
    }

    day.looksDone = [...done];
    day.looksSkipped = [...skipped];

    if (typeof syncWaterTask === "function") {
      syncWaterTask(day, dayKey);
    }

    const allowedCount = getLooksTaskIds(dayKey).length;
    day.looksCompleted = getResolvedSet(day, "looks").size === allowedCount;

    saveState();

    /*
      Full immediate render removes stale row state and installs one fresh click
      handler per row. No 420ms delayed render race.
    */
    try { render(); } catch (error) { console.error("LOCKED OS task render failed:", error); }
  };

  /*
    Main checklist checkboxes get the same immediate transaction behavior.
  */
  toggleMainTask = function(taskId) {
    const dayKey = getTodayKey();
    const day = ensureDay(dayKey);
    const done = new Set(day.done || []);

    if (done.has(taskId)) done.delete(taskId);
    else done.add(taskId);

    day.done = [...done];
    day.skipped = [];
    day.completed = day.done.length === TASK_IDS.length;

    saveState();
    try { render(); } catch (error) { console.error("LOCKED OS main task render failed:", error); }
  };

  /*
    Deletion is now explicit and permanent until a genuinely newer edit is
    created. This is the critical fix for "delete -> refresh -> task is back".
  */
  deleteLooksTask = function(task, section) {
    ensureLooksTaskCustomizationState();
    ensureTaskMeta();

    const id = String(task?.id || "");
    if (!id) return;

    const version = isoNow();
    const isCustom = Boolean(task?.custom || id.startsWith("custom-"));

    state.meta[TOMBSTONES][id] = version;
    state.meta[ENTITY_VERSIONS][id] = version;

    cleanTaskIdEverywhere(state, id, {
      builtinDelete: !isCustom
    });

    const today = ensureDay();
    today.looksCompleted =
      getResolvedSet(today, "looks").size === getLooksTaskIds().length;

    saveState();

    try { render(); } catch (error) { console.error("LOCKED OS delete render failed:", error); }
    try { if (typeof renderRotationCalendar === "function") renderRotationCalendar(); } catch (_) {}

    if (typeof toast === "function") toast("Task deleted.");
  };

  /*
    Make edit versioning explicit. Generic mutation detection also catches it,
    but stamping here means the version is already present in the same save.
  */
  if (typeof saveLooksTaskEdit === "function") {
    const baseSaveLooksTaskEdit = saveLooksTaskEdit;
    saveLooksTaskEdit = function(task, nextTitle) {
      ensureTaskMeta();
      const id = String(task?.id || "");
      if (id) {
        const version = isoNow();
        state.meta[ENTITY_VERSIONS][id] = version;
        delete state.meta[TOMBSTONES][id];
      }
      return baseSaveLooksTaskEdit(task, nextTitle);
    };
  }

  /*
    Order changes are stamped before the base saver runs.
  */
  if (typeof saveLooksTaskOrder === "function") {
    const baseSaveLooksTaskOrder = saveLooksTaskOrder;
    saveLooksTaskOrder = function(section, orderedIds) {
      ensureTaskMeta();
      if (SECTIONS.includes(section)) {
        state.meta[ORDER_VERSIONS][section] = isoNow();
      }
      return baseSaveLooksTaskOrder(section, orderedIds);
    };
  }

  /*
    New custom tasks receive a version immediately after creation. The clean
    schedule wrapper underneath still handles selected weekdays.
  */
  if (typeof addLooksTask === "function") {
    const baseAddLooksTask = addLooksTask;
    addLooksTask = function(...args) {
      ensureTaskMeta();
      const beforeIds = new Set(
        state.meta.looksCustomTasks.map(task => String(task?.id || ""))
      );

      const result = baseAddLooksTask(...args);

      ensureTaskMeta();
      const created = [...state.meta.looksCustomTasks]
        .reverse()
        .find(task => task?.id && !beforeIds.has(String(task.id)));

      if (created) {
        const id = String(created.id);
        state.meta[ENTITY_VERSIONS][id] = isoNow();
        delete state.meta[TOMBSTONES][id];

        const days = normalizeDays(
          created.days?.length
            ? created.days
            : state.meta[CUSTOM_SCHEDULE_META]?.[id]
        );
        if (days.length) {
          created.days = days;
          state.meta[CUSTOM_SCHEDULE_META][id] = days;
        }

        saveState();
        try { render(); } catch (_) {}
        try { if (typeof renderRotationCalendar === "function") renderRotationCalendar(); } catch (_) {}
      }

      return result;
    };
  }

  /*
    Generic save wrapper catches every remaining task mutation, including any
    weekday editor installed by earlier layers.
  */
  if (typeof saveState === "function" && !saveState.__taskStabilityWrapped) {
    const baseSaveState = saveState;
    const wrappedSaveState = function(...args) {
      ensureTaskMeta();
      inferAndStampMutations();
      enforceTombstones(state);
      writeVault();

      const result = baseSaveState(...args);

      baseline = captureBaseline();
      return result;
    };
    wrappedSaveState.__taskStabilityWrapped = true;
    saveState = wrappedSaveState;
  }

  /*
    Preprocess every remote state using per-task/per-day versions before the
    existing sync layer sees it.
  */
  if (typeof applyRemoteState === "function" && !applyRemoteState.__taskStabilityWrapped) {
    const baseApplyRemoteState = applyRemoteState;
    const wrappedApplyRemoteState = function(remoteState, ...args) {
      const mergedRemote = mergeTaskAwareRemote(remoteState);
      const result = baseApplyRemoteState(mergedRemote, ...args);

      ensureTaskMeta();
      enforceTombstones(state);
      writeVault();
      baseline = captureBaseline();

      if (!mainApp.classList.contains("hidden")) {
        try { render(); } catch (_) {}
      }

      return result;
    };
    wrappedApplyRemoteState.__taskStabilityWrapped = true;
    applyRemoteState = wrappedApplyRemoteState;
  }

  function install() {
    if (typeof state === "undefined") return;

    ensureTaskMeta();

    /*
      Apply any task state that was already safely written to the dedicated
      vault before a stale remote state arrived.
    */
    let changed = applyVaultIfNewer();

    /*
      Repair a task deleted moments ago that the old union merge resurrected.
    */
    if (recoverRecentDeletionTombstones()) changed = true;
    if (enforceTombstones(state)) changed = true;

    baseline = captureBaseline();
    writeVault();

    if (changed) {
      /*
        Save the repaired state back through the normal protected sync path.
      */
      saveState();
    } else if (typeof saveLocalState === "function") {
      saveLocalState();
    }

    try {
      if (!mainApp.classList.contains("hidden")) render();
    } catch (_) {}

    installFinished = true;
  }

  const start = () => setTimeout(install, 150);

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

/* ===== FLATTENED: hide Today's gym card ===== */
(() => {
  "use strict";

  const FLAG = "__lockedOsHideTodaysGymCard";
  if (window[FLAG]) return;
  window[FLAG] = true;

  function normalizeText(value) {
    return String(value || "")
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function hideTodaysGymCard() {
    const looksPage = document.getElementById("looksPage");
    if (!looksPage) return;

    /*
      Preferred path: older/current versions use this preview element inside
      the standalone Today's gym card. We hide its card only — not the Gym task.
    */
    const preview = looksPage.querySelector("#workoutPreviewName");
    if (preview) {
      const card = preview.closest(".card, section");
      if (card && looksPage.contains(card)) {
        card.style.display = "none";
        card.dataset.hiddenTodaysGymCard = "true";
        return;
      }
    }

    /*
      Fallback for any markup variation: locate a heading/label whose own text
      is exactly "Today's gym", then hide only its nearest card.
    */
    const candidates = looksPage.querySelectorAll(
      "h1,h2,h3,h4,h5,h6,.eyebrow,.card-title,.panel-title,strong,span,p"
    );

    for (const element of candidates) {
      const text = normalizeText(element.textContent);

      if (text !== "today's gym" && text !== "todays gym") continue;

      const card = element.closest(".card, section");
      if (!card || !looksPage.contains(card)) continue;

      /*
        Safety: never hide an individual routine task row.
      */
      if (card.classList.contains("looks-task") || card.classList.contains("task-row")) {
        continue;
      }

      card.style.display = "none";
      card.dataset.hiddenTodaysGymCard = "true";
      return;
    }
  }

  function install() {
    hideTodaysGymCard();

    const looksPage = document.getElementById("looksPage");
    if (!looksPage) return;

    /*
      Looksmaxxing can re-render its cards after task changes. Watch only this
      page and re-hide the one standalone card if it is recreated.
    */
    const observer = new MutationObserver(() => {
      hideTodaysGymCard();
    });

    observer.observe(looksPage, {
      childList: true,
      subtree: true
    });

    document.querySelector('[data-tab="looksPage"]')?.addEventListener("click", () => {
      requestAnimationFrame(hideTodaysGymCard);
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();

/* ===== QA HARDENING ===== */
(() => {
  "use strict";

  const QA_FLAG = "__lockedOsQaAudited20260911";
  if (window[QA_FLAG]) return;
  window[QA_FLAG] = true;

  const DIRTY_KEY = "locked_os_supabase_dirty_clean";
  const GYM_SCHEDULE_VERSION = "gymScheduleVersion";
  let qaPollTimer = null;
  let qaGymScheduleBaseline = "";

  function qaClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function qaIsRestDay(dayKey) {
    return String(getWorkoutName(dayKey) || "") === "Rest day";
  }

  function qaGymSession(dayKey) {
    return (state?.meta?.gymClean?.sessions || []).find(session => session?.date === dayKey) || null;
  }

  function qaScheduledDaysForCustomTask(task) {
    const direct = Array.isArray(task?.days) ? task.days : [];
    if (direct.length) return direct;
    const mapped = state?.meta?.customTaskSchedules?.[task?.id];
    return Array.isArray(mapped) && mapped.length ? mapped : [
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
    ];
  }

  /*
    BUG FIX: startup sync must not bypass the task/day conflict safeguards.
    If a prior write failed and the local dirty flag is present, the complete
    local state is authoritative and is retried instead of being overwritten
    by an older cloud row.
  */
  loadSupabaseState = async function() {
    if (!supabaseClient) {
      if (syncStatus) syncStatus.textContent = "Saved locally. Supabase is not connected.";
      return;
    }

    const localBeforeLoad = qaClone(state);
    const wasDirty = localStorage.getItem(DIRTY_KEY) === "1";
    const result = await fetchSupabaseState();

    if (!result?.ok) {
      state = localBeforeLoad;
      normalizeState();
      saveLocalState();
      subscribeToSupabaseState();
      qaStartPolling();
      if (syncStatus) syncStatus.textContent = "Supabase load failed. Local data kept safe.";
      return;
    }

    if (result.row?.state && typeof result.row.state === "object") {
      if (wasDirty) {
        state = localBeforeLoad;
        normalizeState();
        saveLocalState();
        localRevision = Math.max(1, localRevision);
        await saveSupabaseState();
        if (syncStatus) syncStatus.textContent = "Restored pending local changes to Supabase.";
      } else {
        /*
          applyRemoteState is already wrapped by the task stability layer, so
          task tombstones and per-day versions are respected here.
        */
        applyRemoteState(
          result.row.state,
          "Synced with Supabase.",
          { force: true, updatedAt: result.row.updated_at || "" }
        );
      }
    } else {
      state = localBeforeLoad;
      normalizeState();
      saveLocalState();
      localRevision = Math.max(1, localRevision);
      localStorage.setItem(DIRTY_KEY, "1");
      await saveSupabaseState();
    }

    subscribeToSupabaseState();
    qaStartPolling();
  };

  function qaStartPolling() {
    if (!supabaseClient || qaPollTimer) return;
    qaPollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (mainApp.classList.contains("hidden")) return;
      if (hasPendingLocalChanges()) return;
      refreshSupabaseState();
    }, 5000);
  }

  /*
    BUG FIX: the original bottom-of-index DOMContentLoaded patch overwrote the
    immediate task-checkbox implementation. Re-install one authoritative,
    selected-day-aware transaction handler after every startup patch is done.
  */
  function qaInstallTaskTransactions() {
    setLooksStatus = function(task, status) {
      const dayKey = typeof lockedOsLooksKey === "function"
        ? lockedOsLooksKey()
        : getTodayKey();

      const day = ensureDay(dayKey);
      const done = new Set(day.looksDone || []);
      const skipped = new Set(day.looksSkipped || []);

      if (status === "done") {
        if (done.has(task.id)) {
          done.delete(task.id);
        } else {
          done.add(task.id);
          skipped.delete(task.id);
        }
      } else if (status === "skipped") {
        if (skipped.has(task.id)) {
          skipped.delete(task.id);
        } else {
          skipped.add(task.id);
          done.delete(task.id);
        }
      } else {
        return;
      }

      if (
        task.meta === "morningWater" &&
        status === "done" &&
        done.has(task.id) &&
        day.waterOz < LOOKS_MORNING_WATER_OZ
      ) {
        day.waterOz = LOOKS_MORNING_WATER_OZ;
      }

      day.looksDone = [...done];
      day.looksSkipped = [...skipped];
      syncWaterTask(day, dayKey);
      day.looksCompleted =
        new Set([...(day.looksDone || []), ...(day.looksSkipped || [])]).size ===
        getLooksTaskIds(dayKey).length;

      saveState();

      /*
        Immediate full Looks render avoids stale rows / double-click races while
        preserving the selected historical day.
      */
      renderLooks();
      renderDayStreak();
    };
  }

  /*
    BUG FIX: final Gym UI used to rewrite state.meta.gymClean.schedule to a
    constant during every render. The flattened file removes those resets.
    This final validator only repairs malformed/empty schedules.
  */
  function qaValidateGymSchedule() {
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean =
      state.meta.gymClean && typeof state.meta.gymClean === "object"
        ? state.meta.gymClean
        : {};

    const allowed = new Set([
      "Chest + side delts",
      "Back + rear delts",
      "Arms",
      "Legs + Abs"
    ]);

    const current = state.meta.gymClean.schedule;
    if (!current || typeof current !== "object" || Array.isArray(current)) return;

    for (const [day, workout] of Object.entries(current)) {
      if (![
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
      ].includes(day) || !allowed.has(workout)) {
        delete current[day];
      }
    }
  }

  /*
    BUG FIX: Rotation Calendar now obeys deleted built-ins and uses edited
    custom-task names. Daily custom tasks remain excluded.
  */
  function qaInstallRotationAuthority() {
    const baseRotation = getRotationTasksForDay;

    getRotationTasksForDay = function(dayKey) {
      const allowedTaskIds = new Set(getLooksTaskIds(dayKey));
      const typeToTaskId = {
        gym: "gym",
        tretinoin: "tretinoin",
        shave: "shave-manage-brows",
        microneedle: "microneedle-eyebrows",
        sheets: "wash-bed-sheets",
        lips: "lip-care"
      };

      let items = (baseRotation(dayKey) || []).filter(item => {
        if (item?.type === "custom") return false;
        if (item?.type === "mk677") return true;
        const taskId = typeToTaskId[item?.type];
        return !taskId || allowedTaskIds.has(taskId);
      });

      const dayName = getRoutineDayName(dayKey);
      const customTasks = Array.isArray(state?.meta?.looksCustomTasks)
        ? state.meta.looksCustomTasks
        : [];
      const existing = new Set(
        items.map(item => String(item?.label || "").trim().toLowerCase())
      );

      for (const task of customTasks) {
        if (!task?.id || !allowedTaskIds.has(task.id)) continue;

        const days = qaScheduledDaysForCustomTask(task);
        if (days.length >= 7 || !days.includes(dayName)) continue;

        const label = String(getLooksTaskTitle(task) || "").trim();
        if (!label || existing.has(label.toLowerCase())) continue;

        items.push({ label, type: "custom" });
        existing.add(label.toLowerCase());
      }

      return items;
    };
  }

  /*
    BUG FIX: Rest days are not failed Gym days. Weekly Review denominator is
    scheduled training days only, and skipped training days stay "Skipped".
  */
  function qaInstallWeeklyGymLogic() {
    getWeeklyGymStatus = function(dayKey, day) {
      if (qaIsRestDay(dayKey)) return "Rest day";

      const session = qaGymSession(dayKey);
      if (session?.completed) return "Done";

      const done = new Set(day?.looksDone || []);
      const skipped = new Set(day?.looksSkipped || []);
      if (done.has("gym")) return "Done";
      if (skipped.has("gym")) return "Skipped";
      if (dayKey === getTodayKey()) return "Not yet";
      return "Didn't go";
    };

    const baseRenderWeeklyReview = renderWeeklyReview;
    renderWeeklyReview = function() {
      baseRenderWeeklyReview();

      const dayKeys = getWeeklyReviewKeys();
      let scheduled = 0;
      let doneCount = 0;
      let skippedCount = 0;
      let missedCount = 0;
      let notYetCount = 0;

      const rows = [...document.querySelectorAll("#weeklyDayList .weekly-day-row")];

      dayKeys.forEach((dayKey, index) => {
        const day = state.days?.[dayKey] || createDayRecord();
        const status = getWeeklyGymStatus(dayKey, day);
        const metric = rows[index]?.querySelector(".weekly-day-metric.gym-status");

        if (status === "Rest day") {
          if (metric) {
            metric.className = "weekly-day-metric gym-status rest-day";
            const strong = metric.querySelector("strong");
            if (strong) strong.textContent = "Rest";
          }
          return;
        }

        scheduled += 1;
        if (status === "Done") doneCount += 1;
        else if (status === "Skipped") skippedCount += 1;
        else if (status === "Not yet") notYetCount += 1;
        else missedCount += 1;
      });

      const value = document.getElementById("weeklyGymDays");
      const meta = document.getElementById("weeklyGymMeta");

      if (value) value.textContent = scheduled ? `${doneCount}/${scheduled}` : "0/0";

      if (meta) {
        const parts = [];
        if (skippedCount) parts.push(`${skippedCount} skipped`);
        if (missedCount) parts.push(`${missedCount} missed`);
        if (notYetCount) parts.push("today not yet");

        meta.textContent = scheduled === 0
          ? "No training days scheduled yet"
          : parts.length
            ? parts.join(" · ")
            : "All scheduled workouts completed";
      }
    };
  }

  /*
    BUG FIX: Completing a workout in Gym should resolve the matching Gym task
    on Looksmaxxing for that same date.
  */
  function qaSyncCompletedGymSession(dayKey) {
    if (!isDateKey(dayKey) || qaIsRestDay(dayKey)) return false;

    const session = qaGymSession(dayKey);
    if (!session?.completed) return false;

    const day = ensureDay(dayKey);
    const done = new Set(day.looksDone || []);
    const skipped = new Set(day.looksSkipped || []);
    if (done.has("gym") && !skipped.has("gym")) return false;

    done.add("gym");
    skipped.delete("gym");
    day.looksDone = [...done];
    day.looksSkipped = [...skipped];
    day.looksCompleted =
      new Set([...day.looksDone, ...day.looksSkipped]).size ===
      getLooksTaskIds(dayKey).length;

    return true;
  }

  function qaInstallGymCompletionSync() {
    /*
      Document capture runs before the Gym button's target-capture handler,
      which deliberately stops propagation. Delay the reconciliation until that
      handler has finished saving the session.
    */
    document.addEventListener("click", event => {
      if (!event.target.closest("#cleanGymComplete")) return;

      setTimeout(() => {
        const selected = document.querySelector(
          "#cleanGymWeekGrid [data-gym-strip-date].gym-strip-selected"
        );
        const dayKey = selected?.dataset?.gymStripDate;
        if (!dayKey) return;

        if (qaSyncCompletedGymSession(dayKey)) {
          saveState();
          try { renderLooks(); } catch (_) {}
          try { renderWeeklyReview(); } catch (_) {}
        }
      }, 0);
    }, true);

    let changed = false;
    for (const session of state?.meta?.gymClean?.sessions || []) {
      if (session?.completed && qaSyncCompletedGymSession(session.date)) changed = true;
    }
    if (changed) saveState();
  }

  /*
    BUG FIX: the HTML still described an obsolete Mon/Wed/Sat default after the
    Friday-anchored tretinoin schedule was introduced.
  */
  function qaInstallTretinoinNote() {
    const baseRenderAdmin = renderAdmin;

    renderAdmin = function() {
      baseRenderAdmin();
      const note = document.querySelector(".tret-admin-note");
      if (!note) return;

      const days = getTretinoinDays().map(day => day.slice(0, 3));
      note.textContent =
        `Current nights: ${days.join(", ")}. ` +
        (days.length === 7
          ? "Tretinoin appears every night."
          : "Changing frequency applies from today forward.");
    };
  }

  /*
    BUG FIX: Gym schedule edits are versioned too. A stale device can no longer
    overwrite a newer saved weekly schedule merely by syncing later.
  */
  function qaInstallGymScheduleVersioning() {
    const scheduleFingerprint = snapshot => JSON.stringify(snapshot?.meta?.gymClean?.schedule || {});
    qaGymScheduleBaseline = scheduleFingerprint(state);

    if (typeof saveState === "function" && !saveState.__qaGymScheduleVersioned) {
      const baseSaveState = saveState;
      const wrappedSaveState = function(...args) {
        state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
        const current = scheduleFingerprint(state);
        if (current !== qaGymScheduleBaseline) {
          state.meta[GYM_SCHEDULE_VERSION] = new Date().toISOString();
          qaGymScheduleBaseline = current;
        }
        return baseSaveState(...args);
      };
      wrappedSaveState.__qaGymScheduleVersioned = true;
      saveState = wrappedSaveState;
    }

    if (typeof applyRemoteState === "function" && !applyRemoteState.__qaGymScheduleVersioned) {
      const baseApplyRemoteState = applyRemoteState;
      const wrappedApplyRemoteState = function(remoteState, ...args) {
        const remote = qaClone(remoteState || {});
        remote.meta = remote.meta && typeof remote.meta === "object" ? remote.meta : {};
        remote.meta.gymClean = remote.meta.gymClean && typeof remote.meta.gymClean === "object"
          ? remote.meta.gymClean
          : {};

        const localVersion = String(state?.meta?.[GYM_SCHEDULE_VERSION] || "");
        const remoteVersion = String(remote.meta?.[GYM_SCHEDULE_VERSION] || "");

        if (localVersion && (!remoteVersion || localVersion > remoteVersion)) {
          remote.meta.gymClean.schedule = qaClone(state?.meta?.gymClean?.schedule || {});
          remote.meta[GYM_SCHEDULE_VERSION] = localVersion;
        }

        const result = baseApplyRemoteState(remote, ...args);
        qaGymScheduleBaseline = scheduleFingerprint(state);
        return result;
      };
      wrappedApplyRemoteState.__qaGymScheduleVersioned = true;
      applyRemoteState = wrappedApplyRemoteState;
    }
  }

  function qaInstallRuntimeGuards() {
    /*
      Prevent one optional panel renderer from taking down the entire app.
      Core renderers are still allowed to throw during development, but the
      user-facing render() gets isolated calls for the feature panels that have
      historically changed most often.
    */
    const originalRender = render;
    render = function() {
      try {
        originalRender();
      } catch (error) {
        console.error("LOCKED OS render error:", error);

        /*
          Attempt the essential views individually so one broken optional card
          does not leave the entire interface unusable.
        */
        const safeCalls = [
          renderTaskLists,
          renderProgress,
          renderPhoneLock,
          renderDayStreak,
          renderLooks,
          renderWeeklyReview,
          renderMk677,
          renderAdmin
        ];

        for (const fn of safeCalls) {
          try { if (typeof fn === "function") fn(); } catch (inner) {
            console.error("LOCKED OS isolated renderer error:", inner);
          }
        }
      }
    };
  }

  function qaRunInvariantRepair() {
    qaValidateGymSchedule();

    /*
      Normalize current days only after final routine authority is installed so
      obsolete task IDs cannot remain in checked/skipped arrays.
    */
    for (const dayKey of Object.keys(state.days || {})) {
      if (!isDateKey(dayKey)) continue;
      state.days[dayKey] = normalizeDay(dayKey, state.days[dayKey]);
    }

    saveLocalState();
  }

  function qaInstall() {
    qaInstallTaskTransactions();
    qaInstallRotationAuthority();
    qaInstallWeeklyGymLogic();
    qaInstallGymCompletionSync();
    qaInstallTretinoinNote();
    qaInstallGymScheduleVersioning();
    qaInstallRuntimeGuards();
    qaRunInvariantRepair();

    try { render(); } catch (_) {}
    try { renderRotationCalendar(); } catch (_) {}
  }

  /*
    All earlier Gym/task layers finish by 150 ms. Install the audited final
    authority afterward so later timers cannot replace these fixes.
  */
  setTimeout(qaInstall, 225);
})();
