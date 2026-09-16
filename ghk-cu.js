"use strict";

/*
  LOCKED OS — TRUSTED DEVICE + GYM RANK PATCH
  Generated from the current main build on 2026-09-15.

  The exact current ghk-cu.js is loaded first from the pinned commit below.
  This file then adds only:
    1) trusted-browser auto unlock with password fallback
    2) Gym -> Rank subtab and progression system
*/

(() => {
  const CURRENT_BUILD_COMMIT = "2449c6831eca87e3ab56d10eec47fcbb73b34e90";
  const CURRENT_BUILD = `https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@${CURRENT_BUILD_COMMIT}/ghk-cu.js`;

  try {
    const request = new XMLHttpRequest();
    request.open("GET", CURRENT_BUILD, false);
    request.send(null);

    if (request.status < 200 || request.status >= 300) {
      throw new Error(`HTTP ${request.status}`);
    }

    (0, eval)(
      request.responseText +
      `\n//# sourceURL=locked-os-current-build-${CURRENT_BUILD_COMMIT.slice(0, 8)}.js`
    );
  } catch (error) {
    console.error("LOCKED OS: could not load the pinned current build.", error);
  }
})();

(() => {
  "use strict";

  const PATCH_FLAG = "__lockedOsTrustedDeviceGymRank20260915";
  if (window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  /* ---------------------------------------------------------------------- */
  /* TRUSTED BROWSER                                                        */
  /* ---------------------------------------------------------------------- */

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
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    } catch (_) {
      return null;
    }
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
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
    if (typeof crypto?.randomUUID === "function") {
      return `locked-${crypto.randomUUID()}`;
    }

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
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }

      const request = indexedDB.open(DEVICE_DB_NAME, DEVICE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DEVICE_DB_STORE)) {
          db.createObjectStore(DEVICE_DB_STORE, { keyPath: "id" });
        }
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
        transaction.oncomplete = () => resolve();
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

      const secretHash = await hashSecret(secretBytes);
      if (secretHash !== record.secretHash) return false;

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
  }

  async function tryTrustedAutoUnlock() {
    const login = document.getElementById("loginScreen");
    const app = document.getElementById("mainApp");
    if (!login || !app || login.classList.contains("hidden")) return;

    const verified = await verifyTrustedDevice();
    if (!verified) return;

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

      if (wasLocked && isUnlocked && !trustedAutoUnlockInFlight) {
        setTimeout(() => {
          registerTrustedDeviceAfterPassword();
        }, 250);
      }

      wasLocked = !isUnlocked;
    });

    observer.observe(login, { attributes: true, attributeFilter: ["class"] });
    observer.observe(app, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------------------------------------------------------------------- */
  /* GYM RANK                                                               */
  /* ---------------------------------------------------------------------- */

  const GYM_VAULT_KEY = "locked_os_gym_sessions_vault_v2";
  const TARGET_CATEGORIES = [
    { key: "chest", label: "Chest + Side Delts" },
    { key: "back", label: "Back + Rear Delts" },
    { key: "arms", label: "Arms" }
  ];

  const CATEGORY_RANKS = [
    { name: "Unranked", xp: 0 },
    { name: "Bronze I", xp: 150 },
    { name: "Bronze II", xp: 350 },
    { name: "Bronze III", xp: 600 },
    { name: "Silver I", xp: 900 },
    { name: "Silver II", xp: 1250 },
    { name: "Silver III", xp: 1650 },
    { name: "Gold I", xp: 2100 },
    { name: "Gold II", xp: 2600 },
    { name: "Gold III", xp: 3200 },
    { name: "Platinum", xp: 3900 },
    { name: "Diamond", xp: 4800 },
    { name: "Locked In", xp: 6000 }
  ];

  const OVERALL_RANKS = CATEGORY_RANKS.map((rank, index) => ({
    name: rank.name,
    xp: index === 0 ? 0 : Math.round(rank.xp * 2.25)
  }));

  const safeArray = value => Array.isArray(value) ? value : [];
  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function escapeRankHtml(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeWorkoutName(value) {
    const name = String(value || "").trim();
    if (name === "Push") return "Chest + side delts";
    if (name === "Pull") return "Back + rear delts";
    if (name === "Arms + Abs") return "Arms";
    return name || "Workout";
  }

  function normalizeSets(value) {
    return safeArray(value)
      .slice(0, 10)
      .map(set => ({
        weight: Number.isFinite(Number(set?.weight)) && Number(set.weight) > 0 ? Number(set.weight) : 0,
        reps: Number.isFinite(Number(set?.reps)) && Number(set.reps) > 0 ? Math.round(Number(set.reps)) : 0
      }));
  }

  function normalizeSession(raw, fallbackDate = "") {
    if (!raw || typeof raw !== "object") return null;

    const date = validDateKey(raw.date)
      ? raw.date
      : validDateKey(raw.dayKey)
        ? raw.dayKey
        : validDateKey(fallbackDate)
          ? fallbackDate
          : "";

    if (!date) return null;

    return {
      id: String(raw.id || `rank-gym-${date}`),
      date,
      workout: normalizeWorkoutName(raw.workout || raw.workoutName),
      completed: Boolean(raw.completed || raw.done),
      updatedAt: String(raw.updatedAt || raw.updated_at || raw.savedAt || ""),
      exercises: safeArray(raw.exercises)
        .map(exercise => ({
          name: String(exercise?.name || "").trim(),
          sets: normalizeSets(exercise?.sets)
        }))
        .filter(exercise => exercise.name)
    };
  }

  function sessionScoreForMerge(session) {
    if (!session) return -1;
    let score = session.completed ? 10000 : 0;
    for (const exercise of safeArray(session.exercises)) {
      if (exercise.name) score += 5;
      for (const set of safeArray(exercise.sets)) {
        if (Number(set.weight) > 0) score += 2;
        if (Number(set.reps) > 0) score += 2;
      }
    }
    return score;
  }

  function mergeSession(left, right) {
    if (!left) return clone(right);
    if (!right) return clone(left);

    const leftScore = sessionScoreForMerge(left);
    const rightScore = sessionScoreForMerge(right);
    if (leftScore !== rightScore) return clone(rightScore > leftScore ? right : left);

    return clone(String(right.updatedAt || "") > String(left.updatedAt || "") ? right : left);
  }

  function addSessions(map, sessions) {
    for (const raw of safeArray(sessions)) {
      const session = normalizeSession(raw);
      if (!session) continue;
      map.set(session.date, mergeSession(map.get(session.date), session));
    }
  }

  function extractSessionsFromSnapshot(snapshot, map) {
    if (!snapshot || typeof snapshot !== "object") return;

    addSessions(map, snapshot?.meta?.gymClean?.sessions);
    addSessions(map, snapshot?.meta?.gymTrackerV2?.sessions);
    addSessions(map, snapshot?.meta?.gymTracker?.sessions);

    for (const source of [snapshot?.meta?.gymSessions, snapshot?.gymSessions]) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      for (const [date, raw] of Object.entries(source)) {
        const session = normalizeSession(raw, date);
        if (!session) continue;
        map.set(session.date, mergeSession(map.get(session.date), session));
      }
    }
  }

  function inspectRecoveryValue(value, map, depth = 0) {
    if (depth > 3 || value == null) return;

    if (typeof value === "string") {
      try {
        inspectRecoveryValue(JSON.parse(value), map, depth + 1);
      } catch (_) {}
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) inspectRecoveryValue(item, map, depth + 1);
      return;
    }

    if (typeof value !== "object") return;
    extractSessionsFromSnapshot(value, map);
    if (value.state) inspectRecoveryValue(value.state, map, depth + 1);
    if (value.snapshot) inspectRecoveryValue(value.snapshot, map, depth + 1);
    if (value.serialized) inspectRecoveryValue(value.serialized, map, depth + 1);
  }

  function getAllWorkoutSessions() {
    const map = new Map();

    try {
      if (typeof state !== "undefined") extractSessionsFromSnapshot(state, map);
    } catch (_) {}

    try {
      addSessions(map, JSON.parse(localStorage.getItem(GYM_VAULT_KEY) || "[]"));
    } catch (_) {}

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.toLowerCase().includes("locked_os")) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        inspectRecoveryValue(raw, map);
      }
    } catch (_) {}

    return [...map.values()]
      .filter(session => validDateKey(session.date))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function getWorkoutCategory(workoutName) {
    const name = String(workoutName || "").toLowerCase();
    if (name.includes("chest") || name.includes("side delt") || name === "push") return "chest";
    if (name.includes("back") || name.includes("rear delt") || name === "pull") return "back";
    if (name.includes("arm") || name.includes("bicep") || name.includes("tricep")) return "arms";
    return "";
  }

  function loggedSetCount(session) {
    let count = 0;
    for (const exercise of safeArray(session.exercises)) {
      for (const set of safeArray(exercise.sets)) {
        if (Number(set?.weight) > 0 || Number(set?.reps) > 0) count += 1;
      }
    }
    return count;
  }

  function estimatedOneRepMax(set) {
    const weight = Number(set?.weight || 0);
    const reps = Number(set?.reps || 0);
    if (weight <= 0 || reps <= 0) return 0;
    return weight * (1 + Math.min(reps, 30) / 30);
  }

  function calculateCategoryProgress(sessions, categoryKey) {
    const categorySessions = sessions.filter(session => getWorkoutCategory(session.workout) === categoryKey);
    const exerciseBest = new Map();
    let xp = 0;
    let completed = 0;
    let sets = 0;
    let prs = 0;

    for (const session of categorySessions) {
      if (session.completed) {
        xp += 100;
        completed += 1;
      } else if (loggedSetCount(session) > 0) {
        xp += 40;
      }

      const sessionSets = loggedSetCount(session);
      sets += sessionSets;
      xp += sessionSets * 5;

      for (const exercise of safeArray(session.exercises)) {
        const exerciseKey = String(exercise.name || "").trim().toLowerCase();
        if (!exerciseKey) continue;

        const sessionBest = Math.max(0, ...safeArray(exercise.sets).map(estimatedOneRepMax));
        if (sessionBest <= 0) continue;

        const previousBest = Number(exerciseBest.get(exerciseKey) || 0);
        if (previousBest > 0 && sessionBest > previousBest * 1.005) {
          prs += 1;
          xp += 40;
        }
        if (sessionBest > previousBest) exerciseBest.set(exerciseKey, sessionBest);
      }
    }

    return { xp, completed, sets, prs, sessions: categorySessions.length };
  }

  function resolveRank(xp, ranks) {
    let current = ranks[0];
    let next = null;

    for (let index = 0; index < ranks.length; index += 1) {
      if (xp >= ranks[index].xp) {
        current = ranks[index];
        next = ranks[index + 1] || null;
      } else {
        break;
      }
    }

    const floor = current.xp;
    const ceiling = next?.xp ?? floor;
    const percent = next ? Math.max(0, Math.min(100, ((xp - floor) / Math.max(1, ceiling - floor)) * 100)) : 100;

    return {
      current,
      next,
      percent,
      remaining: next ? Math.max(0, next.xp - xp) : 0
    };
  }

  function buildRankData() {
    const sessions = getAllWorkoutSessions();
    const categories = TARGET_CATEGORIES.map(category => ({
      ...category,
      progress: calculateCategoryProgress(sessions, category.key)
    }));

    const overallXp = categories.reduce((sum, category) => sum + category.progress.xp, 0);
    const totals = categories.reduce((result, category) => {
      result.completed += category.progress.completed;
      result.sets += category.progress.sets;
      result.prs += category.progress.prs;
      return result;
    }, { completed: 0, sets: 0, prs: 0 });

    return {
      sessions,
      categories,
      overallXp,
      totals,
      overallRank: resolveRank(overallXp, OVERALL_RANKS)
    };
  }

  function rankIcon(rankName) {
    if (/Diamond|Locked In/i.test(rankName)) return "◆";
    if (/Platinum/i.test(rankName)) return "⬟";
    if (/Gold/i.test(rankName)) return "★";
    if (/Silver/i.test(rankName)) return "●";
    if (/Bronze/i.test(rankName)) return "▲";
    return "○";
  }

  function categoryCardMarkup(category) {
    const rank = resolveRank(category.progress.xp, CATEGORY_RANKS);
    const nextText = rank.next
      ? `${rank.remaining} XP to ${rank.next.name}`
      : "Maximum rank reached";

    return `
      <article class="gym-rank-category-card">
        <div class="gym-rank-category-head">
          <div>
            <span>${escapeRankHtml(category.label)}</span>
            <strong>${escapeRankHtml(rank.current.name)}</strong>
          </div>
          <div class="gym-rank-mini-icon">${rankIcon(rank.current.name)}</div>
        </div>
        <div class="gym-rank-progress"><span style="width:${rank.percent.toFixed(1)}%"></span></div>
        <div class="gym-rank-next">${escapeRankHtml(nextText)}</div>
        <div class="gym-rank-stats">
          <div><strong>${category.progress.completed}</strong><span>workouts</span></div>
          <div><strong>${category.progress.sets}</strong><span>sets</span></div>
          <div><strong>${category.progress.prs}</strong><span>PRs</span></div>
          <div><strong>${category.progress.xp}</strong><span>XP</span></div>
        </div>
      </article>`;
  }

  function ladderMarkup(xp, ranks) {
    const resolved = resolveRank(xp, ranks);
    return ranks.map(rank => {
      const unlocked = xp >= rank.xp;
      const current = rank.name === resolved.current.name;
      return `
        <div class="gym-rank-ladder-row ${unlocked ? "unlocked" : ""} ${current ? "current" : ""}">
          <span class="gym-rank-ladder-icon">${rankIcon(rank.name)}</span>
          <strong>${escapeRankHtml(rank.name)}</strong>
          <span>${rank.xp.toLocaleString()} XP</span>
          <b>${current ? "Current" : unlocked ? "Unlocked" : "Locked"}</b>
        </div>`;
    }).join("");
  }

  function renderGymRank() {
    const panel = document.getElementById("lockedGymRankPanel");
    if (!panel) return;

    const data = buildRankData();
    const rank = data.overallRank;
    const nextText = rank.next
      ? `${rank.remaining.toLocaleString()} XP until ${rank.next.name}`
      : "You reached the top rank.";

    panel.innerHTML = `
      <section class="card gym-rank-hero-card">
        <div class="gym-rank-hero-copy">
          <p class="eyebrow blue">Training rank</p>
          <h2>${rankIcon(rank.current.name)} ${escapeRankHtml(rank.current.name)}</h2>
          <p>${escapeRankHtml(nextText)}</p>
        </div>
        <div class="gym-rank-xp-block">
          <strong>${data.overallXp.toLocaleString()}</strong>
          <span>total XP</span>
        </div>
        <div class="gym-rank-progress large"><span style="width:${rank.percent.toFixed(1)}%"></span></div>
        <div class="gym-rank-summary-stats">
          <div><strong>${data.totals.completed}</strong><span>target workouts</span></div>
          <div><strong>${data.totals.sets}</strong><span>logged sets</span></div>
          <div><strong>${data.totals.prs}</strong><span>strength PRs</span></div>
        </div>
      </section>

      <section class="gym-rank-category-grid">
        ${data.categories.map(categoryCardMarkup).join("")}
      </section>

      <section class="card gym-rank-rules-card">
        <div class="panel-title">
          <div>
            <p class="eyebrow blue">How to rank up</p>
            <h3>XP rules</h3>
          </div>
        </div>
        <div class="gym-rank-rule-grid">
          <div><strong>+100 XP</strong><span>Complete a Chest + Side Delts, Back + Rear Delts, or Arms workout.</span></div>
          <div><strong>+5 XP</strong><span>For every logged working set with weight or reps.</span></div>
          <div><strong>+40 XP</strong><span>Whenever an exercise beats its previous estimated-strength best.</span></div>
        </div>
        <p class="gym-rank-footnote">Legs and other workout types are not counted in this rank because this ladder is built around the three splits you asked for. Rank recalculates automatically from your saved workout history.</p>
      </section>

      <section class="card gym-rank-ladder-card">
        <div class="panel-title">
          <div>
            <p class="eyebrow blue">Progression</p>
            <h3>Overall rank ladder</h3>
          </div>
        </div>
        <div class="gym-rank-ladder">
          ${ladderMarkup(data.overallXp, OVERALL_RANKS)}
        </div>
      </section>`;
  }

  function setGymSubtab(mode) {
    const page = document.getElementById("gymPage");
    if (!page) return;

    const rankMode = mode === "rank";
    page.classList.toggle("locked-gym-rank-mode", rankMode);

    document.querySelectorAll("#lockedGymSubtabs [data-gym-subtab]").forEach(button => {
      const active = button.dataset.gymSubtab === (rankMode ? "rank" : "workout");
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    const rankPanel = document.getElementById("lockedGymRankPanel");
    if (rankPanel) rankPanel.hidden = !rankMode;
    if (rankMode) renderGymRank();
  }

  function markGymOriginalChildren() {
    const page = document.getElementById("gymPage");
    if (!page) return;

    for (const child of [...page.children]) {
      if (child.id === "lockedGymSubtabs" || child.id === "lockedGymRankPanel") continue;
      child.classList.add("locked-gym-original-content");
    }
  }

  function installGymRankSubtab() {
    const page = document.getElementById("gymPage");
    if (!page || document.getElementById("lockedGymSubtabs")) return false;

    const subtabs = document.createElement("div");
    subtabs.id = "lockedGymSubtabs";
    subtabs.className = "locked-gym-subtabs";
    subtabs.setAttribute("role", "tablist");
    subtabs.innerHTML = `
      <button class="locked-gym-subtab active" data-gym-subtab="workout" type="button" role="tab" aria-selected="true">Workout</button>
      <button class="locked-gym-subtab" data-gym-subtab="rank" type="button" role="tab" aria-selected="false">Rank</button>`;

    const rankPanel = document.createElement("div");
    rankPanel.id = "lockedGymRankPanel";
    rankPanel.className = "locked-gym-rank-panel";
    rankPanel.hidden = true;

    page.insertBefore(subtabs, page.firstChild);
    page.appendChild(rankPanel);
    markGymOriginalChildren();

    subtabs.addEventListener("click", event => {
      const button = event.target.closest("[data-gym-subtab]");
      if (!button) return;
      setGymSubtab(button.dataset.gymSubtab);
    });

    const observer = new MutationObserver(() => markGymOriginalChildren());
    observer.observe(page, { childList: true });

    document.addEventListener("click", event => {
      if (event.target.closest("#cleanGymSave, #cleanGymComplete")) {
        setTimeout(renderGymRank, 150);
      }
    }, true);

    window.addEventListener("storage", event => {
      if (String(event.key || "").toLowerCase().includes("gym") || String(event.key || "").toLowerCase().includes("locked_os")) {
        renderGymRank();
      }
    });

    window.addEventListener("focus", () => {
      if (page.classList.contains("locked-gym-rank-mode")) renderGymRank();
    });

    return true;
  }

  function installPatchStyles() {
    if (document.getElementById("trustedDeviceGymRankStyles")) return;

    const style = document.createElement("style");
    style.id = "trustedDeviceGymRankStyles";
    style.textContent = `
      .locked-device-hint {
        margin-top: 14px;
        color: var(--muted, #756c62);
        font-size: .75rem;
        line-height: 1.45;
        font-weight: 700;
      }

      #gymPage .locked-gym-subtabs {
        display: inline-flex;
        gap: 6px;
        margin: 0 0 18px;
        padding: 5px;
        border: 1px solid var(--line, rgba(42,30,18,.12));
        border-radius: 999px;
        background: rgba(255,255,255,.55);
      }

      #gymPage .locked-gym-subtab {
        min-height: 38px;
        padding: 0 16px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--muted, #756c62);
        font: inherit;
        font-size: .8rem;
        font-weight: 950;
        cursor: pointer;
      }

      #gymPage .locked-gym-subtab.active {
        background: var(--blue-soft, rgba(37,132,184,.12));
        color: var(--blue-dark, #145d86);
        box-shadow: inset 0 0 0 1px rgba(37,132,184,.16);
      }

      #gymPage.locked-gym-rank-mode > .locked-gym-original-content {
        display: none !important;
      }

      #lockedGymRankPanel[hidden] {
        display: none !important;
      }

      .locked-gym-rank-panel {
        display: grid;
        gap: 16px;
      }

      .gym-rank-hero-card {
        display: grid;
        grid-template-columns: minmax(0,1fr) auto;
        gap: 18px;
        align-items: center;
      }

      .gym-rank-hero-copy h2 {
        margin: 4px 0 6px;
        font-size: clamp(1.8rem, 5vw, 3rem);
        letter-spacing: -.05em;
      }

      .gym-rank-hero-copy > p:last-child {
        margin: 0;
        color: var(--muted, #756c62);
        font-weight: 800;
      }

      .gym-rank-xp-block {
        display: grid;
        justify-items: end;
      }

      .gym-rank-xp-block strong {
        font-size: 1.9rem;
        letter-spacing: -.04em;
      }

      .gym-rank-xp-block span,
      .gym-rank-next,
      .gym-rank-footnote {
        color: var(--muted, #756c62);
        font-size: .78rem;
        font-weight: 800;
      }

      .gym-rank-progress {
        grid-column: 1 / -1;
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(42,30,18,.09);
      }

      .gym-rank-progress.large {
        height: 11px;
      }

      .gym-rank-progress > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--blue, #2584b8);
        transition: width .25s ease;
      }

      .gym-rank-summary-stats,
      .gym-rank-stats {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(4,minmax(0,1fr));
        gap: 10px;
      }

      .gym-rank-summary-stats {
        grid-template-columns: repeat(3,minmax(0,1fr));
      }

      .gym-rank-summary-stats > div,
      .gym-rank-stats > div {
        display: grid;
        gap: 2px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(42,30,18,.045);
      }

      .gym-rank-summary-stats strong,
      .gym-rank-stats strong {
        font-size: 1.05rem;
      }

      .gym-rank-summary-stats span,
      .gym-rank-stats span {
        color: var(--muted, #756c62);
        font-size: .7rem;
        font-weight: 850;
      }

      .gym-rank-category-grid {
        display: grid;
        grid-template-columns: repeat(3,minmax(0,1fr));
        gap: 14px;
      }

      .gym-rank-category-card {
        display: grid;
        gap: 12px;
        padding: 18px;
        border: 1px solid var(--line, rgba(42,30,18,.12));
        border-radius: 20px;
        background: var(--card, rgba(255,255,255,.8));
        box-shadow: 0 12px 40px rgba(42,30,18,.06);
      }

      .gym-rank-category-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .gym-rank-category-head > div:first-child {
        display: grid;
        gap: 3px;
      }

      .gym-rank-category-head span {
        color: var(--muted, #756c62);
        font-size: .75rem;
        font-weight: 850;
      }

      .gym-rank-category-head strong {
        font-size: 1.25rem;
        letter-spacing: -.03em;
      }

      .gym-rank-mini-icon {
        display: grid;
        width: 40px;
        height: 40px;
        place-items: center;
        border-radius: 14px;
        background: var(--blue-soft, rgba(37,132,184,.12));
        color: var(--blue-dark, #145d86);
        font-size: 1.1rem;
        font-weight: 950;
      }

      .gym-rank-rule-grid {
        display: grid;
        grid-template-columns: repeat(3,minmax(0,1fr));
        gap: 12px;
      }

      .gym-rank-rule-grid > div {
        display: grid;
        gap: 6px;
        padding: 14px;
        border-radius: 16px;
        background: rgba(42,30,18,.045);
      }

      .gym-rank-rule-grid strong {
        color: var(--blue-dark, #145d86);
      }

      .gym-rank-rule-grid span {
        color: var(--muted, #756c62);
        font-size: .78rem;
        font-weight: 750;
        line-height: 1.45;
      }

      .gym-rank-footnote {
        margin: 14px 0 0;
        line-height: 1.5;
      }

      .gym-rank-ladder {
        display: grid;
        gap: 8px;
      }

      .gym-rank-ladder-row {
        display: grid;
        grid-template-columns: 28px minmax(0,1fr) auto auto;
        gap: 10px;
        align-items: center;
        min-height: 44px;
        padding: 0 12px;
        border-radius: 13px;
        background: rgba(42,30,18,.035);
        opacity: .55;
      }

      .gym-rank-ladder-row.unlocked {
        opacity: 1;
      }

      .gym-rank-ladder-row.current {
        background: var(--blue-soft, rgba(37,132,184,.12));
        box-shadow: inset 0 0 0 1px rgba(37,132,184,.16);
      }

      .gym-rank-ladder-row > span:nth-of-type(2),
      .gym-rank-ladder-row b {
        color: var(--muted, #756c62);
        font-size: .72rem;
      }

      .gym-rank-ladder-row b {
        min-width: 62px;
        text-align: right;
      }

      .gym-rank-ladder-icon {
        color: var(--blue-dark, #145d86);
        text-align: center;
      }

      @media (max-width: 900px) {
        .gym-rank-category-grid,
        .gym-rank-rule-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 620px) {
        .gym-rank-hero-card {
          grid-template-columns: 1fr;
        }

        .gym-rank-xp-block {
          justify-items: start;
        }

        .gym-rank-summary-stats,
        .gym-rank-stats {
          grid-template-columns: repeat(2,minmax(0,1fr));
        }

        .gym-rank-ladder-row {
          grid-template-columns: 24px minmax(0,1fr) auto;
        }

        .gym-rank-ladder-row b {
          display: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function installWhenGymExists(attempt = 0) {
    if (installGymRankSubtab()) return;
    if (attempt >= 30) return;
    setTimeout(() => installWhenGymExists(attempt + 1), 200);
  }

  function install() {
    installPatchStyles();
    installTrustedDeviceStatusChip();
    watchForSuccessfulPasswordUnlock();
    tryTrustedAutoUnlock();
    installWhenGymExists();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
