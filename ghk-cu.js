"use strict";

/*
  LOCKED OS drop-in ghk-cu.js
  - Loads the exact ghk-cu.js that was already in the repo before this fix.
  - Adds resilient Supabase sync/recovery logic after app.js has loaded.
  - Does not change HTML/CSS/layout.
*/
(() => {
  const pinnedCurrentFile = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@7f036ad138540eb6b1de34199784f99a8aac49fa/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", pinnedCurrentFile, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-pinned-current-ghk-cu.js");
  } catch (error) {
    console.error("LOCKED OS: could not load the pinned current ghk-cu.js.", error);
  }
})();

(() => {
  "use strict";

  if (window.__lockedOsSupabaseSyncFixInstalled) return;
  window.__lockedOsSupabaseSyncFixInstalled = true;

  /* app.js is intentionally left untouched. This file is already loaded after it. */
  if (
    typeof supabaseClient === "undefined" ||
    typeof saveLocalState !== "function" ||
    typeof normalizeState !== "function" ||
    typeof hasMeaningfulState !== "function"
  ) {
    console.error("LOCKED OS sync fix: app.js globals were not available.");
    return;
  }

  const DIRTY_KEY = "locked_os_supabase_dirty_v2";
  const MIGRATION_KEY = "locked_os_supabase_merge_migrated_v2";
  const RECOVERY_KEY = "locked_os_recovery_snapshots_v2";
  const RETRY_DELAYS = [1000, 2500, 5000, 10000, 20000, 30000];
  const POLL_INTERVAL = 5000;
  let retryTimer = null;
  let retryAttempt = 0;
  let pollTimer = null;

  const previousFocusRefresh = typeof refreshSupabaseState === "function" ? refreshSupabaseState : null;
  if (previousFocusRefresh) window.removeEventListener("focus", previousFocusRefresh);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readBoolean(key) {
    return localStorage.getItem(key) === "1";
  }

  function writeBoolean(key, value) {
    if (value) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  }

  function snapshotSummary(snapshot) {
    const weights = Object.keys(snapshot?.weights || {}).length;
    const days = Object.values(snapshot?.days || {}).filter(day => {
      if (!day || typeof day !== "object") return false;
      return Boolean(
        day.completed || day.looksCompleted || day.missedReason || Number(day.waterOz) > 0 ||
        (Array.isArray(day.done) && day.done.length) ||
        (Array.isArray(day.looksDone) && day.looksDone.length) ||
        (Array.isArray(day.looksSkipped) && day.looksSkipped.length)
      );
    }).length;
    const customTasks = Array.isArray(snapshot?.meta?.looksCustomTasks) ? snapshot.meta.looksCustomTasks.length : 0;
    const glucose = Array.isArray(snapshot?.mk677?.glucoseEntries) ? snapshot.mk677.glucoseEntries.length : 0;
    const labs = Array.isArray(snapshot?.mk677?.labs) ? snapshot.mk677.labs.length : 0;
    return { weights, days, customTasks, glucose, labs };
  }

  function archiveSnapshot(label, snapshot, remoteUpdatedAt = "") {
    if (!snapshot || typeof snapshot !== "object") return;
    if (!hasMeaningfulState(snapshot)) return;

    try {
      const serialized = JSON.stringify(snapshot);
      let entries = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "[]");
        if (Array.isArray(parsed)) entries = parsed;
      } catch {
        entries = [];
      }

      if (entries[0]?.serialized === serialized) return;
      entries.unshift({
        savedAt: new Date().toISOString(),
        label,
        remoteUpdatedAt,
        summary: snapshotSummary(snapshot),
        serialized,
        state: clone(snapshot)
      });
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(entries.slice(0, 12)));
    } catch (error) {
      console.warn("LOCKED OS: recovery snapshot could not be stored.", error);
    }
  }

  function mergeByKey(localItems, remoteItems, keyFn) {
    const map = new Map();
    for (const item of Array.isArray(localItems) ? localItems : []) {
      const key = keyFn(item);
      if (key) map.set(key, clone(item));
    }
    for (const item of Array.isArray(remoteItems) ? remoteItems : []) {
      const key = keyFn(item);
      if (key) map.set(key, clone(item));
    }
    return [...map.values()];
  }

  function deepPreserveLocalMissing(localValue, remoteValue) {
    if (remoteValue === undefined) return clone(localValue);
    if (localValue === undefined) return clone(remoteValue);

    const localObject = localValue && typeof localValue === "object" && !Array.isArray(localValue);
    const remoteObject = remoteValue && typeof remoteValue === "object" && !Array.isArray(remoteValue);
    if (localObject && remoteObject) {
      const output = {};
      for (const key of new Set([...Object.keys(localValue), ...Object.keys(remoteValue)])) {
        output[key] = deepPreserveLocalMissing(localValue[key], remoteValue[key]);
      }
      return output;
    }

    /* Arrays/scalars use remote when it exists. Special arrays are merged below. */
    return clone(remoteValue);
  }

  function mergeRecoveryStates(localState, remoteState) {
    const local = localState && typeof localState === "object" ? localState : {};
    const remote = remoteState && typeof remoteState === "object" ? remoteState : {};
    const merged = deepPreserveLocalMissing(local, remote);

    /* Preserve historical day records that do not exist remotely. Remote wins same-day conflicts. */
    merged.days = { ...(local.days || {}), ...(remote.days || {}) };

    /* Preserve weight dates that only exist on a device. Remote wins the same date. */
    merged.weights = { ...(local.weights || {}), ...(remote.weights || {}) };

    merged.meta = deepPreserveLocalMissing(local.meta || {}, remote.meta || {});
    merged.meta.looksTaskEdits = {
      ...(local.meta?.looksTaskEdits || {}),
      ...(remote.meta?.looksTaskEdits || {})
    };
    merged.meta.taskInfo = {
      ...(local.meta?.taskInfo || {}),
      ...(remote.meta?.taskInfo || {})
    };
    merged.meta.looksCustomTasks = mergeByKey(
      local.meta?.looksCustomTasks,
      remote.meta?.looksCustomTasks,
      item => String(item?.id || "")
    );
    merged.meta.looksDeletedTaskIds = [...new Set([
      ...(Array.isArray(local.meta?.looksDeletedTaskIds) ? local.meta.looksDeletedTaskIds : []),
      ...(Array.isArray(remote.meta?.looksDeletedTaskIds) ? remote.meta.looksDeletedTaskIds : [])
    ])];
    merged.meta.tretinoinScheduleChanges = mergeByKey(
      local.meta?.tretinoinScheduleChanges,
      remote.meta?.tretinoinScheduleChanges,
      item => String(item?.effectiveDayKey || "")
    ).sort((a, b) => String(a.effectiveDayKey).localeCompare(String(b.effectiveDayKey)));
    merged.meta.gymScheduleChanges = mergeByKey(
      local.meta?.gymScheduleChanges,
      remote.meta?.gymScheduleChanges,
      item => String(item?.effectiveDayKey || "")
    ).sort((a, b) => String(a.effectiveDayKey).localeCompare(String(b.effectiveDayKey)));

    merged.mk677 = deepPreserveLocalMissing(local.mk677 || {}, remote.mk677 || {});
    merged.mk677.logs = { ...(local.mk677?.logs || {}), ...(remote.mk677?.logs || {}) };
    merged.mk677.glucoseEntries = mergeByKey(
      local.mk677?.glucoseEntries,
      remote.mk677?.glucoseEntries,
      item => String(item?.id || `${item?.dayKey || ""}|${item?.time || ""}|${item?.glucose ?? ""}|${item?.context || ""}`)
    );
    merged.mk677.labs = mergeByKey(
      local.mk677?.labs,
      remote.mk677?.labs,
      item => String(item?.id || `${item?.date || ""}|${item?.igf1 ?? ""}|${item?.a1c ?? ""}|${item?.glucose ?? ""}`)
    );

    return merged;
  }

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function resetRetry() {
    clearRetry();
    retryAttempt = 0;
  }

  function scheduleRetry() {
    if (!supabaseClient) return;
    clearRetry();
    const delay = RETRY_DELAYS[Math.min(retryAttempt, RETRY_DELAYS.length - 1)];
    retryAttempt += 1;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (mainApp.classList.contains("hidden")) {
        scheduleRetry();
        return;
      }
      if (readBoolean(DIRTY_KEY) || hasPendingLocalChanges()) await saveSupabaseState();
      else await refreshSupabaseState({ force: true });
    }, delay);
  }

  function startPolling() {
    if (!supabaseClient || pollTimer) return;
    pollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (mainApp.classList.contains("hidden")) return;
      if (readBoolean(DIRTY_KEY) || hasPendingLocalChanges()) return;
      refreshSupabaseState();
    }, POLL_INTERVAL);
  }

  /* Save a local recovery copy immediately, before the user can unlock/sync. */
  archiveSnapshot("local-before-sync-fix", state);

  hasPendingLocalChanges = function() {
    return Boolean(saveTimer || supabaseSaveInFlight || localRevision > syncedRevision || readBoolean(DIRTY_KEY));
  };

  fetchSupabaseState = async function({ silent = false } = {}) {
    if (!supabaseClient) {
      return { ok: false, row: null, error: new Error("Supabase client is unavailable.") };
    }
    if (!silent && syncStatus) syncStatus.textContent = "Loading from Supabase…";

    try {
      const { data, error } = await supabaseClient
        .from(SUPABASE_TABLE)
        .select("state, updated_at")
        .eq("id", SUPABASE_ROW_ID)
        .maybeSingle();

      if (error) {
        console.error(error);
        if (!silent && syncStatus) syncStatus.textContent = "Supabase load failed. Keeping your local data and retrying…";
        return { ok: false, row: null, error };
      }
      return { ok: true, row: data || null, error: null };
    } catch (error) {
      console.error(error);
      if (!silent && syncStatus) syncStatus.textContent = "Supabase load failed. Keeping your local data and retrying…";
      return { ok: false, row: null, error };
    }
  };

  applyRemoteState = function(remoteState, statusMessage = "Updated from Supabase.", { force = false, updatedAt = "" } = {}) {
    if (!remoteState || typeof remoteState !== "object") return false;
    if (!force && hasPendingLocalChanges()) return false;

    /* Never destroy a local copy without archiving it first. */
    archiveSnapshot("local-before-remote-apply", state);
    archiveSnapshot("supabase-remote", remoteState, updatedAt);

    state = clone(remoteState);
    normalizeState();
    saveLocalState();
    localRevision = 0;
    syncedRevision = 0;
    writeBoolean(DIRTY_KEY, false);
    if (updatedAt) latestSupabaseWriteAt = updatedAt;
    resetRetry();
    if (!mainApp.classList.contains("hidden")) render();
    if (syncStatus) syncStatus.textContent = statusMessage;
    return true;
  };

  saveState = function() {
    localRevision += 1;
    writeBoolean(DIRTY_KEY, true);
    archiveSnapshot("local-change", state);
    saveLocalState();
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
      writeBoolean(DIRTY_KEY, true);
      return false;
    }

    if (supabaseSaveInFlight) {
      supabaseSaveQueued = true;
      return false;
    }

    supabaseSaveInFlight = true;
    supabaseSaveQueued = false;
    const revisionToSave = localRevision;
    const snapshot = clone(state);
    const writeTimestamp = new Date().toISOString();
    let succeeded = false;
    if (syncStatus) syncStatus.textContent = "Saving…";

    try {
      const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert({
        id: SUPABASE_ROW_ID,
        state: snapshot,
        updated_at: writeTimestamp
      });

      if (error) {
        console.error(error);
        writeBoolean(DIRTY_KEY, true);
        if (syncStatus) syncStatus.textContent = "Supabase save failed. Your local copy is safe; retrying…";
        return false;
      }

      archiveSnapshot("saved-to-supabase", snapshot, writeTimestamp);
      syncedRevision = Math.max(syncedRevision, revisionToSave);
      latestSupabaseWriteAt = writeTimestamp;
      succeeded = true;
      resetRetry();

      if (localRevision <= syncedRevision) writeBoolean(DIRTY_KEY, false);
      if (syncStatus) {
        syncStatus.textContent = localRevision > syncedRevision ? "Saving newer changes…" : "Saved to Supabase.";
      }
      return true;
    } catch (error) {
      console.error(error);
      writeBoolean(DIRTY_KEY, true);
      if (syncStatus) syncStatus.textContent = "Supabase save failed. Your local copy is safe; retrying…";
      return false;
    } finally {
      supabaseSaveInFlight = false;
      if (succeeded && (supabaseSaveQueued || localRevision > syncedRevision)) {
        queueSupabaseSave(0);
      } else if (!succeeded) {
        scheduleRetry();
      }
    }
  };

  loadSupabaseState = async function() {
    if (!supabaseClient) {
      if (syncStatus) syncStatus.textContent = "Saved locally. Supabase is not connected.";
      writeBoolean(DIRTY_KEY, true);
      return;
    }

    const localBeforeLoad = clone(state);
    archiveSnapshot("local-before-supabase-load", localBeforeLoad);

    const result = await fetchSupabaseState();
    if (!result.ok) {
      state = localBeforeLoad;
      normalizeState();
      saveLocalState();
      subscribeToSupabaseState();
      startPolling();
      scheduleRetry();
      return;
    }

    const remoteRow = result.row;
    if (remoteRow?.state && typeof remoteRow.state === "object") {
      archiveSnapshot("supabase-before-merge", remoteRow.state, remoteRow.updated_at || "");

      const needsRecoveryMerge = !readBoolean(MIGRATION_KEY) || readBoolean(DIRTY_KEY);
      if (needsRecoveryMerge && hasMeaningfulState(localBeforeLoad)) {
        const merged = mergeRecoveryStates(localBeforeLoad, remoteRow.state);
        state = merged;
        normalizeState();
        saveLocalState();

        const remoteSerialized = JSON.stringify(remoteRow.state);
        const mergedSerialized = JSON.stringify(state);
        if (mergedSerialized !== remoteSerialized) {
          localRevision = Math.max(localRevision, 1);
          writeBoolean(DIRTY_KEY, true);
          const saved = await saveSupabaseState();
          if (saved) writeBoolean(MIGRATION_KEY, true);
        } else {
          applyRemoteState(remoteRow.state, "Synced with Supabase.", { force: true, updatedAt: remoteRow.updated_at || "" });
          writeBoolean(MIGRATION_KEY, true);
        }
      } else {
        applyRemoteState(remoteRow.state, "Synced with Supabase.", { force: true, updatedAt: remoteRow.updated_at || "" });
        writeBoolean(MIGRATION_KEY, true);
      }
    } else {
      /* A successful read confirmed there is no row. Only now is it safe to create one. */
      state = localBeforeLoad;
      normalizeState();
      saveLocalState();
      localRevision = Math.max(localRevision, 1);
      writeBoolean(DIRTY_KEY, true);
      const saved = await saveSupabaseState();
      if (saved) writeBoolean(MIGRATION_KEY, true);
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

    if (!force && hasPendingLocalChanges()) return false;
    resetRetry();

    const remoteRow = result.row;
    if (remoteRow?.state && typeof remoteRow.state === "object") {
      const updatedAt = remoteRow.updated_at || "";
      if (!force && updatedAt && latestSupabaseWriteAt && updatedAt === latestSupabaseWriteAt) return false;
      return applyRemoteState(remoteRow.state, "Synced with Supabase.", { updatedAt });
    }
    return false;
  };

  subscribeToSupabaseState = function() {
    if (!supabaseClient || realtimeChannel) return;

    realtimeChannel = supabaseClient
      .channel(`locked-os-state-${SUPABASE_ROW_ID}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: SUPABASE_TABLE, filter: `id=eq.${SUPABASE_ROW_ID}` },
        payload => {
          const remoteState = payload?.new?.state;
          if (!remoteState || typeof remoteState !== "object") return;
          if (hasPendingLocalChanges()) return;
          const updatedAt = payload?.new?.updated_at || "";
          if (updatedAt && latestSupabaseWriteAt && updatedAt === latestSupabaseWriteAt) return;
          applyRemoteState(remoteState, "Updated live from Supabase.", { updatedAt });
        }
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          if (syncStatus && !syncStatus.textContent.includes("Saving")) syncStatus.textContent = "Live sync connected.";
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Supabase Realtime error:", error);
          if (syncStatus) syncStatus.textContent = "Supabase live sync is reconnecting…";
          scheduleRetry();
        }
      });
  };

  window.addEventListener("focus", () => refreshSupabaseState());
  window.addEventListener("pagehide", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (readBoolean(DIRTY_KEY) || localRevision > syncedRevision) saveSupabaseState();
  });
})();

/* September 11 routine + backup hardening update. */
(() => {
  "use strict";

  const PATCH_FLAG = "__lockedOsSept11RoutineBackupPatchInstalled";
  if (window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  const PATCH_VERSION = 3;
  const PATCH_VERSION_KEY = "routineBackupPatchVersion";
  const NEW_GYM_START = "2026-09-11";
  const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DESIRED_GYM_SCHEDULE = {
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
  const ROTATING_IDS = new Set([
    "tretinoin",
    "shave-manage-brows",
    "microneedle-eyebrows",
    "wash-bed-sheets"
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensurePatchState() {
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
    const allowed = new Set(["Chest + side delts", "Back + rear delts", "Arms", "Legs + Abs"]);
    const output = {};
    if (!schedule || typeof schedule !== "object") return output;
    for (const day of DAY_ORDER) {
      const value = String(schedule[day] || "").trim();
      if (allowed.has(value)) output[day] = value;
    }
    return output;
  }

  function gymScheduleForDay(dayKey = getTodayKey()) {
    ensurePatchState();
    let schedule = dayKey >= NEW_GYM_START ? { ...DESIRED_GYM_SCHEDULE } : {};
    const changes = state.meta.gymScheduleChanges
      .filter(change => change && isDateKey(change.effectiveDayKey))
      .sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));
    for (const change of changes) {
      if (change.effectiveDayKey <= dayKey) schedule = normalizeSchedule(change.schedule);
      else break;
    }
    return schedule;
  }

  function gymWorkoutForDay(dayKey = getTodayKey()) {
    const schedule = gymScheduleForDay(dayKey);
    return schedule[getRoutineDayName(dayKey)] || "";
  }

  function syncGymTrackerSchedule(startKey = NEW_GYM_START) {
    ensurePatchState();
    const managed = new Set(state.meta.gymRecurringManagedKeys);
    const overrides = state.meta.gymTracker.overrides;
    const startDate = keyToLocalDate(startKey);

    for (let offset = 0; offset < 400; offset += 1) {
      const dayKey = formatDateKey(addDays(startDate, offset));
      const dayName = getRoutineDayName(dayKey);
      const desired = gymWorkoutForDay(dayKey) || "Rest";
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
    state.meta.gymRecurringManagedKeys = [...managed].filter(key => key >= NEW_GYM_START).sort();
  }

  function installRequestedGymSchedule() {
    ensurePatchState();
    if (Number(state.meta[PATCH_VERSION_KEY] || 0) >= PATCH_VERSION) return false;

    /* Replace the old future schedule with the requested Mon/Wed/Fri/Sat split. */
    state.meta.gymScheduleChanges = state.meta.gymScheduleChanges
      .filter(change => !change || !isDateKey(change.effectiveDayKey) || change.effectiveDayKey < NEW_GYM_START);
    state.meta.gymScheduleChanges.push({
      effectiveDayKey: NEW_GYM_START,
      schedule: clone(DESIRED_GYM_SCHEDULE)
    });
    state.meta.gymScheduleChanges.sort((a, b) => String(a.effectiveDayKey || "").localeCompare(String(b.effectiveDayKey || "")));
    syncGymTrackerSchedule(NEW_GYM_START);
    state.meta[PATCH_VERSION_KEY] = PATCH_VERSION;
    saveState();
    return true;
  }

  function installRoutineOverrides() {
    if (typeof window.getLooksRoutine !== "function") return;

    const previousGetLooksRoutine = window.getLooksRoutine;
    window.getLooksRoutine = function(dayKey = getTodayKey()) {
      const routine = previousGetLooksRoutine(dayKey);
      if (!routine || typeof routine !== "object") return routine;

      routine.morning = Array.isArray(routine.morning) ? routine.morning.filter(task => task?.id !== "azelaic-acid") : [];
      routine.night = Array.isArray(routine.night) ? routine.night.filter(task => task?.id !== "azelaic-acid") : [];

      const deleted = new Set(Array.isArray(state?.meta?.looksDeletedTaskIds) ? state.meta.looksDeletedTaskIds : []);
      if (!deleted.has("azelaic-acid")) {
        const azelaic = { id: "azelaic-acid", title: "Apply azelaic acid" };
        const vitaminIndex = routine.morning.findIndex(task => task?.id === "vitamin-c");
        const moisturizerIndex = routine.morning.findIndex(task => task?.id === "morning-moisturizer");
        const insertAt = vitaminIndex >= 0 ? vitaminIndex + 1 : (moisturizerIndex >= 0 ? moisturizerIndex : routine.morning.length);
        routine.morning.splice(insertAt, 0, azelaic);
      }

      /* Make gym follow the requested real weekly schedule, not an every-day rotation. */
      routine.midday = Array.isArray(routine.midday) ? routine.midday.filter(task => task?.id !== "gym") : [];
      const workout = gymWorkoutForDay(dayKey);
      if (workout) routine.midday.unshift({ id: "gym", title: `Gym: ${workout}` });
      return routine;
    };

    window.getWorkoutName = function(dayKey = getTodayKey()) {
      return gymWorkoutForDay(dayKey) || "Rest day";
    };

    window.getWeeklyGymStatus = function(dayKey, day) {
      const workout = gymWorkoutForDay(dayKey);
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
      const workout = gymWorkoutForDay(dayKey);
      if (workout) items.push({ label: `Gym: ${workout}`, type: "gym" });

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

      /* Scheduled custom tasks belong here only when they are not every-day tasks. */
      const customTasks = Array.isArray(state?.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [];
      const existing = new Set(items.map(item => item.label.toLowerCase()));
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

  function downloadCurrentBackup() {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `locked-os-full-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function refreshBackupStatus() {
    const status = document.getElementById("lockedOsBackupStatus");
    const detail = document.getElementById("lockedOsBackupDetail");
    if (!status || !detail) return;

    let localCount = 0;
    try {
      const local = JSON.parse(localStorage.getItem("locked_os_recovery_snapshots_v2") || "[]");
      if (Array.isArray(local)) localCount = local.length;
    } catch (_) {}

    if (!supabaseClient) {
      status.textContent = "Local protection active";
      detail.textContent = `${localCount} local recovery snapshot${localCount === 1 ? "" : "s"}. Supabase is not connected.`;
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
      status.textContent = "Cloud backup protection active";
      detail.textContent = latest?.backed_up_at
        ? `${localCount} local snapshots · latest append-only cloud backup ${new Date(latest.backed_up_at).toLocaleString()}`
        : `${localCount} local snapshots · cloud backup table is ready.`;
    } catch (_) {
      status.textContent = "Local protection active · cloud backup setup needed";
      detail.textContent = `${localCount} local recovery snapshot${localCount === 1 ? "" : "s"}. Run ENABLE-BACKUPS.sql once in Supabase to enable append-only cloud history.`;
    }
  }

  function installBackupCard() {
    const grid = document.querySelector("#adminRoutinePanel .admin-grid");
    if (!grid || document.getElementById("lockedOsBackupCard")) return;

    const card = document.createElement("section");
    card.className = "card admin-card locked-os-backup-card";
    card.id = "lockedOsBackupCard";
    card.innerHTML = `
      <p class="eyebrow blue">Data protection</p>
      <h2>Automatic backups</h2>
      <p id="lockedOsBackupStatus">Checking backup protection…</p>
      <p class="rank-copy" id="lockedOsBackupDetail">Your full LOCKED OS state is protected locally and can also be versioned in Supabase.</p>
      <div class="locked-os-backup-actions">
        <button class="btn blue" id="lockedOsDownloadBackup" type="button">Download full backup</button>
        <button class="btn secondary" id="lockedOsOpenRecovery" type="button">Recovery history</button>
      </div>`;

    const rotation = grid.querySelector(".rotation-admin-card");
    if (rotation) grid.insertBefore(card, rotation);
    else grid.appendChild(card);

    card.querySelector("#lockedOsDownloadBackup")?.addEventListener("click", downloadCurrentBackup);
    card.querySelector("#lockedOsOpenRecovery")?.addEventListener("click", () => {
      window.location.href = "recover-data.html";
    });
    refreshBackupStatus();
  }

  function updateGymEditorDisplay() {
    const editor = document.getElementById("gymScheduleEditor");
    if (!editor) return;
    const schedule = gymScheduleForDay(getTodayKey());
    for (const row of editor.querySelectorAll(".gym-day-editor-row")) {
      const day = row.dataset.day;
      const active = Boolean(schedule[day]);
      row.classList.toggle("active", active);
      const button = row.querySelector(".gym-day-toggle");
      const input = row.querySelector(".gym-day-workout");
      if (button) {
        button.setAttribute("aria-pressed", active ? "true" : "false");
        const small = button.querySelector("small");
        if (small) small.textContent = active ? "Training" : "Rest";
      }
      if (input) {
        input.disabled = !active;
        input.value = schedule[day] || "";
      }
    }
    const count = Object.keys(schedule).length;
    const countEl = document.getElementById("gymScheduleCount");
    if (countEl) countEl.textContent = `${count} training days selected`;
  }

  function installStyle() {
    if (document.getElementById("lockedOsSept11PatchStyles")) return;
    const style = document.createElement("style");
    style.id = "lockedOsSept11PatchStyles";
    style.textContent = `
      .locked-os-backup-card .locked-os-backup-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
      .locked-os-backup-card #lockedOsBackupStatus{font-weight:900;margin:8px 0 4px}
      @media(max-width:560px){.locked-os-backup-card .locked-os-backup-actions{display:grid;grid-template-columns:1fr}.locked-os-backup-card .btn{width:100%}}
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

    installStyle();
    installRequestedGymSchedule();
    installRoutineOverrides();
    installBackupCard();
    updateGymEditorDisplay();

    document.querySelectorAll('[data-tab="adminPage"], [data-admin-panel="adminRoutinePanel"]').forEach(button => {
      button.addEventListener("click", () => {
        setTimeout(() => {
          installBackupCard();
          updateGymEditorDisplay();
          refreshBackupStatus();
        }, 40);
      });
    });

    document.getElementById("saveGymScheduleBtn")?.addEventListener("click", () => {
      setTimeout(() => {
        syncGymTrackerSchedule(getTodayKey());
        saveState();
        updateGymEditorDisplay();
        refreshBackupStatus();
      }, 80);
    });

    try {
      render();
      if (typeof renderRotationCalendar === "function") renderRotationCalendar();
      if (typeof renderWeeklyReview === "function") renderWeeklyReview();
    } catch (_) {}
  }

  const start = () => setTimeout(install, 25);
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start);
  else start();
})();
