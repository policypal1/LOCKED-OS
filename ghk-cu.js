"use strict";

/*
  LOCKED OS — TASK STABILITY FIX
  Base: currently deployed build 5c4cc98e2feaf218cc35c8261952c6fad2828363

  Purpose:
  - deleted custom tasks cannot be resurrected by an older Supabase state
  - checked/skipped task state cannot be rolled back by an older remote day record
  - task edits / schedules / ordering are versioned
  - task state gets a dedicated local vault
  - check/skip/delete use one immediate authoritative state update
*/

(() => {
  const baseUrl = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@5c4cc98e2feaf218cc35c8261952c6fad2828363/ghk-cu.js";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", baseUrl, false);
    request.send(null);
    if (request.status < 200 || request.status >= 300) throw new Error(`HTTP ${request.status}`);
    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-task-stability-base.js");
  } catch (error) {
    console.error("LOCKED OS: task stability base failed to load.", error);
  }
})();

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