"use strict";

(() => {
  const APPOINTMENT_SEED_VERSION = 1;
  const DEFAULT_APPOINTMENTS = [
    { id: "appt-dermatologist-2026-09-12", title: "Dermatologist", date: "2026-09-12", time: "10:00", notes: "Dermatology appointment" },
    { id: "appt-orthodontist-2026-10-15", title: "Orthodontist", date: "2026-10-15", time: "15:00", notes: "Maxilla consultation" }
  ];
  let appointmentEditId = null;

  const GYM_WORKOUTS = {
    Push: [
      "Incline Dumbbell Bench Press",
      "Machine Chest Press",
      "Cable Fly / Pec Deck",
      "Cable Lateral Raise",
      "Machine Lateral Raise",
      "Triceps Pressdown",
      "Overhead Cable Triceps Extension"
    ],
    Pull: [
      "Lat Pulldown",
      "Chest-Supported Row",
      "Seated Cable Row, both arms",
      "Reverse Pec Deck",
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
  const GYM_DAY_PLAN = ["Legs + Abs", "Push", "Pull", "Rest", "Legs + Abs", "Push", "Pull"];
  const GYM_DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const GYM_EXERCISE_NAMES = Object.values(GYM_WORKOUTS).flat();
  let gymSelectedDate = "";
  let gymHistoryExercise = "";

  function gymDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function gymDateFromKey(key) {
    if (!validDateKey(key)) return new Date();
    const [y,m,d] = key.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  function gymScheduledWorkoutForDate(key) {
    return GYM_DAY_PLAN[gymDateFromKey(key).getDay()] || "Rest";
  }
  function gymWorkoutOverrideForDate(key) {
    if (typeof state === "undefined" || !state?.meta?.gymTracker?.overrides) return "";
    const value = state.meta.gymTracker.overrides[key];
    return ["Push", "Pull", "Legs + Abs", "Rest"].includes(value) ? value : "";
  }
  function gymWorkoutForDate(key) {
    return gymWorkoutOverrideForDate(key) || gymScheduledWorkoutForDate(key);
  }

  const safeText = (value, max = 2000) => String(value ?? "").trim().slice(0, max);
  const makeId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));

  function normalizeUrl(raw) {
    const value = safeText(raw, 1000);
    if (!value) return "";
    for (const candidate of [value, `https://${value}`]) {
      try {
        const url = new URL(candidate);
        if (["http:", "https:"].includes(url.protocol)) return url.toString();
      } catch {}
    }
    return "";
  }

  function getYouTubeId(rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!url) return "";
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      let id = "";
      if (host === "youtu.be") id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
        if (parsed.pathname === "/watch") id = parsed.searchParams.get("v") || "";
        else {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (["shorts", "embed", "live"].includes(parts[0])) id = parts[1] || "";
        }
      }
      return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : "";
    } catch { return ""; }
  }

  function ensureFeatureState() {
    if (typeof state !== "object" || !state) return;
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    if (!Array.isArray(state.meta.appointments)) state.meta.appointments = [];
    if (state.meta.appointmentSeedVersion !== APPOINTMENT_SEED_VERSION) {
      const existing = new Set(state.meta.appointments.map(item => item?.id));
      DEFAULT_APPOINTMENTS.forEach(item => { if (!existing.has(item.id)) state.meta.appointments.push({ ...item }); });
      state.meta.appointmentSeedVersion = APPOINTMENT_SEED_VERSION;
    }
    state.meta.appointments = state.meta.appointments
      .filter(item => item && typeof item === "object" && validDateKey(item.date))
      .map(item => ({
        id: safeText(item.id, 120) || makeId("appt"),
        title: safeText(item.title, 120) || "Appointment",
        date: item.date,
        time: validTime(item.time) ? item.time : "",
        notes: safeText(item.notes, 500)
      }));

    if (!state.meta.ghkCuVial || typeof state.meta.ghkCuVial !== "object" || Array.isArray(state.meta.ghkCuVial)) {
      state.meta.ghkCuVial = { bacWaterMl: "", reconstitutedDate: "" };
    }
    const ghkBacWater = Number(state.meta.ghkCuVial.bacWaterMl);
    state.meta.ghkCuVial = {
      bacWaterMl: Number.isFinite(ghkBacWater) && ghkBacWater > 0
        ? Math.min(100, Math.round(ghkBacWater * 100) / 100)
        : "",
      reconstitutedDate: validDateKey(state.meta.ghkCuVial.reconstitutedDate)
        ? state.meta.ghkCuVial.reconstitutedDate
        : ""
    };

    if (!state.meta.forumHub || typeof state.meta.forumHub !== "object" || Array.isArray(state.meta.forumHub)) state.meta.forumHub = { resources: [], guides: [] };
    if (!Array.isArray(state.meta.forumHub.resources)) state.meta.forumHub.resources = [];
    if (!Array.isArray(state.meta.forumHub.guides)) state.meta.forumHub.guides = [];
    state.meta.forumHub.resources = state.meta.forumHub.resources
      .filter(item => item && typeof item === "object")
      .map(item => ({
        id: safeText(item.id, 120) || makeId("resource"),
        title: safeText(item.title, 160) || "Saved resource",
        url: normalizeUrl(item.url),
        type: ["video", "forum", "article", "other"].includes(item.type) ? item.type : "other",
        notes: safeText(item.notes, 1000),
        createdAt: safeText(item.createdAt, 80) || new Date().toISOString()
      }))
      .filter(item => item.url);

    if (!state.meta.gymTracker || typeof state.meta.gymTracker !== "object" || Array.isArray(state.meta.gymTracker)) {
      state.meta.gymTracker = { sessions: [], overrides: {} };
    }
    if (!Array.isArray(state.meta.gymTracker.sessions)) state.meta.gymTracker.sessions = [];
    if (!state.meta.gymTracker.overrides || typeof state.meta.gymTracker.overrides !== "object" || Array.isArray(state.meta.gymTracker.overrides)) state.meta.gymTracker.overrides = {};
    state.meta.gymTracker.overrides = Object.fromEntries(
      Object.entries(state.meta.gymTracker.overrides)
        .filter(([date, workout]) => validDateKey(date) && ["Push", "Pull", "Legs + Abs", "Rest"].includes(workout))
    );
    state.meta.gymTracker.sessions = state.meta.gymTracker.sessions
      .filter(item => item && typeof item === "object" && validDateKey(item.date))
      .map(item => ({
        id: safeText(item.id, 120) || makeId("gym"),
        date: item.date,
        workout: ["Push", "Pull", "Legs + Abs"].includes(item.workout) ? item.workout : gymWorkoutForDate(item.date),
        completed: Boolean(item.completed),
        updatedAt: safeText(item.updatedAt, 80) || new Date().toISOString(),
        exercises: Array.isArray(item.exercises) ? item.exercises
          .filter(ex => ex && GYM_EXERCISE_NAMES.includes(ex.name))
          .map(ex => ({
            name: ex.name,
            sets: Array.isArray(ex.sets) ? ex.sets.slice(0, 2).map(set => ({
              weight: Number.isFinite(Number(set?.weight)) ? Math.max(0, Math.min(2000, Number(set.weight))) : 0,
              reps: Number.isFinite(Number(set?.reps)) ? Math.max(0, Math.min(100, Math.round(Number(set.reps)))) : 0
            })) : []
          })) : []
      }))
      .filter(item => item.workout !== "Rest");
  }

  function persist() {
    ensureFeatureState();
    if (typeof saveState === "function") saveState();
    else if (typeof saveLocalState === "function") saveLocalState();
  }

  function installMeaningfulStateSupport() {
    if (typeof hasMeaningfulState !== "function" || hasMeaningfulState.__featureWrapped) return;
    const base = hasMeaningfulState;
    const wrapped = snapshot => base(snapshot) ||
      (Array.isArray(snapshot?.meta?.appointments) && snapshot.meta.appointments.length > 0) ||
      (Array.isArray(snapshot?.meta?.forumHub?.resources) && snapshot.meta.forumHub.resources.length > 0) ||
      (Array.isArray(snapshot?.meta?.forumHub?.guides) && snapshot.meta.forumHub.guides.length > 0) ||
      (Array.isArray(snapshot?.meta?.gymTracker?.sessions) && snapshot.meta.gymTracker.sessions.length > 0) ||
      (snapshot?.meta?.gymTracker?.overrides && Object.keys(snapshot.meta.gymTracker.overrides).length > 0) ||
      (Number(snapshot?.meta?.ghkCuVial?.bacWaterMl) > 0) ||
      Boolean(snapshot?.meta?.ghkCuVial?.reconstitutedDate);
    wrapped.__featureWrapped = true;
    hasMeaningfulState = wrapped;
  }

  function injectStyles() {
    if (document.getElementById("lockedOsFeatureStyles")) return;
    const style = document.createElement("style");
    style.id = "lockedOsFeatureStyles";
    style.textContent = `
      .forums-page,.appointments-panel{display:grid;gap:16px}.forums-hero,.appointments-hero{padding:24px;display:flex;align-items:center;justify-content:space-between;gap:20px;background:radial-gradient(circle at top right,rgba(126,87,194,.14),transparent 19rem),rgba(255,250,241,.86)}
      .forums-hero h2,.appointments-hero h2{margin:0;font-size:clamp(2rem,5vw,3.1rem);letter-spacing:-.035em}.forums-hero p:not(.eyebrow),.appointments-hero p:not(.eyebrow){margin:9px 0 0;color:var(--muted);font-weight:750;line-height:1.5}.forums-hero-badge,.appointment-next-badge{padding:12px 16px;border-radius:999px;background:rgba(126,87,194,.11);color:#6140a1;font-weight:950}
      .feature-card{padding:20px}.feature-form{display:grid;gap:11px;margin-top:16px}.feature-field{display:grid;gap:6px}.feature-field>span{color:var(--muted);font-size:.78rem;font-weight:900}.feature-field input,.feature-field select,.feature-field textarea{width:100%;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.58);color:var(--text);font:inherit;font-weight:750;outline:0;padding:11px 12px}.feature-field textarea{min-height:112px;resize:vertical}.feature-two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.feature-actions,.card-actions{display:flex;gap:7px;flex-wrap:wrap}.feature-status{min-height:18px;margin:0;color:var(--muted);font-size:.82rem;font-weight:800}.feature-status.good{color:var(--green-dark)}.feature-status.bad{color:var(--red)}
      .resource-list,.appointment-list{display:grid;gap:12px;margin-top:14px}.resource-card,.appointment-card{border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.42);overflow:hidden}.resource-card-body,.appointment-card-body{padding:15px}.resource-card-head,.appointment-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.resource-card h4,.appointment-card h4{margin:0}.resource-meta,.appointment-meta{margin-top:5px;color:var(--muted);font-size:.78rem;font-weight:800}.resource-note,.appointment-notes{margin:10px 0 0;color:var(--muted);font-size:.88rem;font-weight:700;line-height:1.5;white-space:pre-wrap}.resource-link{display:inline-flex;margin-top:11px;color:var(--blue-dark);font-size:.84rem;font-weight:900;text-decoration:none}.resource-embed{aspect-ratio:16/9;background:#111}.resource-embed iframe{width:100%;height:100%;border:0;display:block}.resource-type-pill{padding:5px 9px;border-radius:999px;background:var(--blue-soft);color:var(--blue-dark);font-size:.7rem;font-weight:950;text-transform:uppercase}.feature-mini-btn{border:0;border-radius:10px;padding:7px 10px;background:rgba(42,30,18,.07);color:var(--text);font:inherit;font-size:.76rem;font-weight:900;cursor:pointer}.feature-mini-btn.danger{color:var(--red)}.feature-empty{padding:22px 16px;border:1px dashed var(--line);border-radius:16px;color:var(--muted);text-align:center;font-size:.86rem;font-weight:800}
      .forums-library-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.resource-add-details{position:relative}.resource-add-details>summary{list-style:none;cursor:pointer}.resource-add-details>summary::-webkit-details-marker{display:none}.resource-add-popdown{position:absolute;z-index:30;right:0;top:calc(100% + 10px);width:min(390px,calc(100vw - 42px));padding:14px;border:1px solid var(--line);border-radius:17px;background:var(--card);box-shadow:0 18px 50px rgba(55,38,18,.18)}
      .appointment-date-block{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center}.appointment-date-chip{width:54px;min-height:58px;border-radius:15px;display:grid;place-items:center;align-content:center;background:var(--blue-soft);color:var(--blue-dark)}.appointment-date-chip strong{font-size:1.25rem;line-height:1}.appointment-date-chip span{font-size:.67rem;font-weight:950;text-transform:uppercase}.appointment-countdown{display:inline-block;margin-top:8px;color:var(--green-dark);font-size:.78rem;font-weight:900}.appointment-card.past{opacity:.62}
      .ghk-vial-card{padding:20px}.ghk-vial-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.ghk-vial-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}.ghk-vial-summary{margin:10px 0 0;color:var(--muted);font-size:.82rem;font-weight:800}.ghk-vial-summary strong{color:var(--text)}.ghk-vial-status{min-height:18px;margin:0;color:var(--muted);font-size:.8rem;font-weight:850}.ghk-vial-status.good{color:var(--green-dark)}.ghk-vial-status.bad{color:var(--red)}.ghk-current-status-card{display:none;margin-top:14px;padding:16px;border:1px solid rgba(37,132,184,.28);border-radius:16px;background:rgba(37,132,184,.07)}.ghk-current-status-card.visible{display:block}.ghk-current-status-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.ghk-current-status-head span{color:var(--blue-dark);font-size:.7rem;font-weight:950;letter-spacing:.06em;text-transform:uppercase}.ghk-current-status-head strong{font-size:.9rem}.ghk-current-status-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.ghk-current-status-item{padding:12px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.58)}.ghk-current-status-item span{display:block;color:var(--muted);font-size:.68rem;font-weight:900}.ghk-current-status-item strong{display:block;margin-top:5px;font-size:1rem;overflow-wrap:anywhere}
      .gym-page{display:grid;gap:16px}.gym-hero{padding:24px;display:flex;align-items:center;justify-content:space-between;gap:20px;background:radial-gradient(circle at top right,rgba(37,132,184,.14),transparent 20rem),rgba(255,250,241,.86)}.gym-hero h2{margin:0;font-size:clamp(2rem,5vw,3.1rem);letter-spacing:-.035em}.gym-hero p:not(.eyebrow){margin:9px 0 0;color:var(--muted);font-weight:750;line-height:1.5}.gym-today-badge{padding:12px 16px;border-radius:999px;background:var(--blue-soft);color:var(--blue-dark);font-weight:950;white-space:nowrap}
      .gym-week-card,.gym-log-card,.gym-history-card{padding:20px}.gym-week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-top:14px}.gym-day-card{min-width:0;border:1px solid var(--line);border-radius:15px;padding:12px 9px;background:rgba(255,255,255,.42);cursor:pointer;text-align:left;color:var(--text);font:inherit}.gym-day-card strong,.gym-day-card span{display:block}.gym-day-card strong{font-size:.78rem}.gym-day-card span{margin-top:5px;color:var(--muted);font-size:.7rem;font-weight:850;line-height:1.25}.gym-day-card.today{border-color:rgba(37,132,184,.38);box-shadow:0 0 0 2px rgba(37,132,184,.08)}.gym-day-card.selected{background:var(--blue-soft);border-color:rgba(37,132,184,.42);color:var(--blue-dark)}.gym-day-card.selected span{color:var(--blue-dark)}
      .gym-log-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.gym-date-tools{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.gym-date-input{min-height:40px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.62);color:var(--text);font:inherit;font-size:.8rem;font-weight:850;padding:0 10px}.gym-nav-btn{width:40px;height:40px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.5);color:var(--text);font:inherit;font-weight:950;cursor:pointer}.gym-workout-title{margin:4px 0 0;font-size:1.75rem;letter-spacing:-.025em}.gym-workout-meta{margin:5px 0 0;color:var(--muted);font-size:.82rem;font-weight:800}.gym-day-override{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.34)}.gym-day-override-field{display:grid;gap:5px;min-width:220px;flex:1}.gym-day-override-field>span{color:var(--muted);font-size:.68rem;font-weight:900}.gym-workout-select{width:100%;min-height:40px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.7);color:var(--text);font:inherit;font-size:.8rem;font-weight:850;padding:0 10px}.gym-override-note{margin:0;flex-basis:100%;color:var(--muted);font-size:.72rem;font-weight:800}.gym-override-note.custom{color:var(--blue-dark)}.gym-rest{margin-top:18px;padding:30px 18px;border:1px dashed var(--line);border-radius:18px;text-align:center}.gym-rest strong{display:block;font-size:1.15rem}.gym-rest span{display:block;margin-top:6px;color:var(--muted);font-weight:750}
      .gym-exercise-list{display:grid;gap:10px;margin-top:17px}.gym-exercise-row{display:grid;grid-template-columns:minmax(190px,1.25fr) minmax(140px,.9fr) repeat(2,minmax(150px,1fr));gap:10px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.42)}.gym-exercise-name strong{display:block;font-size:.9rem}.gym-exercise-name span{display:block;margin-top:4px;color:var(--muted);font-size:.72rem;font-weight:850}.gym-prev{font-size:.73rem;color:var(--muted);font-weight:800;line-height:1.4}.gym-prev strong{display:block;color:var(--text);font-size:.73rem}.gym-set-box{display:grid;grid-template-columns:1fr 1fr;gap:6px}.gym-set-box label{display:grid;gap:4px}.gym-set-box label span{font-size:.64rem;color:var(--muted);font-weight:900}.gym-set-input{width:100%;min-width:0;height:38px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.68);color:var(--text);font:inherit;font-size:.8rem;font-weight:850;padding:0 8px}.gym-row-progress{grid-column:2 / -1;display:flex;align-items:center;gap:7px;min-height:20px;color:var(--muted);font-size:.72rem;font-weight:850}.gym-row-progress.good{color:var(--green-dark)}.gym-row-progress.ready{color:var(--blue-dark)}.gym-log-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:15px}.gym-save-actions{display:flex;gap:8px;flex-wrap:wrap}.gym-save-status{margin:0;color:var(--muted);font-size:.8rem;font-weight:850}.gym-save-status.good{color:var(--green-dark)}.gym-save-status.bad{color:var(--red)}.gym-complete-badge{display:inline-flex;padding:7px 10px;border-radius:999px;background:rgba(47,143,86,.1);color:var(--green-dark);font-size:.72rem;font-weight:950}
      .gym-history-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.gym-history-select{min-width:min(320px,100%);height:42px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.62);color:var(--text);font:inherit;font-size:.82rem;font-weight:850;padding:0 11px}.gym-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}.gym-stat{padding:13px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.4)}.gym-stat span{display:block;color:var(--muted);font-size:.67rem;font-weight:900}.gym-stat strong{display:block;margin-top:5px;font-size:1rem}.gym-history-table-wrap{overflow:auto;margin-top:14px;border:1px solid var(--line);border-radius:15px}.gym-history-table{width:100%;border-collapse:collapse;min-width:650px}.gym-history-table th,.gym-history-table td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;font-size:.75rem}.gym-history-table th{color:var(--muted);font-size:.66rem;text-transform:uppercase;letter-spacing:.05em}.gym-history-table td{font-weight:800}.gym-history-table tr:last-child td{border-bottom:0}.gym-pr{color:var(--green-dark);font-weight:950}.gym-empty{padding:25px 16px;text-align:center;color:var(--muted);font-size:.84rem;font-weight:800}
      @media(max-width:980px){.gym-week-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.gym-exercise-row{grid-template-columns:minmax(170px,1fr) minmax(130px,.75fr) minmax(150px,1fr)}.gym-exercise-row>.gym-set-box:last-of-type{grid-column:3}.gym-row-progress{grid-column:2 / -1}.gym-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:680px){.forums-hero,.appointments-hero,.gym-hero{padding:17px;align-items:flex-start;flex-direction:column}.feature-card,.gym-week-card,.gym-log-card,.gym-history-card,.ghk-vial-card{padding:16px}.feature-two-col,.ghk-vial-grid,.ghk-current-status-grid{grid-template-columns:1fr}.resource-card-head,.appointment-card-head{flex-direction:column}.resource-add-details{position:static}.resource-add-popdown{position:static;width:100%;margin-top:10px;box-shadow:none}.gym-week-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gym-log-head{display:grid}.gym-date-tools{width:100%}.gym-date-input{flex:1;min-width:130px}.gym-day-override{display:grid;grid-template-columns:1fr}.gym-day-override-field{min-width:0}.gym-day-override .btn{width:100%}.gym-exercise-row{grid-template-columns:1fr 1fr}.gym-exercise-name{grid-column:1 / -1}.gym-prev{grid-column:1 / -1}.gym-set-box{grid-column:auto!important}.gym-row-progress{grid-column:1 / -1}.gym-stat-grid{grid-template-columns:1fr 1fr}.gym-save-actions{width:100%}.gym-save-actions .btn{flex:1}.gym-history-select{width:100%;min-width:0}}
    `;
    document.head.appendChild(style);
  }

  function highlightGhkToday() {
    const day = new Date().getDay();
    document.querySelectorAll("[data-ghk-day]").forEach(el => el.classList.toggle("today", Number(el.dataset.ghkDay) === day));
    const badge = document.getElementById("ghkTodayBadge");
    if (badge) badge.textContent = day >= 1 && day <= 5 ? "Today · morning" : "Today · no reminder";
  }

  function ghkVialDateLabel(dateKey) {
    if (!validDateKey(dateKey)) return "Not set";
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function ghkDaysSinceReconstituted(dateKey) {
    if (!validDateKey(dateKey)) return null;
    const [year, month, day] = dateKey.split("-").map(Number);
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const reconstitutedUtc = Date.UTC(year, month - 1, day);
    return Math.max(0, Math.floor((todayUtc - reconstitutedUtc) / 86400000));
  }

  function renderGhkVialTracker() {
    const card = document.getElementById("ghkVialTrackerCard");
    if (!card) return;
    ensureFeatureState();

    const tracker = state.meta.ghkCuVial;
    const waterInput = document.getElementById("ghkBacWaterMl");
    const dateInput = document.getElementById("ghkReconstitutedDate");
    const active = document.activeElement;

    if (waterInput && active !== waterInput) waterInput.value = tracker.bacWaterMl === "" ? "" : String(tracker.bacWaterMl);
    if (dateInput && active !== dateInput) dateInput.value = tracker.reconstitutedDate || "";

    const summary = document.getElementById("ghkVialSummary");
    if (summary) {
      const waterText = tracker.bacWaterMl === "" ? "BAC water not set" : `${tracker.bacWaterMl} mL BAC water`;
      const dateText = tracker.reconstitutedDate ? `reconstituted ${ghkVialDateLabel(tracker.reconstitutedDate)}` : "reconstitution date not set";
      summary.innerHTML = `<strong>Current vial:</strong> ${waterText} · ${dateText}`;
    }

    const currentStatus = document.getElementById("ghkCurrentVialStatus");
    const currentWater = document.getElementById("ghkCurrentWaterValue");
    const currentDate = document.getElementById("ghkCurrentDateValue");
    const currentDays = document.getElementById("ghkCurrentDaysValue");
    const daysSinceReconstituted = ghkDaysSinceReconstituted(tracker.reconstitutedDate);
    const hasSavedDetails = tracker.bacWaterMl !== "" || Boolean(tracker.reconstitutedDate);
    if (currentStatus) currentStatus.classList.toggle("visible", hasSavedDetails);
    if (currentWater) currentWater.textContent = tracker.bacWaterMl === "" ? "Not set" : `${tracker.bacWaterMl} mL`;
    if (currentDate) currentDate.textContent = tracker.reconstitutedDate ? ghkVialDateLabel(tracker.reconstitutedDate) : "Not set";
    if (currentDays) currentDays.textContent = daysSinceReconstituted === null
      ? "Not set"
      : `${daysSinceReconstituted} day${daysSinceReconstituted === 1 ? "" : "s"}`;
  }

  function saveGhkVialTracker() {
    ensureFeatureState();
    const waterInput = document.getElementById("ghkBacWaterMl");
    const dateInput = document.getElementById("ghkReconstitutedDate");
    const status = document.getElementById("ghkVialStatus");

    const rawWater = String(waterInput?.value || "").trim();
    const rawDate = String(dateInput?.value || "").trim();
    const water = rawWater === "" ? "" : Number(rawWater);

    if (rawWater !== "" && (!Number.isFinite(water) || water <= 0 || water > 100)) {
      if (status) {
        status.textContent = "Enter a BAC-water amount between 0 and 100 mL.";
        status.classList.add("bad");
        status.classList.remove("good");
      }
      waterInput?.focus();
      return;
    }
    if (rawDate !== "" && !validDateKey(rawDate)) {
      if (status) {
        status.textContent = "Choose a valid reconstitution date.";
        status.classList.add("bad");
        status.classList.remove("good");
      }
      dateInput?.focus();
      return;
    }

    state.meta.ghkCuVial = {
      bacWaterMl: water === "" ? "" : Math.round(water * 100) / 100,
      reconstitutedDate: rawDate
    };
    persist();
    renderGhkVialTracker();

    if (status) {
      status.textContent = "Vial details saved.";
      status.classList.add("good");
      status.classList.remove("bad");
    }
    if (typeof toast === "function") toast("GHK-Cu vial details saved.");
  }

  function installGhkVialTracker() {
    const page = document.querySelector("#ghkCuPage .ghk-page");
    const schedule = page?.querySelector(".ghk-schedule-card");
    if (!page || !schedule) return;

    let card = document.getElementById("ghkVialTrackerCard");
    if (!card) {
      card = document.createElement("section");
      card.className = "card ghk-vial-card";
      card.id = "ghkVialTrackerCard";
      card.innerHTML = `
        <div class="panel-title">
          <div>
            <p class="eyebrow blue">Vial details</p>
            <h3>Current GHK-Cu vial</h3>
          </div>
        </div>
        <div class="ghk-vial-grid">
          <label class="feature-field">
            <span>BAC water in vial (mL)</span>
            <input id="ghkBacWaterMl" inputmode="decimal" min="0.01" max="100" step="0.01" type="number" placeholder="e.g. 2"/>
          </label>
          <label class="feature-field">
            <span>Reconstituted date</span>
            <input id="ghkReconstitutedDate" type="date"/>
          </label>
        </div>
        <p class="ghk-vial-summary" id="ghkVialSummary"></p>
        <div class="ghk-vial-actions">
          <button class="btn blue" id="saveGhkVialBtn" type="button">Save vial details</button>
          <p class="ghk-vial-status" id="ghkVialStatus"></p>
        </div>
        <div class="ghk-current-status-card" id="ghkCurrentVialStatus" aria-live="polite">
          <div class="ghk-current-status-head">
            <span>Saved</span>
            <strong>Current vial status</strong>
          </div>
          <div class="ghk-current-status-grid">
            <div class="ghk-current-status-item">
              <span>BAC water in vial</span>
              <strong id="ghkCurrentWaterValue">Not set</strong>
            </div>
            <div class="ghk-current-status-item">
              <span>Reconstituted</span>
              <strong id="ghkCurrentDateValue">Not set</strong>
            </div>
            <div class="ghk-current-status-item">
              <span>Days since reconstituted</span>
              <strong id="ghkCurrentDaysValue">Not set</strong>
            </div>
          </div>
        </div>`;
      schedule.insertAdjacentElement("afterend", card);
      document.getElementById("saveGhkVialBtn")?.addEventListener("click", saveGhkVialTracker);
      [document.getElementById("ghkBacWaterMl"), document.getElementById("ghkReconstitutedDate")].forEach(input => {
        input?.addEventListener("keydown", event => {
          if (event.key === "Enter") {
            event.preventDefault();
            saveGhkVialTracker();
          }
        });
      });
    }
    renderGhkVialTracker();
  }

  function installMainTab() {
    if (document.getElementById("forumsPage")) return;
    const nav = document.querySelector(".tabs");
    const adminPage = document.getElementById("adminPage");
    if (!nav || !adminPage) return;
    const button = document.createElement("button");
    button.className = "tab forums-tab";
    button.dataset.tab = "forumsPage";
    button.type = "button";
    button.textContent = "Forums";
    const mkTab = [...nav.querySelectorAll(".tab")].find(item => item.dataset.tab === "mk677Page");
    if (mkTab) nav.insertBefore(button, mkTab); else nav.appendChild(button);

    const page = document.createElement("section");
    page.className = "page";
    page.id = "forumsPage";
    page.innerHTML = `
      <div class="forums-page">
        <section class="card forums-hero"><div><p class="eyebrow blue">Saved research</p><h2>Forums</h2><p>Keep useful videos, forum threads, and articles in one place.</p></div><div class="forums-hero-badge" id="forumResourceCount">0 saved</div></section>
        <section class="card feature-card">
          <div class="panel-title"><div><p class="eyebrow blue">Library</p><h3>Saved resources</h3></div><div class="forums-library-actions"><span class="badge blue" id="forumLibraryBadge">0 items</span><details class="resource-add-details" id="resourceAddDetails"><summary class="btn blue compact">Add resource</summary><div class="resource-add-popdown"><div class="feature-form"><label class="feature-field"><span>Title</span><input id="forumResourceTitle" maxlength="160" placeholder="Resource title" type="text"/></label><label class="feature-field"><span>URL</span><input id="forumResourceUrl" maxlength="1000" placeholder="https://..." type="url"/></label><label class="feature-field"><span>Type</span><select id="forumResourceType"><option value="video">Video</option><option value="forum">Forum thread</option><option value="article">Article</option><option value="other">Other link</option></select></label><button class="btn blue" id="saveForumResourceBtn" type="button">Save resource</button><p class="feature-status" id="forumResourceStatus"></p></div></div></details></div></div>
          <div class="resource-list" id="forumResourceList"></div>
        </section>
      </div>`;
    adminPage.parentNode.insertBefore(page, adminPage);
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
      document.querySelectorAll(".page").forEach(item => item.classList.remove("active"));
      button.classList.add("active"); page.classList.add("active"); renderForums();
    });
    document.querySelectorAll(".tab").forEach(tab => {
      if (tab !== button) tab.addEventListener("click", () => { button.classList.remove("active"); page.classList.remove("active"); });
    });
  }


  function gymGetSession(dateKey, create = false) {
    ensureFeatureState();
    const workout = gymWorkoutForDate(dateKey);
    if (workout === "Rest") return null;
    let session = state.meta.gymTracker.sessions.find(item => item.date === dateKey && item.workout === workout);
    if (!session && create) {
      session = { id: makeId("gym"), date: dateKey, workout, completed: false, updatedAt: new Date().toISOString(), exercises: [] };
      state.meta.gymTracker.sessions.push(session);
    }
    return session || null;
  }

  function gymGetExercise(session, exerciseName) {
    return session?.exercises?.find(item => item.name === exerciseName) || null;
  }

  function gymPreviousExercise(exerciseName, beforeDate) {
    ensureFeatureState();
    return state.meta.gymTracker.sessions
      .filter(session => session.date < beforeDate)
      .sort((a,b) => b.date.localeCompare(a.date))
      .map(session => ({ session, exercise: gymGetExercise(session, exerciseName) }))
      .find(item => item.exercise?.sets?.some(set => set.weight > 0 && set.reps > 0)) || null;
  }

  function gymSetText(set) {
    return set && set.weight > 0 && set.reps > 0 ? `${gymNumber(set.weight, 1)} lb × ${set.reps}` : "—";
  }

  function gymNumber(value, decimals = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
  }

  function gymBestSet(exercise) {
    const valid = (exercise?.sets || []).filter(set => set.weight > 0 && set.reps > 0);
    if (!valid.length) return null;
    return valid.reduce((best, set) => {
      const score = set.weight * (1 + set.reps / 30);
      const bestScore = best.weight * (1 + best.reps / 30);
      return score > bestScore ? set : best;
    });
  }

  function gymE1rm(exercise) {
    const set = gymBestSet(exercise);
    return set ? set.weight * (1 + set.reps / 30) : 0;
  }

  function gymVolume(exercise) {
    return (exercise?.sets || []).reduce((sum, set) => sum + ((set.weight > 0 && set.reps > 0) ? set.weight * set.reps : 0), 0);
  }

  function gymProgressText(currentExercise, previousExercise) {
    const currentSets = (currentExercise?.sets || []).filter(set => set.weight > 0 && set.reps > 0);
    if (!currentSets.length) return { text: "Log both working sets to build your baseline.", type: "" };
    if (!previousExercise?.sets?.some(set => set.weight > 0 && set.reps > 0)) {
      return { text: "Baseline saved. Next goal: beat reps or load with clean form.", type: "good" };
    }
    const currentE1rm = gymE1rm(currentExercise);
    const previousE1rm = gymE1rm(previousExercise);
    const pct = previousE1rm > 0 ? ((currentE1rm - previousE1rm) / previousE1rm) * 100 : 0;
    const bothTop = currentSets.length >= 2 && currentSets.slice(0,2).every(set => set.reps >= 10);
    if (bothTop) return { text: "Both sets hit 10 reps. Add a small amount of weight next time and return to 6–8 reps.", type: "ready" };
    if (pct >= 0.5) return { text: `Progress: estimated strength is up ${pct.toFixed(1)}% vs your last log.`, type: "good" };
    if (pct <= -2) return { text: "Below your previous performance. Keep the load steady and rebuild reps before adding weight.", type: "" };
    return { text: "Keep this load and add reps until both working sets reach the top of the 6–10 range.", type: "" };
  }

  function gymFormatDate(dateKey, options = {}) {
    return gymDateFromKey(dateKey).toLocaleDateString(undefined, {
      weekday: options.short ? undefined : "long",
      month: "short",
      day: "numeric",
      year: options.year === false ? undefined : "numeric"
    });
  }

  function installGymTab() {
    if (document.getElementById("gymPage")) return;
    const nav = document.querySelector(".tabs");
    const mkTab = [...(nav?.querySelectorAll(".tab") || [])].find(item => item.dataset.tab === "mk677Page");
    const mkPage = document.getElementById("mk677Page");
    if (!nav || !mkPage) return;

    const button = document.createElement("button");
    button.className = "tab gym-tab";
    button.dataset.tab = "gymPage";
    button.type = "button";
    button.textContent = "Gym";
    if (mkTab) nav.insertBefore(button, mkTab); else nav.appendChild(button);

    const page = document.createElement("section");
    page.className = "page";
    page.id = "gymPage";
    page.innerHTML = `
      <div class="gym-page">
        <section class="card gym-hero">
          <div><p class="eyebrow blue">Progressive overload</p><h2>Gym</h2><p>Your Push / Pull / Legs + Abs schedule with set-by-set lift tracking and progression history.</p></div>
          <div class="gym-today-badge" id="gymTodayBadge">Loading…</div>
        </section>

        <section class="card gym-week-card">
          <div class="panel-title"><div><p class="eyebrow blue">Schedule</p><h3>Your week</h3></div><span class="badge blue">6 training days</span></div>
          <div class="gym-week-grid" id="gymWeekGrid"></div>
        </section>

        <section class="card gym-log-card">
          <div class="gym-log-head">
            <div><p class="eyebrow blue">Workout log</p><h3 class="gym-workout-title" id="gymWorkoutTitle">Loading…</h3><p class="gym-workout-meta" id="gymWorkoutMeta">2 working sets · 6–10 reps</p></div>
            <div class="gym-date-tools">
              <button class="gym-nav-btn" id="gymPrevDayBtn" type="button" aria-label="Previous day">←</button>
              <input class="gym-date-input" id="gymDateInput" type="date"/>
              <button class="gym-nav-btn" id="gymNextDayBtn" type="button" aria-label="Next day">→</button>
              <button class="btn secondary compact" id="gymTodayBtn" type="button">Today</button>
            </div>
          </div>
          <div class="gym-day-override">
            <label class="gym-day-override-field"><span>Workout for this day</span><select class="gym-workout-select" id="gymWorkoutOverrideSelect" aria-label="Workout for selected day"></select></label>
            <button class="btn secondary compact" id="gymResetWorkoutBtn" type="button">Use scheduled workout</button>
            <p class="gym-override-note" id="gymOverrideNote">Using your normal weekly schedule.</p>
          </div>
          <div id="gymWorkoutBody"></div>
          <div class="gym-log-actions" id="gymLogActions">
            <p class="gym-save-status" id="gymSaveStatus"></p>
            <div class="gym-save-actions">
              <button class="btn secondary compact hidden" id="gymDeleteLogBtn" type="button">Delete log</button>
              <button class="btn secondary" id="gymSaveBtn" type="button">Save workout</button>
              <button class="btn blue" id="gymCompleteBtn" type="button">Save + complete</button>
            </div>
          </div>
        </section>

        <section class="card gym-history-card">
          <div class="gym-history-controls">
            <div><p class="eyebrow blue">Progress</p><h3>Lift history</h3></div>
            <select class="gym-history-select" id="gymHistoryExercise" aria-label="Exercise history"></select>
          </div>
          <div id="gymHistoryBody"></div>
        </section>
      </div>`;
    mkPage.parentNode.insertBefore(page, mkPage);

    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
      document.querySelectorAll(".page").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      page.classList.add("active");
      renderGym();
    });
    document.querySelectorAll(".tab").forEach(tab => {
      if (tab !== button) tab.addEventListener("click", () => {
        button.classList.remove("active");
        page.classList.remove("active");
      });
    });
  }

  function gymSetWorkoutForDate(dateKey, workout) {
    ensureFeatureState();
    if (!validDateKey(dateKey)) return;
    const scheduled = gymScheduledWorkoutForDate(dateKey);
    if (!["Push", "Pull", "Legs + Abs", "Rest"].includes(workout) || workout === scheduled) {
      delete state.meta.gymTracker.overrides[dateKey];
    } else {
      state.meta.gymTracker.overrides[dateKey] = workout;
    }
    persist();
    renderGym();
  }

  function renderGymWorkoutOverride() {
    const select = document.getElementById("gymWorkoutOverrideSelect");
    const reset = document.getElementById("gymResetWorkoutBtn");
    const note = document.getElementById("gymOverrideNote");
    if (!select || !reset || !note || !validDateKey(gymSelectedDate)) return;

    const scheduled = gymScheduledWorkoutForDate(gymSelectedDate);
    const override = gymWorkoutOverrideForDate(gymSelectedDate);
    const active = override || scheduled;
    select.innerHTML = ["Push", "Pull", "Legs + Abs", "Rest"].map(workout =>
      `<option value="${workout}"${workout === active ? " selected" : ""}>${workout}${workout === scheduled ? " · scheduled" : ""}</option>`
    ).join("");
    reset.disabled = !override;
    reset.classList.toggle("hidden", !override);
    note.textContent = override
      ? `Custom workout set for this date. Normal schedule: ${scheduled}.`
      : `Using your normal weekly schedule: ${scheduled}.`;
    note.classList.toggle("custom", Boolean(override));
  }

  function gymMoveSelectedDate(days) {
    const date = gymDateFromKey(gymSelectedDate || gymDateKey());
    date.setDate(date.getDate() + days);
    gymSelectedDate = gymDateKey(date);
    renderGym();
  }

  function gymWeekDates(dateKey) {
    const selected = gymDateFromKey(dateKey);
    const mondayOffset = (selected.getDay() + 6) % 7;
    const monday = new Date(selected);
    monday.setDate(monday.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + index);
      return gymDateKey(d);
    });
  }

  function renderGymWeek() {
    const grid = document.getElementById("gymWeekGrid");
    if (!grid) return;
    ensureFeatureState();
    const today = gymDateKey();
    grid.innerHTML = "";
    gymWeekDates(gymSelectedDate).forEach(dateKey => {
      const workout = gymWorkoutForDate(dateKey);
      const override = gymWorkoutOverrideForDate(dateKey);
      const session = workout === "Rest" ? null : gymGetSession(dateKey);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `gym-day-card${dateKey === today ? " today" : ""}${dateKey === gymSelectedDate ? " selected" : ""}`;
      button.dataset.gymDate = dateKey;
      const date = gymDateFromKey(dateKey);
      button.innerHTML = `<strong>${GYM_DAY_LABELS[date.getDay()].slice(0,3)} · ${date.getMonth()+1}/${date.getDate()}</strong><span>${workout}${override ? " · custom" : ""}${session?.completed ? " ✓" : ""}</span>`;
      grid.appendChild(button);
    });
  }

  function gymInputExerciseFromRow(row) {
    const name = row?.dataset.exercise || "";
    const sets = [0,1].map(index => {
      const weight = Number(row.querySelector(`[data-set="${index}"][data-field="weight"]`)?.value || 0);
      const reps = Number(row.querySelector(`[data-set="${index}"][data-field="reps"]`)?.value || 0);
      return {
        weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
        reps: Number.isFinite(reps) ? Math.max(0, Math.round(reps)) : 0
      };
    });
    return { name, sets };
  }

  function renderGymWorkout() {
    const body = document.getElementById("gymWorkoutBody");
    const title = document.getElementById("gymWorkoutTitle");
    const meta = document.getElementById("gymWorkoutMeta");
    const dateInput = document.getElementById("gymDateInput");
    const actions = document.getElementById("gymLogActions");
    const deleteBtn = document.getElementById("gymDeleteLogBtn");
    if (!body || !title || !meta || !dateInput || !actions) return;

    const workout = gymWorkoutForDate(gymSelectedDate);
    const override = gymWorkoutOverrideForDate(gymSelectedDate);
    const date = gymDateFromKey(gymSelectedDate);
    const dayName = GYM_DAY_LABELS[date.getDay()];
    const session = gymGetSession(gymSelectedDate);
    dateInput.value = gymSelectedDate;
    title.textContent = workout;
    meta.textContent = workout === "Rest"
      ? `${dayName} · recovery day${override ? " · custom" : ""}`
      : `${dayName} · ${GYM_WORKOUTS[workout].length * 2} working sets · 2 sets each · 6–10 reps${override ? " · custom" : ""}`;
    if (deleteBtn) deleteBtn.classList.toggle("hidden", !session);

    if (workout === "Rest") {
      body.innerHTML = `<div class="gym-rest"><strong>Rest day</strong><span>No lifting scheduled. Your next session is ${gymWorkoutForDate(gymDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate()+1, 12)))}.</span></div>`;
      actions.classList.add("hidden");
      return;
    }

    actions.classList.remove("hidden");
    const list = document.createElement("div");
    list.className = "gym-exercise-list";
    GYM_WORKOUTS[workout].forEach(exerciseName => {
      const current = gymGetExercise(session, exerciseName) || { name: exerciseName, sets: [] };
      const previousWrap = gymPreviousExercise(exerciseName, gymSelectedDate);
      const previous = previousWrap?.exercise || null;
      const progress = gymProgressText(current, previous);
      const row = document.createElement("div");
      row.className = "gym-exercise-row";
      row.dataset.exercise = exerciseName;

      const previousText = previous
        ? `${gymSetText(previous.sets?.[0])}<br>${gymSetText(previous.sets?.[1])}`
        : "No previous log";

      const setMarkup = [0,1].map(index => {
        const set = current.sets?.[index] || { weight: 0, reps: 0 };
        return `<div class="gym-set-box">
          <label><span>Set ${index+1} lb</span><input class="gym-set-input" data-set="${index}" data-field="weight" inputmode="decimal" min="0" max="2000" step="0.5" type="number" value="${set.weight || ""}" placeholder="Weight"/></label>
          <label><span>Reps</span><input class="gym-set-input" data-set="${index}" data-field="reps" inputmode="numeric" min="0" max="100" step="1" type="number" value="${set.reps || ""}" placeholder="6–10"/></label>
        </div>`;
      }).join("");

      row.innerHTML = `
        <div class="gym-exercise-name"><strong>${exerciseName}</strong><span>2 × 6–10</span></div>
        <div class="gym-prev"><strong>Previous</strong>${previousText}</div>
        ${setMarkup}
        <div class="gym-row-progress ${progress.type}">${progress.text}</div>`;
      list.appendChild(row);
    });
    body.innerHTML = "";
    body.appendChild(list);

    const complete = session?.completed;
    if (complete) {
      const badge = document.createElement("span");
      badge.className = "gym-complete-badge";
      badge.textContent = "Workout completed ✓";
      meta.append(" · ");
      meta.appendChild(badge);
    }
  }

  function gymCollectWorkout() {
    const rows = [...document.querySelectorAll("#gymWorkoutBody .gym-exercise-row")];
    const exercises = [];
    let invalid = false;
    rows.forEach(row => {
      const exercise = gymInputExerciseFromRow(row);
      const hasAny = exercise.sets.some(set => set.weight > 0 || set.reps > 0);
      if (!hasAny) return;
      const hasHalfSet = exercise.sets.some(set => (set.weight > 0) !== (set.reps > 0));
      if (hasHalfSet) invalid = true;
      exercises.push(exercise);
    });
    return { exercises, invalid, rows };
  }

  function saveGymWorkout(markComplete = false) {
    ensureFeatureState();
    const workout = gymWorkoutForDate(gymSelectedDate);
    if (workout === "Rest") return;
    const collected = gymCollectWorkout();
    if (collected.invalid) {
      setStatus("gymSaveStatus", "Each logged set needs both a weight and rep count.", "bad");
      return;
    }
    if (!collected.exercises.length) {
      setStatus("gymSaveStatus", "Log at least one set before saving.", "bad");
      return;
    }
    if (markComplete) {
      const byName = new Map(collected.exercises.map(ex => [ex.name, ex]));
      const missing = GYM_WORKOUTS[workout].some(name => {
        const ex = byName.get(name);
        return !ex || ex.sets.length < 2 || ex.sets.some(set => !(set.weight > 0 && set.reps > 0));
      });
      if (missing) {
        setStatus("gymSaveStatus", "Fill in both working sets for every exercise before marking the workout complete.", "bad");
        return;
      }
    }

    let session = gymGetSession(gymSelectedDate, true);
    session.exercises = GYM_WORKOUTS[workout].map(name => {
      const found = collected.exercises.find(ex => ex.name === name);
      return found || { name, sets: [] };
    });
    session.completed = markComplete ? true : Boolean(session.completed);
    session.updatedAt = new Date().toISOString();
    persist();
    renderGym();
    setStatus("gymSaveStatus", markComplete ? "Workout saved and marked complete." : "Workout saved.", "good");
    if (typeof toast === "function") toast(markComplete ? "Workout completed." : "Workout saved.");
  }

  function deleteGymLog() {
    ensureFeatureState();
    const session = gymGetSession(gymSelectedDate);
    if (!session) return;
    if (!window.confirm(`Delete your ${session.workout} log for ${gymFormatDate(gymSelectedDate, { year: false })}?`)) return;
    state.meta.gymTracker.sessions = state.meta.gymTracker.sessions.filter(item => item.id !== session.id);
    persist();
    renderGym();
    setStatus("gymSaveStatus", "Workout log deleted.", "good");
  }

  function gymHistoryEntries(exerciseName) {
    ensureFeatureState();
    return state.meta.gymTracker.sessions
      .map(session => ({ session, exercise: gymGetExercise(session, exerciseName) }))
      .filter(item => item.exercise?.sets?.some(set => set.weight > 0 && set.reps > 0))
      .sort((a,b) => b.session.date.localeCompare(a.session.date));
  }

  function renderGymHistory() {
    const select = document.getElementById("gymHistoryExercise");
    const body = document.getElementById("gymHistoryBody");
    if (!select || !body) return;

    const currentWorkout = gymWorkoutForDate(gymSelectedDate);
    if (!gymHistoryExercise || !GYM_EXERCISE_NAMES.includes(gymHistoryExercise)) {
      gymHistoryExercise = currentWorkout !== "Rest" ? GYM_WORKOUTS[currentWorkout][0] : GYM_EXERCISE_NAMES[0];
    }
    const previousSelection = gymHistoryExercise;
    select.innerHTML = "";
    Object.entries(GYM_WORKOUTS).forEach(([workout, exercises]) => {
      const group = document.createElement("optgroup");
      group.label = workout;
      exercises.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        option.selected = name === previousSelection;
        group.appendChild(option);
      });
      select.appendChild(group);
    });

    const entries = gymHistoryEntries(gymHistoryExercise);
    if (!entries.length) {
      body.innerHTML = `<div class="gym-empty">No history for this exercise yet. Log your first session to create a baseline.</div>`;
      return;
    }

    const latest = entries[0];
    const prior = entries[1] || null;
    const latestBest = gymBestSet(latest.exercise);
    const allTime = entries.reduce((best, item) => Math.max(best, gymE1rm(item.exercise)), 0);
    const progressPct = prior && gymE1rm(prior.exercise) > 0
      ? ((gymE1rm(latest.exercise) - gymE1rm(prior.exercise)) / gymE1rm(prior.exercise)) * 100
      : null;
    const progressText = progressPct === null ? "Baseline" : `${progressPct >= 0 ? "+" : ""}${progressPct.toFixed(1)}%`;

    const rows = entries.slice(0, 20).map(item => {
      const e1rm = gymE1rm(item.exercise);
      const isPr = Math.abs(e1rm - allTime) < 0.01;
      return `<tr>
        <td>${gymFormatDate(item.session.date, { year: false })}${item.session.completed ? " ✓" : ""}</td>
        <td>${gymSetText(item.exercise.sets?.[0])}</td>
        <td>${gymSetText(item.exercise.sets?.[1])}</td>
        <td>${gymNumber(gymVolume(item.exercise), 0)} lb</td>
        <td class="${isPr ? "gym-pr" : ""}">${gymNumber(e1rm, 1)} lb${isPr ? " · PR" : ""}</td>
      </tr>`;
    }).join("");

    body.innerHTML = `
      <div class="gym-stat-grid">
        <div class="gym-stat"><span>Latest best set</span><strong>${latestBest ? gymSetText(latestBest) : "—"}</strong></div>
        <div class="gym-stat"><span>Estimated strength</span><strong>${gymNumber(gymE1rm(latest.exercise),1)} lb</strong></div>
        <div class="gym-stat"><span>Change vs last</span><strong>${progressText}</strong></div>
        <div class="gym-stat"><span>Logged sessions</span><strong>${entries.length}</strong></div>
      </div>
      <div class="gym-history-table-wrap">
        <table class="gym-history-table">
          <thead><tr><th>Date</th><th>Set 1</th><th>Set 2</th><th>Volume</th><th>Est. 1RM</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderGym() {
    const page = document.getElementById("gymPage");
    if (!page) return;
    ensureFeatureState();
    if (!validDateKey(gymSelectedDate)) gymSelectedDate = gymDateKey();
    const workout = gymWorkoutForDate(gymSelectedDate);
    const badge = document.getElementById("gymTodayBadge");
    if (badge) badge.textContent = gymSelectedDate === gymDateKey() ? `Today · ${workout}` : `${gymFormatDate(gymSelectedDate, { year: false })} · ${workout}`;
    renderGymWeek();
    renderGymWorkoutOverride();
    renderGymWorkout();
    renderGymHistory();
  }

  function installGymHandlers() {
    const page = document.getElementById("gymPage");
    if (!page || page.dataset.handlersInstalled === "true") return;
    page.dataset.handlersInstalled = "true";
    if (!validDateKey(gymSelectedDate)) gymSelectedDate = gymDateKey();

    document.getElementById("gymPrevDayBtn")?.addEventListener("click", () => gymMoveSelectedDate(-1));
    document.getElementById("gymNextDayBtn")?.addEventListener("click", () => gymMoveSelectedDate(1));
    document.getElementById("gymTodayBtn")?.addEventListener("click", () => { gymSelectedDate = gymDateKey(); renderGym(); });
    document.getElementById("gymDateInput")?.addEventListener("change", event => {
      if (validDateKey(event.target.value)) { gymSelectedDate = event.target.value; renderGym(); }
    });
    document.getElementById("gymWorkoutOverrideSelect")?.addEventListener("change", event => {
      gymSetWorkoutForDate(gymSelectedDate, event.target.value);
      if (typeof toast === "function") toast(`Workout set to ${event.target.value}.`);
    });
    document.getElementById("gymResetWorkoutBtn")?.addEventListener("click", () => {
      ensureFeatureState();
      delete state.meta.gymTracker.overrides[gymSelectedDate];
      persist();
      renderGym();
      if (typeof toast === "function") toast("Scheduled workout restored.");
    });
    document.getElementById("gymSaveBtn")?.addEventListener("click", () => saveGymWorkout(false));
    document.getElementById("gymCompleteBtn")?.addEventListener("click", () => saveGymWorkout(true));
    document.getElementById("gymDeleteLogBtn")?.addEventListener("click", deleteGymLog);
    document.getElementById("gymHistoryExercise")?.addEventListener("change", event => {
      gymHistoryExercise = event.target.value;
      renderGymHistory();
    });
    document.getElementById("gymWeekGrid")?.addEventListener("click", event => {
      const button = event.target.closest("[data-gym-date]");
      if (!button) return;
      gymSelectedDate = button.dataset.gymDate;
      renderGym();
    });
    document.getElementById("gymWorkoutBody")?.addEventListener("input", event => {
      const input = event.target.closest(".gym-set-input");
      if (!input) return;
      const row = input.closest(".gym-exercise-row");
      if (!row) return;
      const current = gymInputExerciseFromRow(row);
      const previous = gymPreviousExercise(row.dataset.exercise, gymSelectedDate)?.exercise || null;
      const progress = gymProgressText(current, previous);
      const el = row.querySelector(".gym-row-progress");
      if (el) {
        el.textContent = progress.text;
        el.classList.toggle("good", progress.type === "good");
        el.classList.toggle("ready", progress.type === "ready");
      }
    });
  }

  function installAppointmentsPanel() {
    if (document.getElementById("appointmentsAdminPanel")) return;
    const subtabs = document.querySelector(".admin-subtabs");
    const weekly = document.getElementById("weeklyPage");
    if (!subtabs || !weekly) return;
    const button = document.createElement("button");
    button.className = "admin-subtab appointments-subtab";
    button.dataset.adminPanel = "appointmentsAdminPanel";
    button.type = "button";
    button.textContent = "Appointments";
    subtabs.appendChild(button);
    const panel = document.createElement("div");
    panel.className = "admin-subpanel appointments-panel";
    panel.id = "appointmentsAdminPanel";
    panel.innerHTML = `
      <section class="card appointments-hero"><div><p class="eyebrow blue">Calendar</p><h2>Doctor's appointments</h2><p>Keep upcoming appointments in one place and edit them as plans change.</p></div><div class="appointment-next-badge" id="appointmentNextBadge">Loading…</div></section>
      <div class="admin-grid routine-admin-grid">
        <section class="card admin-card"><p class="eyebrow blue">Schedule</p><h2 id="appointmentFormHeading">Add appointment</h2><div class="feature-form"><label class="feature-field"><span>Appointment</span><input id="appointmentTitle" maxlength="120" placeholder="Dermatologist" type="text"/></label><div class="feature-two-col"><label class="feature-field"><span>Date</span><input id="appointmentDate" type="date"/></label><label class="feature-field"><span>Time</span><input id="appointmentTime" type="time"/></label></div><label class="feature-field"><span>Notes</span><textarea id="appointmentNotes" maxlength="500" placeholder="Optional notes"></textarea></label><div class="feature-actions"><button class="btn blue" id="saveAppointmentBtn" type="button">Add appointment</button><button class="btn secondary hidden" id="cancelAppointmentEditBtn" type="button">Cancel edit</button></div><p class="feature-status" id="appointmentStatus"></p></div></section>
        <section class="card admin-card"><div class="panel-title"><div><p class="eyebrow blue">Upcoming</p><h2>Your appointments</h2></div><span class="badge blue" id="appointmentCountBadge">0 upcoming</span></div><div class="appointment-list" id="appointmentList"></div></section>
      </div>`;
    weekly.parentNode.insertBefore(panel, weekly.nextSibling);

    subtabs.addEventListener("click", event => {
      const tab = event.target.closest(".admin-subtab");
      if (!tab) return;
      document.querySelectorAll(".admin-subtab").forEach(item => item.classList.toggle("active", item === tab));
      document.querySelectorAll(".admin-subpanel").forEach(item => item.classList.toggle("active", item.id === tab.dataset.adminPanel));
      if (tab.dataset.adminPanel === "appointmentsAdminPanel") renderAppointments();
      if (tab.dataset.adminPanel === "weeklyPage" && typeof renderWeeklyReview === "function") renderWeeklyReview();
    });
  }

  function formatAppointmentDate(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  function formatAppointmentTime(time) {
    if (!validTime(time)) return "Time not set";
    const [hour, minute] = time.split(":").map(Number);
    return new Date(2000,0,1,hour,minute).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
  }
  function appointmentMoment(item) {
    const [year, month, day] = item.date.split("-").map(Number);
    const [hour, minute] = (validTime(item.time) ? item.time : "23:59").split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute);
  }
  function appointmentCountdown(item) {
    const diff = appointmentMoment(item).getTime() - Date.now();
    if (diff < 0) return "Past appointment";
    const days = Math.ceil(diff / 86400000);
    if (days <= 1) return "Coming up today";
    if (days === 2) return "Tomorrow";
    return `${days - 1} days away`;
  }
  function setStatus(id, message, type = "") {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = message; el.classList.toggle("good", type === "good"); el.classList.toggle("bad", type === "bad");
  }
  function resetAppointmentForm() {
    appointmentEditId = null;
    ["appointmentTitle","appointmentDate","appointmentTime","appointmentNotes"].forEach(id => { const el=document.getElementById(id); if(el) el.value=""; });
    const heading=document.getElementById("appointmentFormHeading"), save=document.getElementById("saveAppointmentBtn"), cancel=document.getElementById("cancelAppointmentEditBtn");
    if(heading) heading.textContent="Add appointment"; if(save) save.textContent="Add appointment"; if(cancel) cancel.classList.add("hidden");
  }
  function saveAppointment() {
    ensureFeatureState();
    const title=safeText(document.getElementById("appointmentTitle")?.value,120), date=safeText(document.getElementById("appointmentDate")?.value,20), time=safeText(document.getElementById("appointmentTime")?.value,10), notes=safeText(document.getElementById("appointmentNotes")?.value,500);
    if(!title){setStatus("appointmentStatus","Enter the appointment name.","bad");return;}
    if(!validDateKey(date)){setStatus("appointmentStatus","Choose a valid date.","bad");return;}
    if(time&&!validTime(time)){setStatus("appointmentStatus","Choose a valid time.","bad");return;}
    if(appointmentEditId){const item=state.meta.appointments.find(x=>x.id===appointmentEditId);if(item)Object.assign(item,{title,date,time,notes});}
    else state.meta.appointments.push({id:makeId("appt"),title,date,time,notes});
    persist(); resetAppointmentForm(); renderAppointments(); setStatus("appointmentStatus","Appointment saved.","good"); if(typeof toast==="function")toast("Appointment saved.");
  }
  function editAppointment(id) {
    const item=state.meta.appointments.find(x=>x.id===id); if(!item)return; appointmentEditId=id;
    document.getElementById("appointmentTitle").value=item.title; document.getElementById("appointmentDate").value=item.date; document.getElementById("appointmentTime").value=item.time||""; document.getElementById("appointmentNotes").value=item.notes||"";
    document.getElementById("appointmentFormHeading").textContent="Edit appointment"; document.getElementById("saveAppointmentBtn").textContent="Save changes"; document.getElementById("cancelAppointmentEditBtn").classList.remove("hidden");
  }
  function deleteAppointment(id) {
    const item=state.meta.appointments.find(x=>x.id===id); if(!item||!window.confirm(`Delete “${item.title}”?`))return;
    state.meta.appointments=state.meta.appointments.filter(x=>x.id!==id); persist(); renderAppointments();
  }
  function renderAppointments() {
    const list=document.getElementById("appointmentList"); if(!list)return; ensureFeatureState();
    const items=[...state.meta.appointments].sort((a,b)=>appointmentMoment(a)-appointmentMoment(b)), now=new Date(), upcoming=items.filter(x=>appointmentMoment(x)>=now), past=items.filter(x=>appointmentMoment(x)<now);
    const count=document.getElementById("appointmentCountBadge"); if(count)count.textContent=`${upcoming.length} upcoming`;
    const next=document.getElementById("appointmentNextBadge"); if(next)next.textContent=upcoming.length?`Next · ${upcoming[0].title} · ${formatAppointmentDate(upcoming[0].date)}`:"No upcoming appointments";
    list.innerHTML="";
    const draw=(item,isPast)=>{const d=new Date(`${item.date}T12:00:00`),card=document.createElement("div");card.className=`appointment-card${isPast?" past":""}`;card.innerHTML=`<div class="appointment-card-body"><div class="appointment-card-head"><div class="appointment-date-block"><div class="appointment-date-chip"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString(undefined,{month:"short"})}</span></div><div><h4></h4><div class="appointment-meta">${formatAppointmentDate(item.date)} · ${formatAppointmentTime(item.time)}</div><span class="appointment-countdown">${appointmentCountdown(item)}</span></div></div><div class="card-actions"><button class="feature-mini-btn edit" type="button">Edit</button><button class="feature-mini-btn danger remove" type="button">Delete</button></div></div>${item.notes?'<p class="appointment-notes"></p>':""}</div>`;card.querySelector("h4").textContent=item.title;if(item.notes)card.querySelector(".appointment-notes").textContent=item.notes;card.querySelector(".edit").onclick=()=>editAppointment(item.id);card.querySelector(".remove").onclick=()=>deleteAppointment(item.id);list.appendChild(card);};
    upcoming.forEach(x=>draw(x,false)); if(past.length){const label=document.createElement("div");label.className="feature-empty";label.textContent="Past appointments";list.appendChild(label);[...past].reverse().forEach(x=>draw(x,true));}
    if(!items.length){const empty=document.createElement("div");empty.className="feature-empty";empty.textContent="No appointments saved yet.";list.appendChild(empty);}
  }

  function saveResource() {
    ensureFeatureState(); const title=safeText(document.getElementById("forumResourceTitle")?.value,160), url=normalizeUrl(document.getElementById("forumResourceUrl")?.value); let type=safeText(document.getElementById("forumResourceType")?.value,20);
    if(!title){setStatus("forumResourceStatus","Enter a title.","bad");return;} if(!url){setStatus("forumResourceStatus","Enter a valid http or https URL.","bad");return;} if(getYouTubeId(url))type="video"; if(!["video","forum","article","other"].includes(type))type="other";
    state.meta.forumHub.resources.unshift({id:makeId("resource"),title,url,type,notes:"",createdAt:new Date().toISOString()}); persist(); document.getElementById("forumResourceTitle").value=""; document.getElementById("forumResourceUrl").value=""; const details=document.getElementById("resourceAddDetails");if(details)details.open=false;renderForums();
  }
  function deleteResource(id){state.meta.forumHub.resources=state.meta.forumHub.resources.filter(x=>x.id!==id);persist();renderForums();}
  function renderForums(){const list=document.getElementById("forumResourceList");if(!list)return;ensureFeatureState();const resources=state.meta.forumHub.resources;list.innerHTML="";const badge=document.getElementById("forumLibraryBadge"),hero=document.getElementById("forumResourceCount");if(badge)badge.textContent=`${resources.length} item${resources.length===1?"":"s"}`;if(hero)hero.textContent=`${resources.length} saved`;if(!resources.length){list.innerHTML='<div class="feature-empty">No saved resources yet.</div>';return;}resources.forEach(item=>{const card=document.createElement("article");card.className="resource-card";const ytid=getYouTubeId(item.url);if(ytid){const embed=document.createElement("div");embed.className="resource-embed";const iframe=document.createElement("iframe");iframe.loading="lazy";iframe.src=`https://www.youtube-nocookie.com/embed/${ytid}`;iframe.title=item.title;iframe.allowFullscreen=true;embed.appendChild(iframe);card.appendChild(embed);}const body=document.createElement("div");body.className="resource-card-body";body.innerHTML=`<div class="resource-card-head"><div><h4></h4><div class="resource-meta"></div></div><div class="card-actions"><span class="resource-type-pill">${ytid?"video":item.type}</span><button class="feature-mini-btn danger" type="button">Delete</button></div></div>${item.notes?'<p class="resource-note"></p>':""}<a class="resource-link" target="_blank" rel="noopener noreferrer">Open original ↗</a>`;body.querySelector("h4").textContent=item.title;try{body.querySelector(".resource-meta").textContent=new URL(item.url).hostname.replace(/^www\./,"");}catch{}if(item.notes)body.querySelector(".resource-note").textContent=item.notes;const link=body.querySelector("a");link.href=item.url;body.querySelector("button").onclick=()=>deleteResource(item.id);card.appendChild(body);list.appendChild(card);});}

  function installHandlers(){document.getElementById("saveAppointmentBtn")?.addEventListener("click",saveAppointment);document.getElementById("cancelAppointmentEditBtn")?.addEventListener("click",resetAppointmentForm);document.getElementById("saveForumResourceBtn")?.addEventListener("click",saveResource);}

  function installRotationCalendarDeletionFix() {
    const base = typeof getRotationTasksForDay === "function" ? getRotationTasksForDay : null;
    if (!base || base.__looksDeletionAware) return;

    const taskIdsByLabel = {
      "Masseter training": "masseter-training",
      "Wash bed sheets": "wash-bed-sheets",
      "Shave + eyebrows": "shave-manage-brows",
      "Microneedling": "microneedle-eyebrows",
      "Tretinoin": "tretinoin",
      "Azelaic acid": "azelaic-acid",
      "Lip exfoliation": "lip-care"
    };

    const wrapped = dayKey => {
      if (typeof getLooksTaskIds !== "function") return base(dayKey);
      const allowedIds = new Set(getLooksTaskIds(dayKey));
      return base(dayKey).filter(item => {
        const taskId = item?.label?.startsWith("Gym:") ? "gym" : taskIdsByLabel[item?.label];
        return !taskId || allowedIds.has(taskId);
      });
    };

    wrapped.__looksDeletionAware = true;
    window.getRotationTasksForDay = wrapped;
  }

  function installRenderWrapper(){if(typeof render!=="function"||render.__featureWrapped)return;const base=render;const wrapped=function(...args){const result=base(...args);highlightGhkToday();renderGhkVialTracker();renderAppointments();renderForums();renderGym();return result;};wrapped.__featureWrapped=true;render=wrapped;}

  window.addEventListener("DOMContentLoaded",()=>{
    if(typeof state==="undefined")return;
    injectStyles();ensureFeatureState();installMeaningfulStateSupport();installMainTab();installGymTab();installAppointmentsPanel();installHandlers();installGymHandlers();installRotationCalendarDeletionFix();installRenderWrapper();highlightGhkToday();installGhkVialTracker();
    if(typeof saveLocalState==="function")saveLocalState();renderAppointments();renderForums();renderGym();
  });
})();
