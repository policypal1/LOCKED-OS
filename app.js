"use strict";

const PASSWORD = "2009";
const SUPABASE_URL = "https://qihajayxjukppcnsrgpi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NCPEc56HEwlcQroUnCtp2Q_Niz3sNH6";
const SUPABASE_ROW_ID = "samuel-main";
const SUPABASE_TABLE = "locked_os_state_v2";
const STORAGE_KEY = "locked_os_daily_checklist_v15";
const OLD_STORAGE_KEYS = [
  "locked_os_daily_checklist_v14",
  "locked_os_daily_checklist_v13",
  "locked_os_daily_checklist_v12",
  "locked_os_daily_checklist_v11",
  "locked_os_daily_checklist_v10",
  "locked_os_daily_checklist_v9",
  "locked_os_daily_checklist_v8",
  "locked_os_daily_checklist_v7",
  "locked_os_daily_checklist_v6",
  "locked_os_daily_checklist_v5",
  "locked_os_daily_checklist_v4"
];

const DAY_ROLLOVER_HOUR = 4;
const WATER_MINIMUM_OZ = 80;
const WATER_TARGET_OZ = 100;
const WATER_MAX_OZ = 240;
const LOOKS_MORNING_WATER_OZ = 16;
const MS_PER_DAY = 86_400_000;

// Original rotation anchor. A manual gym override creates a newer anchor in state.meta.
const WORKOUT_ROTATION_ANCHOR = "2026-07-25";
const WORKOUT_ROTATION = [
  "Chest + side delts",
  "Back + rear delts",
  "Arms",
  "Legs",
  "Abs"
];

const DEFAULT_TRETINOIN_FREQUENCY = 3;
const TRETINOIN_SCHEDULES = {
  1: ["Monday"],
  2: ["Monday", "Thursday"],
  3: ["Monday", "Wednesday", "Saturday"],
  4: ["Monday", "Wednesday", "Thursday", "Saturday"],
  5: ["Monday", "Wednesday", "Thursday", "Saturday", "Sunday"],
  6: ["Monday", "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday"],
  7: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
};
const SHAVE_DAYS = new Set(["Monday", "Thursday"]);
const MICRONEEDLE_DAYS = new Set(["Wednesday", "Sunday"]);
const MASSETER_DAYS = new Set(["Tuesday", "Thursday", "Saturday"]);

const hasSupabaseConfig =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PASTE_") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");

const supabaseClient = hasSupabaseConfig && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const TASKS = [
  { id: "wake-up", section: "morning", title: "Wake up at planned time" },
  { id: "water", section: "morning", title: "Chug 2 glasses of water immediately after waking up" },
  { id: "clean-room", section: "morning", title: "Clean room" },
  { id: "dressed", section: "morning", title: "Get fully dressed and ready for the day" },
  { id: "real-world-good-morning", section: "morning", title: "Real World daily good morning" },
  { id: "real-world-lesson", section: "morning", title: "Real World daily lesson" },
  { id: "real-world-puzzle", section: "morning", title: "Real World daily puzzle" },
  { id: "breakfast", section: "morning", title: "Eat breakfast" },
  { id: "gym", section: "afternoon", title: "Go to gym" },
  { id: "creatine", section: "afternoon", title: "Take creatine" },
  { id: "bed-ten", section: "night", title: "Go to bed by 10:00 PM — everything shut off" }
];

const TASK_IDS = TASKS.map(task => task.id);
const MORNING_TASK_IDS = TASKS
  .filter(task => task.section === "morning")
  .map(task => task.id);

const LEGACY_TASK_ID_MAP = {
  "bed-ready": "bed-ten",
  "plan-next-day": "bed-ten",
  "brush-lips": "lip-care",
  "vaseline-lips": "lip-care",
  "exfoliate-lips": "lip-care",
  "no-shampoo": "conditional-shampoo"
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const $ = id => document.getElementById(id);
const loginScreen = $("loginScreen");
const mainApp = $("mainApp");
const passwordInput = $("passwordInput");
const unlockBtn = $("unlockBtn");
const loginError = $("loginError");
const syncStatus = $("syncStatus");

let state = loadLocalState();
let saveTimer = null;
let realtimeChannel = null;
let toastTimer = null;
let renderedDayKey = getTodayKey();
let workoutDraftIndex = null;
let workoutDraftDirty = false;
let weightRange = "30";

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getTodayKey(date = new Date()) {
  const effectiveDate = new Date(date);
  if (effectiveDate.getHours() < DAY_ROLLOVER_HOUR) {
    effectiveDate.setDate(effectiveDate.getDate() - 1);
  }
  return formatDateKey(effectiveDate);
}

function keyToLocalDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function keyToUtcDayNumber(key) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getRoutineDayName(dayKey = getTodayKey()) {
  return DAY_NAMES[keyToLocalDate(dayKey).getDay()];
}

function getDefaultWorkoutIndex(dayKey = getTodayKey()) {
  const daysFromAnchor =
    keyToUtcDayNumber(dayKey) - keyToUtcDayNumber(WORKOUT_ROTATION_ANCHOR);
  return ((daysFromAnchor % WORKOUT_ROTATION.length) + WORKOUT_ROTATION.length) % WORKOUT_ROTATION.length;
}

function getWorkoutIndex(dayKey = getTodayKey()) {
  const anchorKey = state?.meta?.workoutRotationAnchorKey;
  const anchorIndex = state?.meta?.workoutRotationAnchorIndex;

  if (!isDateKey(anchorKey) || !Number.isInteger(anchorIndex)) {
    return getDefaultWorkoutIndex(dayKey);
  }

  const daysFromAnchor = keyToUtcDayNumber(dayKey) - keyToUtcDayNumber(anchorKey);
  const index = anchorIndex + daysFromAnchor;
  return ((index % WORKOUT_ROTATION.length) + WORKOUT_ROTATION.length) % WORKOUT_ROTATION.length;
}

function formatWorkoutName(index) {
  return WORKOUT_ROTATION[index];
}

function getWorkoutName(dayKey = getTodayKey()) {
  return formatWorkoutName(getWorkoutIndex(dayKey), dayKey);
}

function getTretinoinFrequency(dayKey = getTodayKey()) {
  const changes = Array.isArray(state?.meta?.tretinoinScheduleChanges)
    ? state.meta.tretinoinScheduleChanges
    : [];

  let frequency = DEFAULT_TRETINOIN_FREQUENCY;
  for (const change of changes) {
    if (change.effectiveDayKey <= dayKey) frequency = change.frequency;
    else break;
  }
  return frequency;
}

function getTretinoinDays(dayKey = getTodayKey()) {
  return TRETINOIN_SCHEDULES[getTretinoinFrequency(dayKey)] || TRETINOIN_SCHEDULES[DEFAULT_TRETINOIN_FREQUENCY];
}

function makeMorning(dayName) {
  const tasks = [
    {
      id: "wake-water",
      title: "Wake up and chug 2 glasses of water immediately",
      meta: "morningWater"
    },
    { id: "lukewarm-shower", title: "Take a lukewarm shower" },
    { id: "conditional-shampoo", title: "Shampoo only if hair is dirty" },
    { id: "conditioner-soap", title: "Use conditioner and soap" }
  ];

  if (MASSETER_DAYS.has(dayName)) {
    tasks.push({
      id: "masseter-training",
      title: "Train masseter muscles while in the shower"
    });
  }

  tasks.push(
    { id: "cold-finish", title: "Finish the shower with cold water" },
    { id: "scrunch-hair", title: "Lightly scrunch hair with a towel" },
    { id: "face-rinse", title: "Wash face only if oily" },
    { id: "vitamin-c", title: "Apply vitamin C serum" },
    { id: "morning-moisturizer", title: "Apply moisturizer" },
    { id: "eyelash-serum", title: "Apply peptide eyelash growth serum" },
    { id: "morning-minoxidil", title: "Apply minoxidil to eyebrows" },
    { id: "sea-salt-spray", title: "Apply sea salt spray to hair" },
    { id: "deodorant", title: "Apply deodorant" },
    { id: "curl-eyelashes", title: "Curl eyelashes" },
    { id: "brush-eyebrows", title: "Brush eyebrows" },
    { id: "morning-teeth", title: "Floss and brush teeth" }
  );

  return tasks;
}

function makeMidday(dayKey) {
  const dayName = getRoutineDayName(dayKey);
  const tasks = [
    { id: "gym", title: `Gym: ${getWorkoutName(dayKey)}` },
    { id: "creatine", title: "Take creatine" }
  ];

  if (dayName === "Wednesday" || dayName === "Sunday") {
    tasks.push({ id: "wash-bed-sheets", title: "Wash bed sheets" });
  }

  tasks.push({
    id: "water-through-day",
    title: "Drink 80–100 oz of water throughout the day",
    subtitle: "Completes automatically at 80 oz.",
    meta: "waterTracked"
  });

  return tasks;
}

function makeNight(dayName, dayKey) {
  const tasks = [
    { id: "whitening-strips", title: "Use Crest 3D White Strips" },
    { id: "no-phone", title: "No phone" },
    { id: "bed-nine", title: "Start getting ready for bed at 9:00 PM" },
    { id: "hydrating-cleanser", title: "Wash face with hydrating facial cleanser" }
  ];

  if (SHAVE_DAYS.has(dayName)) {
    tasks.push({ id: "shave-manage-brows", title: "Shave face and manage eyebrows" });
  }

  if (MICRONEEDLE_DAYS.has(dayName)) {
    tasks.push({ id: "microneedle-eyebrows", title: "Microneedling" });
  }

  if (getTretinoinDays(dayKey).includes(dayName)) {
    tasks.push({ id: "tretinoin", title: "Apply tretinoin" });
  } else {
    tasks.push({ id: "azelaic-acid", title: "Apply azelaic acid" });
  }

  tasks.push(
    { id: "night-moisturizer", title: "Apply moisturizer" },
    { id: "night-eyelash-serum", title: "Apply peptide eyelash growth serum" },
    { id: "night-minoxidil", title: "Apply minoxidil to eyebrows" },
    { id: "night-teeth", title: "Floss and brush teeth" }
  );

  tasks.push({
    id: "lip-care",
    title: dayName === "Sunday"
      ? "Scrub/exfoliate lips and apply Vaseline"
      : "Brush lips and apply Vaseline"
  });

  return tasks;
}

function getLooksRoutine(dayKey = getTodayKey()) {
  const dayName = getRoutineDayName(dayKey);
  return {
    morning: makeMorning(dayName),
    midday: makeMidday(dayKey),
    night: makeNight(dayName, dayKey)
  };
}

function getLooksTasks(dayKey = getTodayKey()) {
  const routine = getLooksRoutine(dayKey);
  return [...routine.morning, ...routine.midday, ...routine.night];
}

function getLooksTaskIds(dayKey = getTodayKey()) {
  return getLooksTasks(dayKey).map(task => task.id);
}

function normalizeTaskId(taskId) {
  return LEGACY_TASK_ID_MAP[taskId] || taskId;
}

function cleanList(values, allowedIds) {
  if (!Array.isArray(values)) return [];
  const allowed = new Set(allowedIds);
  return [...new Set(
    values
      .map(normalizeTaskId)
      .filter(id => typeof id === "string" && allowed.has(id))
  )];
}

function createDayRecord() {
  return {
    done: [],
    skipped: [],
    looksDone: [],
    looksSkipped: [],
    waterOz: 0,
    completed: false,
    looksCompleted: false,
    missedReason: ""
  };
}

function createEmptyState() {
  return {
    days: {},
    weights: {},
    meta: { lastOpenedDayKey: null, tretinoinScheduleChanges: [] },
    adminOverrides: {
      streakOffset: null,
      currentStreak: null,
      missedCounts: null
    }
  };
}

function loadLocalState() {
  for (const key of [STORAGE_KEY, ...OLD_STORAGE_KEYS]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try the next saved version.
    }
  }
  return createEmptyState();
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  OLD_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
}

function getResolvedSet(day, type = "main") {
  if (type === "main") return new Set(day.done || []);
  return new Set([...(day.looksDone || []), ...(day.looksSkipped || [])]);
}

function syncWaterTask(day, dayKey) {
  const allowed = getLooksTaskIds(dayKey);
  const doneSet = new Set(cleanList(day.looksDone, allowed));
  const skippedSet = new Set(cleanList(day.looksSkipped, allowed));

  if (day.waterOz >= WATER_MINIMUM_OZ) {
    doneSet.add("water-through-day");
    skippedSet.delete("water-through-day");
  } else {
    doneSet.delete("water-through-day");
  }

  day.looksDone = [...doneSet];
  day.looksSkipped = [...skippedSet];
}

function normalizeDay(dayKey, original = {}) {
  const allowedLooks = getLooksTaskIds(dayKey);
  const normalized = {
    ...createDayRecord(),
    ...original,
    done: cleanList(original.done, TASK_IDS),
    skipped: [],
    looksDone: cleanList(original.looksDone, allowedLooks),
    looksSkipped: cleanList(original.looksSkipped, allowedLooks),
    waterOz: Math.max(0, Math.min(WATER_MAX_OZ, Math.round(Number(original.waterOz) || 0))),
    missedReason: typeof original.missedReason === "string" ? original.missedReason : ""
  };

  normalized.looksSkipped = normalized.looksSkipped.filter(
    id => !normalized.looksDone.includes(id)
  );
  syncWaterTask(normalized, dayKey);
  normalized.completed = normalized.done.length === TASK_IDS.length;
  normalized.looksCompleted =
    getResolvedSet(normalized, "looks").size === allowedLooks.length;

  return normalized;
}

function normalizeWeights(original) {
  const normalized = {};
  if (!original || typeof original !== "object" || Array.isArray(original)) return normalized;

  for (const [dayKey, rawWeight] of Object.entries(original)) {
    const weight = Number(rawWeight);
    if (!isDateKey(dayKey) || !Number.isFinite(weight) || weight < 50 || weight > 500) continue;
    normalized[dayKey] = Math.round(weight * 10) / 10;
  }

  return normalized;
}

function backfillMissingPastDays() {
  const todayKey = getTodayKey();
  const todayDate = keyToLocalDate(todayKey);
  const pastKeys = Object.keys(state.days)
    .filter(key => isDateKey(key) && key < todayKey)
    .sort();

  let anchorKey = state.meta.lastOpenedDayKey;
  if (!isDateKey(anchorKey) || anchorKey >= todayKey) {
    anchorKey = pastKeys.at(-1) || null;
  }

  let changed = false;

  if (anchorKey && anchorKey < todayKey) {
    if (!state.days[anchorKey]) {
      state.days[anchorKey] = createDayRecord();
      changed = true;
    }

    let cursor = addDays(keyToLocalDate(anchorKey), 1);
    while (cursor < todayDate) {
      const missingKey = formatDateKey(cursor);
      if (!state.days[missingKey]) {
        state.days[missingKey] = createDayRecord();
        changed = true;
      }
      cursor = addDays(cursor, 1);
    }
  }

  if (state.meta.lastOpenedDayKey !== todayKey) {
    state.meta.lastOpenedDayKey = todayKey;
    changed = true;
  }

  return changed;
}

function normalizeState() {
  let changed = false;

  if (!state || typeof state !== "object") {
    state = createEmptyState();
    changed = true;
  }
  if (!state.days || typeof state.days !== "object") {
    state.days = {};
    changed = true;
  }
  if (!state.meta || typeof state.meta !== "object") {
    state.meta = { lastOpenedDayKey: state.lastOpenedDayKey || null, tretinoinScheduleChanges: [] };
    changed = true;
  }

  const normalizedWeights = normalizeWeights(state.weights);
  if (JSON.stringify(state.weights || {}) !== JSON.stringify(normalizedWeights)) {
    state.weights = normalizedWeights;
    changed = true;
  } else if (!state.weights || typeof state.weights !== "object" || Array.isArray(state.weights)) {
    state.weights = {};
    changed = true;
  }

  const originalTretChanges = Array.isArray(state.meta.tretinoinScheduleChanges)
    ? state.meta.tretinoinScheduleChanges
    : [];
  const tretByDay = new Map();
  for (const change of originalTretChanges) {
    if (
      change &&
      isDateKey(change.effectiveDayKey) &&
      Number.isInteger(change.frequency) &&
      change.frequency >= 1 &&
      change.frequency <= 7
    ) {
      tretByDay.set(change.effectiveDayKey, {
        effectiveDayKey: change.effectiveDayKey,
        frequency: change.frequency
      });
    }
  }
  const normalizedTretChanges = [...tretByDay.values()]
    .sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));
  if (JSON.stringify(originalTretChanges) !== JSON.stringify(normalizedTretChanges)) {
    state.meta.tretinoinScheduleChanges = normalizedTretChanges;
    changed = true;
  } else if (!Array.isArray(state.meta.tretinoinScheduleChanges)) {
    state.meta.tretinoinScheduleChanges = [];
    changed = true;
  }

  if (!state.adminOverrides || typeof state.adminOverrides !== "object") {
    state.adminOverrides = {};
    changed = true;
  }

  if (
    state.meta.workoutRotationAnchorIndex !== undefined &&
    !Number.isInteger(state.meta.workoutRotationAnchorIndex)
  ) {
    delete state.meta.workoutRotationAnchorIndex;
    delete state.meta.workoutRotationAnchorKey;
    changed = true;
  }

  for (const dayKey of Object.keys(state.days)) {
    if (!isDateKey(dayKey)) {
      delete state.days[dayKey];
      changed = true;
      continue;
    }

    const original = state.days[dayKey] || {};
    const normalized = normalizeDay(dayKey, original);
    if (JSON.stringify(original) !== JSON.stringify(normalized)) {
      state.days[dayKey] = normalized;
      changed = true;
    }
  }

  if (backfillMissingPastDays()) changed = true;

  const override = state.adminOverrides;
  if (!Number.isInteger(override.streakOffset)) {
    if (Number.isInteger(override.currentStreak) && override.currentStreak >= 0) {
      override.streakOffset = override.currentStreak - calculateCurrentStreak();
    } else {
      override.streakOffset = null;
    }
    changed = true;
  }

  if (override.currentStreak !== null) {
    override.currentStreak = null;
    changed = true;
  }

  if (override.missedCounts !== null && typeof override.missedCounts !== "object") {
    override.missedCounts = null;
    changed = true;
  }

  return changed;
}

function ensureDay(dayKey = getTodayKey()) {
  if (!state.days[dayKey]) {
    state.days[dayKey] = createDayRecord();
  }
  state.days[dayKey] = normalizeDay(dayKey, state.days[dayKey]);
  return state.days[dayKey];
}

function hasMeaningfulState(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;

  if (snapshot.weights && Object.keys(snapshot.weights).length > 0) return true;
  if (Array.isArray(snapshot.meta?.tretinoinScheduleChanges) && snapshot.meta.tretinoinScheduleChanges.length > 0) return true;
  if (Number.isInteger(snapshot.meta?.workoutRotationAnchorIndex)) return true;

  return Object.values(snapshot.days || {}).some(day => {
    if (!day || typeof day !== "object") return false;
    return (
      (Array.isArray(day.done) && day.done.length > 0) ||
      (Array.isArray(day.looksDone) && day.looksDone.length > 0) ||
      (Array.isArray(day.looksSkipped) && day.looksSkipped.length > 0) ||
      Number(day.waterOz) > 0 ||
      day.completed === true ||
      day.looksCompleted === true ||
      Boolean(day.missedReason)
    );
  });
}

function applyRemoteState(remoteState, statusMessage = "Updated from Supabase.") {
  if (!remoteState || typeof remoteState !== "object") return false;

  state = remoteState;
  normalizeState();
  saveLocalState();

  if (!mainApp.classList.contains("hidden")) render();
  if (syncStatus) syncStatus.textContent = statusMessage;
  return true;
}

async function fetchSupabaseState({ silent = false } = {}) {
  if (!supabaseClient) return null;

  if (!silent) syncStatus.textContent = "Loading from Supabase…";
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("state, updated_at")
    .eq("id", SUPABASE_ROW_ID)
    .maybeSingle();

  if (error) {
    console.error(error);
    if (!silent) syncStatus.textContent = "Supabase load failed. Using local save.";
    return null;
  }

  return data || null;
}

function subscribeToSupabaseState() {
  if (!supabaseClient || realtimeChannel) return;

  realtimeChannel = supabaseClient
    .channel(`locked-os-state-${SUPABASE_ROW_ID}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: SUPABASE_TABLE,
        filter: `id=eq.${SUPABASE_ROW_ID}`
      },
      payload => {
        const remoteState = payload?.new?.state;
        if (!remoteState || typeof remoteState !== "object") return;
        applyRemoteState(remoteState, "Updated live from Supabase.");
      }
    )
    .subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        if (syncStatus && !syncStatus.textContent.includes("Saving")) {
          syncStatus.textContent = "Live sync connected.";
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Supabase Realtime error:", error);
        if (syncStatus) syncStatus.textContent = "Saved with Supabase. Live updates are reconnecting…";
      }
    });
}

function saveState() {
  saveLocalState();
  queueSupabaseSave();
}

function queueSupabaseSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSupabaseState, 250);
}

async function loadSupabaseState() {
  if (!supabaseClient) {
    syncStatus.textContent = "Saved locally. Supabase is not connected.";
    return;
  }

  const localBeforeLoad = state;
  const remoteRow = await fetchSupabaseState();

  if (remoteRow?.state && typeof remoteRow.state === "object") {
    const remoteHasData = hasMeaningfulState(remoteRow.state);
    const localHasData = hasMeaningfulState(localBeforeLoad);

    // Supabase is the source of truth. The one exception is a completely
    // empty cloud row with meaningful local data, which lets an existing
    // device repair/reseed a cloud row that was accidentally wiped.
    if (remoteHasData || !localHasData) {
      applyRemoteState(remoteRow.state, "Synced with Supabase.");
    } else {
      state = localBeforeLoad;
      normalizeState();
      saveLocalState();
      await saveSupabaseState();
      syncStatus.textContent = "Restored local data to Supabase.";
    }
  } else {
    await saveSupabaseState();
  }

  subscribeToSupabaseState();
}

async function refreshSupabaseState() {
  if (!supabaseClient || mainApp.classList.contains("hidden")) return;
  const remoteRow = await fetchSupabaseState({ silent: true });
  if (remoteRow?.state && typeof remoteRow.state === "object") {
    applyRemoteState(remoteRow.state, "Synced with Supabase.");
  }
}

async function saveSupabaseState() {
  if (!supabaseClient) {
    syncStatus.textContent = "Saved locally. Supabase is not connected.";
    return false;
  }

  syncStatus.textContent = "Saving…";
  const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert({
    id: SUPABASE_ROW_ID,
    state,
    updated_at: new Date().toISOString()
  });

  if (error) {
    console.error(error);
    syncStatus.textContent = "Supabase save failed. Saved locally only.";
    return false;
  }

  syncStatus.textContent = "Saved to Supabase.";
  return true;
}

function calculateStreak(completedField) {
  let date = keyToLocalDate(getTodayKey());
  let streak = 0;

  if (state.days[getTodayKey()]?.[completedField] !== true) {
    date = addDays(date, -1);
  }

  while (state.days[formatDateKey(date)]?.[completedField] === true) {
    streak += 1;
    date = addDays(date, -1);
  }

  return streak;
}

function calculateCurrentStreak() {
  return calculateStreak("completed");
}

function calculateLooksStreak() {
  return calculateStreak("looksCompleted");
}

function getDisplayedCurrentStreak() {
  return calculateCurrentStreak();
}

function calculateTaskStreak(taskId) {
  let date = keyToLocalDate(getTodayKey());
  let streak = 0;

  if (!state.days[getTodayKey()]?.done?.includes(taskId)) {
    date = addDays(date, -1);
  }

  while (state.days[formatDateKey(date)]?.done?.includes(taskId)) {
    streak += 1;
    date = addDays(date, -1);
  }

  return streak;
}

function toggleMainTask(taskId) {
  const day = ensureDay();
  const done = new Set(day.done);

  if (done.has(taskId)) done.delete(taskId);
  else done.add(taskId);

  day.done = [...done];
  day.skipped = [];
  day.completed = day.done.length === TASK_IDS.length;
  saveState();
  render();
}

function setLooksStatus(task, status) {
  const day = ensureDay();
  const done = new Set(day.looksDone);
  const skipped = new Set(day.looksSkipped);

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
  syncWaterTask(day, getTodayKey());
  day.looksCompleted =
    getResolvedSet(day, "looks").size === getLooksTaskIds().length;
  saveState();
  render();
}

function createTaskRow(task, done, skipped, theme, onToggle, onSkip) {
  const row = document.createElement("div");
  row.className = `task-row ${theme} ${done ? "done" : ""} ${skipped ? "skipped" : ""} ${task.meta === "waterTracked" ? "tracked" : ""}`;

  const main = document.createElement("button");
  main.type = "button";
  main.className = "task-main";
  main.innerHTML = `
    <div class="task-box">${done ? "✓" : skipped ? "−" : ""}</div>
    <div class="task-copy">
      <div class="task-title">${escapeHtml(task.title)}</div>
      ${task.subtitle ? `<div class="task-subtitle">${escapeHtml(task.subtitle)}</div>` : ""}
      ${skipped ? '<div class="task-status">Skipped today</div>' : ""}
    </div>`;
  main.addEventListener("click", onToggle);
  row.appendChild(main);

  if (typeof onSkip === "function") {
    const menu = document.createElement("details");
    menu.className = "task-menu";

    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", `Options for ${task.title}`);
    summary.textContent = "⋯";

    const popover = document.createElement("div");
    popover.className = "task-menu-popover";

    const skipButton = document.createElement("button");
    skipButton.type = "button";
    skipButton.className = "task-menu-action";
    skipButton.textContent = skipped ? "Unskip task" : "Skip this task";
    skipButton.addEventListener("click", event => {
      event.stopPropagation();
      menu.open = false;
      onSkip();
      toast(skipped ? "Task returned to today." : "Task skipped for today.");
    });

    popover.appendChild(skipButton);
    menu.append(summary, popover);
    row.appendChild(menu);
  } else {
    row.classList.add("no-menu");
  }

  return row;
}

function renderTaskLists() {
  const day = ensureDay();
  const done = new Set(day.done);

  $("morningList").innerHTML = "";
  $("afternoonList").innerHTML = "";
  $("nightList").innerHTML = "";

  for (const task of TASKS) {
    const row = createTaskRow(
      task,
      done.has(task.id),
      false,
      "",
      () => toggleMainTask(task.id)
    );
    $(`${task.section}List`).appendChild(row);
  }
}

function renderProgress() {
  const day = ensureDay();
  const done = day.done.length;
  const total = TASKS.length;
  const percent = Math.round((done / total) * 100);
  const left = total - done;

  $("percent").textContent = `${percent}%`;
  $("doneCount").textContent = `${done} / ${total}`;
  $("tasksLeft").textContent = left === 0
    ? "Main checklist complete. The streak updated immediately."
    : `${left} main task${left === 1 ? "" : "s"} left today.`;
  $("progressCircle").style.background =
    `conic-gradient(var(--green) ${Math.round((done / total) * 360)}deg, rgba(42,30,18,.09) 0deg)`;
}

function renderPhoneLock() {
  const done = new Set(ensureDay().done);
  const remaining = MORNING_TASK_IDS.filter(id => !done.has(id)).length;
  const complete = remaining === 0;

  $("phoneLockCard").classList.toggle("locked", !complete);
  $("phoneLockCard").classList.toggle("unlocked", complete);
  $("phoneLockTitle").textContent = complete ? "Phone unlocked" : "Phone locked";
  $("phoneLockText").textContent = complete
    ? "Morning list is complete."
    : `${remaining} morning task${remaining === 1 ? "" : "s"} left.`;
  $("phoneLockBadge").textContent = complete ? "Unlocked" : "Locked";
}

function renderDayStreak() {
  const streak = getDisplayedCurrentStreak();
  const looksStreak = calculateLooksStreak();

  $("dayStreakNumber").textContent = streak;
  $("dayStreakLabel").textContent = streak === 1 ? "day" : "days";
  $("looksStreak").textContent = looksStreak;
}

function renderLooksTaskList(element, tasks, day) {
  element.innerHTML = "";
  const done = new Set(day.looksDone);
  const skipped = new Set(day.looksSkipped);

  for (const task of tasks) {
    const toggle = () => {
      if (task.meta === "waterTracked") {
        $("waterCard").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      setLooksStatus(task, "done");
    };

    element.appendChild(
      createTaskRow(
        task,
        done.has(task.id),
        skipped.has(task.id),
        "looks-task",
        toggle,
        () => setLooksStatus(task, "skipped")
      )
    );
  }
}

function renderWorkoutPicker() {
  const key = getTodayKey();
  const currentIndex = getWorkoutIndex(key);

  if (!workoutDraftDirty || !Number.isInteger(workoutDraftIndex)) {
    workoutDraftIndex = currentIndex;
  }

  const previewName = $("workoutPreviewName");
  const status = $("workoutRotationStatus");

  if (previewName) {
    previewName.textContent = formatWorkoutName(workoutDraftIndex, key);
  }

  if (status) {
    status.textContent = workoutDraftIndex === currentIndex
      ? "This is the workout currently set for today."
      : "Previewing a different point in the rotation. Hit Set to use it.";
  }
}

function shiftWorkoutDraft(amount) {
  const current = Number.isInteger(workoutDraftIndex)
    ? workoutDraftIndex
    : getWorkoutIndex(getTodayKey());

  workoutDraftIndex =
    ((current + amount) % WORKOUT_ROTATION.length + WORKOUT_ROTATION.length) %
    WORKOUT_ROTATION.length;
  workoutDraftDirty = true;
  renderWorkoutPicker();
}

function setWorkoutRotationForToday() {
  if (!Number.isInteger(workoutDraftIndex)) {
    workoutDraftIndex = getWorkoutIndex(getTodayKey());
  }

  state.meta = state.meta || {};
  state.meta.workoutRotationAnchorKey = getTodayKey();
  state.meta.workoutRotationAnchorIndex = workoutDraftIndex;
  workoutDraftDirty = false;

  saveState();
  render();
  toast(`Gym rotation set to ${WORKOUT_ROTATION[workoutDraftIndex]}.`);
}

function renderLooks() {
  const key = getTodayKey();
  const day = ensureDay(key);
  const dayName = getRoutineDayName(key);
  const routine = getLooksRoutine(key);
  const date = keyToLocalDate(key);

  $("looksDayName").textContent = `${dayName} routine`;
  $("looksDateText").textContent =
    `${dayName}, ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;

  renderLooksTaskList($("looksMorningList"), routine.morning, day);
  renderLooksTaskList($("looksMiddayList"), routine.midday, day);
  renderLooksTaskList($("looksNightList"), routine.night, day);

  const total = getLooksTaskIds(key).length;
  const done = day.looksDone.length;
  const skipped = day.looksSkipped.length;
  const resolved = done + skipped;
  const left = total - resolved;
  const percent = total ? Math.round((resolved / total) * 100) : 0;

  $("looksPercent").textContent = `${percent}%`;
  $("looksDoneCount").textContent = skipped
    ? `${done} done • ${skipped} skipped`
    : `${done} / ${total}`;
  $("looksTasksLeft").textContent = left === 0
    ? "Looksmaxxing routine resolved. Its separate streak updated."
    : `${left} looks task${left === 1 ? "" : "s"} left today.`;
  $("looksProgressCircle").style.background =
    `conic-gradient(var(--blue) ${total ? Math.round((resolved / total) * 360) : 0}deg, rgba(42,30,18,.09) 0deg)`;
  $("workoutName").textContent = getWorkoutName(key);

  renderWorkoutPicker();
  renderWater();
}

function renderWater() {
  const waterOz = ensureDay().waterOz;
  const displayPercent = Math.round((waterOz / WATER_TARGET_OZ) * 100);

  $("waterAmount").innerHTML = `${waterOz} <span>oz / ${WATER_TARGET_OZ} oz</span>`;
  $("waterBadge").textContent = `${displayPercent}%`;
  $("waterFill").style.width = `${Math.max(0, Math.min(100, displayPercent))}%`;

  if (waterOz < WATER_MINIMUM_OZ) {
    $("waterStatus").textContent = `${WATER_MINIMUM_OZ - waterOz} oz until the daily minimum.`;
  } else if (waterOz < WATER_TARGET_OZ) {
    $("waterStatus").textContent = `Minimum hit. ${WATER_TARGET_OZ - waterOz} oz until target.`;
  } else {
    $("waterStatus").textContent = waterOz === WATER_TARGET_OZ
      ? `${WATER_TARGET_OZ} oz target complete.`
      : `${waterOz - WATER_TARGET_OZ} oz above target.`;
  }
}

function setWaterOz(value) {
  const day = ensureDay();
  day.waterOz = Math.max(
    0,
    Math.min(WATER_MAX_OZ, Math.round(Number(value) || 0))
  );
  syncWaterTask(day, getTodayKey());
  day.looksCompleted =
    getResolvedSet(day, "looks").size === getLooksTaskIds().length;
  saveState();
  render();
}

function getWeightEntries() {
  return Object.entries(state.weights || {})
    .filter(([dayKey, weight]) => isDateKey(dayKey) && Number.isFinite(Number(weight)))
    .map(([dayKey, weight]) => ({ dayKey, weight: Number(weight) }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

function getVisibleWeightEntries() {
  const entries = getWeightEntries();
  if (weightRange === "all") return entries;

  const days = Number(weightRange);
  if (!Number.isFinite(days) || days <= 0) return entries;

  const cutoff = addDays(keyToLocalDate(getTodayKey()), -(days - 1));
  const cutoffKey = formatDateKey(cutoff);
  return entries.filter(entry => entry.dayKey >= cutoffKey);
}

function formatWeightDate(dayKey, options = {}) {
  return keyToLocalDate(dayKey).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...options
  });
}

function setWeightSaveStatus(message, type = "") {
  const element = $("weightSaveStatus");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("good", type === "good");
  element.classList.toggle("bad", type === "bad");
}

function saveWeightEntry() {
  const dateInput = $("weightDateInput");
  const valueInput = $("weightValueInput");
  const dayKey = dateInput.value;
  const weight = Number(valueInput.value);

  if (!isDateKey(dayKey)) {
    setWeightSaveStatus("Choose a valid date.", "bad");
    dateInput.focus();
    return;
  }

  if (!Number.isFinite(weight) || weight < 50 || weight > 500) {
    setWeightSaveStatus("Enter a weight from 50 to 500 lb.", "bad");
    valueInput.focus();
    return;
  }

  state.weights = state.weights || {};
  state.weights[dayKey] = Math.round(weight * 10) / 10;
  saveState();
  renderWeightTracker();
  valueInput.value = "";
  setWeightSaveStatus(`Saved ${state.weights[dayKey].toFixed(1)} lb for ${formatWeightDate(dayKey)}.`, "good");
  toast("Weight saved.");
}

function deleteWeightEntry(dayKey) {
  if (!state.weights?.[dayKey]) return;
  delete state.weights[dayKey];
  saveState();
  renderWeightTracker();
  setWeightSaveStatus(`Removed the entry for ${formatWeightDate(dayKey)}.`, "good");
}

function renderWeightHistory(entries) {
  const list = $("weightHistoryList");
  if (!list) return;
  list.innerHTML = "";

  const recent = [...entries].reverse().slice(0, 10);
  if (!recent.length) {
    list.innerHTML = '<div class="weight-history-empty">No weight entries yet.</div>';
    return;
  }

  recent.forEach(entry => {
    const row = document.createElement("div");
    row.className = "weight-history-row";

    const date = document.createElement("div");
    date.className = "weight-history-date";
    date.textContent = formatWeightDate(entry.dayKey, { year: "numeric" });

    const value = document.createElement("div");
    value.className = "weight-history-value";
    value.textContent = `${entry.weight.toFixed(1)} lb`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "weight-delete-btn";
    remove.setAttribute("aria-label", `Delete weight for ${entry.dayKey}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteWeightEntry(entry.dayKey));

    row.append(date, value, remove);
    list.appendChild(row);
  });
}

function renderWeightChart(entries) {
  const chart = $("weightChart");
  if (!chart) return;

  if (!entries.length) {
    chart.innerHTML = '<div class="weight-chart-empty">No entries in this time range yet.</div>';
    return;
  }

  const width = 800;
  const height = 310;
  const padding = { top: 24, right: 28, bottom: 42, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const weights = entries.map(entry => entry.weight);
  const rawMin = Math.min(...weights);
  const rawMax = Math.max(...weights);
  const spread = rawMax - rawMin;
  const pad = spread === 0 ? 2 : Math.max(1, spread * 0.18);
  const minWeight = Math.floor((rawMin - pad) * 2) / 2;
  const maxWeight = Math.ceil((rawMax + pad) * 2) / 2;
  const weightSpan = Math.max(1, maxWeight - minWeight);

  const xForIndex = index => entries.length === 1
    ? padding.left + plotWidth / 2
    : padding.left + (index / (entries.length - 1)) * plotWidth;
  const yForWeight = weight =>
    padding.top + ((maxWeight - weight) / weightSpan) * plotHeight;

  const gridLines = [0, 0.5, 1].map(ratio => {
    const y = padding.top + ratio * plotHeight;
    const value = maxWeight - ratio * weightSpan;
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(42,30,18,.10)" stroke-width="1" />
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" fill="#7a6b59" font-size="12" font-weight="700">${value.toFixed(1)}</text>`;
  }).join("");

  const points = entries
    .map((entry, index) => `${xForIndex(index)},${yForWeight(entry.weight)}`)
    .join(" ");

  const circles = entries.map((entry, index) => `
    <circle cx="${xForIndex(index)}" cy="${yForWeight(entry.weight)}" r="4.5" fill="#2584b8" stroke="#fffaf1" stroke-width="2">
      <title>${entry.dayKey}: ${entry.weight.toFixed(1)} lb</title>
    </circle>`).join("");

  const first = entries[0];
  const last = entries.at(-1);
  const firstX = xForIndex(0);
  const lastX = xForIndex(entries.length - 1);

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      ${gridLines}
      ${entries.length > 1 ? `<polyline points="${points}" fill="none" stroke="#2584b8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />` : ""}
      ${circles}
      <text x="${firstX}" y="${height - 16}" text-anchor="${entries.length === 1 ? "middle" : "start"}" fill="#7a6b59" font-size="12" font-weight="700">${escapeHtml(formatWeightDate(first.dayKey))}</text>
      ${entries.length > 1 ? `<text x="${lastX}" y="${height - 16}" text-anchor="end" fill="#7a6b59" font-size="12" font-weight="700">${escapeHtml(formatWeightDate(last.dayKey))}</text>` : ""}
    </svg>`;
}

function renderWeightTracker() {
  const allEntries = getWeightEntries();
  const visibleEntries = getVisibleWeightEntries();
  const dateInput = $("weightDateInput");

  if (dateInput && !dateInput.value) dateInput.value = getTodayKey();

  document.querySelectorAll(".weight-range-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.weightRange === weightRange);
  });

  renderWeightChart(visibleEntries);
  renderWeightHistory(allEntries);

  const latestBadge = $("weightLatestBadge");
  const firstValue = $("weightFirstValue");
  const latestValue = $("weightLatestValue");
  const changeValue = $("weightChangeValue");

  if (!visibleEntries.length) {
    if (latestBadge) latestBadge.textContent = allEntries.length
      ? `${allEntries.at(-1).weight.toFixed(1)} lb latest`
      : "No entries";
    if (firstValue) firstValue.textContent = "—";
    if (latestValue) latestValue.textContent = "—";
    if (changeValue) changeValue.textContent = "—";
    return;
  }

  const first = visibleEntries[0];
  const latest = visibleEntries.at(-1);
  const change = Math.round((latest.weight - first.weight) * 10) / 10;

  if (latestBadge) latestBadge.textContent = `${latest.weight.toFixed(1)} lb latest`;
  if (firstValue) firstValue.textContent = `${first.weight.toFixed(1)} lb`;
  if (latestValue) latestValue.textContent = `${latest.weight.toFixed(1)} lb`;
  if (changeValue) changeValue.textContent = `${change > 0 ? "+" : ""}${change.toFixed(1)} lb`;
}

function renderAdmin() {
  const frequency = getTretinoinFrequency();
  const days = getTretinoinDays();
  const value = $("tretinoinFrequencyValue");
  const label = $("tretinoinFrequencyLabel");
  const dayList = $("tretinoinDaysList");
  const decrease = $("tretinoinFrequencyDown");
  const increase = $("tretinoinFrequencyUp");

  if (!value || !label || !dayList || !decrease || !increase) return;

  value.textContent = `${frequency}×`;
  label.textContent = frequency === 7
    ? "Every day"
    : `${frequency} days per week`;

  dayList.innerHTML = days
    .map(day => `<span class="tret-day-pill">${escapeHtml(day.slice(0, 3))}</span>`)
    .join("");

  decrease.disabled = frequency <= 1;
  increase.disabled = frequency >= 7;
}

function setTretinoinFrequency(nextFrequency) {
  const frequency = Math.max(1, Math.min(7, Math.round(Number(nextFrequency) || DEFAULT_TRETINOIN_FREQUENCY)));
  const todayKey = getTodayKey();
  const previousKey = formatDateKey(addDays(keyToLocalDate(todayKey), -1));
  const previousFrequency = getTretinoinFrequency(previousKey);

  if (!Array.isArray(state.meta.tretinoinScheduleChanges)) {
    state.meta.tretinoinScheduleChanges = [];
  }

  state.meta.tretinoinScheduleChanges = state.meta.tretinoinScheduleChanges
    .filter(change => change.effectiveDayKey !== todayKey);

  if (frequency !== previousFrequency) {
    state.meta.tretinoinScheduleChanges.push({
      effectiveDayKey: todayKey,
      frequency
    });
    state.meta.tretinoinScheduleChanges.sort((a, b) =>
      a.effectiveDayKey.localeCompare(b.effectiveDayKey)
    );
  }

  saveState();
  render();
  toast(`Tretinoin set to ${frequency === 7 ? "every day" : `${frequency} days per week`}.`);
}

function changeTretinoinFrequency(amount) {
  setTretinoinFrequency(getTretinoinFrequency() + amount);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2200);
}

function render() {
  renderedDayKey = getTodayKey();
  ensureDay();
  renderTaskLists();
  renderProgress();
  renderPhoneLock();
  renderDayStreak();
  renderLooks();
  renderWeightTracker();
  renderAdmin();
}

function showApp() {
  loginScreen.classList.add("hidden");
  mainApp.classList.remove("hidden");
  render();
}

function showLogin() {
  mainApp.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  setTimeout(() => passwordInput.focus(), 50);
}

async function unlock() {
  if (passwordInput.value.trim() !== PASSWORD) {
    loginError.textContent = "Wrong password.";
    passwordInput.select();
    return;
  }

  loginError.textContent = "";
  passwordInput.value = "";
  showApp();
  await loadSupabaseState();
}

function setupTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  const pages = [...document.querySelectorAll(".page")];

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(item => item.classList.remove("active"));
      pages.forEach(page => page.classList.remove("active"));
      tab.classList.add("active");
      $(tab.dataset.tab).classList.add("active");
      render();
    });
  });
}

unlockBtn.addEventListener("click", unlock);
passwordInput.addEventListener("keydown", event => {
  if (event.key === "Enter") unlock();
});
document.querySelectorAll("[data-water-add]").forEach(button => {
  button.addEventListener("click", () => {
    setWaterOz(ensureDay().waterOz + Number(button.dataset.waterAdd));
  });
});

$("resetWaterBtn").addEventListener("click", () => setWaterOz(0));

$("addCustomWaterBtn").addEventListener("click", () => {
  const amount = Number($("waterCustomInput").value);
  if (!Number.isFinite(amount) || amount <= 0) {
    $("waterCustomInput").focus();
    return;
  }

  setWaterOz(ensureDay().waterOz + amount);
  $("waterCustomInput").value = "";
});

$("waterCustomInput").addEventListener("keydown", event => {
  if (event.key === "Enter") $("addCustomWaterBtn").click();
});

$("workoutPrevBtn")?.addEventListener("click", () => shiftWorkoutDraft(-1));
$("workoutNextBtn")?.addEventListener("click", () => shiftWorkoutDraft(1));
$("setWorkoutBtn")?.addEventListener("click", setWorkoutRotationForToday);

$("tretinoinFrequencyDown")?.addEventListener("click", () => changeTretinoinFrequency(-1));
$("tretinoinFrequencyUp")?.addEventListener("click", () => changeTretinoinFrequency(1));

$("saveWeightBtn")?.addEventListener("click", saveWeightEntry);
$("weightValueInput")?.addEventListener("keydown", event => {
  if (event.key === "Enter") saveWeightEntry();
});
document.querySelectorAll(".weight-range-btn").forEach(button => {
  button.addEventListener("click", () => {
    weightRange = button.dataset.weightRange || "30";
    renderWeightTracker();
  });
});

document.addEventListener("click", event => {
  document.querySelectorAll("details.task-menu[open]").forEach(menu => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveSupabaseState();
  } else if (document.visibilityState === "visible") {
    refreshSupabaseState();
  }
});

window.addEventListener("focus", refreshSupabaseState);
window.addEventListener("online", async () => {
  await refreshSupabaseState();
  queueSupabaseSave();
});

setInterval(() => {
  if (
    getTodayKey() !== renderedDayKey &&
    !mainApp.classList.contains("hidden")
  ) {
    normalizeState();
    saveState();
    workoutDraftDirty = false;
    render();
  }
}, 60_000);

setupTabs();
if (normalizeState()) saveLocalState();
showLogin();
