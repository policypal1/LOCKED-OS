"use strict";

const PASSWORD = "2009";
const SUPABASE_URL = "https://qihajayxjukppcnsrgpi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NCPEc56HEwlcQroUnCtp2Q_Niz3sNH6";
const SUPABASE_ROW_ID = "samuel-main";
const SUPABASE_TABLE = "locked_os_state_v2";
const STORAGE_KEY = "locked_os_daily_checklist_v17";
const OLD_STORAGE_KEYS = [
  "locked_os_daily_checklist_v16",
  "locked_os_daily_checklist_v15",
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
const ROTATION_PREVIEW_DAYS = 14;

const WORKOUT_ROTATION_ANCHOR = "2026-07-25";
const WORKOUT_ROTATION = [
  "Chest + side delts",
  "Back + rear delts",
  "Arms",
  "Legs",
  "Abs"
];

const DEFAULT_TRETINOIN_FREQUENCY = 3; // Keep the original default for days before the new ramp.
const TRETINOIN_RAMP_START_DAY_KEY = "2026-09-21"; // First 0.05% night: Monday, September 21.
const TRETINOIN_SCHEDULES = {
  1: ["Monday"],
  2: ["Monday", "Friday"],
  3: ["Monday", "Wednesday", "Saturday"],
  4: ["Monday", "Wednesday", "Thursday", "Saturday"],
  5: ["Monday", "Wednesday", "Thursday", "Saturday", "Sunday"],
  6: ["Monday", "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday"],
  7: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
};

const SHAVE_DAYS = new Set(["Monday", "Thursday"]);
const MICRONEEDLE_DAYS = new Set(["Wednesday", "Sunday"]);
const MASSETER_DAYS = new Set(["Tuesday", "Thursday", "Saturday"]);
const SHEET_WASH_DAYS = new Set(["Wednesday", "Sunday"]);

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
const MORNING_TASK_IDS = TASKS.filter(task => task.section === "morning").map(task => task.id);
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const LEGACY_TASK_ID_MAP = {
  "bed-ready": "bed-ten",
  "plan-next-day": "bed-ten",
  "brush-lips": "lip-care",
  "vaseline-lips": "lip-care",
  "exfoliate-lips": "lip-care",
  "no-shampoo": "conditional-shampoo"
};

const $ = id => document.getElementById(id);
const loginScreen = $("loginScreen");
const mainApp = $("mainApp");
const passwordInput = $("passwordInput");
const unlockBtn = $("unlockBtn");
const loginError = $("loginError");
const syncStatus = $("syncStatus");

const hasSupabaseConfig =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PASTE_") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");

const supabaseClient = hasSupabaseConfig && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

let state = loadLocalState();
let saveTimer = null;
let realtimeChannel = null;
let toastTimer = null;
let renderedDayKey = getTodayKey();
let workoutDraftIndex = null;
let workoutDraftDirty = false;
let weightRange = "30";
let glucoseRange = "30";
let localRevision = 0;
let syncedRevision = 0;
let supabaseSaveInFlight = false;
let supabaseSaveQueued = false;
let latestSupabaseWriteAt = "";
let interactionRenderTimer = null;
const MK_CYCLE_WEEKS = 8;
const MK_CYCLE_DAYS = MK_CYCLE_WEEKS * 7;
const MK_SCHEDULED_DAYS = new Set([1, 2, 3, 4, 5]);

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getTodayKey(date = new Date()) {
  const effectiveDate = new Date(date);
  if (effectiveDate.getHours() < DAY_ROLLOVER_HOUR) effectiveDate.setDate(effectiveDate.getDate() - 1);
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
  const daysFromAnchor = keyToUtcDayNumber(dayKey) - keyToUtcDayNumber(WORKOUT_ROTATION_ANCHOR);
  return ((daysFromAnchor % WORKOUT_ROTATION.length) + WORKOUT_ROTATION.length) % WORKOUT_ROTATION.length;
}

function getWorkoutIndex(dayKey = getTodayKey()) {
  const anchorKey = state?.meta?.workoutRotationAnchorKey;
  const anchorIndex = state?.meta?.workoutRotationAnchorIndex;

  if (!isDateKey(anchorKey) || !Number.isInteger(anchorIndex)) return getDefaultWorkoutIndex(dayKey);

  const daysFromAnchor = keyToUtcDayNumber(dayKey) - keyToUtcDayNumber(anchorKey);
  const index = anchorIndex + daysFromAnchor;
  return ((index % WORKOUT_ROTATION.length) + WORKOUT_ROTATION.length) % WORKOUT_ROTATION.length;
}

function formatWorkoutName(index) {
  return WORKOUT_ROTATION[index];
}

function getWorkoutName(dayKey = getTodayKey()) {
  return formatWorkoutName(getWorkoutIndex(dayKey));
}

function getTretinoinRampPhase(dayKey = getTodayKey()) {
  const elapsed = keyToUtcDayNumber(dayKey) - keyToUtcDayNumber(TRETINOIN_RAMP_START_DAY_KEY);
  if (elapsed < 0) return null;
  if (elapsed < 14) return { index: 0, label: "Weeks 1–2", frequency: 2 };
  if (elapsed < 28) return { index: 1, label: "Weeks 3–4", frequency: 3 };
  if (elapsed < 42) return { index: 2, label: "Weeks 5–6", frequency: 4, alternateNights: true };
  if (elapsed < 56) return { index: 3, label: "Weeks 7–8", frequency: 5 };
  // Nightly use is not automatic: the existing Admin + button can enable it if tolerated.
  return { index: 4, label: "After ~8 weeks", frequency: 5 };
}

function getTretinoinRampOverride(dayKey = getTodayKey()) {
  const override = state?.meta?.tretinoinRampOverride;
  return override && isDateKey(override.effectiveDayKey) &&
    override.effectiveDayKey >= TRETINOIN_RAMP_START_DAY_KEY &&
    override.effectiveDayKey <= dayKey &&
    Number.isInteger(override.frequency) && override.frequency >= 1 && override.frequency <= 7
    ? override : null;
}

function getTretinoinFrequency(dayKey = getTodayKey()) {
  const phase = getTretinoinRampPhase(dayKey);
  if (phase) return getTretinoinRampOverride(dayKey)?.frequency ?? phase.frequency;

  // Earlier days retain their original schedule and existing saved changes.
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
  const phase = getTretinoinRampPhase(dayKey);
  if (phase?.alternateNights && !getTretinoinRampOverride(dayKey)) {
    const elapsed = keyToUtcDayNumber(dayKey) - keyToUtcDayNumber(TRETINOIN_RAMP_START_DAY_KEY);
    // October 19 is an application night, followed by every other calendar night.
    return (elapsed - 28) % 2 === 0 ? [getRoutineDayName(dayKey)] : [];
  }
  return TRETINOIN_SCHEDULES[getTretinoinFrequency(dayKey)] || TRETINOIN_SCHEDULES[DEFAULT_TRETINOIN_FREQUENCY];
}

function makeMorning(dayName) {
  const tasks = [
    { id: "wake-water", title: "Wake up and chug 2 glasses of water immediately", meta: "morningWater" },
    { id: "lukewarm-shower", title: "Take a lukewarm shower" },
    { id: "conditional-shampoo", title: "Shampoo only if hair is dirty" },
    { id: "conditioner-soap", title: "Use conditioner and soap" }
  ];

  if (MASSETER_DAYS.has(dayName)) {
    tasks.push({ id: "masseter-training", title: "Train masseter muscles" });
  }

  tasks.push(
    { id: "cold-finish", title: "Finish the shower with cold water" },
    { id: "scrunch-hair", title: "Lightly scrunch hair with a towel" },
    { id: "face-rinse", title: "Wash face" },
    { id: "vitamin-c", title: "Apply vitamin C serum" },
    { id: "morning-moisturizer", title: "Apply moisturizer" },
    { id: "eyelash-serum", title: "Apply peptide eyelash growth serum" },
    { id: "morning-minoxidil", title: "Apply minoxidil to eyebrows" },
    { id: "sea-salt-spray", title: "Apply product/style hair" },
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

  if (SHEET_WASH_DAYS.has(dayName)) tasks.push({ id: "wash-bed-sheets", title: "Wash bed sheets" });

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

  if (SHAVE_DAYS.has(dayName)) tasks.push({ id: "shave-manage-brows", title: "Shave face and manage eyebrows" });
  if (MICRONEEDLE_DAYS.has(dayName)) tasks.push({ id: "microneedle-eyebrows", title: "Microneedling" });

  if (getTretinoinDays(dayKey).includes(dayName)) {
    tasks.push({ id: "tretinoin", title: "Apply tretinoin" });
  } else {
    tasks.push({ id: "azelaic-acid", title: "Apply azelaic acid" });
  }

  tasks.push(
    { id: "night-moisturizer", title: "Apply moisturizer" },
    { id: "night-eyelash-serum", title: "Apply peptide eyelash growth serum" },
    { id: "night-minoxidil", title: "Apply minoxidil to eyebrows" },
    { id: "night-teeth", title: "Floss and brush teeth" },
    {
      id: "lip-care",
      title: dayName === "Sunday"
        ? "Scrub/exfoliate lips and apply Vaseline"
        : "Brush lips and apply Vaseline"
    }
  );

  return tasks;
}

function getLooksTaskMeta() {
  const meta = state?.meta || {};
  return {
    customTasks: Array.isArray(meta.looksCustomTasks) ? meta.looksCustomTasks : [],
    deletedIds: new Set(Array.isArray(meta.looksDeletedTaskIds) ? meta.looksDeletedTaskIds : []),
    order: meta.looksTaskOrder && typeof meta.looksTaskOrder === "object" ? meta.looksTaskOrder : {}
  };
}

function applyLooksTaskCustomizations(section, baseTasks) {
  const { customTasks, deletedIds, order } = getLooksTaskMeta();
  const tasks = [
    ...baseTasks,
    ...customTasks
      .filter(task => task.section === section)
      .map(task => ({ ...task, custom: true }))
  ].filter(task => !deletedIds.has(task.id));

  const savedOrder = Array.isArray(order[section]) ? order[section] : [];
  if (!savedOrder.length) return tasks;

  const rank = new Map(savedOrder.map((id, index) => [id, index]));
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const aRank = rank.has(a.task.id) ? rank.get(a.task.id) : Number.MAX_SAFE_INTEGER;
      const bRank = rank.has(b.task.id) ? rank.get(b.task.id) : Number.MAX_SAFE_INTEGER;
      return aRank - bRank || a.index - b.index;
    })
    .map(item => item.task);
}

function getLooksRoutine(dayKey = getTodayKey()) {
  const dayName = getRoutineDayName(dayKey);
  return {
    morning: applyLooksTaskCustomizations("morning", makeMorning(dayName)),
    midday: applyLooksTaskCustomizations("midday", makeMidday(dayKey)),
    night: applyLooksTaskCustomizations("night", makeNight(dayName, dayKey))
  };
}

function getLooksTasks(dayKey = getTodayKey()) {
  const routine = getLooksRoutine(dayKey);
  return [...routine.morning, ...routine.midday, ...routine.night];
}

function getLooksTaskIds(dayKey = getTodayKey()) {
  return getLooksTasks(dayKey).map(task => task.id);
}

function getLooksTaskTitle(task) {
  const custom = state?.meta?.looksTaskEdits?.[task.id];
  return typeof custom === "string" && custom.trim() ? custom.trim() : task.title;
}

function normalizeTaskId(taskId) {
  return LEGACY_TASK_ID_MAP[taskId] || taskId;
}

function cleanList(values, allowedIds) {
  if (!Array.isArray(values)) return [];
  const allowed = new Set(allowedIds);
  return [...new Set(values.map(normalizeTaskId).filter(id => typeof id === "string" && allowed.has(id)))];
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


function createDefaultMk677State() {
  return {
    cycleStart: "",
    currentDoseMg: 12.5,
    monitoring: { date: "", weight: null, restingHr: null, notes: "" },
    logs: {},
    glucoseEntries: [],
    labs: [],
    thresholds: { fastingGlucoseMax: null, systolicMax: null, diastolicMax: null }
  };
}

function optionalNumber(value, min = -Infinity, max = Infinity) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function normalizeSeverity(value) {
  const number = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(3, number));
}

function normalizeGlucoseEntries(original) {
  const normalized = [];
  const addEntry = (raw, fallbackDayKey = "", fallbackId = "") => {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { glucose: raw };
    const dayKey = isDateKey(source.dayKey) ? source.dayKey : (isDateKey(fallbackDayKey) ? fallbackDayKey : "");
    const glucose = Number(source.glucose ?? source.value);
    if (!dayKey || !Number.isFinite(glucose) || glucose < 40 || glucose > 600) return;
    const time = /^\d{2}:\d{2}$/.test(String(source.time || "")) ? String(source.time) : "";
    const context = String(source.context || "").trim().slice(0, 40);
    const id = String(source.id || fallbackId || `glucose-${dayKey}-${time || "na"}-${normalized.length}`).slice(0, 120);
    normalized.push({ id, dayKey, glucose: Math.round(glucose), time, context });
  };

  if (Array.isArray(original)) {
    original.forEach((item, index) => addEntry(item, "", `glucose-entry-${index}`));
  } else if (original && typeof original === "object") {
    for (const [key, value] of Object.entries(original)) {
      addEntry(value, key, isDateKey(key) ? `legacy-${key}` : key);
    }
  }

  const seen = new Set();
  return normalized
    .filter(entry => {
      const signature = `${entry.id}|${entry.dayKey}|${entry.time}|${entry.glucose}|${entry.context}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}

function normalizeMk677Log(dayKey, original = {}) {
  const scheduled = isMkScheduledDay(dayKey);
  const allowedStatuses = new Set(["taken", "skipped", "off"]);
  const status = allowedStatuses.has(original.status) ? original.status : (scheduled ? "taken" : "off");
  return {
    status,
    doseMg: optionalNumber(original.doseMg, 0, 50),
    time: /^\d{2}:\d{2}$/.test(String(original.time || "")) ? String(original.time) : "",
    fastingGlucose: optionalNumber(original.fastingGlucose, 40, 600),
    weight: optionalNumber(original.weight, 50, 500),
    systolic: optionalNumber(original.systolic, 60, 260),
    diastolic: optionalNumber(original.diastolic, 30, 180),
    restingHr: optionalNumber(original.restingHr, 30, 220),
    swelling: normalizeSeverity(original.swelling),
    appetite: normalizeSeverity(original.appetite),
    fatigue: normalizeSeverity(original.fatigue),
    pain: normalizeSeverity(original.pain),
    tingling: normalizeSeverity(original.tingling),
    headacheVision: normalizeSeverity(original.headacheVision),
    notes: String(original.notes || "").slice(0, 500)
  };
}

function normalizeMk677State(original) {
  const base = createDefaultMk677State();
  if (!original || typeof original !== "object" || Array.isArray(original)) return base;
  const normalized = { ...base };
  normalized.cycleStart = isDateKey(original.cycleStart) ? original.cycleStart : "";
  normalized.currentDoseMg = [12.5, 25].includes(Number(original.currentDoseMg)) ? Number(original.currentDoseMg) : 12.5;
  normalized.monitoring = {
    date: isDateKey(original.monitoring?.date) ? original.monitoring.date : "",
    weight: optionalNumber(original.monitoring?.weight, 50, 500),
    restingHr: optionalNumber(original.monitoring?.restingHr, 30, 220),
    notes: String(original.monitoring?.notes || "").slice(0, 500)
  };
  normalized.logs = {};
  if (original.logs && typeof original.logs === "object" && !Array.isArray(original.logs)) {
    for (const [dayKey, log] of Object.entries(original.logs)) {
      if (isDateKey(dayKey)) normalized.logs[dayKey] = normalizeMk677Log(dayKey, log);
    }
  }
  normalized.glucoseEntries = normalizeGlucoseEntries(original.glucoseEntries);
  for (const [dayKey, log] of Object.entries(normalized.logs)) {
    if (Number.isFinite(log.fastingGlucose) && !normalized.glucoseEntries.some(entry => entry.dayKey === dayKey)) {
      normalized.glucoseEntries.push({
        id: `legacy-log-${dayKey}`,
        dayKey,
        glucose: Math.round(log.fastingGlucose),
        time: "",
        context: "Fasting"
      });
    }
  }
  normalized.glucoseEntries.sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  normalized.thresholds = {
    fastingGlucoseMax: optionalNumber(original.thresholds?.fastingGlucoseMax, 40, 600),
    systolicMax: optionalNumber(original.thresholds?.systolicMax, 60, 260),
    diastolicMax: optionalNumber(original.thresholds?.diastolicMax, 30, 180)
  };
  const labs = Array.isArray(original.labs) ? original.labs : [];
  normalized.labs = labs
    .filter(item => item && isDateKey(item.date))
    .map(item => ({
      id: String(item.id || `${item.date}-${Math.random().toString(36).slice(2, 8)}`),
      date: item.date,
      igf1: optionalNumber(item.igf1, 0),
      a1c: optionalNumber(item.a1c, 0, 30),
      glucose: optionalNumber(item.glucose, 0, 600),
      ast: optionalNumber(item.ast, 0, 5000),
      alt: optionalNumber(item.alt, 0, 5000),
      insulin: optionalNumber(item.insulin, 0, 5000),
      prolactin: optionalNumber(item.prolactin, 0, 5000),
      notes: String(item.notes || "").slice(0, 300)
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return normalized;
}

function isMkScheduledDay(dayKey = getTodayKey()) {
  return MK_SCHEDULED_DAYS.has(keyToLocalDate(dayKey).getDay());
}

function getMkCycleDay(dayKey = getTodayKey()) {
  const start = state?.mk677?.cycleStart;
  if (!isDateKey(start)) return null;
  const diff = keyToUtcDayNumber(dayKey) - keyToUtcDayNumber(start);
  if (diff < 0 || diff >= MK_CYCLE_DAYS) return null;
  return diff + 1;
}

function getMkCycleEndKey() {
  const start = state?.mk677?.cycleStart;
  if (!isDateKey(start)) return "";
  return formatDateKey(addDays(keyToLocalDate(start), MK_CYCLE_DAYS - 1));
}

function createEmptyState() {
  return {
    days: {},
    weights: {},
    mk677: createDefaultMk677State(),
    meta: {
      lastOpenedDayKey: null,
      tretinoinScheduleChanges: [],
      looksTaskEdits: {},
      looksCustomTasks: [],
      looksDeletedTaskIds: [],
      looksTaskOrder: { morning: [], midday: [], night: [] }
    },
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

  normalized.looksSkipped = normalized.looksSkipped.filter(id => !normalized.looksDone.includes(id));
  syncWaterTask(normalized, dayKey);
  normalized.completed = normalized.done.length === TASK_IDS.length;
  normalized.looksCompleted = getResolvedSet(normalized, "looks").size === allowedLooks.length;
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

function normalizeLooksTaskEdits(original) {
  const normalized = {};
  if (!original || typeof original !== "object" || Array.isArray(original)) return normalized;

  for (const [taskId, value] of Object.entries(original)) {
    const title = String(value ?? "").trim();
    if (taskId && title) normalized[taskId] = title.slice(0, 160);
  }
  return normalized;
}

function normalizeLooksCustomTasks(original) {
  if (!Array.isArray(original)) return [];
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
    normalized.push({ id, section, title, custom: true });
  }
  return normalized;
}

function normalizeLooksDeletedTaskIds(original) {
  if (!Array.isArray(original)) return [];
  return [...new Set(original.map(value => String(value || "").trim()).filter(Boolean))];
}

function normalizeLooksTaskOrder(original) {
  const normalized = { morning: [], midday: [], night: [] };
  if (!original || typeof original !== "object" || Array.isArray(original)) return normalized;
  for (const section of Object.keys(normalized)) {
    const ids = Array.isArray(original[section]) ? original[section] : [];
    normalized[section] = [...new Set(ids.map(value => String(value || "").trim()).filter(Boolean))];
  }
  return normalized;
}

function backfillMissingPastDays() {
  const todayKey = getTodayKey();
  const todayDate = keyToLocalDate(todayKey);
  const pastKeys = Object.keys(state.days).filter(key => isDateKey(key) && key < todayKey).sort();

  let anchorKey = state.meta.lastOpenedDayKey;
  if (!isDateKey(anchorKey) || anchorKey >= todayKey) anchorKey = pastKeys.at(-1) || null;

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
    state.meta = { lastOpenedDayKey: state.lastOpenedDayKey || null, tretinoinScheduleChanges: [], looksTaskEdits: {}, looksCustomTasks: [], looksDeletedTaskIds: [], looksTaskOrder: { morning: [], midday: [], night: [] } };
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

  const normalizedMk677 = normalizeMk677State(state.mk677);
  if (JSON.stringify(state.mk677 || {}) !== JSON.stringify(normalizedMk677)) {
    state.mk677 = normalizedMk677;
    changed = true;
  } else if (!state.mk677 || typeof state.mk677 !== "object" || Array.isArray(state.mk677)) {
    state.mk677 = normalizedMk677;
    changed = true;
  }

  const originalTretChanges = Array.isArray(state.meta.tretinoinScheduleChanges)
    ? state.meta.tretinoinScheduleChanges
    : [];
  const tretByDay = new Map();
  for (const change of originalTretChanges) {
    if (
      change && isDateKey(change.effectiveDayKey) && Number.isInteger(change.frequency) &&
      change.frequency >= 1 && change.frequency <= 7
    ) {
      tretByDay.set(change.effectiveDayKey, {
        effectiveDayKey: change.effectiveDayKey,
        frequency: change.frequency
      });
    }
  }
  const normalizedTretChanges = [...tretByDay.values()].sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));
  if (JSON.stringify(originalTretChanges) !== JSON.stringify(normalizedTretChanges)) {
    state.meta.tretinoinScheduleChanges = normalizedTretChanges;
    changed = true;
  } else if (!Array.isArray(state.meta.tretinoinScheduleChanges)) {
    state.meta.tretinoinScheduleChanges = [];
    changed = true;
  }

  // Tretinoin schedule migration: Monday 2026-09-21 was the most recent application.
  // Keep the older every-other-day patch from overriding the current 2x/week ramp.
  if (state.meta.tretinoinEveryOtherDayV1?.enabled) {
    state.meta.tretinoinEveryOtherDayV1 = {
      ...state.meta.tretinoinEveryOtherDayV1,
      enabled: false
    };
    changed = true;
  }

  const tretStartDay = ensureDay("2026-09-21");
  if (!tretStartDay.looksDone.includes("tretinoin")) {
    tretStartDay.looksDone.push("tretinoin");
    tretStartDay.looksSkipped = tretStartDay.looksSkipped.filter(id => id !== "tretinoin");
    changed = true;
  }

  const normalizedEdits = normalizeLooksTaskEdits(state.meta.looksTaskEdits);
  if (JSON.stringify(state.meta.looksTaskEdits || {}) !== JSON.stringify(normalizedEdits)) {
    state.meta.looksTaskEdits = normalizedEdits;
    changed = true;
  } else if (!state.meta.looksTaskEdits || typeof state.meta.looksTaskEdits !== "object") {
    state.meta.looksTaskEdits = {};
    changed = true;
  }

  const normalizedCustomTasks = normalizeLooksCustomTasks(state.meta.looksCustomTasks);
  if (JSON.stringify(state.meta.looksCustomTasks || []) !== JSON.stringify(normalizedCustomTasks)) {
    state.meta.looksCustomTasks = normalizedCustomTasks;
    changed = true;
  } else if (!Array.isArray(state.meta.looksCustomTasks)) {
    state.meta.looksCustomTasks = [];
    changed = true;
  }

  const normalizedDeletedTaskIds = normalizeLooksDeletedTaskIds(state.meta.looksDeletedTaskIds);
  if (JSON.stringify(state.meta.looksDeletedTaskIds || []) !== JSON.stringify(normalizedDeletedTaskIds)) {
    state.meta.looksDeletedTaskIds = normalizedDeletedTaskIds;
    changed = true;
  } else if (!Array.isArray(state.meta.looksDeletedTaskIds)) {
    state.meta.looksDeletedTaskIds = [];
    changed = true;
  }

  const normalizedTaskOrder = normalizeLooksTaskOrder(state.meta.looksTaskOrder);
  if (JSON.stringify(state.meta.looksTaskOrder || {}) !== JSON.stringify(normalizedTaskOrder)) {
    state.meta.looksTaskOrder = normalizedTaskOrder;
    changed = true;
  } else if (!state.meta.looksTaskOrder || typeof state.meta.looksTaskOrder !== "object") {
    state.meta.looksTaskOrder = normalizedTaskOrder;
    changed = true;
  }

  if (!state.adminOverrides || typeof state.adminOverrides !== "object") {
    state.adminOverrides = {};
    changed = true;
  }

  if (state.meta.workoutRotationAnchorIndex !== undefined && !Number.isInteger(state.meta.workoutRotationAnchorIndex)) {
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
  if (!state.days[dayKey]) state.days[dayKey] = createDayRecord();
  state.days[dayKey] = normalizeDay(dayKey, state.days[dayKey]);
  return state.days[dayKey];
}

function hasMeaningfulState(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (snapshot.weights && Object.keys(snapshot.weights).length > 0) return true;
  if (snapshot.mk677 && (
    snapshot.mk677.cycleStart ||
    Number(snapshot.mk677.currentDoseMg) !== 12.5 ||
    Object.keys(snapshot.mk677.logs || {}).length > 0 ||
    Object.keys(snapshot.mk677.glucoseEntries || {}).length > 0 ||
    (Array.isArray(snapshot.mk677.labs) && snapshot.mk677.labs.length > 0) ||
    Object.values(snapshot.mk677.thresholds || {}).some(value => value !== null && value !== "")
  )) return true;
  if (Array.isArray(snapshot.meta?.tretinoinScheduleChanges) && snapshot.meta.tretinoinScheduleChanges.length > 0) return true;
  if (snapshot.meta?.tretinoinRampOverride) return true;
  if (snapshot.meta?.looksTaskEdits && Object.keys(snapshot.meta.looksTaskEdits).length > 0) return true;
  if (Array.isArray(snapshot.meta?.looksCustomTasks) && snapshot.meta.looksCustomTasks.length > 0) return true;
  if (Array.isArray(snapshot.meta?.looksDeletedTaskIds) && snapshot.meta.looksDeletedTaskIds.length > 0) return true;
  if (snapshot.meta?.looksTaskOrder && Object.values(snapshot.meta.looksTaskOrder).some(value => Array.isArray(value) && value.length > 0)) return true;
  if (Number.isInteger(snapshot.meta?.workoutRotationAnchorIndex)) return true;

  return Object.values(snapshot.days || {}).some(day => {
    if (!day || typeof day !== "object") return false;
    return (
      (Array.isArray(day.done) && day.done.length > 0) ||
      (Array.isArray(day.looksDone) && day.looksDone.length > 0) ||
      (Array.isArray(day.looksSkipped) && day.looksSkipped.length > 0) ||
      Number(day.waterOz) > 0 || day.completed === true || day.looksCompleted === true || Boolean(day.missedReason)
    );
  });
}

function hasPendingLocalChanges() {
  return Boolean(saveTimer || supabaseSaveInFlight || localRevision > syncedRevision);
}

function applyRemoteState(remoteState, statusMessage = "Updated from Supabase.", { force = false, updatedAt = "" } = {}) {
  if (!remoteState || typeof remoteState !== "object") return false;
  if (!force && updatedAt && latestSupabaseWriteAt && updatedAt < latestSupabaseWriteAt) return false;
  if (!force && hasPendingLocalChanges()) {
    if (syncStatus) syncStatus.textContent = "Saving local changes…";
    return false;
  }
  state = remoteState;
  const normalizedRemote = normalizeState();
  saveLocalState();
  localRevision = normalizedRemote ? 1 : 0;
  syncedRevision = 0;
  if (updatedAt) latestSupabaseWriteAt = updatedAt;
  if (normalizedRemote) queueSupabaseSave(0);
  if (!mainApp.classList.contains("hidden")) render();
  if (syncStatus) syncStatus.textContent = normalizedRemote ? "Updating Supabase with normalized data…" : statusMessage;
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
      { event: "UPDATE", schema: "public", table: SUPABASE_TABLE, filter: `id=eq.${SUPABASE_ROW_ID}` },
      payload => {
        const remoteState = payload?.new?.state;
        if (!remoteState || typeof remoteState !== "object") return;
        if (hasPendingLocalChanges()) return;
        const updatedAt = payload?.new?.updated_at || "";
        applyRemoteState(remoteState, "Updated live from Supabase.", { updatedAt });
      }
    )
    .subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        if (syncStatus && !syncStatus.textContent.includes("Saving")) syncStatus.textContent = "Live sync connected.";
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Supabase Realtime error:", error);
        if (syncStatus) syncStatus.textContent = "Saved with Supabase. Live updates are reconnecting…";
      }
    });
}

function saveState() {
  localRevision += 1;
  saveLocalState();
  queueSupabaseSave();
}

function queueSupabaseSave(delay = 180) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSupabaseState();
  }, delay);
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

    if (remoteHasData || !localHasData) {
      applyRemoteState(remoteRow.state, "Synced with Supabase.", { force: true, updatedAt: remoteRow.updated_at || "" });
    } else {
      state = localBeforeLoad;
      normalizeState();
      saveLocalState();
      localRevision += 1;
      await saveSupabaseState();
      syncStatus.textContent = "Restored local data to Supabase.";
    }
  } else {
    localRevision += 1;
    await saveSupabaseState();
  }
  subscribeToSupabaseState();
}

async function refreshSupabaseState() {
  if (!supabaseClient || mainApp.classList.contains("hidden") || hasPendingLocalChanges()) return;
  const remoteRow = await fetchSupabaseState({ silent: true });
  if (hasPendingLocalChanges()) return;
  if (remoteRow?.state && typeof remoteRow.state === "object") {
    applyRemoteState(remoteRow.state, "Synced with Supabase.", { updatedAt: remoteRow.updated_at || "" });
  }
}

async function saveSupabaseState() {
  if (!supabaseClient) {
    syncStatus.textContent = "Saved locally. Supabase is not connected.";
    syncedRevision = localRevision;
    return false;
  }

  if (supabaseSaveInFlight) {
    supabaseSaveQueued = true;
    return false;
  }

  supabaseSaveInFlight = true;
  supabaseSaveQueued = false;
  const revisionToSave = localRevision;
  const snapshot = JSON.parse(JSON.stringify(state));
  const writeTimestamp = new Date().toISOString();
  let saveSucceeded = false;
  syncStatus.textContent = "Saving…";

  try {
    const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert({
      id: SUPABASE_ROW_ID,
      state: snapshot,
      updated_at: writeTimestamp
    });

    if (error) {
      console.error(error);
      syncStatus.textContent = "Supabase save failed. Saved locally only.";
      return false;
    }

    syncedRevision = Math.max(syncedRevision, revisionToSave);
    latestSupabaseWriteAt = writeTimestamp;
    saveSucceeded = true;
    syncStatus.textContent = localRevision > syncedRevision ? "Saving newer changes…" : "Saved to Supabase.";
    return true;
  } finally {
    supabaseSaveInFlight = false;
    // Only chain another write after a successful save. If Supabase is offline,
    // keep the newer local state dirty and let the next edit/online event retry it.
    if (saveSucceeded && (supabaseSaveQueued || localRevision > syncedRevision)) queueSupabaseSave(0);
  }
}

function calculateStreak(completedField) {
  let date = keyToLocalDate(getTodayKey());
  let streak = 0;
  if (state.days[getTodayKey()]?.[completedField] !== true) date = addDays(date, -1);

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

function refreshLooksTaskRow(taskId) {
  const day = ensureDay();
  const done = new Set(day.looksDone);
  const skipped = new Set(day.looksSkipped);
  document.querySelectorAll(".looks-task").forEach(row => {
    if (row.dataset.taskId !== taskId) return;
    const isDone = done.has(taskId);
    const isSkipped = skipped.has(taskId);
    row.classList.toggle("done", isDone);
    row.classList.toggle("skipped", isSkipped);
    const box = row.querySelector(".task-box");
    if (box) box.textContent = isDone ? "✓" : isSkipped ? "−" : "";
    const copy = row.querySelector(".task-copy");
    if (copy) {
      let status = copy.querySelector(".task-status");
      if (isSkipped && !status) {
        status = document.createElement("div");
        status.className = "task-status";
        copy.appendChild(status);
      }
      if (status) {
        status.textContent = isSkipped ? "Skipped today" : "";
        status.hidden = !isSkipped;
      }
    }
  });
}

function refreshLooksProgressUI() {
  const key = getTodayKey();
  const day = ensureDay(key);
  const total = getLooksTaskIds(key).length;
  const done = day.looksDone.length;
  const skipped = day.looksSkipped.length;
  const resolved = done + skipped;
  const left = total - resolved;
  const percent = total ? Math.round((resolved / total) * 100) : 0;
  $("looksPercent").textContent = `${percent}%`;
  $("looksDoneCount").textContent = skipped ? `${done} done • ${skipped} skipped` : `${done} / ${total}`;
  $("looksTasksLeft").textContent = left === 0
    ? "Looksmaxxing routine resolved. Its separate streak updated."
    : `${left} looks task${left === 1 ? "" : "s"} left today.`;
  $("looksProgressCircle").style.background = `conic-gradient(var(--blue) ${total ? Math.round((resolved / total) * 360) : 0}deg, rgba(42,30,18,.09) 0deg)`;
}

function scheduleInteractionRender() {
  clearTimeout(interactionRenderTimer);
  interactionRenderTimer = setTimeout(() => {
    interactionRenderTimer = null;
    if (!mainApp.classList.contains("hidden")) render();
  }, 420);
}

function setLooksStatus(task, status) {
  const day = ensureDay();
  const done = new Set(day.looksDone);
  const skipped = new Set(day.looksSkipped);

  if (status === "done") {
    if (done.has(task.id)) done.delete(task.id);
    else {
      done.add(task.id);
      skipped.delete(task.id);
    }
  } else if (status === "skipped") {
    if (skipped.has(task.id)) skipped.delete(task.id);
    else {
      skipped.add(task.id);
      done.delete(task.id);
    }
  }

  if (task.meta === "morningWater" && status === "done" && done.has(task.id) && day.waterOz < LOOKS_MORNING_WATER_OZ) {
    day.waterOz = LOOKS_MORNING_WATER_OZ;
  }

  day.looksDone = [...done];
  day.looksSkipped = [...skipped];
  syncWaterTask(day, getTodayKey());
  day.looksCompleted = getResolvedSet(day, "looks").size === getLooksTaskIds().length;
  saveState();
  refreshLooksTaskRow(task.id);
  if (task.meta === "morningWater") refreshLooksTaskRow("water-through-day");
  refreshLooksProgressUI();
  renderDayStreak();
  renderWater();
  scheduleInteractionRender();
}

function saveLooksTaskEdit(task, nextTitle) {
  state.meta = state.meta || {};
  state.meta.looksTaskEdits = state.meta.looksTaskEdits || {};
  const cleaned = String(nextTitle ?? "").trim().slice(0, 160);

  if (!cleaned || cleaned === task.title) {
    delete state.meta.looksTaskEdits[task.id];
    toast("Task name reset.");
  } else {
    state.meta.looksTaskEdits[task.id] = cleaned;
    toast("Task updated.");
  }

  saveState();
  render();
}

function ensureLooksTaskCustomizationState() {
  state.meta = state.meta || {};
  state.meta.looksTaskEdits = state.meta.looksTaskEdits || {};
  state.meta.looksCustomTasks = Array.isArray(state.meta.looksCustomTasks) ? state.meta.looksCustomTasks : [];
  state.meta.looksDeletedTaskIds = Array.isArray(state.meta.looksDeletedTaskIds) ? state.meta.looksDeletedTaskIds : [];
  state.meta.looksTaskOrder = state.meta.looksTaskOrder && typeof state.meta.looksTaskOrder === "object"
    ? state.meta.looksTaskOrder
    : { morning: [], midday: [], night: [] };
}

function makeCustomLooksTaskId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function addLooksTask(section, title, afterTaskId = null) {
  const cleaned = String(title || "").trim().slice(0, 160);
  if (!cleaned) return;
  ensureLooksTaskCustomizationState();

  const task = { id: makeCustomLooksTaskId(), section, title: cleaned, custom: true };
  state.meta.looksCustomTasks.push(task);

  const currentIds = getLooksRoutine(getTodayKey())[section].map(item => item.id).filter(id => id !== task.id);
  const insertAt = afterTaskId ? currentIds.indexOf(afterTaskId) + 1 : currentIds.length;
  currentIds.splice(Math.max(0, insertAt), 0, task.id);
  state.meta.looksTaskOrder[section] = currentIds;

  saveState();
  render();
  toast("Task added.");
}

function deleteLooksTask(task, section) {
  ensureLooksTaskCustomizationState();

  if (task.custom || String(task.id).startsWith("custom-")) {
    state.meta.looksCustomTasks = state.meta.looksCustomTasks.filter(item => item.id !== task.id);
  } else if (!state.meta.looksDeletedTaskIds.includes(task.id)) {
    state.meta.looksDeletedTaskIds.push(task.id);
  }

  delete state.meta.looksTaskEdits[task.id];
  for (const key of ["morning", "midday", "night"]) {
    const order = Array.isArray(state.meta.looksTaskOrder[key]) ? state.meta.looksTaskOrder[key] : [];
    state.meta.looksTaskOrder[key] = order.filter(id => id !== task.id);
  }

  for (const day of Object.values(state.days || {})) {
    if (!day || typeof day !== "object") continue;
    day.looksDone = (day.looksDone || []).filter(id => id !== task.id);
    day.looksSkipped = (day.looksSkipped || []).filter(id => id !== task.id);
  }

  const today = ensureDay();
  today.looksCompleted = getResolvedSet(today, "looks").size === getLooksTaskIds().length;
  saveState();
  render();
  toast("Task deleted.");
}

function saveLooksTaskOrder(section, orderedIds) {
  ensureLooksTaskCustomizationState();
  state.meta.looksTaskOrder[section] = [...new Set(orderedIds.filter(Boolean))];
  saveState();
}

function startInlineTaskEdit(row, main, menu, task, onEdit) {
  if (row.classList.contains("editing")) return;
  row.classList.add("editing");
  const wasDraggable = row.draggable;
  row.draggable = false;

  const editor = document.createElement("div");
  editor.className = "task-inline-editor";

  const field = document.createElement("div");
  field.className = "task-inline-field";

  const label = document.createElement("label");
  label.textContent = "Edit task name";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "task-inline-input";
  input.maxLength = 160;
  input.value = task.title;
  input.setAttribute("aria-label", `Edit ${task.title}`);

  field.append(label, input);

  const actions = document.createElement("div");
  actions.className = "task-inline-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "btn blue compact task-edit-save";
  saveButton.textContent = "Save";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "btn secondary compact";
  cancelButton.textContent = "Cancel";

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "task-edit-reset";
  resetButton.textContent = "Reset default";
  resetButton.hidden = !task.defaultTitle || task.title === task.defaultTitle;

  const closeEditor = () => {
    row.classList.remove("editing");
    row.draggable = wasDraggable;
    editor.remove();
  };

  const saveEditor = () => {
    const cleaned = input.value.trim();
    if (!cleaned) {
      input.focus();
      toast("Enter a task name or use Reset default.");
      return;
    }
    onEdit(cleaned);
  };

  saveButton.addEventListener("click", saveEditor);
  cancelButton.addEventListener("click", closeEditor);
  resetButton.addEventListener("click", () => onEdit(task.defaultTitle || task.title));
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveEditor();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeEditor();
    }
  });

  actions.append(saveButton, cancelButton, resetButton);
  editor.append(field, actions);
  row.appendChild(editor);

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function startInlineTaskAdd(row, menu, section, afterTaskId, onAdd) {
  if (row.classList.contains("editing") || row.classList.contains("adding")) return;
  row.classList.add("adding");
  row.draggable = false;

  const editor = document.createElement("div");
  editor.className = "task-inline-editor task-inline-add";

  const field = document.createElement("div");
  field.className = "task-inline-field";
  const label = document.createElement("label");
  label.textContent = "New task name";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "task-inline-input";
  input.maxLength = 160;
  input.placeholder = "Enter a new task";
  input.setAttribute("aria-label", "New task name");
  field.append(label, input);

  const actions = document.createElement("div");
  actions.className = "task-inline-actions";
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "btn blue compact task-edit-save";
  saveButton.textContent = "Add task";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "btn secondary compact";
  cancelButton.textContent = "Cancel";

  const close = () => {
    row.classList.remove("adding");
    row.draggable = true;
    editor.remove();
  };
  const save = () => {
    const cleaned = input.value.trim();
    if (!cleaned) { input.focus(); return; }
    onAdd(section, cleaned, afterTaskId);
  };

  saveButton.addEventListener("click", save);
  cancelButton.addEventListener("click", close);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); save(); }
    if (event.key === "Escape") { event.preventDefault(); close(); }
  });
  actions.append(saveButton, cancelButton);
  editor.append(field, actions);
  row.appendChild(editor);
  menu.open = false;
  requestAnimationFrame(() => input.focus());
}

function createTaskRow(task, done, skipped, theme, onToggle, onSkip, onEdit, controls = {}) {
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

  if (typeof onSkip === "function" || typeof onEdit === "function" || typeof controls.onAdd === "function" || typeof controls.onDelete === "function") {
    const menu = document.createElement("details");
    menu.className = "task-menu";

    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", `Options for ${task.title}`);
    summary.textContent = "⋯";

    const popover = document.createElement("div");
    popover.className = "task-menu-popover";

    if (typeof onSkip === "function") {
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
    }

    if (typeof onEdit === "function") {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "task-menu-action edit-action";
      editButton.textContent = "Edit task";
      editButton.addEventListener("click", event => {
        event.stopPropagation();
        menu.open = false;
        startInlineTaskEdit(row, main, menu, task, onEdit);
      });
      popover.appendChild(editButton);
    }

    if (typeof controls.onAdd === "function") {
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "task-menu-action add-action";
      addButton.textContent = "Add new task";
      addButton.addEventListener("click", event => {
        event.stopPropagation();
        startInlineTaskAdd(row, menu, controls.section, task.id, controls.onAdd);
      });
      popover.appendChild(addButton);
    }

    if (typeof controls.onDelete === "function") {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "task-menu-action delete-action";
      deleteButton.textContent = "Delete task";
      deleteButton.addEventListener("click", event => {
        event.stopPropagation();
        menu.open = false;
        if (window.confirm(`Delete “${task.title}”?`)) controls.onDelete(task, controls.section);
      });
      popover.appendChild(deleteButton);
    }

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
    const row = createTaskRow(task, done.has(task.id), false, "", () => toggleMainTask(task.id));
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
  $("progressCircle").style.background = `conic-gradient(var(--green) ${Math.round((done / total) * 360)}deg, rgba(42,30,18,.09) 0deg)`;
}

function renderPhoneLock() {
  const done = new Set(ensureDay().done);
  const remaining = MORNING_TASK_IDS.filter(id => !done.has(id)).length;
  const complete = remaining === 0;

  $("phoneLockCard").classList.toggle("locked", !complete);
  $("phoneLockCard").classList.toggle("unlocked", complete);
  $("phoneLockTitle").textContent = complete ? "Phone unlocked" : "Phone locked";
  $("phoneLockText").textContent = complete ? "Morning list is complete." : `${remaining} morning task${remaining === 1 ? "" : "s"} left.`;
  $("phoneLockBadge").textContent = complete ? "Unlocked" : "Locked";
}

function renderDayStreak() {
  const streak = getDisplayedCurrentStreak();
  const looksStreak = calculateLooksStreak();
  $("dayStreakNumber").textContent = streak;
  $("dayStreakLabel").textContent = streak === 1 ? "day" : "days";
  $("looksStreak").textContent = looksStreak;
}

function renderLooksTaskList(element, tasks, day, section) {
  element.innerHTML = "";
  const done = new Set(day.looksDone);
  const skipped = new Set(day.looksSkipped);

  for (const task of tasks) {
    const displayTask = { ...task, title: getLooksTaskTitle(task), defaultTitle: task.title };
    const toggle = () => {
      if (task.meta === "waterTracked") {
        $("waterCard").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      setLooksStatus(task, "done");
    };

    const row = createTaskRow(
      displayTask,
      done.has(task.id),
      skipped.has(task.id),
      "looks-task",
      toggle,
      () => setLooksStatus(task, "skipped"),
      nextTitle => saveLooksTaskEdit(task, nextTitle),
      { section, onAdd: addLooksTask, onDelete: deleteLooksTask }
    );

    row.dataset.taskId = task.id;
    row.draggable = true;
    row.setAttribute("aria-grabbed", "false");
    row.addEventListener("dragstart", event => {
      if (row.classList.contains("editing") || row.classList.contains("adding")) {
        event.preventDefault();
        return;
      }
      row.classList.add("dragging");
      row.setAttribute("aria-grabbed", "true");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      row.setAttribute("aria-grabbed", "false");
      element.querySelectorAll(".task-row").forEach(item => item.classList.remove("drag-over"));
    });

    element.appendChild(row);
  }

  element.ondragover = event => {
    event.preventDefault();
    const dragging = element.querySelector(".task-row.dragging");
    if (!dragging) return;
    const rows = [...element.querySelectorAll(".task-row:not(.dragging)")];
    const next = rows.find(row => {
      const rect = row.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    if (next) element.insertBefore(dragging, next);
    else element.appendChild(dragging);
  };

  element.ondrop = event => {
    event.preventDefault();
    const orderedIds = [...element.querySelectorAll(".task-row")].map(row => row.dataset.taskId).filter(Boolean);
    saveLooksTaskOrder(section, orderedIds);
    toast("Task order saved.");
  };
}

function renderWorkoutPicker() {
  const key = getTodayKey();
  const currentIndex = getWorkoutIndex(key);
  if (!workoutDraftDirty || !Number.isInteger(workoutDraftIndex)) workoutDraftIndex = currentIndex;

  const previewName = $("workoutPreviewName");
  const status = $("workoutRotationStatus");

  if (previewName) previewName.textContent = formatWorkoutName(workoutDraftIndex);
  if (status) {
    status.textContent = workoutDraftIndex === currentIndex
      ? "This is the workout currently set for today."
      : "Previewing a different point in the rotation. Hit Set to use it.";
  }
}

function shiftWorkoutDraft(amount) {
  const current = Number.isInteger(workoutDraftIndex) ? workoutDraftIndex : getWorkoutIndex(getTodayKey());
  workoutDraftIndex = ((current + amount) % WORKOUT_ROTATION.length + WORKOUT_ROTATION.length) % WORKOUT_ROTATION.length;
  workoutDraftDirty = true;
  renderWorkoutPicker();
}

function setWorkoutRotationForToday() {
  if (!Number.isInteger(workoutDraftIndex)) workoutDraftIndex = getWorkoutIndex(getTodayKey());
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
  $("looksDateText").textContent = `${dayName}, ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;

  renderLooksTaskList($("looksMorningList"), routine.morning, day, "morning");
  renderLooksTaskList($("looksMiddayList"), routine.midday, day, "midday");
  renderLooksTaskList($("looksNightList"), routine.night, day, "night");

  const total = getLooksTaskIds(key).length;
  const done = day.looksDone.length;
  const skipped = day.looksSkipped.length;
  const resolved = done + skipped;
  const left = total - resolved;
  const percent = total ? Math.round((resolved / total) * 100) : 0;

  $("looksPercent").textContent = `${percent}%`;
  $("looksDoneCount").textContent = skipped ? `${done} done • ${skipped} skipped` : `${done} / ${total}`;
  $("looksTasksLeft").textContent = left === 0
    ? "Looksmaxxing routine resolved. Its separate streak updated."
    : `${left} looks task${left === 1 ? "" : "s"} left today.`;
  $("looksProgressCircle").style.background = `conic-gradient(var(--blue) ${total ? Math.round((resolved / total) * 360) : 0}deg, rgba(42,30,18,.09) 0deg)`;
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
  if (waterOz < WATER_MINIMUM_OZ) $("waterStatus").textContent = `${WATER_MINIMUM_OZ - waterOz} oz until the daily minimum.`;
  else if (waterOz < WATER_TARGET_OZ) $("waterStatus").textContent = `Minimum hit. ${WATER_TARGET_OZ - waterOz} oz until target.`;
  else $("waterStatus").textContent = waterOz === WATER_TARGET_OZ ? `${WATER_TARGET_OZ} oz target complete.` : `${waterOz - WATER_TARGET_OZ} oz above target.`;
}

function setWaterOz(value) {
  const day = ensureDay();
  day.waterOz = Math.max(0, Math.min(WATER_MAX_OZ, Math.round(Number(value) || 0)));
  syncWaterTask(day, getTodayKey());
  day.looksCompleted = getResolvedSet(day, "looks").size === getLooksTaskIds().length;
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
  const cutoffKey = formatDateKey(addDays(keyToLocalDate(getTodayKey()), -(days - 1)));
  return entries.filter(entry => entry.dayKey >= cutoffKey);
}

function formatWeightDate(dayKey, options = {}) {
  return keyToLocalDate(dayKey).toLocaleDateString(undefined, { month: "short", day: "numeric", ...options });
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
  if (!Object.prototype.hasOwnProperty.call(state.weights || {}, dayKey)) return;
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

function buildSmoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    d += ` C ${midX} ${current.y}, ${midX} ${next.y}, ${next.x} ${next.y}`;
  }
  return d;
}

function renderMetricChart({ chartId, entries, valueKey, unit, decimals = 1, emptyText = "No entries in this time range yet.", tooltipDetail = null }) {
  const chart = $(chartId);
  if (!chart) return;
  chart.innerHTML = "";

  if (!entries.length) {
    chart.innerHTML = `<div class="weight-chart-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  const width = 1100;
  const height = 460;
  const padding = { top: 34, right: 34, bottom: 60, left: 74 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = entries.map(entry => Number(entry[valueKey])).filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = rawMax - rawMin;
  const pad = spread === 0 ? Math.max(2, Math.abs(rawMax) * .015) : Math.max(1, spread * .22);
  const stepBase = decimals === 0 ? 1 : .5;
  const minValue = Math.floor((rawMin - pad) / stepBase) * stepBase;
  const maxValue = Math.ceil((rawMax + pad) / stepBase) * stepBase;
  const valueSpan = Math.max(stepBase, maxValue - minValue);
  const timeValue = entry => {
    let value = keyToUtcDayNumber(entry.dayKey);
    const match = /^(\d{2}):(\d{2})$/.exec(String(entry.time || ""));
    if (match) value += (Number(match[1]) * 60 + Number(match[2])) / 1440;
    return value;
  };
  const firstTime = timeValue(entries[0]);
  const lastTime = timeValue(entries.at(-1));
  const timeSpan = Math.max(1 / 1440, lastTime - firstTime);

  const xForEntry = (entry, index) => entries.length === 1
    ? padding.left + plotWidth / 2
    : padding.left + ((timeValue(entry) - firstTime) / timeSpan) * plotWidth;
  const yForValue = value => padding.top + ((maxValue - value) / valueSpan) * plotHeight;
  const points = entries.map((entry, index) => ({
    x: xForEntry(entry, index),
    y: yForValue(entry[valueKey]),
    entry
  }));

  const yGrid = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const y = padding.top + ratio * plotHeight;
    const value = maxValue - ratio * valueSpan;
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="metric-grid-line" />
      <text x="${padding.left - 12}" y="${y + 5}" text-anchor="end" class="metric-axis-label">${value.toFixed(decimals)}</text>`;
  }).join("");

  const xTickCount = Math.min(6, entries.length);
  const xTickIndexes = [...new Set(Array.from({ length: xTickCount }, (_, i) => Math.round(i * (entries.length - 1) / Math.max(1, xTickCount - 1))))];
  const xLabels = xTickIndexes.map(index => {
    const point = points[index];
    const anchor = index === 0 ? "start" : index === entries.length - 1 ? "end" : "middle";
    return `<text x="${point.x}" y="${height - 22}" text-anchor="${anchor}" class="metric-axis-label">${escapeHtml(formatWeightDate(point.entry.dayKey))}</text>`;
  }).join("");

  const path = buildSmoothPath(points);
  const areaPath = entries.length > 1
    ? `${path} L ${points.at(-1).x} ${padding.top + plotHeight} L ${points[0].x} ${padding.top + plotHeight} Z`
    : "";
  const gradientId = `${chartId}Gradient`;
  const circles = points.map((point, index) => `<circle class="metric-chart-point" data-index="${index}" cx="${point.x}" cy="${point.y}" r="6" tabindex="0" />`).join("");

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity=".20" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${yGrid}
      ${areaPath ? `<path d="${areaPath}" class="metric-chart-area" fill="url(#${gradientId})" />` : ""}
      ${entries.length > 1 ? `<path d="${path}" class="metric-chart-line" />` : ""}
      ${circles}
      ${xLabels}
    </svg>`;

  const tooltip = document.createElement("div");
  tooltip.className = "metric-chart-tooltip";
  tooltip.hidden = true;
  chart.appendChild(tooltip);

  const showPoint = index => {
    const point = points[index];
    if (!point) return;
    const value = Number(point.entry[valueKey]);
    const detail = typeof tooltipDetail === "function" ? String(tooltipDetail(point.entry) || "") : "";
    tooltip.innerHTML = `<strong>${value.toFixed(decimals)} ${escapeHtml(unit)}</strong><span>${escapeHtml(formatWeightDate(point.entry.dayKey, { year: "numeric" }))}</span>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}`;
    tooltip.hidden = false;
    tooltip.style.left = `${(point.x / width) * 100}%`;
    tooltip.style.top = `${(point.y / height) * 100}%`;
  };
  const hidePoint = () => { tooltip.hidden = true; };

  chart.querySelectorAll(".metric-chart-point").forEach(point => {
    const index = Number(point.dataset.index);
    point.addEventListener("mouseenter", () => showPoint(index));
    point.addEventListener("mouseleave", hidePoint);
    point.addEventListener("focus", () => showPoint(index));
    point.addEventListener("blur", hidePoint);
    point.addEventListener("click", event => {
      event.stopPropagation();
      showPoint(index);
    });
  });
  chart.onclick = event => {
    if (!event.target.classList?.contains("metric-chart-point")) hidePoint();
  };
}

function renderWeightChart(entries) {
  renderMetricChart({
    chartId: "weightChart",
    entries,
    valueKey: "weight",
    unit: "lb",
    decimals: 1,
    emptyText: "No weight entries in this time range yet."
  });
}

function getGlucoseEntries() {
  return normalizeGlucoseEntries(state.mk677?.glucoseEntries || []);
}

function formatGlucoseTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || ""));
  if (!match) return "";
  const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function getVisibleGlucoseEntries() {
  const entries = getGlucoseEntries();
  if (glucoseRange === "all") return entries;
  const days = Number(glucoseRange);
  if (!Number.isFinite(days) || days <= 0) return entries;
  const cutoffKey = formatDateKey(addDays(keyToLocalDate(getTodayKey()), -(days - 1)));
  return entries.filter(entry => entry.dayKey >= cutoffKey);
}

function saveGlucoseEntry() {
  const dateInput = $("glucoseDateInput");
  const timeInput = $("glucoseTimeInput");
  const valueInput = $("glucoseValueInput");
  const contextInput = $("glucoseContextInput");
  if (!dateInput || !valueInput) return;
  const dayKey = dateInput.value;
  const time = /^\d{2}:\d{2}$/.test(String(timeInput?.value || "")) ? timeInput.value : "";
  const context = String(contextInput?.value || "").trim().slice(0, 40);
  const value = Number(valueInput.value);
  if (!isDateKey(dayKey)) {
    setMkStatus("glucoseSaveStatus", "Choose a valid date.", "bad");
    dateInput.focus();
    return;
  }
  if (!Number.isFinite(value) || value < 40 || value > 600) {
    setMkStatus("glucoseSaveStatus", "Enter a glucose value from 40 to 600 mg/dL.", "bad");
    valueInput.focus();
    return;
  }
  state.mk677 = normalizeMk677State(state.mk677);
  const existing = state.mk677.glucoseEntries.find(entry => entry.dayKey === dayKey && entry.time === time && entry.context === context);
  if (existing) {
    existing.glucose = Math.round(value);
  } else {
    state.mk677.glucoseEntries.push({
      id: `glucose-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      dayKey,
      glucose: Math.round(value),
      time,
      context
    });
  }
  state.mk677.glucoseEntries.sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  saveState();
  renderGlucoseTracker();
  valueInput.value = "";
  const detail = [context, formatGlucoseTime(time)].filter(Boolean).join(" · ");
  setMkStatus("glucoseSaveStatus", `Saved ${Math.round(value)} mg/dL for ${formatWeightDate(dayKey)}${detail ? ` · ${detail}` : ""}.`, "good");
  toast("Glucose saved.");
}

function renderGlucoseTracker() {
  const visibleEntries = getVisibleGlucoseEntries();
  const dateInput = $("glucoseDateInput");
  if (dateInput && !dateInput.value) dateInput.value = getTodayKey();

  document.querySelectorAll(".glucose-range-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.glucoseRange === glucoseRange);
  });

  renderMetricChart({
    chartId: "glucoseChart",
    entries: visibleEntries,
    valueKey: "glucose",
    unit: "mg/dL",
    decimals: 0,
    emptyText: "No glucose entries in this time range yet.",
    tooltipDetail: entry => [entry.context, formatGlucoseTime(entry.time)].filter(Boolean).join(" · ")
  });

  const changeValue = $("glucoseChangeValue");
  if (!visibleEntries.length) {
    if (changeValue) changeValue.textContent = "—";
    return;
  }
  const first = visibleEntries[0];
  const latest = visibleEntries.at(-1);
  const change = latest.glucose - first.glucose;
  if (changeValue) changeValue.textContent = `${change > 0 ? "+" : ""}${change} mg/dL`;
}


function renderWeightTracker() {
  const allEntries = getWeightEntries();
  const visibleEntries = getVisibleWeightEntries();
  const dateInput = $("weightDateInput");
  const valueInput = $("weightValueInput");
  if (dateInput && !dateInput.value) dateInput.value = getTodayKey();
  if (valueInput) valueInput.placeholder = allEntries.length ? allEntries.at(-1).weight.toFixed(1) : "165.0";

  document.querySelectorAll(".weight-range-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.weightRange === weightRange);
  });

  renderWeightChart(visibleEntries);

  const changeValue = $("weightChangeValue");
  if (!visibleEntries.length) {
    if (changeValue) changeValue.textContent = "—";
    return;
  }

  const first = visibleEntries[0];
  const latest = visibleEntries.at(-1);
  const change = Math.round((latest.weight - first.weight) * 10) / 10;
  if (changeValue) changeValue.textContent = `${change > 0 ? "+" : ""}${change.toFixed(1)} lb`;
}


function setMkStatus(elementId, message, type = "") {
  const element = $(elementId);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("good", type === "good");
  element.classList.toggle("bad", type === "bad");
}

function formatMkDate(dayKey) {
  return keyToLocalDate(dayKey).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function saveMkPlan() {
  const start = $("mkCycleStartInput")?.value || "";
  const dose = Number($("mkDoseSelect")?.value || 12.5);
  if (start && !isDateKey(start)) {
    setMkStatus("mkPlanStatus", "Choose a valid cycle start date.", "bad");
    return;
  }
  if (![12.5, 25].includes(dose)) {
    setMkStatus("mkPlanStatus", "Choose one of the recorded dose options.", "bad");
    return;
  }
  state.mk677 = normalizeMk677State(state.mk677);
  state.mk677.cycleStart = start;
  state.mk677.currentDoseMg = dose;
  saveState();
  renderMk677();
  setMkStatus("mkPlanStatus", start ? `Plan saved. Eight-week window ends ${formatMkDate(getMkCycleEndKey())}.` : "Plan saved. Set a start date when the cycle begins.", "good");
  toast("MK-677 plan saved.");
}

function syncMkLogFormToDate({ preserveExisting = false } = {}) {
  const dateInput = $("mkLogDate");
  if (!dateInput) return;
  const dayKey = dateInput.value || getTodayKey();
  if (!isDateKey(dayKey)) return;
  const existing = state.mk677?.logs?.[dayKey];
  const scheduled = isMkScheduledDay(dayKey);
  const badge = $("mkLogScheduleBadge");
  if (badge) badge.textContent = scheduled ? "Scheduled night" : "Planned off day";
  if (existing) {
    $("mkLogStatus").value = existing.status;
    $("mkLogDose").value = existing.doseMg ?? "";
    $("mkLogTime").value = existing.time || "";
    $("mkWeight").value = existing.weight ?? "";
    $("mkHeartRate").value = existing.restingHr ?? "";
    $("mkNotes").value = existing.notes || "";
  } else if (!preserveExisting) {
    $("mkLogStatus").value = scheduled ? "taken" : "off";
    $("mkLogDose").value = scheduled ? String(state.mk677?.currentDoseMg ?? 12.5) : "0";
    $("mkLogTime").value = "";
    $("mkWeight").value = state.weights?.[dayKey] ?? "";
    $("mkHeartRate").value = "";
    $("mkNotes").value = "";
  }
}


function saveMkDailyLog() {
  const dayKey = $("mkLogDate")?.value || "";
  if (!isDateKey(dayKey)) {
    setMkStatus("mkLogSaveStatus", "Choose a valid date.", "bad");
    return;
  }
  const status = $("mkLogStatus").value;
  const rawDose = $("mkLogDose").value;
  const dose = rawDose === "" ? null : Number(rawDose);
  if (dose !== null && (!Number.isFinite(dose) || dose < 0 || dose > 50)) {
    setMkStatus("mkLogSaveStatus", "Enter a valid recorded dose from 0 to 50 mg.", "bad");
    return;
  }
  const log = normalizeMk677Log(dayKey, {
    status,
    doseMg: dose,
    time: $("mkLogTime").value,
    weight: $("mkWeight").value,
    restingHr: $("mkHeartRate").value,
    notes: $("mkNotes").value
  });
  state.mk677.logs[dayKey] = log;
  if (log.weight !== null) {
    state.weights = state.weights || {};
    state.weights[dayKey] = Math.round(log.weight * 10) / 10;
  }
  saveState();
  renderMk677();
  renderWeightTracker();
  setMkStatus("mkLogSaveStatus", `Saved ${formatMkDate(dayKey)}.`, "good");
  toast("MK-677 daily log saved.");
}


function deleteMkLog(dayKey) {
  if (!state.mk677?.logs?.[dayKey]) return;
  delete state.mk677.logs[dayKey];
  saveState();
  renderMk677();
}

function saveMkThresholds() {
  state.mk677.thresholds = {
    fastingGlucoseMax: optionalNumber($("mkThresholdGlucose")?.value, 40, 600),
    systolicMax: optionalNumber($("mkThresholdSys")?.value, 60, 260),
    diastolicMax: optionalNumber($("mkThresholdDia")?.value, 30, 180)
  };
  saveState();
  renderMk677();
  toast("Clinician thresholds saved.");
}

function getMkLogs() {
  return Object.entries(state.mk677?.logs || {})
    .filter(([dayKey]) => isDateKey(dayKey))
    .map(([dayKey, log]) => ({ dayKey, ...normalizeMk677Log(dayKey, log) }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

function renderMkSchedule() {
  const container = $("mkWeekSchedule");
  if (!container) return;
  const todayName = getRoutineDayName();
  const ordered = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  container.innerHTML = ordered.map(name => {
    const on = !["Saturday", "Sunday"].includes(name);
    return `<div class="mk-day ${on ? "on" : "off"} ${name === todayName ? "today" : ""}"><strong>${name.slice(0, 3)}</strong><span>${on ? "Night" : "Off"}</span></div>`;
  }).join("");
  const badge = $("mkTodayPlanBadge");
  if (badge) badge.textContent = isMkScheduledDay() ? "Today · scheduled" : "Today · off";
}

function renderMkTrends(logs) {
  const recentStart = formatDateKey(addDays(keyToLocalDate(getTodayKey()), -6));
  const recent = logs.filter(log => log.dayKey >= recentStart && log.dayKey <= getTodayKey());

  const heartRates = recent.map(log => log.restingHr).filter(Number.isFinite);
  const avgHeartRate = heartRates.length
    ? Math.round(heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length)
    : null;
  const heartRateEl = $("mkAvgHeartRate");
  if (heartRateEl) heartRateEl.textContent = avgHeartRate === null ? "—" : `${avgHeartRate} bpm`;

  const weights = logs.filter(log => Number.isFinite(log.weight));
  const weightEl = $("mkWeightChange");
  if (weightEl) {
    if (weights.length >= 2) {
      const change = Math.round((weights.at(-1).weight - weights[0].weight) * 10) / 10;
      weightEl.textContent = `${change > 0 ? "+" : ""}${change.toFixed(1)} lb`;
    } else {
      weightEl.textContent = weights.length ? `${weights[0].weight.toFixed(1)} lb` : "—";
    }
  }

  const logsEl = $("mkWeekLogs");
  if (logsEl) logsEl.textContent = String(recent.length);
  const takenEl = $("mkWeekTaken");
  if (takenEl) takenEl.textContent = String(recent.filter(log => log.status === "taken").length);
}


function renderMkThresholdAlert(logs) {
  const element = $("mkThresholdAlert");
  if (!element) return;
  const threshold = state.mk677.thresholds || {};
  const latest = logs.at(-1);
  if (!latest) {
    element.classList.add("hidden");
    element.textContent = "";
    return;
  }
  const alerts = [];
  if (Number.isFinite(threshold.fastingGlucoseMax) && Number.isFinite(latest.fastingGlucose) && latest.fastingGlucose > threshold.fastingGlucoseMax) alerts.push(`fasting glucose ${latest.fastingGlucose} is above your saved limit of ${threshold.fastingGlucoseMax}`);
  if (Number.isFinite(threshold.systolicMax) && Number.isFinite(latest.systolic) && latest.systolic > threshold.systolicMax) alerts.push(`systolic BP ${latest.systolic} is above your saved limit of ${threshold.systolicMax}`);
  if (Number.isFinite(threshold.diastolicMax) && Number.isFinite(latest.diastolic) && latest.diastolic > threshold.diastolicMax) alerts.push(`diastolic BP ${latest.diastolic} is above your saved limit of ${threshold.diastolicMax}`);
  const severeSymptoms = [latest.swelling, latest.fatigue, latest.pain, latest.tingling, latest.headacheVision].some(value => Number(value) >= 3);
  if (severeSymptoms) alerts.push("a severe symptom score was logged");
  if (!alerts.length) {
    element.classList.add("hidden");
    element.textContent = "";
    return;
  }
  element.classList.remove("hidden");
  element.textContent = `Review with your clinician: ${alerts.join("; ")}.`;
}

function renderMkHistory(logs) {
  const list = $("mkHistoryList");
  if (!list) return;
  list.innerHTML = "";
  const recent = [...logs].reverse().slice(0, 12);
  if (!recent.length) {
    list.innerHTML = '<div class="mk-history-empty">No daily logs yet.</div>';
    return;
  }
  for (const log of recent) {
    const row = document.createElement("div");
    row.className = "mk-history-row";
    row.innerHTML = `
      <div class="mk-history-cell"><span>Date</span><strong>${escapeHtml(formatMkDate(log.dayKey))}</strong></div>
      <div class="mk-history-cell"><span>Status</span><strong class="mk-history-status ${log.status}">${escapeHtml(log.status === "off" ? "Off day" : log.status[0].toUpperCase() + log.status.slice(1))}</strong></div>
      <div class="mk-history-cell"><span>Dose</span><strong>${Number.isFinite(log.doseMg) ? `${log.doseMg} mg` : "—"}</strong></div>
      <div class="mk-history-cell"><span>Weight</span><strong>${Number.isFinite(log.weight) ? `${log.weight.toFixed(1)} lb` : "—"}</strong></div>
      <div class="mk-history-cell"><span>Resting HR</span><strong>${Number.isFinite(log.restingHr) ? `${log.restingHr} bpm` : "—"}</strong></div>
      <div class="mk-history-cell"><span>Time</span><strong>${log.time ? escapeHtml(log.time) : "—"}</strong></div>
      <button class="mk-delete-btn" type="button" aria-label="Delete MK-677 log for ${escapeHtml(log.dayKey)}">×</button>`;
    row.querySelector("button").addEventListener("click", () => deleteMkLog(log.dayKey));
    list.appendChild(row);
  }
}


function saveMkLab() {
  const date = $("mkLabDate")?.value || "";
  if (!isDateKey(date)) {
    setMkStatus("mkLabSaveStatus", "Choose a valid lab date.", "bad");
    return;
  }
  const result = {
    id: `${date}-${Date.now().toString(36)}`,
    date,
    igf1: optionalNumber($("mkLabIgf1")?.value, 0),
    a1c: optionalNumber($("mkLabA1c")?.value, 0, 30),
    glucose: optionalNumber($("mkLabGlucose")?.value, 0, 600),
    ast: optionalNumber($("mkLabAst")?.value, 0, 5000),
    alt: optionalNumber($("mkLabAlt")?.value, 0, 5000),
    insulin: optionalNumber($("mkLabInsulin")?.value, 0, 5000),
    prolactin: optionalNumber($("mkLabProlactin")?.value, 0, 5000),
    notes: String($("mkLabNotes")?.value || "").slice(0, 300)
  };
  state.mk677.labs.push(result);
  state.mk677.labs.sort((a, b) => a.date.localeCompare(b.date));
  saveState();
  renderMk677();
  ["mkLabIgf1", "mkLabA1c", "mkLabGlucose", "mkLabAst", "mkLabAlt", "mkLabInsulin", "mkLabProlactin", "mkLabNotes"].forEach(id => { if ($(id)) $(id).value = ""; });
  setMkStatus("mkLabSaveStatus", `Saved lab results for ${formatMkDate(date)}.`, "good");
  toast("Lab result saved.");
}

function deleteMkLab(id) {
  state.mk677.labs = (state.mk677.labs || []).filter(item => item.id !== id);
  saveState();
  renderMk677();
}

function renderMkLabHistory() {
  const list = $("mkLabHistory");
  if (!list) return;
  const labs = [...(state.mk677?.labs || [])].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = "";
  if (!labs.length) {
    list.innerHTML = '<div class="mk-history-empty">No lab results logged yet.</div>';
    return;
  }
  for (const lab of labs) {
    const row = document.createElement("div");
    row.className = "mk-lab-row";
    const values = [
      ["IGF-1", lab.igf1], ["A1c", lab.a1c], ["Glucose", lab.glucose], ["AST", lab.ast], ["ALT", lab.alt], ["Insulin", lab.insulin], ["Prolactin", lab.prolactin]
    ].filter(([, value]) => Number.isFinite(value));
    row.innerHTML = `<div class="mk-lab-row-head"><strong>${escapeHtml(formatMkDate(lab.date))}</strong><button class="mk-lab-delete" type="button">Delete</button></div><div class="mk-lab-row-values">${values.map(([label, value]) => `<span><b>${label}</b> ${value}</span>`).join("") || "No numeric values"}${lab.notes ? `<span>${escapeHtml(lab.notes)}</span>` : ""}</div>`;
    row.querySelector("button").addEventListener("click", () => deleteMkLab(lab.id));
    list.appendChild(row);
  }
}

function saveMkMonitoring() {
  state.mk677 = normalizeMk677State(state.mk677);
  const date = $("mkMonitorDate")?.value || getTodayKey();
  if (!isDateKey(date)) {
    setMkStatus("mkMonitoringStatus", "Choose a valid date.", "bad");
    return;
  }
  const weight = optionalNumber($("mkMonitorWeight")?.value, 50, 500);
  const restingHr = optionalNumber($("mkMonitorHeartRate")?.value, 30, 220);
  const notes = String($("mkMonitorNotes")?.value || "").trim().slice(0, 500);
  state.mk677.monitoring = { date, weight, restingHr, notes };
  if (Number.isFinite(weight)) state.weights[date] = weight;
  saveState();
  renderMk677();
  renderWeightTracker();
  setMkStatus("mkMonitoringStatus", `Saved ${formatMkDate(date)}.`, "good");
  toast("MK-677 monitoring saved.");
}

function renderMkMonitoring() {
  const monitor = state.mk677?.monitoring || {};
  const dateEl = $("mkMonitorDate");
  const weightEl = $("mkMonitorWeight");
  const heartEl = $("mkMonitorHeartRate");
  const notesEl = $("mkMonitorNotes");
  if (dateEl) dateEl.value = monitor.date || getTodayKey();
  if (weightEl) weightEl.value = Number.isFinite(monitor.weight) ? String(monitor.weight) : "";
  if (heartEl) heartEl.value = Number.isFinite(monitor.restingHr) ? String(monitor.restingHr) : "";
  if (notesEl) notesEl.value = monitor.notes || "";
  const badge = $("mkMonitorSavedBadge");
  if (badge) badge.textContent = monitor.date ? `Saved ${formatMkDate(monitor.date)}` : "Not saved";
}

function renderMk677() {
  const page = $("mk677Page");
  if (!page) return;
  state.mk677 = normalizeMk677State(state.mk677);
  renderMkSchedule();
  renderWeightTracker();
  renderGlucoseTracker();
}

function getWeeklyReviewKeys() {
  const today = keyToLocalDate(getTodayKey());
  const sunday = addDays(today, -today.getDay());
  const keys = [];
  let cursor = new Date(sunday);

  while (cursor <= today) {
    keys.push(formatDateKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return keys;
}

const WEEKLY_REVIEW_MAJOR_TASK_IDS = new Set([
  "face-rinse",
  "hydrating-cleanser",
  "vitamin-c",
  "morning-moisturizer",
  "night-moisturizer",
  "tretinoin",
  "azelaic-acid",
  "microneedle-eyebrows",
  "morning-teeth",
  "night-teeth",
  "water-through-day",
  "gym",
  "creatine",
  "wash-bed-sheets"
]);

function getTaskByLooksId(taskId, dayKeys) {
  for (const dayKey of dayKeys) {
    const match = getLooksTasks(dayKey).find(task => task.id === taskId);
    if (match) return match;
  }
  return null;
}

function getWeeklyGymStatus(dayKey, day) {
  const done = new Set(day.looksDone || []);
  const skipped = new Set(day.looksSkipped || []);

  if (done.has("gym")) return "Done";
  if (skipped.has("gym")) return "Skipped";
  if (dayKey === getTodayKey()) return "Not yet";
  return "Not logged";
}

function renderWeeklyReview() {
  const page = $("weeklyPage");
  if (!page) return;

  const dayKeys = getWeeklyReviewKeys();
  const firstKey = dayKeys[0];
  const lastKey = dayKeys.at(-1);
  const firstDate = keyToLocalDate(firstKey);
  const lastDate = keyToLocalDate(lastKey);

  const range = $("weeklyDateRange");
  if (range) {
    range.textContent = `${firstDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${lastDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }

  let looksDone = 0;
  let looksScheduled = 0;
  let totalWater = 0;
  let gymDone = 0;
  let gymSkipped = 0;
  let gymNotLogged = 0;
  let gymNotYet = 0;
  let totalSkipped = 0;
  const skipCounts = new Map();

  for (const dayKey of dayKeys) {
    const day = state.days?.[dayKey] || createDayRecord();
    const allowedLooks = getLooksTaskIds(dayKey);
    const doneLooks = cleanList(day.looksDone, allowedLooks);
    const skippedLooks = cleanList(day.looksSkipped, allowedLooks);

    looksDone += doneLooks.length;
    looksScheduled += allowedLooks.length;
    totalWater += Math.max(0, Number(day.waterOz) || 0);
    totalSkipped += skippedLooks.length;

    const gymStatus = getWeeklyGymStatus(dayKey, day);
    if (gymStatus === "Done") gymDone += 1;
    else if (gymStatus === "Skipped") gymSkipped += 1;
    else if (gymStatus === "Not yet") gymNotYet += 1;
    else gymNotLogged += 1;

    for (const taskId of skippedLooks) {
      if (!WEEKLY_REVIEW_MAJOR_TASK_IDS.has(taskId)) continue;
      skipCounts.set(taskId, (skipCounts.get(taskId) || 0) + 1);
    }
  }

  const looksPercent = looksScheduled ? Math.round((looksDone / looksScheduled) * 100) : 0;
  const averageWater = dayKeys.length ? Math.round(totalWater / dayKeys.length) : 0;

  $("weeklyLooksCompletion").textContent = `${looksPercent}%`;
  $("weeklyLooksMeta").textContent = totalSkipped
    ? `${looksDone} completed · ${totalSkipped} skipped`
    : `${looksDone} tasks completed`;
  $("weeklyAverageWater").textContent = `${averageWater} oz`;
  $("weeklyWaterMeta").textContent = averageWater >= WATER_MINIMUM_OZ
    ? "Average is at or above your minimum"
    : `${WATER_MINIMUM_OZ - averageWater} oz below your daily minimum`;
  $("weeklyGymDays").textContent = `${gymDone}/${dayKeys.length}`;

  const gymParts = [];
  if (gymSkipped) gymParts.push(`${gymSkipped} skipped`);
  if (gymNotLogged) gymParts.push(`${gymNotLogged} not logged`);
  if (gymNotYet) gymParts.push("today not yet");
  $("weeklyGymMeta").textContent = gymParts.length
    ? gymParts.join(" · ")
    : "Gym completed each day so far";

  const weekWeights = getWeightEntries().filter(entry => entry.dayKey >= firstKey && entry.dayKey <= lastKey);
  const weightValue = $("weeklyWeightChange");
  const weightMeta = $("weeklyWeightMeta");
  if (weekWeights.length >= 2) {
    const change = Math.round((weekWeights.at(-1).weight - weekWeights[0].weight) * 10) / 10;
    weightValue.textContent = `${change > 0 ? "+" : ""}${change.toFixed(1)} lb`;
    weightMeta.textContent = `${weekWeights[0].weight.toFixed(1)} → ${weekWeights.at(-1).weight.toFixed(1)} lb`;
  } else if (weekWeights.length === 1) {
    weightValue.textContent = `${weekWeights[0].weight.toFixed(1)} lb`;
    weightMeta.textContent = "One weight entry this week";
  } else {
    weightValue.textContent = "No data";
    weightMeta.textContent = "Log weight to see this week's change";
  }

  const mostSkipped = [...skipCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const skippedValue = $("weeklySkippedTask");
  const skippedMeta = $("weeklySkippedMeta");
  if (mostSkipped) {
    const baseTask = getTaskByLooksId(mostSkipped[0], dayKeys);
    skippedValue.textContent = baseTask ? getLooksTaskTitle(baseTask) : mostSkipped[0];
    skippedMeta.textContent = `Skipped ${mostSkipped[1]} time${mostSkipped[1] === 1 ? "" : "s"} this week`;
  } else {
    skippedValue.textContent = "None";
    skippedMeta.textContent = "No major routine tasks skipped";
  }

  const list = $("weeklyDayList");
  list.innerHTML = "";
  for (const dayKey of dayKeys) {
    const day = state.days?.[dayKey] || createDayRecord();
    const allowedLooks = getLooksTaskIds(dayKey);
    const doneLooks = cleanList(day.looksDone, allowedLooks).length;
    const skippedLooks = cleanList(day.looksSkipped, allowedLooks).length;
    const looksDayPercent = allowedLooks.length ? Math.round((doneLooks / allowedLooks.length) * 100) : 0;
    const date = keyToLocalDate(dayKey);
    const gymStatus = getWeeklyGymStatus(dayKey, day);
    const row = document.createElement("div");
    row.className = `weekly-day-row ${dayKey === getTodayKey() ? "today" : ""}`;
    row.innerHTML = `
      <div class="weekly-day-name">
        <strong>${escapeHtml(getRoutineDayName(dayKey))}</strong>
        <span>${escapeHtml(date.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</span>
      </div>
      <div class="weekly-day-metric"><span>Looks</span><strong>${looksDayPercent}%</strong>${skippedLooks ? `<small>${skippedLooks} skipped</small>` : ""}</div>
      <div class="weekly-day-metric"><span>Water</span><strong>${Math.round(Number(day.waterOz) || 0)} oz</strong></div>
      <div class="weekly-day-metric gym-status ${gymStatus.toLowerCase().replaceAll(" ", "-")}"><span>Gym</span><strong>${escapeHtml(gymStatus)}</strong></div>`;
    list.appendChild(row);
  }
}

function getRotationTasksForDay(dayKey) {
  const dayName = getRoutineDayName(dayKey);
  const items = [
    { label: `Gym: ${getWorkoutName(dayKey)}`, type: "gym" }
  ];

  if (MASSETER_DAYS.has(dayName)) items.push({ label: "Masseter training", type: "grooming" });
  if (SHEET_WASH_DAYS.has(dayName)) items.push({ label: "Wash bed sheets", type: "home" });
  if (SHAVE_DAYS.has(dayName)) items.push({ label: "Shave + eyebrows", type: "grooming" });
  if (MICRONEEDLE_DAYS.has(dayName)) items.push({ label: "Microneedling", type: "treatment" });

  if (getTretinoinDays(dayKey).includes(dayName)) {
    items.push({ label: "Tretinoin", type: "treatment" });
  } else {
    items.push({ label: "Azelaic acid", type: "treatment-alt" });
  }

  if (dayName === "Sunday") items.push({ label: "Lip exfoliation", type: "grooming" });
  return items;
}

function renderRotationCalendar() {
  const calendar = $("rotationCalendar");
  if (!calendar) return;

  const todayKey = getTodayKey();
  const todayDate = keyToLocalDate(todayKey);
  calendar.innerHTML = "";

  for (let offset = 0; offset < ROTATION_PREVIEW_DAYS; offset += 1) {
    const date = addDays(todayDate, offset);
    const dayKey = formatDateKey(date);
    const dayName = getRoutineDayName(dayKey);
    const card = document.createElement("div");
    card.className = `rotation-day ${offset === 0 ? "today" : ""}`;

    const heading = document.createElement("div");
    heading.className = "rotation-day-heading";
    heading.innerHTML = `
      <div>
        <strong>${escapeHtml(dayName)}</strong>
        <span>${escapeHtml(date.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</span>
      </div>
      ${offset === 0 ? '<span class="rotation-today-badge">Today</span>' : ""}`;

    const chips = document.createElement("div");
    chips.className = "rotation-task-chips";
    chips.innerHTML = getRotationTasksForDay(dayKey)
      .map(item => `<span class="rotation-chip ${escapeHtml(item.type)}">${escapeHtml(item.label)}</span>`)
      .join("");

    card.append(heading, chips);
    calendar.appendChild(card);
  }
}

function renderAdmin() {
  const todayKey = getTodayKey();
  const frequency = getTretinoinFrequency(todayKey);
  const phase = getTretinoinRampPhase(todayKey);
  const manuallyAdjusted = Boolean(getTretinoinRampOverride(todayKey));
  const alternateNights = Boolean(phase?.alternateNights && !manuallyAdjusted);
  const value = $("tretinoinFrequencyValue");
  const label = $("tretinoinFrequencyLabel");
  const dayList = $("tretinoinDaysList");
  const decrease = $("tretinoinFrequencyDown");
  const increase = $("tretinoinFrequencyUp");

  if (value && label && dayList && decrease && increase) {
    value.textContent = alternateNights ? "EON" : `${frequency}×`;
    label.textContent = alternateNights ? "Every other night" : frequency === 7 ? "Every night" : `${frequency} nights per week`;
    // Show only the current Monday-Sunday week so the spacing is obvious.
    const todayDate = keyToLocalDate(todayKey);
    const mondayOffset = (todayDate.getDay() + 6) % 7;
    const weekStart = addDays(todayDate, -mondayOffset);
    const thisWeekNights = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const key = formatDateKey(addDays(weekStart, offset));
      if (getTretinoinDays(key).includes(getRoutineDayName(key))) thisWeekNights.push(key);
    }

    dayList.innerHTML = thisWeekNights.map(key => {
      const date = keyToLocalDate(key);
      const completed = ensureDay(key).looksDone.includes("tretinoin");
      return `<span class="tret-day-pill">${getRoutineDayName(key).slice(0, 3)} ${date.getMonth() + 1}/${date.getDate()}${completed ? " ✓" : ""}</span>`;
    }).join("");
    decrease.disabled = frequency <= 1;
    increase.disabled = frequency >= 7;
  }

  // Add the requested 0.05% ramp inside the existing Admin card without editing HTML/CSS.
  const card = value?.closest(".tretinoin-admin-card");
  if (card) {
    const heading = card.querySelector("h2");
    if (heading) heading.textContent = "Tretinoin 0.05% schedule";
    const description = card.querySelector(".eyebrow + h2 + p");
    if (description) description.textContent = "Started Monday, September 21. Current 2× schedule is Monday + Friday for near-even spacing.";
    const previewTitle = card.querySelector(".tret-schedule-title");
    if (previewTitle) previewTitle.textContent = "This week's tretinoin nights";
    let ramp = $("tretinoinRampTable");
    if (!ramp) {
      ramp = document.createElement("div");
      ramp.id = "tretinoinRampTable";
      ramp.className = "tret-schedule-preview";
      ramp.innerHTML = `
        <span class="tret-schedule-title">0.05% gradual schedule</span>
        <table style="width:100%;border-collapse:collapse;margin-top:10px;text-align:left;font-size:.88rem;line-height:1.4">
          <thead><tr><th style="padding:8px 5px;border-bottom:1px solid var(--line)">Time</th><th style="padding:8px 5px;border-bottom:1px solid var(--line)">Tretinoin 0.05%</th></tr></thead>
          <tbody>
            <tr data-tret-phase="0"><td style="padding:10px 5px;border-bottom:1px solid var(--line)">Weeks 1–2</td><td style="padding:10px 5px;border-bottom:1px solid var(--line)"><strong>2 nights/week</strong></td></tr>
            <tr data-tret-phase="1"><td style="padding:10px 5px;border-bottom:1px solid var(--line)">Weeks 3–4</td><td style="padding:10px 5px;border-bottom:1px solid var(--line)"><strong>3 nights/week</strong></td></tr>
            <tr data-tret-phase="2"><td style="padding:10px 5px;border-bottom:1px solid var(--line)">Weeks 5–6</td><td style="padding:10px 5px;border-bottom:1px solid var(--line)"><strong>Every other night</strong></td></tr>
            <tr data-tret-phase="3"><td style="padding:10px 5px;border-bottom:1px solid var(--line)">Weeks 7–8</td><td style="padding:10px 5px;border-bottom:1px solid var(--line)"><strong>5 nights/week</strong>, if comfortable</td></tr>
            <tr data-tret-phase="4"><td style="padding:10px 5px">After ~8 weeks</td><td style="padding:10px 5px"><strong>Nightly only if your skin tolerates it</strong></td></tr>
          </tbody>
        </table>
        <p id="tretinoinRampStatus" style="margin:10px 0 0;color:var(--muted);font-size:.84rem;font-weight:750"></p>
        <button id="tretinoinResumeRamp" type="button" class="tret-frequency-btn" style="display:none;width:auto;height:auto;padding:9px 12px;margin-top:10px;font-size:.85rem">Resume gradual schedule</button>`;
      const note = card.querySelector(".tret-admin-note");
      if (note) note.before(ramp);
      else card.appendChild(ramp);
      $("tretinoinResumeRamp")?.addEventListener("click", () => {
        delete state.meta.tretinoinRampOverride;
        saveState();
        render();
        toast("Gradual tretinoin schedule resumed.");
      });
    }
    const status = $("tretinoinRampStatus");
    if (status) {
      status.textContent = manuallyAdjusted
        ? `Manual schedule: ${frequency} nights/week from ${getTretinoinRampOverride(todayKey).effectiveDayKey}. Use Resume to follow the gradual schedule again.`
        : phase?.index === 4 ? "After week 8, the schedule stays at 5 nights unless you choose nightly with + and tolerate it."
        : `${phase?.label || "Before ramp"}: ${alternateNights ? "every other night" : `${frequency} nights/week`}. Increase only if your skin tolerates it.`;
    }
    const resume = $("tretinoinResumeRamp");
    if (resume) resume.style.display = manuallyAdjusted ? "inline-flex" : "none";
    ramp.querySelectorAll("[data-tret-phase]").forEach(row => {
      row.style.background = !manuallyAdjusted && Number(row.dataset.tretPhase) === phase?.index ? "var(--blue-soft)" : "";
    });
    const note = card.querySelector(".tret-admin-note");
    if (note) note.textContent = "First night: Monday, September 21, 2026. Admin adjustments override the automatic ramp until you resume it.";
  }

  renderRotationCalendar();
}

function setTretinoinFrequency(nextFrequency) {
  const frequency = Math.max(1, Math.min(7, Math.round(Number(nextFrequency) || 2)));
  const todayKey = getTodayKey();
  if (todayKey >= TRETINOIN_RAMP_START_DAY_KEY) {
    // A manual change overrides later automatic increases but leaves all earlier days intact.
    state.meta.tretinoinRampOverride = { effectiveDayKey: todayKey, frequency };
  } else {
    // Preserve the old Admin behavior when viewing the historical schedule.
    const previousKey = formatDateKey(addDays(keyToLocalDate(todayKey), -1));
    const previousFrequency = getTretinoinFrequency(previousKey);
    if (!Array.isArray(state.meta.tretinoinScheduleChanges)) state.meta.tretinoinScheduleChanges = [];
    state.meta.tretinoinScheduleChanges = state.meta.tretinoinScheduleChanges.filter(change => change.effectiveDayKey !== todayKey);
    if (frequency !== previousFrequency) {
      state.meta.tretinoinScheduleChanges.push({ effectiveDayKey: todayKey, frequency });
      state.meta.tretinoinScheduleChanges.sort((a, b) => a.effectiveDayKey.localeCompare(b.effectiveDayKey));
    }
  }
  saveState();
  render();
  toast(`Tretinoin set to ${frequency === 7 ? "every night" : `${frequency} nights per week`}.`);
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
  renderWeeklyReview();
  renderMk677();
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
  button.addEventListener("click", () => setWaterOz(ensureDay().waterOz + Number(button.dataset.waterAdd)));
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

$("saveGlucoseBtn")?.addEventListener("click", saveGlucoseEntry);
$("glucoseValueInput")?.addEventListener("keydown", event => {
  if (event.key === "Enter") saveGlucoseEntry();
});
document.querySelectorAll(".glucose-range-btn").forEach(button => {
  button.addEventListener("click", () => {
    glucoseRange = button.dataset.glucoseRange || "30";
    renderGlucoseTracker();
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
  if (getTodayKey() !== renderedDayKey && !mainApp.classList.contains("hidden")) {
    normalizeState();
    saveState();
    workoutDraftDirty = false;
    render();
  }
}, 60_000);

setupTabs();
if (normalizeState()) saveLocalState();
showLogin();

/* ===== 2026-09-22: PERMISSIVE SAVE WORKOUT ===== */
(() => {
  "use strict";

  const FLAG = "__lockedOsPermissiveWorkoutSave20260922";
  if (window[FLAG]) return;
  window[FLAG] = true;

  function selectedGymDayKeyForSave() {
    const selected =
      document.querySelector('#cleanGymWeekGrid .gym-strip-selected[data-gym-strip-date]') ||
      document.querySelector('#cleanGymWeekGrid .selected[data-gym-strip-date]') ||
      document.querySelector('#cleanGymWeekGrid [data-gym-strip-date][aria-current="true"]');

    if (selected?.dataset?.gymStripDate) return selected.dataset.gymStripDate;

    const label = document.getElementById("cleanGymDateLabel")?.textContent?.trim() || "";
    const parsed = new Date(label);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    }

    return typeof getTodayKey === "function" ? getTodayKey() : "";
  }

  function permissiveGymNumber(input, round = false) {
    const raw = String(input?.value ?? "").trim();
    if (!raw) return 0;

    const value = Number(raw);
    if (!Number.isFinite(value)) return 0;

    const nonNegative = Math.max(0, value);
    return round ? Math.round(nonNegative) : nonNegative;
  }

  function saveWorkoutNoMatterWhat() {
    const dayKey = selectedGymDayKeyForSave();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;

    const workout =
      document.getElementById("cleanGymWorkoutTitle")?.textContent?.trim() ||
      "Workout";

    const exercises = [...document.querySelectorAll("#cleanGymWorkoutBody .clean-gym-exercise")]
      .map(row => ({
        name: String(
          row.dataset.exercise ||
          row.querySelector(".clean-gym-exercise-name strong")?.textContent ||
          ""
        ).trim(),
        sets: [0, 1].map(index => ({
          weight: permissiveGymNumber(
            row.querySelector(`[data-set="${index}"][data-field="weight"]`)
          ),
          reps: permissiveGymNumber(
            row.querySelector(`[data-set="${index}"][data-field="reps"]`),
            true
          )
        }))
      }))
      .filter(exercise => exercise.name);

    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean =
      state.meta.gymClean && typeof state.meta.gymClean === "object"
        ? state.meta.gymClean
        : {};
    state.meta.gymClean.sessions = Array.isArray(state.meta.gymClean.sessions)
      ? state.meta.gymClean.sessions
      : [];

    let session = state.meta.gymClean.sessions.find(item => item?.date === dayKey);

    if (!session) {
      session = {
        id: `gym-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date: dayKey,
        workout,
        completed: false,
        exercises: [],
        updatedAt: new Date().toISOString()
      };
      state.meta.gymClean.sessions.push(session);
    }

    session.workout = workout;
    session.exercises = exercises;
    session.updatedAt = new Date().toISOString();

    saveState();

    const status = document.getElementById("cleanGymSaveStatus");
    if (status) status.textContent = "Workout saved.";

    if (typeof toast === "function") toast("Workout saved.");
  }

  document.addEventListener(
    "click",
    event => {
      const saveButton = event.target.closest?.("#cleanGymSave");
      if (!saveButton) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      saveWorkoutNoMatterWhat();
    },
    true
  );
})();

/* ===== 2026-09-22: HARD LOCK TRETINOIN 2X SCHEDULE ===== */
(() => {
  "use strict";

  const FLAG = "__lockedOsTret2xMonFriFix20260922";

  function installTret2xFix() {
    if (window[FLAG]) return;
    window[FLAG] = true;

    let changed = false;

    // Disable the older "every other day" override so it cannot create a
    // Tuesday dose immediately after Monday.
    if (typeof state !== "undefined" && state && typeof state === "object") {
      state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};

      if (state.meta.tretinoinEveryOtherDayV1?.enabled) {
        state.meta.tretinoinEveryOtherDayV1 = {
          ...state.meta.tretinoinEveryOtherDayV1,
          enabled: false
        };
        changed = true;
      }

      // Monday 9/21 was the actual most recent tretinoin night.
      if (typeof ensureDay === "function") {
        const monday = ensureDay("2026-09-21");
        if (!monday.looksDone.includes("tretinoin")) {
          monday.looksDone.push("tretinoin");
          changed = true;
        }
        monday.looksSkipped = monday.looksSkipped.filter(id => id !== "tretinoin");

        // Tuesday 9/22 is NOT a tretinoin night.
        const tuesday = ensureDay("2026-09-22");
        const beforeDone = tuesday.looksDone.length;
        const beforeSkipped = tuesday.looksSkipped.length;
        tuesday.looksDone = tuesday.looksDone.filter(id => id !== "tretinoin");
        tuesday.looksSkipped = tuesday.looksSkipped.filter(id => id !== "tretinoin");
        if (tuesday.looksDone.length !== beforeDone || tuesday.looksSkipped.length !== beforeSkipped) {
          changed = true;
        }
      }
    }

    // ghk-cu.js previously wrapped getTretinoinDays() for an every-other-day mode.
    // This wrapper runs after all scripts load and guarantees that whenever the
    // active schedule is 2 nights/week, the only nights are Monday + Friday.
    if (
      typeof getTretinoinDays === "function" &&
      !getTretinoinDays.__lockedOsTwoNightMonFri
    ) {
      const previousGetTretinoinDays = getTretinoinDays;

      const wrapped = function(dayKey = (typeof getTodayKey === "function" ? getTodayKey() : "")) {
        try {
          if (
            typeof getTretinoinFrequency === "function" &&
            getTretinoinFrequency(dayKey) === 2
          ) {
            const dayName = typeof getRoutineDayName === "function"
              ? getRoutineDayName(dayKey)
              : "";
            return dayName === "Monday" || dayName === "Friday" ? [dayName] : [];
          }
        } catch (_) {}

        return previousGetTretinoinDays(dayKey);
      };

      wrapped.__lockedOsTwoNightMonFri = true;
      getTretinoinDays = wrapped;
    }

    if (changed) {
      try {
        if (typeof saveState === "function") saveState();
      } catch (_) {}
    }

    try {
      if (typeof render === "function") render();
    } catch (_) {}
  }

  // app.js loads before ghk-cu.js, so wait until the full page has loaded,
  // then apply this fix after ghk-cu.js has installed its older wrapper.
  if (document.readyState === "complete") {
    setTimeout(installTret2xFix, 0);
  } else {
    window.addEventListener("load", () => setTimeout(installTret2xFix, 0), { once: true });
  }
})();

/* ===== 2026-09-22: PERMISSIVE SAVE + COMPLETE WORKOUT ===== */
(() => {
  "use strict";

  const FLAG = "__lockedOsPermissiveWorkoutComplete20260922";
  if (window[FLAG]) return;
  window[FLAG] = true;

  function selectedGymDayKeyPermissive() {
    const selected =
      document.querySelector('#cleanGymWeekGrid .gym-strip-selected[data-gym-strip-date]') ||
      document.querySelector('#cleanGymWeekGrid .selected[data-gym-strip-date]') ||
      document.querySelector('#cleanGymWeekGrid [data-gym-strip-date][aria-current="true"]');

    if (selected?.dataset?.gymStripDate) return selected.dataset.gymStripDate;

    const label = document.getElementById("cleanGymDateLabel")?.textContent?.trim() || "";
    const parsed = new Date(label);

    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    }

    return typeof getTodayKey === "function" ? getTodayKey() : "";
  }

  function readGymNumber(input, round = false) {
    const raw = String(input?.value ?? "").trim();
    if (!raw) return 0;

    const value = Number(raw);
    if (!Number.isFinite(value)) return 0;

    const nonNegative = Math.max(0, value);
    return round ? Math.round(nonNegative) : nonNegative;
  }

  function collectGymFormPermissively() {
    return [...document.querySelectorAll("#cleanGymWorkoutBody .clean-gym-exercise")]
      .map(row => ({
        name: String(
          row.dataset.exercise ||
          row.querySelector(".clean-gym-exercise-name strong")?.textContent ||
          ""
        ).trim(),
        sets: [0, 1].map(index => ({
          weight: readGymNumber(
            row.querySelector(`[data-set="${index}"][data-field="weight"]`)
          ),
          reps: readGymNumber(
            row.querySelector(`[data-set="${index}"][data-field="reps"]`),
            true
          )
        }))
      }))
      .filter(exercise => exercise.name);
  }

  function saveGymPermissively(markComplete) {
    if (typeof state === "undefined" || !state || typeof state !== "object") return;

    const dayKey = selectedGymDayKeyPermissive();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;

    const workout =
      document.getElementById("cleanGymWorkoutTitle")?.textContent?.trim() ||
      "Workout";

    const exercises = collectGymFormPermissively();

    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean =
      state.meta.gymClean && typeof state.meta.gymClean === "object"
        ? state.meta.gymClean
        : {};
    state.meta.gymClean.sessions = Array.isArray(state.meta.gymClean.sessions)
      ? state.meta.gymClean.sessions
      : [];

    let session = state.meta.gymClean.sessions.find(item => item?.date === dayKey);

    if (!session) {
      session = {
        id: `gym-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date: dayKey,
        workout,
        completed: false,
        exercises: [],
        updatedAt: new Date().toISOString()
      };
      state.meta.gymClean.sessions.push(session);
    }

    session.workout = workout;
    session.exercises = exercises;
    if (markComplete) session.completed = true;
    session.updatedAt = new Date().toISOString();

    try {
      if (typeof saveState === "function") saveState();
    } catch (error) {
      console.error("LOCKED OS: permissive workout save failed.", error);
      return;
    }

    const status = document.getElementById("cleanGymSaveStatus");
    if (status) {
      status.textContent = markComplete
        ? "Workout saved and completed."
        : "Workout saved.";
    }

    if (typeof toast === "function") {
      toast(markComplete ? "Workout completed." : "Workout saved.");
    }

    // Refresh whatever gym/history UI is available without requiring every
    // exercise/set to have both values.
    try {
      if (typeof renderWeeklyReview === "function") renderWeeklyReview();
    } catch (_) {}
  }

  document.addEventListener(
    "click",
    event => {
      const saveButton = event.target.closest?.("#cleanGymSave");
      const completeButton = event.target.closest?.("#cleanGymComplete");
      if (!saveButton && !completeButton) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      saveGymPermissively(Boolean(completeButton));
    },
    true
  );
})();
