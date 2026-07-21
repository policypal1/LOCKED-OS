"use strict";

const PASSWORD = "2009";
const SUPABASE_URL = "https://agphsqrglqdcckjdtlnk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NpZ-jwFT5soIiO8RakO8Mw_qEf6xy4E";
const SUPABASE_ROW_ID = "samuel-main";
const SUPABASE_TABLE = "locked_os_state_v2";
const STORAGE_KEY = "locked_os_daily_checklist_v10";
const OLD_STORAGE_KEYS = [
  "locked_os_daily_checklist_v9",
  "locked_os_daily_checklist_v8",
  "locked_os_daily_checklist_v7",
  "locked_os_daily_checklist_v6",
  "locked_os_daily_checklist_v5",
  "locked_os_daily_checklist_v4"
];
const DAY_ROLLOVER_HOUR = 4;
const WATER_MINIMUM_OZ = 100;
const WATER_TARGET_OZ = 120;
const WATER_MAX_OZ = 240;

const hasSupabaseConfig =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PASTE_") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");
const supabaseClient = hasSupabaseConfig && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const TASKS = [
  { id: "wake-up", section: "morning", title: "Wake up at planned time" },
  { id: "water", section: "morning", title: "Chug one glass of water immediately after waking up" },
  { id: "clean-room", section: "morning", title: "Clean room" },
  { id: "dressed", section: "morning", title: "Get fully dressed and ready for the day" },
  { id: "real-world-good-morning", section: "morning", title: "Real World daily good morning" },
  { id: "real-world-lesson", section: "morning", title: "Real World daily lesson" },
  { id: "real-world-puzzle", section: "morning", title: "Real World daily puzzle" },
  { id: "breakfast", section: "morning", title: "Eat breakfast" },
  { id: "gym", section: "afternoon", title: "Go to gym" },
  { id: "creatine", section: "afternoon", title: "Take creatine" },
  { id: "reading", section: "night", title: "Read for 10 minutes" },
  { id: "plan-next-day", section: "night", title: "Plan next day" }
];
const TASK_IDS = TASKS.map(task => task.id);
const MORNING_TASK_IDS = TASKS.filter(task => task.section === "morning").map(task => task.id);
const LEGACY_TASK_ID_MAP = { "bed-ready": "plan-next-day", "no-shampoo": "conditional-shampoo" };

const RANKS = [
  { name: "Starter", days: 0, copy: "Resolve the full main checklist to start the streak." },
  { name: "Locked In", days: 3, copy: "Three straight main-checklist days. The system is sticking." },
  { name: "Disciplined", days: 7, copy: "Seven main-checklist days in a row. Reward unlocked." },
  { name: "Machine", days: 14, copy: "Two weeks. This is no longer random motivation." },
  { name: "Unbreakable", days: 30, copy: "Thirty days. This is identity-level discipline." }
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MORNING_BASE = [
  { id: "wake-water", title: "Wake up and chug 1 glass of water immediately", meta: "morningWater" },
  { id: "lukewarm-shower", title: "Take a lukewarm shower" },
  { id: "conditional-shampoo", title: "Shampoo only if hair is dirty; otherwise, skip shampoo" },
  { id: "conditioner-soap", title: "Use conditioner and soap" },
  { id: "cold-finish", title: "Finish the shower with cold water" },
  { id: "get-dressed", title: "Get fully dressed and ready for the day" },
  { id: "scrunch-hair", title: "Lightly scrunch hair with a towel" },
  { id: "gua-sha", title: "Gua sha" },
  { id: "face-rinse", title: "Wash face only if oily; otherwise, rinse with lukewarm water" },
  { id: "vitamin-c", title: "Apply vitamin C serum" },
  { id: "morning-moisturizer", title: "Apply moisturizer" },
  { id: "sunscreen", title: "Apply sunscreen" },
  { id: "morning-minoxidil", title: "Apply minoxidil to eyebrows" },
  { id: "sea-salt-spray", title: "Apply sea salt spray to hair" },
  { id: "deodorant", title: "Apply deodorant" },
  { id: "curl-eyelashes", title: "Curl eyelashes" },
  { id: "brush-eyebrows", title: "Brush eyebrows" },
  { id: "morning-teeth", title: "Floss and brush teeth" }
];
const NIGHT_BASE = [
  { id: "no-phone", title: "No phone" },
  { id: "bed-nine", title: "Start getting ready for bed at 9:00 PM" },
  { id: "hydrating-cleanser", title: "Wash face with hydrating facial cleanser" },
  { id: "azelaic-acid", title: "Apply azelaic acid" },
  { id: "night-moisturizer", title: "Apply moisturizer" },
  { id: "night-minoxidil", title: "Apply minoxidil to eyebrows" },
  { id: "eyelash-serum", title: "Apply peptide eyelash growth serum" },
  { id: "night-teeth", title: "Floss and brush teeth" },
  { id: "whitening-strips", title: "Use Crest whitening strips" }
];
const WORKOUTS = {
  Monday: "Chest + side delts + neck exercises",
  Tuesday: "Back + rear delts",
  Wednesday: "Arms",
  Thursday: "Legs",
  Friday: "Cardio + abs + neck exercises",
  Saturday: "Chest + side delts",
  Sunday: "Back + rear delts"
};

function cloneTasks(tasks) { return tasks.map(task => ({ ...task })); }
function makeMidday(dayName) {
  const tasks = [
    { id: "gym", title: `Gym: ${WORKOUTS[dayName]}` },
    { id: "creatine", title: "Take creatine" },
    { id: "low-sodium-potassium", title: "Low sodium + high potassium" }
  ];
  if (dayName === "Wednesday" || dayName === "Sunday") tasks.push({ id: "wash-bed-sheets", title: "Wash bed sheets" });
  tasks.push({ id: "water-through-day", title: "Drink 100–120 oz of water throughout the day", subtitle: "Completes automatically at 100 oz.", meta: "waterTracked" });
  return tasks;
}
function makeMorning(dayName) {
  const tasks = cloneTasks(MORNING_BASE);
  if (dayName === "Thursday") {
    const index = tasks.findIndex(task => task.id === "cold-finish");
    tasks.splice(index + 1, 0, { id: "shave-manage-brows", title: "Shave face/manage eyebrows" });
  }
  return tasks;
}
function makeNight(dayName) {
  const tasks = cloneTasks(NIGHT_BASE);
  const minoxidilIndex = tasks.findIndex(task => task.id === "night-minoxidil");
  if (dayName === "Monday" || dayName === "Sunday") tasks.splice(minoxidilIndex, 0, { id: "microneedle-eyebrows", title: "Microneedle eyebrows" });
  if (["Tuesday", "Thursday", "Saturday"].includes(dayName)) tasks.push({ id: "masseter-training", title: "Train masseter muscles" });
  if (dayName === "Sunday") {
    const whiteningIndex = tasks.findIndex(task => task.id === "whitening-strips");
    tasks.splice(whiteningIndex, 0,
      { id: "exfoliate-lips", title: "Exfoliate lips: sugar, coconut oil, and raw honey mix" },
      { id: "vaseline-lips", title: "Apply Vaseline to lips" }
    );
  }
  return tasks;
}
const LOOKS_ROUTINES = Object.fromEntries(WEEK_ORDER.map(dayName => [dayName, {
  morning: makeMorning(dayName), midday: makeMidday(dayName), night: makeNight(dayName)
}]));

const $ = id => document.getElementById(id);
const loginScreen = $("loginScreen");
const mainApp = $("mainApp");
const passwordInput = $("passwordInput");
const unlockBtn = $("unlockBtn");
const loginError = $("loginError");
const syncStatus = $("syncStatus");
let state = loadLocalState();
let saveTimer = null;
let toastTimer = null;
let renderedDayKey = getTodayKey();

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
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function getRoutineDayName(dayKey = getTodayKey()) { return DAY_NAMES[keyToLocalDate(dayKey).getDay()]; }
function getLooksRoutine(dayKey = getTodayKey()) { return LOOKS_ROUTINES[getRoutineDayName(dayKey)]; }
function getLooksTasks(dayKey = getTodayKey()) {
  const routine = getLooksRoutine(dayKey);
  return [...routine.morning, ...routine.midday, ...routine.night];
}
function getLooksTaskIds(dayKey = getTodayKey()) { return getLooksTasks(dayKey).map(task => task.id); }
function normalizeTaskId(taskId) { return LEGACY_TASK_ID_MAP[taskId] || taskId; }
function cleanList(values, allowedIds) {
  if (!Array.isArray(values)) return [];
  const allowed = new Set(allowedIds);
  return [...new Set(values.map(normalizeTaskId).filter(id => typeof id === "string" && allowed.has(id)))];
}
function createEmptyState() {
  return { days: {}, adminOverrides: { streakOffset: null, currentStreak: null, missedCounts: null } };
}
function loadLocalState() {
  for (const key of [STORAGE_KEY, ...OLD_STORAGE_KEYS]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed && typeof parsed === "object") return parsed;
    } catch { /* try next key */ }
  }
  return createEmptyState();
}
function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  OLD_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
}
function getResolvedSet(day, type = "main") {
  const done = type === "main" ? day.done : day.looksDone;
  const skipped = type === "main" ? day.skipped : day.looksSkipped;
  return new Set([...(done || []), ...(skipped || [])]);
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
function normalizeState() {
  let changed = false;
  if (!state || typeof state !== "object") { state = createEmptyState(); changed = true; }
  if (!state.days || typeof state.days !== "object") { state.days = {}; changed = true; }
  if (!state.adminOverrides || typeof state.adminOverrides !== "object") { state.adminOverrides = {}; changed = true; }

  for (const dayKey of Object.keys(state.days)) {
    const original = state.days[dayKey] || {};
    const allowedLooks = getLooksTaskIds(dayKey);
    const normalized = {
      ...original,
      done: cleanList(original.done, TASK_IDS),
      skipped: cleanList(original.skipped, TASK_IDS),
      looksDone: cleanList(original.looksDone, allowedLooks),
      looksSkipped: cleanList(original.looksSkipped, allowedLooks),
      waterOz: Math.max(0, Math.min(WATER_MAX_OZ, Math.round(Number(original.waterOz) || 0))),
      missedReason: typeof original.missedReason === "string" ? original.missedReason : ""
    };
    normalized.skipped = normalized.skipped.filter(id => !normalized.done.includes(id));
    normalized.looksSkipped = normalized.looksSkipped.filter(id => !normalized.looksDone.includes(id));
    syncWaterTask(normalized, dayKey);
    normalized.completed = getResolvedSet(normalized, "main").size === TASK_IDS.length;
    normalized.looksCompleted = getResolvedSet(normalized, "looks").size === allowedLooks.length;
    if (JSON.stringify(original) !== JSON.stringify(normalized)) { state.days[dayKey] = normalized; changed = true; }
  }

  const override = state.adminOverrides;
  if (!Number.isInteger(override.streakOffset)) {
    if (Number.isInteger(override.currentStreak) && override.currentStreak >= 0) {
      override.streakOffset = override.currentStreak - calculateCurrentStreak();
      changed = true;
    } else {
      override.streakOffset = null;
    }
  }
  override.currentStreak = null;
  if (override.missedCounts !== null && typeof override.missedCounts !== "object") { override.missedCounts = null; changed = true; }
  return changed;
}
function ensureDay(dayKey = getTodayKey()) {
  if (!state.days[dayKey]) state.days[dayKey] = { done: [], skipped: [], looksDone: [], looksSkipped: [], waterOz: 0, completed: false, looksCompleted: false, missedReason: "" };
  const day = state.days[dayKey];
  day.done = cleanList(day.done, TASK_IDS);
  day.skipped = cleanList(day.skipped, TASK_IDS).filter(id => !day.done.includes(id));
  day.looksDone = cleanList(day.looksDone, getLooksTaskIds(dayKey));
  day.looksSkipped = cleanList(day.looksSkipped, getLooksTaskIds(dayKey)).filter(id => !day.looksDone.includes(id));
  day.waterOz = Math.max(0, Math.min(WATER_MAX_OZ, Math.round(Number(day.waterOz) || 0)));
  if (typeof day.missedReason !== "string") day.missedReason = "";
  syncWaterTask(day, dayKey);
  day.completed = getResolvedSet(day, "main").size === TASK_IDS.length;
  day.looksCompleted = getResolvedSet(day, "looks").size === getLooksTaskIds(dayKey).length;
  return day;
}
function saveState() { saveLocalState(); queueSupabaseSave(); }
function queueSupabaseSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSupabaseState, 450);
}
async function loadSupabaseState() {
  if (!supabaseClient) { syncStatus.textContent = "Saved locally. Supabase is not connected."; return; }
  syncStatus.textContent = "Loading from Supabase…";
  const { data, error } = await supabaseClient.from(SUPABASE_TABLE).select("state").eq("id", SUPABASE_ROW_ID).maybeSingle();
  if (error) { console.error(error); syncStatus.textContent = "Supabase load failed. Using local save."; return; }
  if (data?.state && typeof data.state === "object") {
    state = data.state;
    normalizeState();
    saveLocalState();
    render();
  } else {
    await saveSupabaseState();
  }
  syncStatus.textContent = "Synced with Supabase.";
}
async function saveSupabaseState() {
  if (!supabaseClient) { syncStatus.textContent = "Saved locally. Supabase is not connected."; return; }
  syncStatus.textContent = "Saving…";
  const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert({ id: SUPABASE_ROW_ID, state, updated_at: new Date().toISOString() });
  if (error) { console.error(error); syncStatus.textContent = "Supabase save failed. Saved locally only."; return; }
  syncStatus.textContent = "Saved to Supabase.";
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
function calculateCurrentStreak() { return calculateStreak("completed"); }
function calculateLooksStreak() { return calculateStreak("looksCompleted"); }
function getDisplayedCurrentStreak() {
  const offset = Number.isInteger(state.adminOverrides?.streakOffset) ? state.adminOverrides.streakOffset : 0;
  return Math.max(0, calculateCurrentStreak() + offset);
}
function calculateTaskStreak(taskId) {
  let date = keyToLocalDate(getTodayKey());
  let streak = 0;
  if (!state.days[getTodayKey()]?.done?.includes(taskId)) date = addDays(date, -1);
  while (state.days[formatDateKey(date)]?.done?.includes(taskId)) {
    streak += 1;
    date = addDays(date, -1);
  }
  return streak;
}
function getCurrentRank(streak) { return RANKS.reduce((current, rank) => streak >= rank.days ? rank : current, RANKS[0]); }
function getNextRank(streak) { return RANKS.find(rank => rank.days > streak) || null; }

function setMainStatus(taskId, status) {
  const day = ensureDay();
  const done = new Set(day.done);
  const skipped = new Set(day.skipped);
  if (status === "done") {
    if (done.has(taskId)) done.delete(taskId); else { done.add(taskId); skipped.delete(taskId); }
  } else if (status === "skipped") {
    if (skipped.has(taskId)) skipped.delete(taskId); else { skipped.add(taskId); done.delete(taskId); }
  }
  day.done = [...done];
  day.skipped = [...skipped];
  day.completed = getResolvedSet(day, "main").size === TASK_IDS.length;
  saveState();
  render();
}
function setLooksStatus(task, status) {
  const day = ensureDay();
  const done = new Set(day.looksDone);
  const skipped = new Set(day.looksSkipped);
  if (status === "done") {
    if (done.has(task.id)) done.delete(task.id); else { done.add(task.id); skipped.delete(task.id); }
  } else if (status === "skipped") {
    if (skipped.has(task.id)) skipped.delete(task.id); else { skipped.add(task.id); done.delete(task.id); }
  }
  if (task.meta === "morningWater" && status === "done" && done.has(task.id) && day.waterOz < 8) day.waterOz = 8;
  day.looksDone = [...done];
  day.looksSkipped = [...skipped];
  syncWaterTask(day, getTodayKey());
  day.looksCompleted = getResolvedSet(day, "looks").size === getLooksTaskIds().length;
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
      ${skipped ? `<div class="task-status">Skipped today</div>` : ""}
    </div>`;
  main.addEventListener("click", onToggle);

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
  row.append(main, menu);
  return row;
}

function renderTaskLists() {
  const day = ensureDay();
  const done = new Set(day.done);
  const skipped = new Set(day.skipped);
  $("morningList").innerHTML = "";
  $("afternoonList").innerHTML = "";
  $("nightList").innerHTML = "";
  for (const task of TASKS) {
    const row = createTaskRow(task, done.has(task.id), skipped.has(task.id), "", () => setMainStatus(task.id, "done"), () => setMainStatus(task.id, "skipped"));
    $(`${task.section}List`).appendChild(row);
  }
}
function renderProgress() {
  const day = ensureDay();
  const done = day.done.length;
  const skipped = day.skipped.length;
  const resolved = done + skipped;
  const total = TASKS.length;
  const percent = Math.round((resolved / total) * 100);
  const left = total - resolved;
  $("percent").textContent = `${percent}%`;
  $("doneCount").textContent = skipped ? `${done} done • ${skipped} skipped` : `${done} / ${total}`;
  $("tasksLeft").textContent = left === 0
    ? "Main checklist resolved. The streak updated immediately."
    : `${left} main task${left === 1 ? "" : "s"} left today.`;
  $("progressCircle").style.background = `conic-gradient(var(--green) ${Math.round((resolved / total) * 360)}deg, rgba(42,30,18,.09) 0deg)`;
}
function renderPhoneLock() {
  const resolved = getResolvedSet(ensureDay(), "main");
  const remaining = MORNING_TASK_IDS.filter(id => !resolved.has(id)).length;
  const complete = remaining === 0;
  $("phoneLockCard").classList.toggle("locked", !complete);
  $("phoneLockCard").classList.toggle("unlocked", complete);
  $("phoneLockTitle").textContent = complete ? "Phone unlocked" : "Phone locked";
  $("phoneLockText").textContent = complete ? "Morning list is resolved." : `${remaining} morning task${remaining === 1 ? "" : "s"} left.`;
  $("phoneLockBadge").textContent = complete ? "Unlocked" : "Locked";
}
function renderRankAndReward() {
  const streak = getDisplayedCurrentStreak();
  const looksStreak = calculateLooksStreak();
  const gymStreak = calculateTaskStreak("gym");
  const currentRank = getCurrentRank(streak);
  const nextRank = getNextRank(streak);
  $("rankBadge").textContent = `Day ${streak}`;
  $("rankName").textContent = currentRank.name;
  $("rankCopy").textContent = currentRank.copy;
  $("bigStreak").textContent = streak;
  $("gameChecklistStreak").textContent = streak;
  $("gameLooksStreak").textContent = looksStreak;
  $("gameGymStreak").textContent = gymStreak;
  $("gameRewardProgress").textContent = `${Math.min(streak, 7)} / 7`;
  $("looksStreak").textContent = looksStreak;

  if (nextRank) {
    const span = nextRank.days - currentRank.days;
    $("rankProgress").style.width = `${Math.max(0, Math.min(100, ((streak - currentRank.days) / span) * 100))}%`;
  } else $("rankProgress").style.width = "100%";

  if (streak >= 7) {
    $("rewardBadge").textContent = "Unlocked";
    $("rewardText").textContent = "You earned it. Guts Racing seat cover unlocked.";
  } else {
    const left = 7 - streak;
    $("rewardBadge").textContent = `${left} left`;
    $("rewardText").textContent = `Resolve ${left} more main-checklist day${left === 1 ? "" : "s"} in a row.`;
  }
  renderRankLadder(streak);
}
function renderRankLadder(streak) {
  const ladder = $("rankLadder");
  ladder.innerHTML = "";
  for (const rank of RANKS) {
    const active = streak >= rank.days;
    const item = document.createElement("div");
    item.className = `ladder-item ${active ? "active" : ""}`;
    item.innerHTML = `<div class="ladder-dot">${active ? "✓" : rank.days}</div><div><div class="ladder-name">${rank.name}</div><div class="ladder-days">${rank.days} main day${rank.days === 1 ? "" : "s"}</div></div><div class="badge">${active ? "Unlocked" : "Locked"}</div>`;
    ladder.appendChild(item);
  }
}
function renderLooksTaskList(element, tasks, day) {
  element.innerHTML = "";
  const done = new Set(day.looksDone);
  const skipped = new Set(day.looksSkipped);
  for (const task of tasks) {
    const toggle = () => {
      if (task.meta === "waterTracked") { $("waterCard").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      setLooksStatus(task, "done");
    };
    element.appendChild(createTaskRow(task, done.has(task.id), skipped.has(task.id), "looks-task", toggle, () => setLooksStatus(task, "skipped")));
  }
}
function renderLooks() {
  const key = getTodayKey();
  const day = ensureDay(key);
  const dayName = getRoutineDayName(key);
  const routine = getLooksRoutine(key);
  const date = keyToLocalDate(key);
  $("looksDayName").textContent = `${dayName} routine`;
  $("looksDateText").textContent = `${dayName}, ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
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
  $("looksDoneCount").textContent = skipped ? `${done} done • ${skipped} skipped` : `${done} / ${total}`;
  $("looksTasksLeft").textContent = left === 0 ? "Looksmaxxing routine resolved. Its separate streak updated." : `${left} looks task${left === 1 ? "" : "s"} left today.`;
  $("looksProgressCircle").style.background = `conic-gradient(var(--blue) ${total ? Math.round((resolved / total) * 360) : 0}deg, rgba(42,30,18,.09) 0deg)`;
  $("workoutName").textContent = WORKOUTS[dayName];
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
  else $("waterStatus").textContent = waterOz === WATER_TARGET_OZ ? "120 oz target complete." : `${waterOz - WATER_TARGET_OZ} oz above target.`;
}
function setWaterOz(value) {
  const day = ensureDay();
  day.waterOz = Math.max(0, Math.min(WATER_MAX_OZ, Math.round(Number(value) || 0)));
  syncWaterTask(day, getTodayKey());
  day.looksCompleted = getResolvedSet(day, "looks").size === getLooksTaskIds().length;
  saveState();
  render();
}

function getReviewDayKeys() {
  const active = getTodayKey();
  return Object.keys(state.days).filter(key => {
    const day = state.days[key];
    const hasMainActivity = (day.done?.length || 0) + (day.skipped?.length || 0) > 0 || day.completed === true || day.missedReason?.trim();
    return hasMainActivity && !(key === active && day.completed !== true);
  }).sort().slice(-7);
}
function getCalculatedMissedCounts() {
  const counts = Object.fromEntries(TASKS.map(task => [task.id, 0]));
  for (const key of getReviewDayKeys()) {
    const resolved = getResolvedSet(ensureDay(key), "main");
    TASKS.forEach(task => { if (!resolved.has(task.id)) counts[task.id] += 1; });
  }
  return counts;
}
function getDisplayedMissedCounts() {
  const override = state.adminOverrides?.missedCounts;
  if (!override || typeof override !== "object") return getCalculatedMissedCounts();
  return Object.fromEntries(TASKS.map(task => [task.id, Number.isInteger(Number(override[task.id])) ? Math.max(0, Number(override[task.id])) : 0]));
}
function renderReview() {
  const day = ensureDay();
  if (document.activeElement !== $("missedReasonBox")) $("missedReasonBox").value = day.missedReason;
  const missed = TASKS.map(task => ({ ...task, missed: getDisplayedMissedCounts()[task.id] || 0 })).filter(task => task.missed > 0).sort((a,b) => b.missed - a.missed);
  const list = $("missedTasksList");
  list.innerHTML = "";
  if (!missed.length) { list.innerHTML = `<div class="missed-item"><div class="missed-name">No missed-task data yet.</div></div>`; return; }
  const max = Math.max(...missed.map(task => task.missed), 1);
  missed.slice(0,8).forEach(task => {
    const item = document.createElement("div");
    item.className = "missed-item";
    item.innerHTML = `<div class="missed-top"><div class="missed-name">${escapeHtml(task.title)}</div><div class="missed-count">${task.missed}x</div></div><div class="missed-bar"><span style="width:${Math.round((task.missed/max)*100)}%"></span></div>`;
    list.appendChild(item);
  });
}
function renderAdmin() {
  const calculated = calculateCurrentStreak();
  const displayed = getDisplayedCurrentStreak();
  const offset = Number.isInteger(state.adminOverrides?.streakOffset) ? state.adminOverrides.streakOffset : 0;
  $("adminCurrentInfo").textContent = offset
    ? `Calculated: ${calculated}. Correction: ${offset > 0 ? "+" : ""}${offset}. Displayed: ${displayed}. It will still update when today resolves.`
    : `Current streak is calculated from resolved main-checklist days: ${calculated}.`;
  $("adminCurrentStreakInput").placeholder = `Current: ${displayed}`;
  $("missedOverrideBadge").textContent = state.adminOverrides?.missedCounts ? "Edited" : "Calculated";
  const list = $("adminMissedCountsList");
  list.innerHTML = "";
  const counts = getDisplayedMissedCounts();
  TASKS.forEach(task => {
    const row = document.createElement("label");
    row.className = "missed-admin-row";
    row.innerHTML = `<span>${escapeHtml(task.title)}</span><input class="admin-input admin-missed-count" type="number" min="0" max="99" inputmode="numeric" value="${counts[task.id] || 0}" data-task-id="${task.id}" />`;
    list.appendChild(row);
  });
}
function setCurrentStreakCorrection() {
  const value = Number($("adminCurrentStreakInput").value);
  if (!Number.isInteger(value) || value < 0 || value > 365) return setAdminStatus("Enter a whole number from 0 to 365.", "bad");
  state.adminOverrides.streakOffset = value - calculateCurrentStreak();
  $("adminCurrentStreakInput").value = "";
  saveState(); render(); setAdminStatus(`Displayed main streak set to ${value}.`, "good");
}
function clearCurrentStreakCorrection() {
  state.adminOverrides.streakOffset = null;
  saveState(); render(); setAdminStatus("Main streak now uses calculated history only.", "good");
}
function saveMissedOverrides() {
  const counts = {};
  for (const input of document.querySelectorAll(".admin-missed-count")) {
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 0 || value > 99) return setAdminStatus("Missed counts must be whole numbers from 0 to 99.", "bad");
    if (value > 0) counts[input.dataset.taskId] = value;
  }
  state.adminOverrides.missedCounts = counts;
  saveState(); render(); setAdminStatus("Missed-task numbers saved.", "good");
}
function clearMissedOverrides() { state.adminOverrides.missedCounts = {}; saveState(); render(); setAdminStatus("All displayed missed-task numbers reset to 0.", "good"); }
function setAdminStatus(message, type = "") {
  const el = $("adminStatus");
  el.textContent = message;
  el.classList.toggle("good", type === "good");
  el.classList.toggle("bad", type === "bad");
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
function render() {
  renderedDayKey = getTodayKey();
  ensureDay();
  renderTaskLists();
  renderProgress();
  renderPhoneLock();
  renderRankAndReward();
  renderLooks();
  renderReview();
  renderAdmin();
}
function showApp() { loginScreen.classList.add("hidden"); mainApp.classList.remove("hidden"); render(); }
function showLogin() { mainApp.classList.add("hidden"); loginScreen.classList.remove("hidden"); setTimeout(() => passwordInput.focus(), 50); }
async function unlock() {
  if (passwordInput.value.trim() !== PASSWORD) { loginError.textContent = "Wrong password."; passwordInput.select(); return; }
  loginError.textContent = ""; passwordInput.value = ""; showApp(); await loadSupabaseState();
}
function setupTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  const pages = [...document.querySelectorAll(".page")];
  tabs.forEach(tab => tab.addEventListener("click", () => {
    tabs.forEach(item => item.classList.remove("active"));
    pages.forEach(page => page.classList.remove("active"));
    tab.classList.add("active");
    $(tab.dataset.tab).classList.add("active");
    render();
  }));
}

unlockBtn.addEventListener("click", unlock);
passwordInput.addEventListener("keydown", event => { if (event.key === "Enter") unlock(); });
$("logoutBtn").addEventListener("click", showLogin);
$("missedReasonBox").addEventListener("input", () => { ensureDay().missedReason = $("missedReasonBox").value; saveState(); });
document.querySelectorAll("[data-water-add]").forEach(button => button.addEventListener("click", () => setWaterOz(ensureDay().waterOz + Number(button.dataset.waterAdd))));
$("resetWaterBtn").addEventListener("click", () => setWaterOz(0));
$("addCustomWaterBtn").addEventListener("click", () => {
  const amount = Number($("waterCustomInput").value);
  if (!Number.isFinite(amount) || amount <= 0) return $("waterCustomInput").focus();
  setWaterOz(ensureDay().waterOz + amount);
  $("waterCustomInput").value = "";
});
$("waterCustomInput").addEventListener("keydown", event => { if (event.key === "Enter") $("addCustomWaterBtn").click(); });
$("adminSetCurrentStreakBtn").addEventListener("click", setCurrentStreakCorrection);
$("adminClearCurrentStreakBtn").addEventListener("click", clearCurrentStreakCorrection);
$("adminSaveMissedCountsBtn").addEventListener("click", saveMissedOverrides);
$("adminClearMissedCountsBtn").addEventListener("click", clearMissedOverrides);
document.addEventListener("click", event => {
  document.querySelectorAll("details.task-menu[open]").forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
});
setInterval(() => {
  if (getTodayKey() !== renderedDayKey && !mainApp.classList.contains("hidden")) { normalizeState(); render(); }
}, 60000);

setupTabs();
if (normalizeState()) saveLocalState();
showLogin();
