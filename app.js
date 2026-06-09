/* Accountability OS
   Static-first app with optional Supabase sync.
   Paste your Supabase project URL and anon/public key below if you want cloud login.
*/

const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

let sb = null;
let currentUser = null;
let syncTimer = null;
let toastTimer = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const STORE_KEY = "accountabilityOS.v2";
const APP_VERSION = 2;

const SECTION_ORDER = ["morning", "afternoon", "night", "extra"];

const SECTION_META = {
  morning: {
    title: "Morning Gate",
    subtitle: "This must be resolved first. Complete it or fail it honestly.",
  },
  afternoon: {
    title: "Afternoon",
    subtitle: "Training, supplements, and daytime execution.",
  },
  night: {
    title: "Night",
    subtitle: "Close the day properly. Bedtime routine starts at 8:00 PM.",
  },
  extra: {
    title: "Extra",
    subtitle: "Quick tasks and custom add-ons for this date.",
  },
};

const BASE_TASKS = [
  {
    id: "wake_planned",
    title: "Wake up at planned time",
    section: "morning",
    schedule: "daily",
    xp: 25,
    critical: true,
    special: "wake",
    icon: "⏰",
    note: "Set planned wake time, log actual wake time, and confirm no alarm skipping.",
  },
  {
    id: "water_glass",
    title: "Drink one full glass of water",
    section: "morning",
    schedule: "daily",
    xp: 10,
    icon: "💧",
    note: "Regular glass. Drink it early and move.",
  },
  {
    id: "clean_room",
    title: "Clean room",
    section: "morning",
    schedule: "daily",
    xp: 15,
    icon: "🧹",
    note: "Reset your room so the day starts clean.",
  },
  {
    id: "pray_morning",
    title: "Pray",
    section: "morning",
    schedule: "daily",
    xp: 10,
    icon: "✦",
    note: "Morning prayer before the desk tasks.",
  },
  {
    id: "trw_good_morning",
    title: "The Real World daily good morning",
    section: "morning",
    schedule: "daily",
    xp: 10,
    icon: "☀",
    note: "Check in and start the workday.",
  },
  {
    id: "trw_lesson",
    title: "The Real World daily lesson",
    section: "morning",
    schedule: "daily",
    xp: 15,
    icon: "▣",
    note: "Complete the lesson before random work.",
  },
  {
    id: "trw_puzzle",
    title: "The Real World daily puzzle",
    section: "morning",
    schedule: "daily",
    xp: 10,
    icon: "◇",
    note: "Finish the daily puzzle.",
  },
  {
    id: "full_get_ready",
    title: "Full get ready: dressed, hygiene, hairstyle",
    section: "morning",
    schedule: "daily",
    xp: 15,
    icon: "◆",
    note: "Get dressed, hygiene handled, hair styled, and actually ready for the day.",
  },
  {
    id: "gym",
    title: "Go to the gym",
    section: "afternoon",
    schedule: "days",
    days: [1, 3, 5],
    xp: 35,
    icon: "▲",
    note: "Monday, Wednesday, Friday.",
  },
  {
    id: "creatine",
    title: "Take creatine",
    section: "afternoon",
    schedule: "daily",
    xp: 12,
    special: "creatine",
    icon: "◉",
    note: "Goal: 5 to 10 grams every day.",
  },
  {
    id: "microneedle_eyebrows",
    title: "Microneedle eyebrows",
    section: "night",
    schedule: "days",
    days: [3, 6],
    xp: 18,
    icon: "✧",
    note: "Wednesday and Saturday.",
  },
  {
    id: "bedtime_routine",
    title: "Full bedtime routine at 8:00 PM",
    section: "night",
    schedule: "daily",
    due: "8:00 PM",
    xp: 20,
    icon: "☾",
    note: "You do not have to sleep yet. Start the routine at 8.",
  },
  {
    id: "pray_night",
    title: "Pray before bed",
    section: "night",
    schedule: "daily",
    xp: 10,
    icon: "✦",
    note: "Final prayer before sleep.",
  },
];

const RANKS = [
  { name: "Rookie", xp: 0 },
  { name: "Locked In", xp: 150 },
  { name: "Disciplined", xp: 400 },
  { name: "Machine", xp: 800 },
  { name: "Elite", xp: 1300 },
  { name: "Unbreakable", xp: 2000 },
  { name: "Legend Mode", xp: 3200 },
];

const ACHIEVEMENTS = [
  {
    id: "first_task",
    title: "First Rep",
    description: "Complete your first tracked task.",
    test: (stats) => stats.totalDone >= 1,
  },
  {
    id: "first_perfect_day",
    title: "Clean Day",
    description: "Hit one perfect day.",
    test: (stats) => stats.perfectDays >= 1,
  },
  {
    id: "three_streak",
    title: "3-Day Lock",
    description: "Hold a 3-day perfect streak.",
    test: (stats) => stats.streak >= 3,
  },
  {
    id: "seven_streak",
    title: "One Full Week",
    description: "Hold a 7-day perfect streak.",
    test: (stats) => stats.streak >= 7,
  },
  {
    id: "gym_proof",
    title: "Gym Proof",
    description: "Complete at least one gym day.",
    test: (stats) => stats.gymCompletions >= 1,
  },
  {
    id: "morning_master",
    title: "Morning Master",
    description: "Complete all morning tasks on any day.",
    test: (stats) => stats.morningPerfectDays >= 1,
  },
  {
    id: "one_k_xp",
    title: "1K XP",
    description: "Earn 1,000 XP.",
    test: (stats) => stats.totalXp >= 1000,
  },
  {
    id: "thirty_perfect",
    title: "30 Perfect Days",
    description: "Stack 30 total perfect days.",
    test: (stats) => stats.perfectDays >= 30,
  },
  {
    id: "hard_truth",
    title: "Honest Fail",
    description: "Mark a task failed instead of hiding it.",
    test: (stats) => stats.totalFailed >= 1,
  },
];

const PAGE_META = {
  today: {
    eyebrow: "Today",
    title: "Daily Accountability",
    subtitle: "Finish the morning gate, then move through the rest of the day.",
  },
  planner: {
    eyebrow: "Planner",
    title: "Rules & Add-ons",
    subtitle: "Your default recurring system plus quick tasks for the selected day.",
  },
  stats: {
    eyebrow: "Stats",
    title: "Progress Dashboard",
    subtitle: "XP, rank, achievements, perfect days, and completion quality.",
  },
  history: {
    eyebrow: "History",
    title: "Past Performance",
    subtitle: "Review recent days and spot where the routine is breaking.",
  },
  settings: {
    eyebrow: "Settings",
    title: "Backup & Sync",
    subtitle: "Export your tracker, import a backup, or connect Supabase.",
  },
};

const $ = (id) => document.getElementById(id);

let selectedDate = normalizeDate(new Date());
let selectedHistoryDate = normalizeDate(new Date());
let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORE_KEY);

  if (!raw) {
    return freshState();
  }

  try {
    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  } catch {
    return freshState();
  }
}

function freshState() {
  return {
    version: APP_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    days: {},
    customTasks: [],
  };
}

function migrateState(input) {
  const next = {
    ...freshState(),
    ...input,
    version: APP_VERSION,
    days: input.days || {},
    customTasks: input.customTasks || [],
  };

  Object.keys(next.days).forEach((key) => {
    next.days[key] = normalizeDayState(next.days[key]);
  });

  return next;
}

function normalizeDayState(day = {}) {
  return {
    completed: day.completed || {},
    failed: day.failed || {},
    wake: {
      planned: day.wake?.planned || "",
      actual: day.wake?.actual || "",
      noAlarmSkipping: !!day.wake?.noAlarmSkipping,
    },
    creatineGrams: day.creatineGrams || "",
    quickTasks: Array.isArray(day.quickTasks) ? day.quickTasks : [],
    notes: day.notes || "",
  };
}

function saveState({ sync = true } = {}) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORE_KEY, JSON.stringify(state));

  if (sync) {
    scheduleSupabaseSync();
  }
}

function normalizeDate(date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

function dateKey(date = selectedDate) {
  return normalizeDate(date).toISOString().slice(0, 10);
}

function fromKey(key) {
  return normalizeDate(new Date(`${key}T12:00:00`));
}

function formatDate(date = selectedDate, options = {}) {
  return date.toLocaleDateString(undefined, {
    weekday: options.short ? "short" : "long",
    month: "short",
    day: "numeric",
    year: options.year === false ? undefined : "numeric",
  });
}

function getDayState(key = dateKey()) {
  if (!state.days[key]) {
    state.days[key] = normalizeDayState();
  }

  return state.days[key];
}

function getAllTasksForDate(date = selectedDate) {
  const key = dateKey(date);
  const base = BASE_TASKS.filter((task) => taskScheduled(task, date));
  const custom = state.customTasks
    .filter((task) => taskScheduled(task, date))
    .map((task) => ({
      ...task,
      custom: true,
      icon: task.icon || "＋",
      note: task.note || "Custom recurring task.",
    }));

  const quick = getDayState(key).quickTasks.map((task) => ({
    ...task,
    quick: true,
    schedule: "once",
    icon: task.icon || "＋",
    note: task.note || "Quick task for this day only.",
  }));

  return [...base, ...custom, ...quick].sort((a, b) => {
    const sectionDiff = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
    if (sectionDiff !== 0) return sectionDiff;
    return String(a.title).localeCompare(String(b.title));
  });
}

function taskScheduled(task, date) {
  const day = normalizeDate(date).getDay();

  if (task.schedule === "daily") return true;
  if (task.schedule === "once") return true;
  if (task.schedule === "weekend") return day === 0 || day === 6;
  if (task.schedule === "gym") return [1, 3, 5].includes(day);
  if (task.schedule === "days") return Array.isArray(task.days) && task.days.includes(day);

  return true;
}

function isDone(task, key = dateKey()) {
  return !!getDayState(key).completed[task.id];
}

function isFailed(task, key = dateKey()) {
  return !!getDayState(key).failed[task.id];
}

function isResolved(task, key = dateKey()) {
  return isDone(task, key) || isFailed(task, key);
}

function getMorningTasks(date = selectedDate) {
  return getAllTasksForDate(date).filter((task) => task.section === "morning");
}

function morningGateOpen(date = selectedDate) {
  const key = dateKey(date);
  const morningTasks = getMorningTasks(date);

  if (!morningTasks.length) return true;

  return morningTasks.every((task) => isResolved(task, key));
}

function sectionLocked(section, date = selectedDate) {
  if (section === "morning") return false;
  return !morningGateOpen(date);
}

function setTaskDone(task, value = true) {
  const key = dateKey();
  const day = getDayState(key);

  if (sectionLocked(task.section) && !isResolved(task, key)) {
    toast("Morning gate is still locked. Resolve morning first.");
    return;
  }

  if (value) {
    const validation = validateTaskBeforeDone(task, day);
    if (!validation.ok) {
      toast(validation.message);
      return;
    }

    day.completed[task.id] = new Date().toISOString();
    delete day.failed[task.id];
  } else {
    delete day.completed[task.id];
  }

  saveState();
  renderAll();
}

function failTask(task) {
  const key = dateKey();
  const day = getDayState(key);

  if (sectionLocked(task.section) && !isResolved(task, key)) {
    toast("Morning gate is still locked. Resolve morning first.");
    return;
  }

  day.failed[task.id] = new Date().toISOString();
  delete day.completed[task.id];

  saveState();
  renderAll();

  if (task.critical) {
    toast("Wake-up failed. Perfect day is gone, but the day is still trackable.");
  } else {
    toast("Task marked failed.");
  }
}

function validateTaskBeforeDone(task, day) {
  if (task.special === "wake") {
    if (!day.wake.planned) {
      return { ok: false, message: "Set your planned wake time first." };
    }

    if (!day.wake.actual) {
      return { ok: false, message: "Log your actual wake time first." };
    }

    if (!day.wake.noAlarmSkipping) {
      return { ok: false, message: "Confirm no alarm skipping first." };
    }

    if (timeToMinutes(day.wake.actual) > timeToMinutes(day.wake.planned)) {
      return {
        ok: false,
        message: "Actual wake time is later than planned. Mark it failed or correct the time.",
      };
    }
  }

  if (task.special === "creatine") {
    const grams = Number(day.creatineGrams);

    if (!grams || grams < 5 || grams > 10) {
      return { ok: false, message: "Enter creatine between 5 and 10 grams first." };
    }
  }

  return { ok: true };
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function failUnfinishedMorning() {
  const key = dateKey();
  const day = getDayState(key);
  const morningTasks = getMorningTasks();

  const unfinished = morningTasks.filter((task) => !isResolved(task, key));

  if (!unfinished.length) {
    toast("Morning is already resolved.");
    return;
  }

  unfinished.forEach((task) => {
    day.failed[task.id] = new Date().toISOString();
    delete day.completed[task.id];
  });

  saveState();
  renderAll();
  toast(`${unfinished.length} unfinished morning task${unfinished.length === 1 ? "" : "s"} failed. Afternoon unlocked.`);
}

function completeAllVisibleCleanTasks() {
  const key = dateKey();
  const day = getDayState(key);
  const tasks = getAllTasksForDate();

  let count = 0;

  tasks.forEach((task) => {
    if (sectionLocked(task.section) && !isResolved(task, key)) return;
    if (isResolved(task, key)) return;
    if (task.special) return;

    day.completed[task.id] = new Date().toISOString();
    count += 1;
  });

  saveState();
  renderAll();

  if (!count) {
    toast("No clean visible tasks were available to complete.");
  } else {
    toast(`${count} clean task${count === 1 ? "" : "s"} completed.`);
  }
}

function getDayStats(key = dateKey(), date = fromKey(key)) {
  const tasks = getAllTasksForDate(date);
  const done = tasks.filter((task) => isDone(task, key));
  const failed = tasks.filter((task) => isFailed(task, key));
  const resolved = tasks.filter((task) => isResolved(task, key));
  const unresolved = tasks.length - resolved.length;
  const completePercent = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const resolvedPercent = tasks.length ? Math.round((resolved.length / tasks.length) * 100) : 0;
  const todayXp = done.reduce((sum, task) => sum + Number(task.xp || 0), 0);
  const perfect = tasks.length > 0 && failed.length === 0 && done.length === tasks.length;

  return {
    key,
    date,
    tasks,
    done,
    failed,
    resolved,
    unresolved,
    completePercent,
    resolvedPercent,
    todayXp,
    perfect,
  };
}

function getLifetimeStats() {
  let totalXp = 0;
  let totalDone = 0;
  let totalFailed = 0;
  let totalScheduled = 0;
  let totalResolved = 0;
  let perfectDays = 0;
  let morningPerfectDays = 0;
  let gymCompletions = 0;

  const allKeys = getRelevantHistoryKeys();

  allKeys.forEach((key) => {
    const date = fromKey(key);
    const dayStats = getDayStats(key, date);
    const morningTasks = dayStats.tasks.filter((task) => task.section === "morning");
    const morningDone = morningTasks.filter((task) => isDone(task, key));

    totalXp += dayStats.todayXp;
    totalDone += dayStats.done.length;
    totalFailed += dayStats.failed.length;
    totalScheduled += dayStats.tasks.length;
    totalResolved += dayStats.resolved.length;

    if (dayStats.perfect) perfectDays += 1;

    if (morningTasks.length && morningDone.length === morningTasks.length) {
      morningPerfectDays += 1;
    }

    if (isDone({ id: "gym" }, key)) {
      gymCompletions += 1;
    }
  });

  const completionRate = totalResolved ? Math.round((totalDone / totalResolved) * 100) : 0;

  return {
    totalXp,
    totalDone,
    totalFailed,
    totalScheduled,
    totalResolved,
    perfectDays,
    morningPerfectDays,
    gymCompletions,
    completionRate,
    streak: calculatePerfectStreak(),
  };
}

function getRelevantHistoryKeys() {
  const keys = new Set(Object.keys(state.days));

  const today = normalizeDate(new Date());
  for (let i = 0; i < 90; i++) {
    const date = normalizeDate(today);
    date.setDate(today.getDate() - i);
    keys.add(dateKey(date));
  }

  return [...keys].sort();
}

function calculatePerfectStreak() {
  let streak = 0;
  const cursor = normalizeDate(new Date());

  while (true) {
    const key = dateKey(cursor);
    const stats = getDayStats(key, cursor);

    if (stats.perfect) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function getRank(totalXp) {
  let current = RANKS[0];
  let next = RANKS[1] || null;

  for (let i = 0; i < RANKS.length; i++) {
    if (totalXp >= RANKS[i].xp) {
      current = RANKS[i];
      next = RANKS[i + 1] || null;
    }
  }

  const progress = next ? totalXp - current.xp : 1;
  const needed = next ? next.xp - current.xp : 1;
  const percent = next ? Math.min(100, Math.round((progress / needed) * 100)) : 100;

  return {
    current,
    next,
    progress,
    needed,
    percent,
  };
}

function renderAll() {
  renderHeader();
  renderToday();
  renderPlanner();
  renderStats();
  renderHistory();
  renderSettings();
}

function renderHeader() {
  $("dateChip").textContent = formatDate(selectedDate, { year: false });

  const activePage = document.querySelector(".nav-item.active")?.dataset.page || "today";
  const meta = PAGE_META[activePage] || PAGE_META.today;

  $("pageEyebrow").textContent = meta.eyebrow;
  $("pageTitle").textContent = meta.title;
  $("pageSubtitle").textContent = meta.subtitle;
}

function renderToday() {
  const key = dateKey();
  const day = getDayState(key);
  const stats = getDayStats(key, selectedDate);
  const lifetime = getLifetimeStats();
  const rank = getRank(lifetime.totalXp);
  const gateOpen = morningGateOpen(selectedDate);
  const morningLeft = getMorningTasks(selectedDate).filter((task) => !isResolved(task, key)).length;
  const dayTags = buildDayTags(selectedDate);

  $("dayBadge").textContent = dayTags.join(" • ");
  $("gateBadge").textContent = gateOpen ? "Morning resolved" : "Morning locked";
  $("gateBadge").className = `soft-badge ${gateOpen ? "good" : "warning"}`;

  const scoreDegrees = Math.round((stats.completePercent / 100) * 360);
  $("scoreRing").style.background = `conic-gradient(var(--gold) ${scoreDegrees}deg, rgba(55,43,28,.09) ${scoreDegrees}deg)`;
  $("scorePercent").textContent = `${stats.completePercent}%`;
  $("scoreFraction").textContent = `${stats.done.length} / ${stats.tasks.length} done`;

  if (stats.perfect) {
    $("todayMainMessage").textContent = "Perfect day locked.";
    $("todaySubMessage").textContent = "Every scheduled task is complete with no failures.";
  } else if (!gateOpen) {
    $("todayMainMessage").textContent = "Finish the morning gate.";
    $("todaySubMessage").textContent = "The rest of the app stays strict until every morning task is completed or failed.";
  } else if (stats.failed.length) {
    $("todayMainMessage").textContent = "Keep tracking honestly.";
    $("todaySubMessage").textContent = "There are failed tasks today, but finishing the rest still protects the data.";
  } else {
    $("todayMainMessage").textContent = "Morning is clear. Keep moving.";
    $("todaySubMessage").textContent = "Afternoon and night are open. Finish the scheduled tasks.";
  }

  $("currentStreak").textContent = lifetime.streak;
  $("currentRank").textContent = rank.current.name;
  $("rankProgressText").textContent = rank.next
    ? `${rank.progress}/${rank.needed} XP`
    : "Max rank";
  $("todayXp").textContent = stats.todayXp;

  $("sideScoreText").textContent = `${stats.completePercent}%`;
  $("sideResolvedText").textContent = `${stats.resolved.length}/${stats.tasks.length} resolved`;
  $("sideScoreBar").style.width = `${stats.completePercent}%`;

  renderFocusBanner(gateOpen, morningLeft, stats);
  renderTaskBoard(stats.tasks);

  $("dailyNotes").value = day.notes || "";
}

function renderFocusBanner(gateOpen, morningLeft, stats) {
  const banner = $("focusBanner");
  banner.className = "focus-banner";

  if (stats.perfect) {
    banner.classList.add("good");
    $("focusTitle").textContent = "Perfect day";
    $("focusText").textContent = "Everything scheduled for this date is complete.";
    $("focusCount").textContent = "clean";
    return;
  }

  if (!gateOpen) {
    $("focusTitle").textContent = "Morning gate active";
    $("focusText").textContent = "Complete or fail all morning tasks to unlock afternoon and night.";
    $("focusCount").textContent = `${morningLeft} left`;
    return;
  }

  if (stats.failed.length) {
    banner.classList.add("bad");
    $("focusTitle").textContent = "Failures logged";
    $("focusText").textContent = "The perfect day is gone, but honest tracking is still better than hiding misses.";
    $("focusCount").textContent = `${stats.failed.length} failed`;
    return;
  }

  banner.classList.add("good");
  $("focusTitle").textContent = "Morning resolved";
  $("focusText").textContent = "Afternoon and night are unlocked. Finish the remaining tasks clean.";
  $("focusCount").textContent = `${stats.unresolved} left`;
}

function renderTaskBoard(tasks) {
  const board = $("taskBoard");
  board.innerHTML = "";

  SECTION_ORDER.forEach((section) => {
    const sectionTasks = tasks.filter((task) => task.section === section);
    if (!sectionTasks.length) return;

    const locked = sectionLocked(section);
    const key = dateKey();
    const doneCount = sectionTasks.filter((task) => isDone(task, key)).length;
    const resolvedCount = sectionTasks.filter((task) => isResolved(task, key)).length;

    const wrapper = document.createElement("section");
    wrapper.className = `task-section ${locked ? "locked" : ""}`;
    wrapper.innerHTML = `
      <div class="task-section-header">
        <div>
          <h3>${escapeHtml(SECTION_META[section].title)}</h3>
          <p>${escapeHtml(SECTION_META[section].subtitle)}</p>
        </div>
        <span class="task-section-count">${doneCount}/${sectionTasks.length} done • ${resolvedCount}/${sectionTasks.length} resolved</span>
      </div>
    `;

    if (locked) {
      const lock = document.createElement("div");
      lock.className = "lock-message";
      lock.innerHTML = `<span>Locked until morning is resolved.</span><span>Strict mode</span>`;
      wrapper.appendChild(lock);
    }

    const list = document.createElement("div");
    list.className = "task-list";

    sectionTasks.forEach((task) => {
      list.appendChild(renderTaskCard(task, locked));
    });

    wrapper.appendChild(list);
    board.appendChild(wrapper);
  });
}

function renderTaskCard(task, lockedSection) {
  const key = dateKey();
  const day = getDayState(key);
  const done = isDone(task, key);
  const failed = isFailed(task, key);
  const resolved = done || failed;
  const locked = lockedSection && !resolved;

  const card = document.createElement("article");
  card.className = `task-card ${done ? "done" : ""} ${failed ? "failed" : ""} ${locked ? "locked" : ""}`;

  const check = document.createElement("button");
  check.className = "check-button";
  check.disabled = locked;
  check.textContent = done ? "✓" : failed ? "×" : task.icon || "";
  check.title = done ? "Undo complete" : "Mark complete";
  check.addEventListener("click", () => setTaskDone(task, !done));

  const content = document.createElement("div");
  content.className = "task-content";

  const badges = [];
  if (task.critical) badges.push(`<span class="soft-badge bad">critical</span>`);
  if (task.due) badges.push(`<span class="soft-badge blue">${escapeHtml(task.due)}</span>`);
  if (task.days) badges.push(`<span class="soft-badge">${escapeHtml(formatDays(task.days))}</span>`);
  if (task.quick) badges.push(`<span class="soft-badge">quick</span>`);
  if (task.custom) badges.push(`<span class="soft-badge">custom</span>`);
  badges.push(`<span class="soft-badge good">+${Number(task.xp || 0)} XP</span>`);

  content.innerHTML = `
    <div class="task-title-row">
      <h4>${escapeHtml(task.title)}</h4>
    </div>
    <p class="task-subtext">${escapeHtml(task.note || "")}</p>
    <div class="task-meta-row">${badges.join("")}</div>
  `;

  if (task.special === "wake") {
    content.appendChild(renderWakeFields(day));
  }

  if (task.special === "creatine") {
    content.appendChild(renderCreatineFields(day));
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const doneButton = document.createElement("button");
  doneButton.className = "mini-action";
  doneButton.disabled = locked;
  doneButton.textContent = done ? "Undo" : "Done";
  doneButton.addEventListener("click", () => setTaskDone(task, !done));
  actions.appendChild(doneButton);

  const failButton = document.createElement("button");
  failButton.className = "mini-action fail";
  failButton.disabled = locked;
  failButton.textContent = failed ? "Unfail" : "Fail";
  failButton.addEventListener("click", () => {
    if (failed) {
      const day = getDayState(dateKey());
      delete day.failed[task.id];
      saveState();
      renderAll();
      return;
    }

    failTask(task);
  });
  actions.appendChild(failButton);

  if (task.quick) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "mini-action delete";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteQuickTask(task.id));
    actions.appendChild(deleteButton);
  }

  card.appendChild(check);
  card.appendChild(content);
  card.appendChild(actions);

  return card;
}

function renderWakeFields(day) {
  const wrap = document.createElement("div");
  wrap.className = "special-fields";
  wrap.innerHTML = `
    <label>
      Planned wake time
      <input type="time" value="${escapeAttribute(day.wake.planned)}" data-wake-field="planned" />
    </label>
    <label>
      Actual wake time
      <input type="time" value="${escapeAttribute(day.wake.actual)}" data-wake-field="actual" />
    </label>
  `;

  const noSkip = document.createElement("label");
  noSkip.className = "inline-check";
  noSkip.innerHTML = `
    <input type="checkbox" ${day.wake.noAlarmSkipping ? "checked" : ""} data-wake-field="noAlarmSkipping" />
    No alarm skipping
  `;

  const container = document.createElement("div");
  container.appendChild(wrap);
  container.appendChild(noSkip);

  container.querySelectorAll("[data-wake-field]").forEach((input) => {
    input.addEventListener("input", handleWakeInput);
    input.addEventListener("change", handleWakeInput);
  });

  return container;
}

function handleWakeInput(event) {
  const day = getDayState(dateKey());
  const field = event.target.dataset.wakeField;

  if (field === "noAlarmSkipping") {
    day.wake.noAlarmSkipping = event.target.checked;
  } else {
    day.wake[field] = event.target.value;
  }

  saveState();
}

function renderCreatineFields(day) {
  const wrap = document.createElement("div");
  wrap.className = "special-fields one";
  wrap.innerHTML = `
    <label>
      Creatine grams
      <input type="number" min="0" max="20" step="1" value="${escapeAttribute(day.creatineGrams)}" placeholder="5 to 10" id="creatineGramsInput" />
    </label>
  `;

  wrap.querySelector("input").addEventListener("input", (event) => {
    const dayState = getDayState(dateKey());
    dayState.creatineGrams = event.target.value;
    saveState();
  });

  return wrap;
}

function renderPlanner() {
  renderRulesList();
  renderCustomTaskList();

  const picker = $("customDayPicker");
  picker.classList.toggle("active", $("customTaskSchedule").value === "custom");
}

function renderRulesList() {
  const list = $("rulesList");
  list.innerHTML = "";

  BASE_TASKS.forEach((task) => {
    const row = document.createElement("div");
    row.className = "rule-item";
    row.innerHTML = `
      <div class="rule-icon">${escapeHtml(task.icon || "✓")}</div>
      <div>
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.note || "")}</p>
      </div>
      <span class="soft-badge">${escapeHtml(scheduleLabel(task))}</span>
    `;
    list.appendChild(row);
  });
}

function renderCustomTaskList() {
  const list = $("customTaskList");
  list.innerHTML = "";

  if (!state.customTasks.length) {
    list.innerHTML = `<p class="muted-line">No custom recurring tasks yet.</p>`;
    return;
  }

  state.customTasks.forEach((task) => {
    const item = document.createElement("div");
    item.className = "custom-task-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <span>${escapeHtml(SECTION_META[task.section]?.title || task.section)} • ${escapeHtml(scheduleLabel(task))} • +${Number(task.xp || 0)} XP</span>
      </div>
    `;

    const del = document.createElement("button");
    del.className = "mini-action delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteCustomTask(task.id));

    item.appendChild(del);
    list.appendChild(item);
  });
}

function scheduleLabel(task) {
  if (task.schedule === "daily") return "Every day";
  if (task.schedule === "gym") return "Mon/Wed/Fri";
  if (task.schedule === "weekend") return "Weekend";
  if (task.schedule === "days") return formatDays(task.days || []);
  if (task.schedule === "once") return "One day";
  return "Custom";
}

function renderStats() {
  const lifetime = getLifetimeStats();
  const rank = getRank(lifetime.totalXp);

  $("statsRank").textContent = rank.current.name;
  $("statsRankCopy").textContent = rank.next
    ? `Next rank: ${rank.next.name}. Keep stacking XP by finishing scheduled tasks.`
    : "Maximum rank reached. Keep the streak clean.";
  $("rankBar").style.width = `${rank.percent}%`;
  $("statsRankProgress").textContent = rank.next
    ? `${rank.progress} / ${rank.needed} XP to ${rank.next.name}`
    : "Max rank reached";

  $("statsTotalXp").textContent = lifetime.totalXp;
  $("statsPerfectDays").textContent = lifetime.perfectDays;
  $("statsCompletionRate").textContent = `${lifetime.completionRate}%`;

  const grid = $("achievementGrid");
  grid.innerHTML = "";

  ACHIEVEMENTS.forEach((achievement) => {
    const unlocked = achievement.test(lifetime);
    const card = document.createElement("div");
    card.className = `achievement-card ${unlocked ? "unlocked" : ""}`;
    card.innerHTML = `
      <div class="achievement-medal">${unlocked ? "✓" : "○"}</div>
      <strong>${escapeHtml(achievement.title)}</strong>
      <p>${escapeHtml(achievement.description)}</p>
    `;
    grid.appendChild(card);
  });
}

function renderHistory() {
  const grid = $("historyGrid");
  grid.innerHTML = "";

  const today = normalizeDate(new Date());

  for (let i = 20; i >= 0; i--) {
    const date = normalizeDate(today);
    date.setDate(today.getDate() - i);

    const key = dateKey(date);
    const stats = getDayStats(key, date);
    const selected = key === dateKey(selectedHistoryDate);

    const button = document.createElement("button");
    button.className = `history-day ${stats.perfect ? "perfect" : ""} ${stats.failed.length ? "failed" : ""} ${selected ? "selected" : ""}`;
    button.innerHTML = `
      <div>
        <strong>${escapeHtml(date.toLocaleDateString(undefined, { weekday: "short" }))}</strong>
        <small>${escapeHtml(date.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</small>
      </div>
      <div>
        <small>${stats.done.length}/${stats.tasks.length} done</small>
        <div class="history-score"><span style="width:${stats.completePercent}%"></span></div>
      </div>
    `;

    button.addEventListener("click", () => {
      selectedHistoryDate = normalizeDate(date);
      selectedDate = normalizeDate(date);
      renderAll();
    });

    grid.appendChild(button);
  }

  renderHistoryDetail();
}

function renderHistoryDetail() {
  const key = dateKey(selectedHistoryDate);
  const stats = getDayStats(key, selectedHistoryDate);

  $("historySelectedTitle").textContent = formatDate(selectedHistoryDate);

  const detail = $("historyDetail");
  detail.innerHTML = "";

  const rows = [
    ["Status", stats.perfect ? "Perfect day" : stats.failed.length ? "Had failures" : stats.unresolved ? "Unfinished" : "Completed"],
    ["Completed", `${stats.done.length} / ${stats.tasks.length}`],
    ["Failed", `${stats.failed.length}`],
    ["Unresolved", `${stats.unresolved}`],
    ["XP earned", `${stats.todayXp}`],
    ["Completion", `${stats.completePercent}%`],
  ];

  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "history-detail-row";
    row.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    detail.appendChild(row);
  });
}

function renderSettings() {
  $("syncModeBadge").textContent = sb ? currentUser ? "Synced" : "Configured" : "Local";
  $("syncModeBadge").className = `soft-badge ${currentUser ? "good" : sb ? "blue" : ""}`;
}

function buildDayTags(date) {
  const day = normalizeDate(date).getDay();
  const tags = ["Daily"];

  if ([1, 3, 5].includes(day)) tags.push("Gym");
  if ([3, 6].includes(day)) tags.push("Eyebrows");
  if (day === 0 || day === 6) tags.push("Weekend");

  return tags;
}

function addQuickTask() {
  const title = $("quickTaskName").value.trim();
  const section = $("quickTaskSection").value;

  if (!title) {
    toast("Type a quick task first.");
    return;
  }

  const day = getDayState(dateKey());
  const id = `quick_${safeId()}`;

  day.quickTasks.push({
    id,
    title,
    section,
    xp: 8,
    schedule: "once",
    note: "Added from the planner for this selected day.",
    icon: "＋",
  });

  $("quickTaskName").value = "";
  saveState();
  renderAll();
  toast("Quick task added.");
}

function deleteQuickTask(id) {
  const key = dateKey();
  const day = getDayState(key);

  day.quickTasks = day.quickTasks.filter((task) => task.id !== id);
  delete day.completed[id];
  delete day.failed[id];

  saveState();
  renderAll();
  toast("Quick task deleted.");
}

function addCustomTask() {
  const title = $("customTaskName").value.trim();
  const section = $("customTaskSection").value;
  const scheduleValue = $("customTaskSchedule").value;
  const xp = Math.max(1, Number($("customTaskXp").value || 10));

  if (!title) {
    toast("Type a custom task name first.");
    return;
  }

  let schedule = scheduleValue;
  let days = [];

  if (scheduleValue === "gym") {
    schedule = "days";
    days = [1, 3, 5];
  }

  if (scheduleValue === "weekend") {
    schedule = "days";
    days = [0, 6];
  }

  if (scheduleValue === "custom") {
    schedule = "days";
    days = [...document.querySelectorAll("#customDayPicker input:checked")].map((input) => Number(input.value));

    if (!days.length) {
      toast("Pick at least one custom day.");
      return;
    }
  }

  state.customTasks.push({
    id: `custom_${safeId()}`,
    title,
    section,
    schedule,
    days,
    xp,
    note: "Custom recurring task.",
    icon: "＋",
  });

  $("customTaskName").value = "";
  $("customTaskXp").value = "10";
  document.querySelectorAll("#customDayPicker input").forEach((input) => {
    input.checked = false;
  });

  saveState();
  renderAll();
  toast("Custom recurring task created.");
}

function deleteCustomTask(id) {
  if (!confirm("Delete this custom recurring task? Past completion records for this task will also be removed from visible tracking.")) {
    return;
  }

  state.customTasks = state.customTasks.filter((task) => task.id !== id);

  Object.values(state.days).forEach((day) => {
    delete day.completed[id];
    delete day.failed[id];
  });

  saveState();
  renderAll();
  toast("Custom task deleted.");
}

function saveNotes() {
  const day = getDayState(dateKey());
  day.notes = $("dailyNotes").value;
  saveState();
  toast("Notes saved.");
}

function changeDay(offset) {
  selectedDate.setDate(selectedDate.getDate() + offset);
  selectedDate = normalizeDate(selectedDate);
  selectedHistoryDate = normalizeDate(selectedDate);
  renderAll();
}

function jumpToday() {
  selectedDate = normalizeDate(new Date());
  selectedHistoryDate = normalizeDate(new Date());
  renderAll();
}

function switchPage(page) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  document.querySelectorAll(".page").forEach((pageEl) => {
    pageEl.classList.toggle("active", pageEl.id === `page-${page}`);
  });

  renderHeader();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `accountability-os-backup-${dateKey(new Date())}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = migrateState(parsed);
      saveState();
      renderAll();
      toast("Backup imported.");
    } catch {
      toast("That backup file could not be read.");
    }
  };

  reader.readAsText(file);
}

function resetEverything() {
  if (!confirm("This will erase all local accountability data. Continue?")) return;

  state = freshState();
  saveState();
  renderAll();
  toast("Everything reset.");
}

function formatDays(days) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.map((day) => names[day]).join("/");
}

function safeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function toast(message) {
  const el = $("toast");

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 3000);
}

function scheduleSupabaseSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToSupabase, 900);
}

async function initSupabase() {
  if (!sb) {
    $("syncStatus").textContent = "Local mode active. Supabase not configured.";
    renderSettings();
    return;
  }

  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user || null;

  if (currentUser) {
    $("syncStatus").textContent = `Signed in as ${currentUser.email}.`;
    await loadFromSupabase();
  } else {
    $("syncStatus").textContent = "Supabase configured. Sign in to sync.";
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;

    if (currentUser) {
      $("syncStatus").textContent = `Signed in as ${currentUser.email}.`;
      await loadFromSupabase();
    } else {
      $("syncStatus").textContent = "Signed out. Local mode active.";
    }

    renderSettings();
  });
}

async function sendMagicLink() {
  if (!sb) {
    toast("Add your Supabase URL and anon key in app.js first.");
    return;
  }

  const email = $("emailInput").value.trim();

  if (!email) {
    toast("Enter your email first.");
    return;
  }

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href,
    },
  });

  if (error) {
    toast(error.message);
    return;
  }

  toast("Magic link sent. Check your email.");
}

async function loadFromSupabase() {
  if (!sb || !currentUser) return;

  $("syncStatus").textContent = "Loading cloud data...";

  const { data, error } = await sb
    .from("accountability_state")
    .select("state, updated_at")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    $("syncStatus").textContent = `Load error: ${error.message}`;
    return;
  }

  if (data?.state) {
    const localUpdated = new Date(state.updatedAt || 0).getTime();
    const remoteUpdated = new Date(data.state.updatedAt || data.updated_at || 0).getTime();

    if (remoteUpdated > localUpdated) {
      state = migrateState(data.state);
      saveState({ sync: false });
      renderAll();
      $("syncStatus").textContent = "Cloud data loaded.";
      return;
    }
  }

  await syncToSupabase();
}

async function syncToSupabase() {
  if (!sb || !currentUser) return;

  const payload = {
    user_id: currentUser.id,
    state,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from("accountability_state")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    $("syncStatus").textContent = `Sync error: ${error.message}`;
    return;
  }

  $("syncStatus").textContent = `Synced at ${new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}.`;

  renderSettings();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => switchPage(item.dataset.page));
  });

  $("prevDayBtn").addEventListener("click", () => changeDay(-1));
  $("nextDayBtn").addEventListener("click", () => changeDay(1));
  $("dateChip").addEventListener("click", jumpToday);
  $("todayBtn").addEventListener("click", jumpToday);

  $("finishMorningBtn").addEventListener("click", failUnfinishedMorning);
  $("completeAllVisibleBtn").addEventListener("click", completeAllVisibleCleanTasks);

  $("saveNotesBtn").addEventListener("click", saveNotes);
  $("dailyNotes").addEventListener("input", () => {
    const day = getDayState(dateKey());
    day.notes = $("dailyNotes").value;
    saveState();
  });

  $("addQuickTaskBtn").addEventListener("click", addQuickTask);
  $("quickTaskName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addQuickTask();
  });

  $("customTaskSchedule").addEventListener("change", renderPlanner);
  $("addCustomTaskBtn").addEventListener("click", addCustomTask);

  $("exportBtn").addEventListener("click", exportBackup);
  $("importInput").addEventListener("change", (event) => importBackup(event.target.files[0]));
  $("resetEverythingBtn").addEventListener("click", resetEverything);

  $("loginBtn").addEventListener("click", sendMagicLink);
  $("manualSyncBtn").addEventListener("click", () => {
    if (!sb) {
      toast("Supabase is not configured yet.");
      return;
    }

    if (!currentUser) {
      toast("Sign in first.");
      return;
    }

    syncToSupabase();
  });
}

bindEvents();
renderAll();
initSupabase();
