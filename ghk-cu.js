"use strict";

/*
  LOCKED OS — RESTORE RECENT WORKOUTS ONLY
  This intentionally loads the exact current build unchanged, then restores
  only the Recent Workouts -> Workout Log UI.

  Pinned current build:
  1eb4b5273bb03dc6ee3027d3bc2c597441a623f8
*/

(() => {
  const CURRENT_BUILD =
    "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@1eb4b5273bb03dc6ee3027d3bc2c597441a623f8/ghk-cu.js";

  try {
    const request = new XMLHttpRequest();
    request.open("GET", CURRENT_BUILD, false);
    request.send(null);

    if (request.status < 200 || request.status >= 300) {
      throw new Error(`HTTP ${request.status}`);
    }

    (0, eval)(
      request.responseText +
      "\n//# sourceURL=locked-os-current-build-1eb4b527.js"
    );
  } catch (error) {
    console.error("LOCKED OS: could not load the current pinned build.", error);
  }
})();

(() => {
  "use strict";

  const FLAG = "__lockedOsRecentWorkoutsOnly20260911";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const GYM_VAULT_KEY = "locked_os_gym_sessions_vault_v2";
  let refreshTimer = null;

  const clone = value => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  };

  const validDateKey = value =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeWorkoutName(value) {
    const name = String(value || "").trim();
    if (name === "Push") return "Chest + side delts";
    if (name === "Pull") return "Back + rear delts";
    if (name === "Legs") return "Legs + Abs";
    if (name === "Arms + Abs") return "Arms";
    return name || "Workout";
  }

  function normalizeSets(value) {
    return safeArray(value)
      .slice(0, 6)
      .map(set => ({
        weight:
          Number.isFinite(Number(set?.weight)) && Number(set.weight) > 0
            ? Number(set.weight)
            : 0,
        reps:
          Number.isFinite(Number(set?.reps)) && Number(set.reps) > 0
            ? Math.round(Number(set.reps))
            : 0
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
      id: String(raw.id || `restored-gym-${date}`),
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

  function sessionScore(session) {
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

    const leftScore = sessionScore(left);
    const rightScore = sessionScore(right);

    if (rightScore !== leftScore) {
      return clone(rightScore > leftScore ? right : left);
    }

    const leftTime = String(left.updatedAt || "");
    const rightTime = String(right.updatedAt || "");

    return clone(rightTime > leftTime ? right : left);
  }

  function addSessions(map, sessions) {
    for (const raw of safeArray(sessions)) {
      const session = normalizeSession(raw);
      if (!session) continue;
      map.set(
        session.date,
        mergeSession(map.get(session.date), session)
      );
    }
  }

  function extractSessionsFromSnapshot(snapshot, map) {
    if (!snapshot || typeof snapshot !== "object") return;

    addSessions(map, snapshot?.meta?.gymClean?.sessions);
    addSessions(map, snapshot?.meta?.gymTrackerV2?.sessions);
    addSessions(map, snapshot?.meta?.gymTracker?.sessions);

    for (const source of [
      snapshot?.meta?.gymSessions,
      snapshot?.gymSessions
    ]) {
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        continue;
      }

      for (const [date, raw] of Object.entries(source)) {
        const session = normalizeSession(raw, date);
        if (!session) continue;

        map.set(
          session.date,
          mergeSession(map.get(session.date), session)
        );
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
      for (const item of value) {
        inspectRecoveryValue(item, map, depth + 1);
      }
      return;
    }

    if (typeof value !== "object") return;

    extractSessionsFromSnapshot(value, map);

    if (value.state) inspectRecoveryValue(value.state, map, depth + 1);
    if (value.snapshot) inspectRecoveryValue(value.snapshot, map, depth + 1);
    if (value.serialized) {
      inspectRecoveryValue(value.serialized, map, depth + 1);
    }
  }

  function getAllSavedWorkoutLogs() {
    const map = new Map();

    /*
      Current state — read only.
    */
    if (typeof state !== "undefined") {
      extractSessionsFromSnapshot(state, map);
    }

    /*
      Dedicated Gym recovery vault — read only.
    */
    try {
      addSessions(
        map,
        JSON.parse(localStorage.getItem(GYM_VAULT_KEY) || "[]")
      );
    } catch (_) {}

    /*
      Read old LOCKED OS recovery snapshots only to surface historical logs.
      Nothing is written back to state.
    */
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
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function escape(value) {
    if (typeof escapeHtml === "function") {
      return escapeHtml(value);
    }

    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function prettyDate(dayKey) {
    try {
      const date =
        typeof keyToLocalDate === "function"
          ? keyToLocalDate(dayKey)
          : new Date(`${dayKey}T12:00:00`);

      return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      });
    } catch (_) {
      return dayKey;
    }
  }

  function setText(set) {
    const weight = Number(set?.weight);
    const reps = Number(set?.reps);

    if (weight > 0 && reps > 0) {
      return `${weight} lb × ${Math.round(reps)}`;
    }

    if (weight > 0) return `${weight} lb`;
    if (reps > 0) return `${Math.round(reps)} reps`;
    return "—";
  }

  function completedSetCount(session) {
    let count = 0;

    for (const exercise of safeArray(session.exercises)) {
      for (const set of safeArray(exercise.sets)) {
        if (Number(set?.weight) > 0 || Number(set?.reps) > 0) {
          count += 1;
        }
      }
    }

    return count;
  }

  function ensureHistorySection() {
    const gymPage = document.getElementById("gymPage");
    if (!gymPage) return null;

    let list = document.getElementById("cleanGymHistory");

    if (list) {
      const card = list.closest(".clean-gym-history-card, .card");
      if (card) {
        card.hidden = false;
        card.style.removeProperty("display");
      }
      return list;
    }

    const page =
      gymPage.querySelector(".clean-gym-page") ||
      gymPage.firstElementChild ||
      gymPage;

    const card = document.createElement("section");
    card.className = "card clean-gym-history-card";
    card.id = "restoredRecentWorkoutsCard";
    card.innerHTML = `
      <div class="panel-title">
        <div>
          <p class="eyebrow blue">History</p>
          <h3>Recent workouts</h3>
        </div>
      </div>
      <div class="clean-gym-history" id="cleanGymHistory"></div>
    `;

    page.appendChild(card);

    return card.querySelector("#cleanGymHistory");
  }

  function openWorkoutLog(session) {
    document
      .querySelector(".restored-gym-log-backdrop")
      ?.remove();

    const backdrop = document.createElement("div");
    backdrop.className =
      "gym-log-modal-backdrop restored-gym-log-backdrop";

    const exerciseRows = safeArray(session.exercises)
      .map(exercise => {
        const sets = safeArray(exercise.sets);

        return `
          <div class="gym-log-exercise">
            <div class="gym-log-exercise-name">
              ${escape(exercise.name || "Exercise")}
            </div>
            <div class="gym-log-sets">
              ${sets.length
                ? sets
                    .map(
                      (set, index) => `
                        <div class="gym-log-set">
                          <span>Set ${index + 1}</span>
                          <strong>${escape(setText(set))}</strong>
                        </div>
                      `
                    )
                    .join("")
                : `
                    <div class="gym-log-set">
                      <span>Sets</span>
                      <strong>—</strong>
                    </div>
                  `}
            </div>
          </div>
        `;
      })
      .join("");

    backdrop.innerHTML = `
      <section
        class="gym-log-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restoredGymLogTitle"
      >
        <div class="gym-log-modal-head">
          <div>
            <p class="eyebrow blue">Workout log</p>
            <h3 id="restoredGymLogTitle">
              ${escape(session.workout)}
            </h3>
            <p>${escape(prettyDate(session.date))}</p>
          </div>
          <button
            class="gym-log-close"
            type="button"
            aria-label="Close"
          >×</button>
        </div>

        <div class="gym-log-status ${session.completed ? "complete" : ""}">
          ${
            session.completed
              ? "✓ Completed workout"
              : "Saved workout"
          }
        </div>

        <div class="gym-log-exercises">
          ${
            exerciseRows ||
            '<div class="clean-gym-empty">This saved workout does not contain set details.</div>'
          }
        </div>

        <div class="gym-log-modal-actions">
          <button
            class="btn blue restored-gym-log-done"
            type="button"
          >Done</button>
        </div>
      </section>
    `;

    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) close();
    });

    backdrop
      .querySelector(".gym-log-close")
      ?.addEventListener("click", close);

    backdrop
      .querySelector(".restored-gym-log-done")
      ?.addEventListener("click", close);
  }

  function renderRecentWorkoutLogs() {
    const list = ensureHistorySection();
    if (!list) return;

    const sessions = getAllSavedWorkoutLogs().slice(0, 20);

    list.innerHTML = "";

    if (!sessions.length) {
      list.innerHTML =
        '<div class="clean-gym-empty">No saved workout logs yet.</div>';
      return;
    }

    for (const session of sessions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "clean-gym-history-row gym-log-row restored-gym-log-row";

      const setCount = completedSetCount(session);

      button.innerHTML = `
        <div class="gym-log-row-copy">
          <span>${escape(session.date)}</span>
          <strong>
            ${escape(session.workout)}
            ${session.completed ? " ✓" : ""}
          </strong>
          <small>
            ${
              setCount
                ? `${setCount} logged set${setCount === 1 ? "" : "s"}`
                : "Open workout log"
            }
          </small>
        </div>
        <span class="gym-log-open">View log →</span>
      `;

      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openWorkoutLog(session);
      });

      list.appendChild(button);
    }
  }

  function scheduleRefresh(delay = 0) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(renderRecentWorkoutLogs, delay);
  }

  function installStyles() {
    if (document.getElementById("recentWorkoutsOnlyStyles")) return;

    const style = document.createElement("style");
    style.id = "recentWorkoutsOnlyStyles";
    style.textContent = `
      #restoredRecentWorkoutsCard {
        display:block;
      }

      .restored-gym-log-row {
        width:100%;
      }

      .restored-gym-log-backdrop {
        z-index:10050;
      }
    `;

    document.head.appendChild(style);
  }

  function install() {
    installStyles();
    renderRecentWorkoutLogs();

    /*
      Refresh only when the Gym view or Gym save buttons are used.
      No task/schedule/sync behavior is changed.
    */
    document
      .querySelector('[data-tab="gymPage"]')
      ?.addEventListener("click", () => scheduleRefresh(50));

    document.addEventListener(
      "click",
      event => {
        if (
          event.target.closest("#cleanGymSave") ||
          event.target.closest("#cleanGymComplete")
        ) {
          scheduleRefresh(100);
        }
      },
      true
    );

    window.addEventListener("focus", () => scheduleRefresh(50));
  }

  const start = () => setTimeout(install, 350);

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
