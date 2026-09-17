"use strict";

/*
  LOCKED OS — 2026-09-16 USER PATCH

  This file loads the exact GitHub main build that existed immediately before
  this patch, then layers only the requested changes on top.

  Intentionally NOT changed:
    - Gym weekday schedule. The suggested schedule can be applied separately.
    - Trusted-device auto-unlock stays enabled.

  Removed from the previous build:
    - Gym ranking / XP / rank subtab system.

  Requested changes:
    1) Back + rear delts:
       - Keep Lat Pulldown
       - Keep Chest-Supported Row
       - Keep Seated Cable Row, both arms
       - Rename Reverse Pec Deck -> Face Pulls, including saved workout history
       - Add Shrugs as a new 2-working-set exercise
    2) Custom Looksmaxxing tasks:
       - Add an "Every other day" schedule option
       - Existing treadmill task is migrated to every other day starting 2026-09-17
    3) Glucose tracker:
       - Merge local + remote glucose history instead of allowing an empty/stale
         remote array to replace local readings
       - Attempt recovery from LOCKED OS local recovery snapshots
*/

(() => {
  const PRE_PATCH_COMMIT = "2449c6831eca87e3ab56d10eec47fcbb73b34e90";
  const PRE_PATCH_BUILD = `https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@${PRE_PATCH_COMMIT}/ghk-cu.js`;

  try {
    const request = new XMLHttpRequest();
    request.open("GET", PRE_PATCH_BUILD, false);
    request.send(null);

    if (request.status < 200 || request.status >= 300) {
      throw new Error(`HTTP ${request.status}`);
    }

    (0, eval)(
      request.responseText +
      `\n//# sourceURL=locked-os-pre-sep16-${PRE_PATCH_COMMIT.slice(0, 8)}.js`
    );
  } catch (error) {
    console.error("LOCKED OS: could not load the pre-patch build.", error);
  }
})();

/* Preserve trusted-browser auto-unlock from the previous build, without Gym Rank. */
(() => {
  "use strict";

  const TRUSTED_DEVICE_FLAG = "__lockedOsTrustedDeviceOnly20260916";
  if (window[TRUSTED_DEVICE_FLAG]) return;
  window[TRUSTED_DEVICE_FLAG] = true;

  const DEVICE_RECORD_KEY = "locked_os_trusted_device_v1";
  const DEVICE_DB_NAME = "locked_os_device_auth_v1";
  const DEVICE_DB_STORE = "deviceSecrets";
  const DEVICE_DB_VERSION = 1;
  const DEVICE_SECRET_BYTES = 32;

  let trustedAutoUnlockInFlight = false;

  function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    try {
      const binary = atob(String(value || ""));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    } catch (_) {
      return null;
    }
  }

  function safeJsonParse(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function getDeviceRecord() {
    const record = safeJsonParse(localStorage.getItem(DEVICE_RECORD_KEY));
    if (!record || typeof record !== "object") return null;
    if (!/^locked-[a-z0-9-]{12,}$/i.test(String(record.id || ""))) return null;
    if (!/^[A-Za-z0-9+/=]{20,}$/.test(String(record.secretHash || ""))) return null;
    return record;
  }

  function getDeviceLabel() {
    const ua = String(navigator.userAgent || "");
    const platform = String(navigator.platform || "");
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    const isIPhone = /iPhone/i.test(ua);
    const isIPad = /iPad/i.test(ua) || (/Mac/i.test(platform) && touchPoints > 1);
    const isMac = /Mac/i.test(platform) && !isIPad;
    const isWindows = /Win/i.test(platform) || /Windows/i.test(ua);
    if (isIPhone) return "iPhone";
    if (isIPad) return "iPad";
    if (isMac) return "Mac";
    if (isWindows) return "Windows PC";
    return "Trusted browser";
  }

  function makeDeviceId() {
    if (typeof crypto?.randomUUID === "function") return `locked-${crypto.randomUUID()}`;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return `locked-${[...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  async function hashSecret(secretBytes) {
    const digest = await crypto.subtle.digest("SHA-256", secretBytes);
    return bytesToBase64(new Uint8Array(digest));
  }

  function openDeviceDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
      const request = indexedDB.open(DEVICE_DB_NAME, DEVICE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DEVICE_DB_STORE)) db.createObjectStore(DEVICE_DB_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open device database"));
    });
  }

  async function putDeviceSecret(id, secretBase64) {
    const db = await openDeviceDb();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(DEVICE_DB_STORE, "readwrite");
        transaction.objectStore(DEVICE_DB_STORE).put({ id, secret: secretBase64 });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Could not save device secret"));
        transaction.onabort = () => reject(transaction.error || new Error("Could not save device secret"));
      });
    } finally {
      db.close();
    }
  }

  async function getDeviceSecret(id) {
    const db = await openDeviceDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(DEVICE_DB_STORE, "readonly");
        const request = transaction.objectStore(DEVICE_DB_STORE).get(id);
        request.onsuccess = () => resolve(request.result?.secret || "");
        request.onerror = () => reject(request.error || new Error("Could not read device secret"));
      });
    } finally {
      db.close();
    }
  }

  async function verifyTrustedDevice() {
    if (!window.isSecureContext || !crypto?.subtle || !crypto?.getRandomValues) return false;
    const record = getDeviceRecord();
    if (!record) return false;
    try {
      const secretBase64 = await getDeviceSecret(record.id);
      const secretBytes = base64ToBytes(secretBase64);
      if (!secretBytes || secretBytes.byteLength < DEVICE_SECRET_BYTES) return false;
      if (await hashSecret(secretBytes) !== record.secretHash) return false;
      record.lastSeenAt = new Date().toISOString();
      record.label = getDeviceLabel();
      localStorage.setItem(DEVICE_RECORD_KEY, JSON.stringify(record));
      return true;
    } catch (error) {
      console.warn("LOCKED OS: trusted-device verification unavailable; password required.", error);
      return false;
    }
  }

  async function registerTrustedDeviceAfterPassword() {
    if (!window.isSecureContext || !crypto?.subtle || !crypto?.getRandomValues) return false;
    const existing = getDeviceRecord();
    if (existing && await verifyTrustedDevice()) return true;
    try {
      const id = makeDeviceId();
      const secretBytes = new Uint8Array(DEVICE_SECRET_BYTES);
      crypto.getRandomValues(secretBytes);
      const secretBase64 = bytesToBase64(secretBytes);
      const secretHash = await hashSecret(secretBytes);
      await putDeviceSecret(id, secretBase64);
      localStorage.setItem(DEVICE_RECORD_KEY, JSON.stringify({
        id,
        secretHash,
        label: getDeviceLabel(),
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      }));
      return true;
    } catch (error) {
      console.warn("LOCKED OS: this browser could not be registered as trusted.", error);
      return false;
    }
  }

  function installTrustedDeviceStatusChip() {
    const card = document.querySelector("#loginScreen .login-card");
    if (!card || document.getElementById("trustedDeviceHint")) return;
    const hint = document.createElement("div");
    hint.id = "trustedDeviceHint";
    hint.className = "locked-device-hint";
    hint.textContent = "New browsers still require the password. After a successful unlock, this browser can verify itself automatically next time.";
    card.appendChild(hint);

    if (!document.getElementById("trustedDeviceOnlyStyles")) {
      const style = document.createElement("style");
      style.id = "trustedDeviceOnlyStyles";
      style.textContent = `.locked-device-hint{margin-top:14px;color:var(--muted,#756c62);font-size:.75rem;line-height:1.45;font-weight:700}`;
      document.head.appendChild(style);
    }
  }

  async function tryTrustedAutoUnlock() {
    const login = document.getElementById("loginScreen");
    const app = document.getElementById("mainApp");
    if (!login || !app || login.classList.contains("hidden")) return;
    if (!await verifyTrustedDevice()) return;
    trustedAutoUnlockInFlight = true;
    try {
      if (typeof showApp === "function") showApp();
      if (typeof loadSupabaseState === "function") await loadSupabaseState();
    } catch (error) {
      console.warn("LOCKED OS: trusted-device auto unlock failed; password remains available.", error);
      if (typeof showLogin === "function") showLogin();
    } finally {
      trustedAutoUnlockInFlight = false;
    }
  }

  function watchForSuccessfulPasswordUnlock() {
    const login = document.getElementById("loginScreen");
    const app = document.getElementById("mainApp");
    if (!login || !app) return;
    let wasLocked = !login.classList.contains("hidden");
    const observer = new MutationObserver(() => {
      const isUnlocked = login.classList.contains("hidden") && !app.classList.contains("hidden");
      if (wasLocked && isUnlocked && !trustedAutoUnlockInFlight) setTimeout(registerTrustedDeviceAfterPassword, 250);
      wasLocked = !isUnlocked;
    });
    observer.observe(login, { attributes: true, attributeFilter: ["class"] });
    observer.observe(app, { attributes: true, attributeFilter: ["class"] });
  }

  function install() {
    installTrustedDeviceStatusChip();
    watchForSuccessfulPasswordUnlock();
    tryTrustedAutoUnlock();
  }

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();

(() => {
  "use strict";

  const PATCH_FLAG = "__lockedOsSep16GymRecurrenceGlucosePatch";
  if (window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  const ALL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const RECURRENCE_META_KEY = "customTaskRecurrenceV1";
  const CUSTOM_SCHEDULE_META_KEY = "customTaskSchedules";
  const TREADMILL_START = "2026-09-17";
  const GYM_VAULT_KEY = "locked_os_gym_sessions_vault_v2";

  let pendingEveryOtherTask = null;
  let gymObserver = null;
  let gymPatchQueued = false;
  let persistenceTimer = null;

  const clone = value => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  };

  function validDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function dateKeyToUtcDay(key) {
    if (!validDateKey(key)) return NaN;
    const [year, month, day] = key.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  }

  function tomorrowKey() {
    try {
      if (typeof getTodayKey === "function" && typeof keyToLocalDate === "function" && typeof formatDateKey === "function") {
        const date = keyToLocalDate(getTodayKey());
        date.setDate(date.getDate() + 1);
        return formatDateKey(date);
      }
    } catch (_) {}

    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function sameArray(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
  }

  function ensurePatchMeta(target = (typeof state !== "undefined" ? state : null)) {
    if (!target || typeof target !== "object") return null;
    target.meta = target.meta && typeof target.meta === "object" && !Array.isArray(target.meta) ? target.meta : {};
    target.meta[RECURRENCE_META_KEY] = target.meta[RECURRENCE_META_KEY] && typeof target.meta[RECURRENCE_META_KEY] === "object" && !Array.isArray(target.meta[RECURRENCE_META_KEY])
      ? target.meta[RECURRENCE_META_KEY]
      : {};
    target.meta[CUSTOM_SCHEDULE_META_KEY] = target.meta[CUSTOM_SCHEDULE_META_KEY] && typeof target.meta[CUSTOM_SCHEDULE_META_KEY] === "object" && !Array.isArray(target.meta[CUSTOM_SCHEDULE_META_KEY])
      ? target.meta[CUSTOM_SCHEDULE_META_KEY]
      : {};
    return target.meta;
  }

  function persistSoon() {
    clearTimeout(persistenceTimer);
    persistenceTimer = setTimeout(() => {
      persistenceTimer = null;
      try {
        if (typeof saveState === "function") {
          saveState();
          return;
        }
      } catch (error) {
        console.warn("LOCKED OS: normal save failed; using local fallback.", error);
      }

      try { if (typeof saveLocalState === "function") saveLocalState(); } catch (_) {}
      try { if (typeof queueSupabaseSave === "function") queueSupabaseSave(0); } catch (_) {}
    }, 30);
  }

  /* -------------------------------------------------------------------- */
  /* GLUCOSE HISTORY PROTECTION + RECOVERY                                */
  /* -------------------------------------------------------------------- */

  function normalizeGlucoseEntry(raw, fallbackDayKey = "", fallbackId = "") {
    if (raw == null) return null;
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { glucose: raw };
    const dayKey = validDateKey(source.dayKey)
      ? source.dayKey
      : validDateKey(source.date)
        ? source.date
        : validDateKey(fallbackDayKey)
          ? fallbackDayKey
          : "";
    const glucose = Number(source.glucose ?? source.value ?? source.fastingGlucose);
    if (!dayKey || !Number.isFinite(glucose) || glucose < 40 || glucose > 600) return null;

    const time = /^\d{2}:\d{2}$/.test(String(source.time || "")) ? String(source.time) : "";
    const context = String(source.context || source.type || "").trim().slice(0, 40);
    const id = String(source.id || fallbackId || `glucose-${dayKey}-${time || "na"}-${Math.round(glucose)}`).slice(0, 120);

    return {
      id,
      dayKey,
      glucose: Math.round(glucose),
      time,
      context
    };
  }

  function collectDirectGlucose(source, output) {
    if (!source || typeof source !== "object") return;

    if (Array.isArray(source.glucoseEntries)) {
      source.glucoseEntries.forEach((entry, index) => {
        const normalized = normalizeGlucoseEntry(entry, "", `recovered-entry-${index}`);
        if (normalized) output.push(normalized);
      });
    } else if (source.glucoseEntries && typeof source.glucoseEntries === "object") {
      for (const [key, entry] of Object.entries(source.glucoseEntries)) {
        const normalized = normalizeGlucoseEntry(entry, key, validDateKey(key) ? `legacy-${key}` : key);
        if (normalized) output.push(normalized);
      }
    }

    if (source.logs && typeof source.logs === "object" && !Array.isArray(source.logs)) {
      for (const [dayKey, log] of Object.entries(source.logs)) {
        if (!validDateKey(dayKey) || !log || typeof log !== "object") continue;
        const value = Number(log.fastingGlucose);
        if (!Number.isFinite(value) || value < 40 || value > 600) continue;
        output.push({
          id: `legacy-log-${dayKey}`,
          dayKey,
          glucose: Math.round(value),
          time: "",
          context: "Fasting"
        });
      }
    }
  }

  function inspectGlucoseRecoveryValue(value, output, depth = 0) {
    if (depth > 5 || value == null) return;

    if (typeof value === "string") {
      if (!value.trim() || (!value.trim().startsWith("{") && !value.trim().startsWith("["))) return;
      try { inspectGlucoseRecoveryValue(JSON.parse(value), output, depth + 1); } catch (_) {}
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value.slice(0, 80)) inspectGlucoseRecoveryValue(item, output, depth + 1);
      return;
    }

    if (typeof value !== "object") return;

    if (value.mk677 && typeof value.mk677 === "object") collectDirectGlucose(value.mk677, output);
    if (value.glucoseEntries || value.logs) collectDirectGlucose(value, output);

    for (const key of ["state", "snapshot", "serialized", "data", "value"]) {
      if (value[key] != null) inspectGlucoseRecoveryValue(value[key], output, depth + 1);
    }
  }

  function glucoseSignature(entry) {
    const id = String(entry?.id || "").trim();
    if (id) return `id:${id}`;
    return `value:${entry.dayKey}|${entry.time || ""}|${entry.context || ""}|${entry.glucose}`;
  }

  function mergeGlucoseEntries(...collections) {
    const map = new Map();

    for (const collection of collections) {
      if (!Array.isArray(collection)) continue;
      collection.forEach((raw, index) => {
        const entry = normalizeGlucoseEntry(raw, "", `merged-${index}`);
        if (!entry) return;

        const signature = glucoseSignature(entry);
        const existing = map.get(signature);
        if (!existing) {
          map.set(signature, entry);
          return;
        }

        map.set(signature, {
          ...existing,
          ...entry,
          time: entry.time || existing.time || "",
          context: entry.context || existing.context || ""
        });
      });
    }

    return [...map.values()].sort((a, b) =>
      a.dayKey.localeCompare(b.dayKey) ||
      String(a.time || "").localeCompare(String(b.time || "")) ||
      String(a.id || "").localeCompare(String(b.id || ""))
    );
  }

  function recoverGlucoseHistory() {
    if (typeof state === "undefined" || !state || typeof state !== "object") return false;

    state.mk677 = state.mk677 && typeof state.mk677 === "object" ? state.mk677 : {};
    const recovered = [];
    collectDirectGlucose(state.mk677, recovered);

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.toLowerCase().includes("locked_os")) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        inspectGlucoseRecoveryValue(raw, recovered, 0);
      }
    } catch (error) {
      console.warn("LOCKED OS: glucose recovery scan was partially unavailable.", error);
    }

    const before = mergeGlucoseEntries(Array.isArray(state.mk677.glucoseEntries) ? state.mk677.glucoseEntries : []);
    const merged = mergeGlucoseEntries(before, recovered);

    if (JSON.stringify(before) === JSON.stringify(merged)) return false;
    state.mk677.glucoseEntries = merged;
    return true;
  }

  function protectGlucoseDuringRemoteApply() {
    if (typeof applyRemoteState !== "function" || applyRemoteState.__sep16GlucoseProtected) return;

    const beforeApplyRemote = applyRemoteState;
    const wrappedApplyRemote = function(remoteState, statusMessage, options = {}) {
      let protectedRemote = remoteState;

      if (remoteState && typeof remoteState === "object" && typeof state !== "undefined" && state && typeof state === "object") {
        protectedRemote = clone(remoteState);
        protectedRemote.mk677 = protectedRemote.mk677 && typeof protectedRemote.mk677 === "object"
          ? protectedRemote.mk677
          : {};

        const localEntries = Array.isArray(state?.mk677?.glucoseEntries) ? state.mk677.glucoseEntries : [];
        const remoteEntries = Array.isArray(protectedRemote?.mk677?.glucoseEntries)
          ? protectedRemote.mk677.glucoseEntries
          : [];

        protectedRemote.mk677.glucoseEntries = mergeGlucoseEntries(localEntries, remoteEntries);
      }

      const result = beforeApplyRemote(protectedRemote, statusMessage, options);

      let changed = false;
      changed = recoverGlucoseHistory() || changed;
      changed = migrateExistingTreadmillTask() || changed;
      changed = migrateBackExerciseHistory() || changed;
      if (changed) {
        persistSoon();
        try { if (typeof render === "function") render(); } catch (_) {}
      }
      queueGymDomPatch();
      return result;
    };

    wrappedApplyRemote.__sep16GlucoseProtected = true;
    applyRemoteState = wrappedApplyRemote;
  }

  /* -------------------------------------------------------------------- */
  /* EVERY-OTHER-DAY CUSTOM TASK RECURRENCE                               */
  /* -------------------------------------------------------------------- */

  function taskRecurrence(taskId, targetState = (typeof state !== "undefined" ? state : null)) {
    const meta = ensurePatchMeta(targetState);
    return meta?.[RECURRENCE_META_KEY]?.[String(taskId || "")] || null;
  }

  function recurringTaskAppears(taskId, dayKey) {
    const recurrence = taskRecurrence(taskId);
    if (!recurrence || recurrence.type !== "everyOtherDay") return true;
    const startDayKey = validDateKey(recurrence.startDayKey) ? recurrence.startDayKey : TREADMILL_START;
    const currentDay = dateKeyToUtcDay(dayKey);
    const startDay = dateKeyToUtcDay(startDayKey);
    if (!Number.isFinite(currentDay) || !Number.isFinite(startDay) || currentDay < startDay) return false;
    return (currentDay - startDay) % 2 === 0;
  }

  function setEveryOtherRecurrence(task, startDayKey) {
    if (!task?.id || typeof state === "undefined" || !state) return false;
    const meta = ensurePatchMeta();
    const start = validDateKey(startDayKey) ? startDayKey : tomorrowKey();
    let changed = false;

    const existing = meta[RECURRENCE_META_KEY][task.id];
    if (!existing || existing.type !== "everyOtherDay" || existing.startDayKey !== start) {
      meta[RECURRENCE_META_KEY][task.id] = { type: "everyOtherDay", startDayKey: start };
      changed = true;
    }

    if (!sameArray(task.days, ALL_DAYS)) {
      task.days = [...ALL_DAYS];
      changed = true;
    }

    if (!sameArray(meta[CUSTOM_SCHEDULE_META_KEY][task.id], ALL_DAYS)) {
      meta[CUSTOM_SCHEDULE_META_KEY][task.id] = [...ALL_DAYS];
      changed = true;
    }

    return changed;
  }

  function migrateExistingTreadmillTask() {
    if (typeof state === "undefined" || !state || typeof state !== "object") return false;
    const meta = ensurePatchMeta();
    const tasks = Array.isArray(meta?.looksCustomTasks) ? meta.looksCustomTasks : [];
    let changed = false;

    for (const task of tasks) {
      const title = String(state.meta?.looksTaskEdits?.[task.id] || task?.title || "").trim().toLowerCase();
      if (!title.includes("treadmill")) continue;
      changed = setEveryOtherRecurrence(task, TREADMILL_START) || changed;
    }

    return changed;
  }

  function installRecurrenceFilter() {
    if (typeof getLooksRoutine !== "function" || getLooksRoutine.__sep16RecurrenceFilter) return;

    const beforeGetLooksRoutine = getLooksRoutine;
    const wrappedGetLooksRoutine = function(dayKey = typeof getTodayKey === "function" ? getTodayKey() : "") {
      const routine = beforeGetLooksRoutine(dayKey);
      const filter = tasks => (Array.isArray(tasks) ? tasks : []).filter(task => {
        if (!task?.custom) return true;
        return recurringTaskAppears(task.id, dayKey);
      });

      return {
        morning: filter(routine?.morning),
        midday: filter(routine?.midday),
        night: filter(routine?.night)
      };
    };

    wrappedGetLooksRoutine.__sep16RecurrenceFilter = true;
    getLooksRoutine = wrappedGetLooksRoutine;
  }

  function markPendingEveryOther(section, title, startDayKey, existingIds) {
    pendingEveryOtherTask = {
      section: String(section || ""),
      title: String(title || "").trim(),
      startDayKey: validDateKey(startDayKey) ? startDayKey : tomorrowKey(),
      existingIds: new Set(existingIds || [])
    };

    setTimeout(applyPendingEveryOtherTask, 0);
    setTimeout(applyPendingEveryOtherTask, 80);
  }

  function applyPendingEveryOtherTask() {
    const pending = pendingEveryOtherTask;
    if (!pending || typeof state === "undefined" || !state) return;

    const meta = ensurePatchMeta();
    const tasks = Array.isArray(meta?.looksCustomTasks) ? meta.looksCustomTasks : [];
    const candidate = [...tasks].reverse().find(task => {
      if (!task?.id || pending.existingIds.has(task.id)) return false;
      if (String(task.section || "") !== pending.section) return false;
      return String(task.title || "").trim() === pending.title;
    });

    if (!candidate) return;

    pendingEveryOtherTask = null;
    if (setEveryOtherRecurrence(candidate, pending.startDayKey)) {
      persistSoon();
      try { if (typeof render === "function") render(); } catch (_) {}
    }
  }

  function enhanceTaskScheduleModal(baseOpen, args) {
    const modal = document.getElementById("looksTaskAddModal");
    if (!modal || modal.dataset.sep16Enhanced === "1") return;
    modal.dataset.sep16Enhanced = "1";
    modal.dataset.scheduleMode = "days";

    const [row, menu, section] = args;
    void row;
    void menu;

    const presets = modal.querySelector(".looks-task-day-presets");
    const dayBlock = modal.querySelector(".looks-task-days-block");
    const dayGrid = modal.querySelector(".looks-task-day-grid");
    const count = modal.querySelector("#looksTaskDayCount");
    const input = modal.querySelector("#looksTaskAddName");
    const saveButton = modal.querySelector("#looksTaskAddSave");

    if (!presets || !dayBlock || !dayGrid) return;

    const everyOtherButton = document.createElement("button");
    everyOtherButton.className = "looks-task-day-preset";
    everyOtherButton.id = "looksTaskEveryOtherDay";
    everyOtherButton.type = "button";
    everyOtherButton.textContent = "Every other day";
    presets.appendChild(everyOtherButton);

    const startField = document.createElement("label");
    startField.id = "looksTaskEveryOtherStartField";
    startField.className = "looks-task-modal-field";
    startField.hidden = true;
    startField.style.marginTop = "12px";
    startField.innerHTML = `
      <span>Start every-other-day schedule</span>
      <input class="looks-task-modal-input" id="looksTaskEveryOtherStart" type="date" value="${tomorrowKey()}"/>
    `;
    dayBlock.insertAdjacentElement("afterend", startField);

    const setMode = mode => {
      modal.dataset.scheduleMode = mode;
      const everyOther = mode === "everyOtherDay";
      startField.hidden = !everyOther;
      dayGrid.style.opacity = everyOther ? ".45" : "";
      dayGrid.style.pointerEvents = everyOther ? "none" : "";

      if (everyOther) {
        if (typeof lockedOsSetTaskDays === "function") lockedOsSetTaskDays(ALL_DAYS);
        if (count) count.textContent = "Every other day";
      } else if (typeof lockedOsUpdateTaskDayCount === "function") {
        lockedOsUpdateTaskDayCount();
      }
    };

    everyOtherButton.addEventListener("click", () => setMode("everyOtherDay"));

    ["looksTaskEveryDay", "looksTaskWeekdays", "looksTaskClearDays"].forEach(id => {
      document.getElementById(id)?.addEventListener("click", () => setMode("days"), true);
    });

    dayGrid.addEventListener("click", () => {
      if (modal.dataset.scheduleMode !== "everyOtherDay") setMode("days");
    }, true);

    const preparePending = () => {
      if (modal.dataset.scheduleMode !== "everyOtherDay") return;
      const title = String(input?.value || "").trim().slice(0, 160);
      if (!title) return;
      const start = document.getElementById("looksTaskEveryOtherStart")?.value || tomorrowKey();
      const existingIds = (Array.isArray(state?.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [])
        .map(task => task?.id)
        .filter(Boolean);
      markPendingEveryOther(section, title, start, existingIds);
    };

    saveButton?.addEventListener("click", preparePending, true);
    input?.addEventListener("keydown", event => {
      if (event.key === "Enter") preparePending();
    }, true);
  }

  function installEveryOtherDayModalOption() {
    if (typeof lockedOsOpenTaskAddModal !== "function" || lockedOsOpenTaskAddModal.__sep16EveryOtherDay) return;

    const beforeOpen = lockedOsOpenTaskAddModal;
    const wrappedOpen = function(...args) {
      const result = beforeOpen(...args);
      enhanceTaskScheduleModal(beforeOpen, args);
      return result;
    };

    wrappedOpen.__sep16EveryOtherDay = true;
    lockedOsOpenTaskAddModal = wrappedOpen;
  }

  /* -------------------------------------------------------------------- */
  /* BACK WORKOUT: FACE PULLS + SHRUGS                                    */
  /* -------------------------------------------------------------------- */

  function normalizeBackExerciseName(value) {
    return String(value || "").trim() === "Reverse Pec Deck" ? "Face Pulls" : String(value || "").trim();
  }

  function migrateSessionExerciseNames(session) {
    if (!session || typeof session !== "object" || !Array.isArray(session.exercises)) return false;
    let changed = false;
    const merged = [];

    for (const exercise of session.exercises) {
      if (!exercise || typeof exercise !== "object") continue;
      const next = { ...exercise, name: normalizeBackExerciseName(exercise.name) };
      if (next.name !== exercise.name) changed = true;

      const existing = merged.find(item => item.name === next.name);
      if (!existing) {
        merged.push(next);
      } else {
        const existingSets = Array.isArray(existing.sets) ? existing.sets : [];
        const nextSets = Array.isArray(next.sets) ? next.sets : [];
        if (nextSets.some(set => Number(set?.weight) > 0 || Number(set?.reps) > 0)) existing.sets = nextSets;
        changed = true;
      }
    }

    if (changed) session.exercises = merged;
    return changed;
  }

  function migrateSessionCollection(collection) {
    if (!collection) return false;
    let changed = false;

    if (Array.isArray(collection)) {
      for (const session of collection) changed = migrateSessionExerciseNames(session) || changed;
      return changed;
    }

    if (typeof collection === "object") {
      for (const session of Object.values(collection)) changed = migrateSessionExerciseNames(session) || changed;
    }

    return changed;
  }

  function migrateBackExerciseHistory() {
    if (typeof state === "undefined" || !state || typeof state !== "object") return false;
    let changed = false;

    const collections = [
      state?.meta?.gymClean?.sessions,
      state?.meta?.gymTrackerV2?.sessions,
      state?.meta?.gymTracker?.sessions,
      state?.meta?.gymSessions,
      state?.gymSessions
    ];

    for (const collection of collections) changed = migrateSessionCollection(collection) || changed;

    try {
      const raw = localStorage.getItem(GYM_VAULT_KEY);
      if (raw) {
        const sessions = JSON.parse(raw);
        if (migrateSessionCollection(sessions)) {
          localStorage.setItem(GYM_VAULT_KEY, JSON.stringify(sessions));
          changed = true;
        }
      }
    } catch (error) {
      console.warn("LOCKED OS: could not migrate the local gym history vault.", error);
    }

    return changed;
  }

  function visibleGymDayKey() {
    const label = document.getElementById("cleanGymDateLabel")?.textContent?.trim() || "";
    const today = typeof getTodayKey === "function" ? getTodayKey() : "";

    if (!label) return today;

    const currentYear = validDateKey(today) ? Number(today.slice(0, 4)) : new Date().getFullYear();
    const withoutWeekday = label.includes(",") ? label.slice(label.indexOf(",") + 1).trim() : label;
    const parsed = new Date(`${withoutWeekday}, ${currentYear} 12:00:00`);

    if (!Number.isNaN(parsed.getTime())) {
      const candidate = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
      return candidate;
    }

    return today;
  }

  function primaryGymSessions() {
    const sessions = state?.meta?.gymClean?.sessions;
    return Array.isArray(sessions) ? sessions : [];
  }

  function exerciseForDay(dayKey, name) {
    const session = primaryGymSessions().find(item => item?.date === dayKey);
    return session?.exercises?.find(exercise => normalizeBackExerciseName(exercise?.name) === name) || null;
  }

  function previousExercise(dayKey, name) {
    return [...primaryGymSessions()]
      .filter(session => validDateKey(session?.date) && session.date < dayKey)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(session => session?.exercises?.find(exercise => normalizeBackExerciseName(exercise?.name) === name))
      .find(Boolean) || null;
  }

  function formatSet(set) {
    const weight = Number(set?.weight);
    const reps = Number(set?.reps);
    if (weight > 0 && reps > 0) return `${weight} lb × ${Math.round(reps)}`;
    if (weight > 0) return `${weight} lb`;
    if (reps > 0) return `${Math.round(reps)} reps`;
    return "—";
  }

  function fillExerciseRow(row, exercise, previous) {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
    row.querySelectorAll("input[data-set][data-field]").forEach(input => {
      const index = Number(input.dataset.set);
      const field = input.dataset.field;
      const value = Number(sets?.[index]?.[field]);
      input.value = Number.isFinite(value) && value > 0 ? String(value) : "";
    });

    const previousStrong = row.querySelector(".clean-gym-previous strong");
    if (previousStrong) {
      previousStrong.innerHTML = `${formatSet(previous?.sets?.[0])}<br>${formatSet(previous?.sets?.[1])}`;
    }
  }

  function patchBackWorkoutDom() {
    gymPatchQueued = false;
    const gymPage = document.getElementById("gymPage");
    const title = document.getElementById("cleanGymWorkoutTitle");
    if (!gymPage || !title || !String(title.textContent || "").toLowerCase().includes("back")) return;

    const rows = [...gymPage.querySelectorAll(".clean-gym-exercise")];
    if (!rows.length) return;

    let facePullRow = rows.find(row => row.dataset.exercise === "Reverse Pec Deck" || row.dataset.exercise === "Face Pulls");
    if (facePullRow) {
      const wasReversePecDeck = facePullRow.dataset.exercise === "Reverse Pec Deck";
      if (wasReversePecDeck) facePullRow.dataset.exercise = "Face Pulls";
      const label = facePullRow.querySelector(".clean-gym-exercise-name strong");
      if (label && label.textContent !== "Face Pulls") label.textContent = "Face Pulls";
      if (wasReversePecDeck) {
        const dayKey = visibleGymDayKey();
        fillExerciseRow(facePullRow, exerciseForDay(dayKey, "Face Pulls"), previousExercise(dayKey, "Face Pulls"));
      }
    }

    let shrugRow = [...gymPage.querySelectorAll(".clean-gym-exercise")].find(row => row.dataset.exercise === "Shrugs");
    if (!shrugRow) {
      const sourceRow = facePullRow || rows.at(-1);
      if (!sourceRow) return;
      shrugRow = sourceRow.cloneNode(true);
      shrugRow.dataset.exercise = "Shrugs";
      const label = shrugRow.querySelector(".clean-gym-exercise-name strong");
      if (label) label.textContent = "Shrugs";

      const dayKey = visibleGymDayKey();
      fillExerciseRow(shrugRow, exerciseForDay(dayKey, "Shrugs"), previousExercise(dayKey, "Shrugs"));
      sourceRow.insertAdjacentElement("afterend", shrugRow);
    }
  }

  function queueGymDomPatch() {
    if (gymPatchQueued) return;
    gymPatchQueued = true;
    requestAnimationFrame(patchBackWorkoutDom);
  }

  function installGymDomObserver() {
    if (gymObserver) return;
    const gymPage = document.getElementById("gymPage");
    if (!gymPage) {
      setTimeout(installGymDomObserver, 200);
      return;
    }

    gymObserver = new MutationObserver(() => queueGymDomPatch());
    gymObserver.observe(gymPage, { childList: true, subtree: true, characterData: true });

    ["cleanGymPrev", "cleanGymToday", "cleanGymNext"].forEach(id => {
      document.getElementById(id)?.addEventListener("click", () => setTimeout(queueGymDomPatch, 0));
    });

    queueGymDomPatch();
  }

  function installFinalPatchLayer() {
    installRecurrenceFilter();
    installEveryOtherDayModalOption();
    protectGlucoseDuringRemoteApply();

    let changed = false;
    changed = recoverGlucoseHistory() || changed;
    changed = migrateExistingTreadmillTask() || changed;
    changed = migrateBackExerciseHistory() || changed;

    if (changed) persistSoon();
    installGymDomObserver();
    queueGymDomPatch();

    /* Some existing LOCKED OS patches install their own wrappers on a zero-delay
       timer. Re-assert this final layer after those have finished. */
    setTimeout(() => {
      installRecurrenceFilter();
      installEveryOtherDayModalOption();
      protectGlucoseDuringRemoteApply();
      let laterChanged = false;
      laterChanged = recoverGlucoseHistory() || laterChanged;
      laterChanged = migrateExistingTreadmillTask() || laterChanged;
      laterChanged = migrateBackExerciseHistory() || laterChanged;
      if (laterChanged) persistSoon();
      queueGymDomPatch();
    }, 0);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", installFinalPatchLayer);
  } else {
    installFinalPatchLayer();
  }
})();
