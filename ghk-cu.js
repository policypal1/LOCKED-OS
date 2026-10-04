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



"use strict";

/*
  LOCKED OS — CLEAN REBUILD
  One stable feature base + one clean authority layer.
  This intentionally replaces the stacked gym/task patches that accumulated before it.
*/



(() => {
  "use strict";

  const CLEAN_FLAG = "__lockedOsCleanRebuild20260911";
  if (window[CLEAN_FLAG]) return;
  window[CLEAN_FLAG] = true;

  const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const GYM_EDITOR_ORDER = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
  const GYM_START = "2026-09-11";
  const GYM_WORKOUTS = ["Chest + side delts", "Back + rear delts", "Arms", "Legs + Abs"];
  const GYM_WORKOUT_SET = new Set(GYM_WORKOUTS);
  const DEFAULT_GYM_SCHEDULE = {
    Monday: "Chest + side delts",
    Wednesday: "Back + rear delts",
    Friday: "Arms",
    Saturday: "Legs + Abs"
  };
  const EXERCISES = {
    "Chest + side delts": [
      "Incline Dumbbell Bench Press",
      "Machine Chest Press",
      "Cable Fly / Pec Deck",
      "Cable Lateral Raise",
      "Machine Lateral Raise"
    ],
    "Back + rear delts": [
      "Lat Pulldown",
      "Chest-Supported Row",
      "Seated Cable Row, both arms",
      "Reverse Pec Deck"
    ],
    "Arms": [
      "Triceps Pressdown",
      "Overhead Cable Triceps Extension",
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

  const TRETINOIN_SCHEDULE_CLEAN = {
    1: ["Friday"],
    2: ["Tuesday", "Friday"],
    3: ["Monday", "Wednesday", "Friday"],
    4: ["Sunday", "Monday", "Wednesday", "Friday"],
    5: ["Sunday", "Monday", "Tuesday", "Thursday", "Friday"],
    6: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    7: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  };

  const CUSTOM_SCHEDULE_META = "customTaskSchedules";
  const DIRTY_KEY = "locked_os_supabase_dirty_clean";
  const RECOVERY_KEY = "locked_os_recovery_snapshots_clean";
  const RETRY_DELAYS = [1000, 2500, 5000, 10000, 20000, 30000];
  const POLL_MS = 5000;

  let cleanGymSelectedDate = "";
  let retryTimer = null;
  let retryIndex = 0;
  let pollTimer = null;
  let cleanRealtimeChannel = null;

  const clone = value => JSON.parse(JSON.stringify(value));
  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function validDays(value) {
    if (!Array.isArray(value)) return [];
    const set = new Set(value.map(day => String(day || "").trim()));
    return DAY_ORDER.filter(day => set.has(day));
  }

  function ensureMeta(target = state) {
    if (!target || typeof target !== "object") return;
    target.meta = target.meta && typeof target.meta === "object" ? target.meta : {};
    if (!target.meta[CUSTOM_SCHEDULE_META] || typeof target.meta[CUSTOM_SCHEDULE_META] !== "object" || Array.isArray(target.meta[CUSTOM_SCHEDULE_META])) {
      target.meta[CUSTOM_SCHEDULE_META] = {};
    }
  }

  function recoverTaskSchedulesFromSnapshots() {
    ensureMeta();
    const map = state.meta[CUSTOM_SCHEDULE_META];

    for (const task of Array.isArray(state.meta.looksCustomTasks) ? state.meta.looksCustomTasks : []) {
      const days = validDays(task?.days);
      if (task?.id && days.length) map[task.id] = days;
    }

    const snapshotKeys = [
      "locked_os_recovery_snapshots_v2",
      "locked_os_recovery_snapshots_clean"
    ];

    for (const key of snapshotKeys) {
      try {
        const entries = JSON.parse(localStorage.getItem(key) || "[]");
        for (const entry of Array.isArray(entries) ? entries : []) {
          let snapshot = entry?.state;
          if (!snapshot && entry?.serialized) {
            try { snapshot = JSON.parse(entry.serialized); } catch (_) {}
          }
          const tasks = snapshot?.meta?.looksCustomTasks;
          if (!Array.isArray(tasks)) continue;
          for (const task of tasks) {
            const days = validDays(task?.days);
            if (task?.id && days.length && !map[task.id]) map[task.id] = days;
          }
        }
      } catch (_) {}
    }
  }

  function scheduleForTask(task, targetState = state) {
    ensureMeta(targetState);
    const direct = validDays(task?.days);
    if (direct.length) return direct;
    const mapped = validDays(targetState.meta?.[CUSTOM_SCHEDULE_META]?.[task?.id]);
    return mapped.length ? mapped : [...DAY_ORDER];
  }

  /*
    Fix the actual startup bug: app.js's original normalizer discarded days[].
    Every normalization after this point preserves the day schedule, and the
    side-map keeps it recoverable across future reloads/devices.
  */
  normalizeLooksCustomTasks = function(original) {
    if (!Array.isArray(original)) return [];
    ensureMeta();
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

      const days = validDays(item.days).length
        ? validDays(item.days)
        : validDays(state.meta[CUSTOM_SCHEDULE_META][id]);

      const task = { id, section, title, custom: true };
      if (days.length) {
        task.days = days;
        state.meta[CUSTOM_SCHEDULE_META][id] = days;
      }
      normalized.push(task);
    }
    return normalized;
  };

  recoverTaskSchedulesFromSnapshots();

  /* ------------------------- resilient save/sync ------------------------- */

  function archiveSnapshot(label, snapshot = state) {
    if (!snapshot || typeof snapshot !== "object") return;
    try {
      const serialized = JSON.stringify(snapshot);
      let entries = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "[]");
        if (Array.isArray(parsed)) entries = parsed;
      } catch (_) {}
      if (entries[0]?.serialized === serialized) return;
      entries.unshift({
        savedAt: new Date().toISOString(),
        label,
        serialized
      });
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(entries.slice(0, 20)));
    } catch (error) {
      console.warn("LOCKED OS: could not create local recovery snapshot.", error);
    }
  }

  function mergeById(localItems, remoteItems) {
    const map = new Map();
    for (const item of Array.isArray(localItems) ? localItems : []) {
      if (item?.id) map.set(String(item.id), clone(item));
    }
    for (const item of Array.isArray(remoteItems) ? remoteItems : []) {
      if (item?.id) map.set(String(item.id), clone(item));
    }
    return [...map.values()];
  }

  function sessionRichness(session) {
    let score = session?.completed ? 1000 : 0;
    for (const exercise of Array.isArray(session?.exercises) ? session.exercises : []) {
      for (const set of Array.isArray(exercise?.sets) ? exercise.sets : []) {
        if (Number(set?.weight) > 0) score += 2;
        if (Number(set?.reps) > 0) score += 2;
      }
    }
    return score;
  }

  function mergeGymSessions(localSessions, remoteSessions) {
    const map = new Map();
    const choose = (a, b) => {
      if (!a) return clone(b);
      const at = String(a?.updatedAt || "");
      const bt = String(b?.updatedAt || "");
      if (at && bt && at !== bt) return clone(bt > at ? b : a);
      return clone(sessionRichness(b) > sessionRichness(a) ? b : a);
    };
    for (const session of Array.isArray(localSessions) ? localSessions : []) {
      if (validDateKey(session?.date)) map.set(session.date, clone(session));
    }
    for (const session of Array.isArray(remoteSessions) ? remoteSessions : []) {
      if (validDateKey(session?.date)) map.set(session.date, choose(map.get(session.date), session));
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function deepMerge(localValue, remoteValue) {
    if (remoteValue === undefined) return clone(localValue);
    if (localValue === undefined) return clone(remoteValue);
    const localObj = localValue && typeof localValue === "object" && !Array.isArray(localValue);
    const remoteObj = remoteValue && typeof remoteValue === "object" && !Array.isArray(remoteValue);
    if (localObj && remoteObj) {
      const out = {};
      for (const key of new Set([...Object.keys(localValue), ...Object.keys(remoteValue)])) {
        out[key] = deepMerge(localValue[key], remoteValue[key]);
      }
      return out;
    }
    return clone(remoteValue);
  }

  function mergeStateSafely(localState, remoteState) {
    const local = localState && typeof localState === "object" ? localState : {};
    const remote = remoteState && typeof remoteState === "object" ? remoteState : {};
    const merged = deepMerge(local, remote);

    merged.days = { ...(local.days || {}), ...(remote.days || {}) };
    merged.weights = { ...(local.weights || {}), ...(remote.weights || {}) };

    merged.meta = deepMerge(local.meta || {}, remote.meta || {});
    merged.meta[CUSTOM_SCHEDULE_META] = {
      ...(local.meta?.[CUSTOM_SCHEDULE_META] || {}),
      ...(remote.meta?.[CUSTOM_SCHEDULE_META] || {})
    };

    merged.meta.looksCustomTasks = mergeById(
      local.meta?.looksCustomTasks,
      remote.meta?.looksCustomTasks
    ).map(task => {
      const days = validDays(task.days).length
        ? validDays(task.days)
        : validDays(merged.meta[CUSTOM_SCHEDULE_META][task.id]);
      return days.length ? { ...task, days } : task;
    });

    if (local.meta?.gymClean || remote.meta?.gymClean) {
      const lg = local.meta?.gymClean || {};
      const rg = remote.meta?.gymClean || {};
      merged.meta.gymClean = {
        version: 1,
        schedule: Object.keys(rg.schedule || {}).length ? clone(rg.schedule) : clone(lg.schedule || DEFAULT_GYM_SCHEDULE),
        sessions: mergeGymSessions(lg.sessions, rg.sessions)
      };
    }

    return merged;
  }

  const oldFocusRefresh = typeof refreshSupabaseState === "function" ? refreshSupabaseState : null;
  if (oldFocusRefresh) window.removeEventListener("focus", oldFocusRefresh);

  hasPendingLocalChanges = function() {
    return Boolean(
      saveTimer ||
      supabaseSaveInFlight ||
      localRevision > syncedRevision ||
      localStorage.getItem(DIRTY_KEY) === "1"
    );
  };

  fetchSupabaseState = async function({ silent = false } = {}) {
    if (!supabaseClient) return { ok: false, row: null, error: new Error("Supabase unavailable") };
    if (!silent && syncStatus) syncStatus.textContent = "Loading from Supabase…";

    try {
      const { data, error } = await supabaseClient
        .from(SUPABASE_TABLE)
        .select("state, updated_at")
        .eq("id", SUPABASE_ROW_ID)
        .maybeSingle();

      if (error) throw error;
      return { ok: true, row: data || null, error: null };
    } catch (error) {
      console.error(error);
      if (!silent && syncStatus) syncStatus.textContent = "Supabase load failed. Local data kept safe.";
      return { ok: false, row: null, error };
    }
  };

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry() {
    if (!supabaseClient) return;
    clearRetry();
    const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
    retryIndex += 1;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (mainApp.classList.contains("hidden")) {
        scheduleRetry();
        return;
      }
      if (hasPendingLocalChanges()) await saveSupabaseState();
      else await refreshSupabaseState({ force: true });
    }, delay);
  }

  function resetRetry() {
    clearRetry();
    retryIndex = 0;
  }

  applyRemoteState = function(remoteState, statusMessage = "Updated from Supabase.", { force = false, updatedAt = "" } = {}) {
    if (!remoteState || typeof remoteState !== "object") return false;
    if (!force && hasPendingLocalChanges()) return false;

    archiveSnapshot("before-remote-apply", state);
    state = mergeStateSafely(state, remoteState);
    ensureMeta();
    recoverTaskSchedulesFromSnapshots();
    normalizeState();
    saveLocalState();

    localRevision = 0;
    syncedRevision = 0;
    localStorage.removeItem(DIRTY_KEY);
    if (updatedAt) latestSupabaseWriteAt = updatedAt;
    resetRetry();

    if (!mainApp.classList.contains("hidden")) render();
    if (syncStatus) syncStatus.textContent = statusMessage;
    return true;
  };

  const coreSaveLocalState = saveLocalState;
  saveState = function() {
    localRevision += 1;
    localStorage.setItem(DIRTY_KEY, "1");
    archiveSnapshot("local-change", state);
    coreSaveLocalState();
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
      return false;
    }
    if (supabaseSaveInFlight) {
      supabaseSaveQueued = true;
      return false;
    }

    supabaseSaveInFlight = true;
    supabaseSaveQueued = false;
    const revision = localRevision;
    const snapshot = clone(state);
    const writeTimestamp = new Date().toISOString();
    let success = false;

    if (syncStatus) syncStatus.textContent = "Saving…";
    try {
      const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert({
        id: SUPABASE_ROW_ID,
        state: snapshot,
        updated_at: writeTimestamp
      });
      if (error) throw error;

      syncedRevision = Math.max(syncedRevision, revision);
      latestSupabaseWriteAt = writeTimestamp;
      if (localRevision <= syncedRevision) localStorage.removeItem(DIRTY_KEY);
      archiveSnapshot("saved-to-supabase", snapshot);
      success = true;
      resetRetry();
      if (syncStatus) syncStatus.textContent = localRevision > syncedRevision ? "Saving newer changes…" : "Saved to Supabase.";
      return true;
    } catch (error) {
      console.error(error);
      localStorage.setItem(DIRTY_KEY, "1");
      if (syncStatus) syncStatus.textContent = "Supabase save failed. Local copy is safe; retrying…";
      return false;
    } finally {
      supabaseSaveInFlight = false;
      if (success && (supabaseSaveQueued || localRevision > syncedRevision)) queueSupabaseSave(0);
      if (!success) scheduleRetry();
    }
  };

  loadSupabaseState = async function() {
    if (!supabaseClient) {
      if (syncStatus) syncStatus.textContent = "Saved locally. Supabase is not connected.";
      return;
    }

    const localCopy = clone(state);
    archiveSnapshot("before-supabase-load", localCopy);
    const result = await fetchSupabaseState();

    if (!result.ok) {
      state = localCopy;
      normalizeState();
      coreSaveLocalState();
      subscribeToSupabaseState();
      startPolling();
      scheduleRetry();
      return;
    }

    if (result.row?.state && typeof result.row.state === "object") {
      const merged = mergeStateSafely(localCopy, result.row.state);
      state = merged;
      ensureMeta();
      normalizeState();
      coreSaveLocalState();

      const same = JSON.stringify(merged) === JSON.stringify(result.row.state);
      if (same) {
        applyRemoteState(result.row.state, "Synced with Supabase.", {
          force: true,
          updatedAt: result.row.updated_at || ""
        });
      } else {
        localRevision = Math.max(1, localRevision);
        localStorage.setItem(DIRTY_KEY, "1");
        await saveSupabaseState();
      }
    } else {
      state = localCopy;
      normalizeState();
      coreSaveLocalState();
      localRevision = Math.max(1, localRevision);
      localStorage.setItem(DIRTY_KEY, "1");
      await saveSupabaseState();
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

    const row = result.row;
    if (!row?.state || typeof row.state !== "object") return false;
    if (!force && row.updated_at && latestSupabaseWriteAt && row.updated_at === latestSupabaseWriteAt) return false;

    return applyRemoteState(row.state, "Synced with Supabase.", {
      updatedAt: row.updated_at || ""
    });
  };

  subscribeToSupabaseState = function() {
    if (!supabaseClient || cleanRealtimeChannel) return;
    cleanRealtimeChannel = supabaseClient
      .channel(`locked-os-clean-${SUPABASE_ROW_ID}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: SUPABASE_TABLE, filter: `id=eq.${SUPABASE_ROW_ID}` },
        payload => {
          if (hasPendingLocalChanges()) return;
          const remote = payload?.new?.state;
          if (!remote || typeof remote !== "object") return;
          const updatedAt = payload?.new?.updated_at || "";
          if (updatedAt && latestSupabaseWriteAt && updatedAt === latestSupabaseWriteAt) return;
          applyRemoteState(remote, "Updated live from Supabase.", { updatedAt });
        }
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED" && syncStatus && !syncStatus.textContent.includes("Saving")) {
          syncStatus.textContent = "Live sync connected.";
        }
      });
  };

  function startPolling() {
    if (!supabaseClient || pollTimer) return;
    pollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (mainApp.classList.contains("hidden")) return;
      if (hasPendingLocalChanges()) return;
      refreshSupabaseState();
    }, POLL_MS);
  }

  window.addEventListener("focus", () => refreshSupabaseState());
  archiveSnapshot("clean-rebuild-start", state);

  /* ------------------------------ gym state ------------------------------ */

  function cleanGymSchedule(schedule) {
    const out = {};
    if (!schedule || typeof schedule !== "object") return out;
    for (const day of DAY_ORDER) {
      const workout = String(schedule[day] || "").trim();
      if (GYM_WORKOUT_SET.has(workout)) out[day] = workout;
    }
    return out;
  }

  function mapLegacyWorkout(value) {
    const name = String(value || "");
    if (GYM_WORKOUT_SET.has(name)) return name;
    if (name === "Push") return "Chest + side delts";
    if (name === "Pull") return "Back + rear delts";
    if (name === "Legs") return "Legs + Abs";
    if (name === "Arms + Abs") return "Arms";
    return "";
  }

  function migrateGymSessions() {
    ensureMeta();

    const current = Array.isArray(state.meta.gymClean?.sessions) ? state.meta.gymClean.sessions : [];
    const v2 = Array.isArray(state.meta.gymTrackerV2?.sessions) ? state.meta.gymTrackerV2.sessions : [];
    const old = Array.isArray(state.meta.gymTracker?.sessions) ? state.meta.gymTracker.sessions : [];

    const convertedOld = old
      .filter(session => validDateKey(session?.date))
      .map(session => ({
        ...session,
        workout: mapLegacyWorkout(session.workout) || "Chest + side delts",
        updatedAt: session.updatedAt || ""
      }));

    return mergeGymSessions(mergeGymSessions(current, v2), convertedOld);
  }

  function latestLegacyGymSchedule() {
    const changes = Array.isArray(state.meta?.gymScheduleChanges) ? state.meta.gymScheduleChanges : [];
    let schedule = {};
    for (const change of [...changes].sort((a, b) => String(a?.effectiveDayKey || "").localeCompare(String(b?.effectiveDayKey || "")))) {
      if (change?.effectiveDayKey <= GYM_START) {
        const normalized = cleanGymSchedule(change.schedule);
        if (Object.keys(normalized).length) schedule = normalized;
      }
    }
    return schedule;
  }

  function ensureGymClean() {
    ensureMeta();
    const legacySchedule = latestLegacyGymSchedule();

    if (!state.meta.gymClean || typeof state.meta.gymClean !== "object" || Array.isArray(state.meta.gymClean)) {
      state.meta.gymClean = {
        version: 1,
        schedule: Object.keys(legacySchedule).length ? legacySchedule : clone(DEFAULT_GYM_SCHEDULE),
        sessions: []
      };
    }

    const normalizedSchedule = cleanGymSchedule(state.meta.gymClean.schedule);
    state.meta.gymClean.schedule = Object.keys(normalizedSchedule).length
      ? normalizedSchedule
      : (Object.keys(legacySchedule).length ? legacySchedule : clone(DEFAULT_GYM_SCHEDULE));

    state.meta.gymClean.sessions = migrateGymSessions();
    state.meta.gymClean.version = 1;
  }

  function gymWorkout(dayKey) {
    ensureGymClean();
    if (dayKey < GYM_START) return "";
    const dayName = getRoutineDayName(dayKey);
    return state.meta.gymClean.schedule[dayName] || "";
  }

  function gymSession(dayKey) {
    ensureGymClean();
    return state.meta.gymClean.sessions.find(session => session?.date === dayKey) || null;
  }

  function gymSessionForWrite(dayKey) {
    ensureGymClean();
    let session = gymSession(dayKey);
    if (!session) {
      session = {
        id: `gym-clean-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date: dayKey,
        workout: gymWorkout(dayKey),
        completed: false,
        exercises: [],
        updatedAt: new Date().toISOString()
      };
      state.meta.gymClean.sessions.push(session);
    }
    return session;
  }

  function previousExercise(name, beforeDate) {
    ensureGymClean();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => session?.date < beforeDate)
      .sort((a, b) => b.date.localeCompare(a.date));

    for (const session of sessions) {
      const exercise = Array.isArray(session.exercises)
        ? session.exercises.find(item => item?.name === name)
        : null;
      if (exercise) return exercise;
    }
    return null;
  }

  /* ------------------------- final routine authority ------------------------- */

  getTretinoinDays = function(dayKey = getTodayKey()) {
    const frequency = Number(getTretinoinFrequency(dayKey)) || 1;
    return TRETINOIN_SCHEDULE_CLEAN[frequency] || TRETINOIN_SCHEDULE_CLEAN[1];
  };

  function installRoutineAuthority() {
    recoverTaskSchedulesFromSnapshots();
    ensureGymClean();

    const priorRoutine = getLooksRoutine;
    getLooksRoutine = function(dayKey = getTodayKey()) {
      const routine = priorRoutine(dayKey);
      const dayName = getRoutineDayName(dayKey);

      for (const section of ["morning", "midday", "night"]) {
        if (!Array.isArray(routine[section])) routine[section] = [];
        routine[section] = routine[section].filter(task => {
          if (!task?.custom) return true;
          return scheduleForTask(task).includes(dayName);
        });
      }

      /* Azelaic acid is every morning, not a night rotation. */
      routine.morning = routine.morning.filter(task => task?.id !== "azelaic-acid");
      routine.night = routine.night.filter(task => task?.id !== "azelaic-acid");
      if (!routine.morning.some(task => task?.id === "azelaic-acid")) {
        const vitaminIndex = routine.morning.findIndex(task => task?.id === "vitamin-c");
        const insertAt = vitaminIndex >= 0 ? vitaminIndex + 1 : routine.morning.length;
        routine.morning.splice(insertAt, 0, { id: "azelaic-acid", title: "Apply azelaic acid" });
      }

      /* Keep the voice task in the shower block. */
      routine.morning = routine.morning.filter(task => task?.id !== "voice-training");
      const conditionerIndex = routine.morning.findIndex(task => task?.id === "conditioner-soap");
      routine.morning.splice(
        conditionerIndex >= 0 ? conditionerIndex + 1 : 1,
        0,
        { id: "voice-training", title: "Train voice in shower" }
      );

      /* One and only one gym source of truth. */
      routine.midday = routine.midday.filter(task => task?.id !== "gym");
      const workout = gymWorkout(dayKey);
      if (workout) routine.midday.unshift({ id: "gym", title: `Gym: ${workout}` });

      return routine;
    };

    getWorkoutName = function(dayKey = getTodayKey()) {
      return gymWorkout(dayKey) || "Rest day";
    };

    getWeeklyGymStatus = function(dayKey, day) {
      const workout = gymWorkout(dayKey);
      if (!workout) return "Rest day";
      const session = gymSession(dayKey);
      if (session?.completed) return "Done";
      const done = new Set(day?.looksDone || []);
      if (done.has("gym")) return "Done";
      if (dayKey === getTodayKey()) return "Not yet";
      return "Didn't go";
    };

    getRotationTasksForDay = function(dayKey) {
      const dayName = getRoutineDayName(dayKey);
      const items = [];
      const workout = gymWorkout(dayKey);

      if (workout) items.push({ label: `Gym: ${workout}`, type: "gym" });

      const jsDay = keyToLocalDate(dayKey).getDay();
      if (jsDay >= 1 && jsDay <= 5) items.push({ label: "MK-677", type: "mk677" });

      if (getTretinoinDays(dayKey).includes(dayName)) {
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

      const customTasks = Array.isArray(state.meta?.looksCustomTasks) ? state.meta.looksCustomTasks : [];
      const existing = new Set(items.map(item => item.label.toLowerCase()));

      for (const task of customTasks) {
        const days = scheduleForTask(task);
        if (days.length >= 7 || !days.includes(dayName)) continue;
        const label = String(task?.title || "").trim();
        if (!label || existing.has(label.toLowerCase())) continue;
        items.push({ label, type: "custom" });
        existing.add(label.toLowerCase());
      }

      return items;
    };
  }

  function wrapAddTaskScheduling() {
    const baseAdd = addLooksTask;
    addLooksTask = function(section, title, afterTaskId = null, days = DAY_ORDER) {
      const before = new Set((state.meta?.looksCustomTasks || []).map(task => task.id));
      const result = baseAdd(section, title, afterTaskId, days);

      ensureMeta();
      const created = [...(state.meta.looksCustomTasks || [])]
        .reverse()
        .find(task => !before.has(task.id));

      if (created) {
        const chosen = validDays(days);
        created.days = chosen.length ? chosen : [...DAY_ORDER];
        state.meta[CUSTOM_SCHEDULE_META][created.id] = created.days;
        saveState();
      }

      try { render(); } catch (_) {}
      try { renderRotationCalendar(); } catch (_) {}
      return result;
    };
  }

  /* ------------------------------ clean gym UI ------------------------------ */

  function nextScheduledWorkout(fromKey, direction) {
    let cursor = keyToLocalDate(fromKey);
    for (let i = 0; i < 45; i += 1) {
      cursor = addDays(cursor, direction);
      const key = formatDateKey(cursor);
      if (key < GYM_START) return null;
      if (gymWorkout(key)) return key;
    }
    return null;
  }

  function weekStartMonday(dayKey) {
    const date = keyToLocalDate(dayKey);
    const offset = (date.getDay() + 6) % 7;
    return addDays(date, -offset);
  }

  function cleanGymWeekKeys(dayKey) {
    const monday = weekStartMonday(dayKey);
    return Array.from({ length: 7 }, (_, index) => formatDateKey(addDays(monday, index)));
  }

  function setGymSelectedDate(dayKey) {
    if (!validDateKey(dayKey)) return;
    cleanGymSelectedDate = dayKey;
    renderCleanGym();
  }

  function workoutSetText(set) {
    return set && Number(set.weight) > 0 && Number(set.reps) > 0
      ? `${Number(set.weight)} lb × ${Number(set.reps)}`
      : "—";
  }

  function renderCleanGymWeek() {
    const grid = document.getElementById("cleanGymWeekGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const today = getTodayKey();
    for (const dayKey of cleanGymWeekKeys(cleanGymSelectedDate || today)) {
      const workout = gymWorkout(dayKey);
      if (!workout) continue;
      const date = keyToLocalDate(dayKey);
      const session = gymSession(dayKey);

      const button = document.createElement("button");
      button.type = "button";
      button.className = `clean-gym-day${dayKey === today ? " today" : ""}${dayKey === cleanGymSelectedDate ? " selected" : ""}`;
      button.innerHTML = `
        <strong>${DAY_ORDER[date.getDay()].slice(0, 3)} · ${date.getMonth() + 1}/${date.getDate()}</strong>
        <span>${escapeHtml(workout)}${session?.completed ? " ✓" : ""}</span>`;
      button.addEventListener("click", () => setGymSelectedDate(dayKey));
      grid.appendChild(button);
    }
  }

  function renderCleanGymWorkout() {
    const body = document.getElementById("cleanGymWorkoutBody");
    const title = document.getElementById("cleanGymWorkoutTitle");
    const dateLabel = document.getElementById("cleanGymDateLabel");
    const actions = document.getElementById("cleanGymActions");
    const status = document.getElementById("cleanGymSaveStatus");
    if (!body || !title || !dateLabel || !actions) return;

    const dayKey = cleanGymSelectedDate || getTodayKey();
    const date = keyToLocalDate(dayKey);
    const workout = gymWorkout(dayKey);
    const session = gymSession(dayKey);

    dateLabel.textContent = `${DAY_ORDER[date.getDay()]}, ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
    if (status) status.textContent = "";

    if (!workout) {
      title.textContent = "Rest day";
      const next = nextScheduledWorkout(dayKey, 1);
      body.innerHTML = `<div class="clean-gym-rest"><strong>Rest day</strong><span>${next ? `Next workout: ${escapeHtml(gymWorkout(next))} · ${escapeHtml(next)}` : "No upcoming workout found."}</span></div>`;
      actions.hidden = true;
      return;
    }

    actions.hidden = false;
    title.textContent = workout;
    const list = document.createElement("div");
    list.className = "clean-gym-exercises";

    for (const name of EXERCISES[workout] || []) {
      const current = session?.exercises?.find(item => item?.name === name) || { sets: [] };
      const previous = previousExercise(name, dayKey);
      const row = document.createElement("div");
      row.className = "clean-gym-exercise";
      row.dataset.exercise = name;

      const inputs = [0, 1].map(index => {
        const set = current.sets?.[index] || {};
        return `
          <div class="clean-gym-set">
            <label><span>Set ${index + 1} lb</span><input data-set="${index}" data-field="weight" type="number" min="0" max="2000" step="0.5" value="${Number(set.weight) || ""}" placeholder="Weight"></label>
            <label><span>Reps</span><input data-set="${index}" data-field="reps" type="number" min="0" max="100" step="1" value="${Number(set.reps) || ""}" placeholder="Reps"></label>
          </div>`;
      }).join("");

      row.innerHTML = `
        <div class="clean-gym-exercise-name"><strong>${escapeHtml(name)}</strong><span>2 working sets</span></div>
        <div class="clean-gym-previous"><span>Previous</span><strong>${escapeHtml(workoutSetText(previous?.sets?.[0]))}<br>${escapeHtml(workoutSetText(previous?.sets?.[1]))}</strong></div>
        ${inputs}`;
      list.appendChild(row);
    }

    body.innerHTML = "";
    body.appendChild(list);
  }

  function renderCleanGymHistory() {
    const list = document.getElementById("cleanGymHistory");
    if (!list) return;
    ensureGymClean();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => validDateKey(session?.date))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);

    if (!sessions.length) {
      list.innerHTML = '<div class="clean-gym-empty">No saved workouts yet.</div>';
      return;
    }

    list.innerHTML = sessions.map(session => `
      <button type="button" class="clean-gym-history-row" data-date="${escapeHtml(session.date)}">
        <span>${escapeHtml(session.date)}</span>
        <strong>${escapeHtml(session.workout || gymWorkout(session.date) || "Workout")}${session.completed ? " ✓" : ""}</strong>
      </button>`).join("");

    list.querySelectorAll("[data-date]").forEach(button => {
      button.addEventListener("click", () => setGymSelectedDate(button.dataset.date));
    });
  }

  function renderCleanGym() {
    if (!document.getElementById("gymPage")) return;
    if (!validDateKey(cleanGymSelectedDate)) cleanGymSelectedDate = getTodayKey();

    const badge = document.getElementById("cleanGymTodayBadge");
    if (badge) badge.textContent = gymWorkout(getTodayKey()) || "Rest day";

    renderCleanGymWeek();
    renderCleanGymWorkout();
    renderCleanGymHistory();
  }

  function collectGymInputs() {
    const exercises = [];
    let invalid = false;
    document.querySelectorAll("#cleanGymWorkoutBody .clean-gym-exercise").forEach(row => {
      const sets = [0, 1].map(index => {
        const weight = Number(row.querySelector(`[data-set="${index}"][data-field="weight"]`)?.value || 0);
        const reps = Number(row.querySelector(`[data-set="${index}"][data-field="reps"]`)?.value || 0);
        if ((weight > 0) !== (reps > 0)) invalid = true;
        return {
          weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
          reps: Number.isFinite(reps) ? Math.max(0, Math.round(reps)) : 0
        };
      });
      exercises.push({ name: row.dataset.exercise || "", sets });
    });
    return { exercises, invalid };
  }

  function saveCleanGym(markComplete) {
    const workout = gymWorkout(cleanGymSelectedDate);
    const status = document.getElementById("cleanGymSaveStatus");
    if (!workout) return;

    const collected = collectGymInputs();
    if (collected.invalid) {
      if (status) status.textContent = "Each entered set needs both weight and reps.";
      return;
    }

    if (markComplete) {
      const missing = collected.exercises.some(exercise =>
        exercise.sets.some(set => !(set.weight > 0 && set.reps > 0))
      );
      if (missing) {
        if (status) status.textContent = "Fill both sets for every exercise before marking complete.";
        return;
      }
    }

    const session = gymSessionForWrite(cleanGymSelectedDate);
    session.workout = workout;
    session.exercises = collected.exercises;
    if (markComplete) session.completed = true;
    session.updatedAt = new Date().toISOString();

    saveState();
    if (status) status.textContent = markComplete ? "Workout saved and completed." : "Workout saved.";
    toast(markComplete ? "Workout completed." : "Workout saved.");
    renderCleanGymWeek();
    renderCleanGymHistory();
    try { renderWeeklyReview(); } catch (_) {}
  }

  function saveGymScheduleFromModal(modal) {
    const schedule = {};
    for (const row of modal.querySelectorAll(".clean-gym-schedule-row.active")) {
      const workout = String(row.querySelector("select")?.value || "");
      if (GYM_WORKOUT_SET.has(workout)) schedule[row.dataset.day] = workout;
    }
    if (!Object.keys(schedule).length) return;

    ensureGymClean();
    state.meta.gymClean.schedule = schedule;
    saveState();
    modal.closest(".clean-modal-backdrop")?.remove();

    renderCleanGym();
    try { render(); } catch (_) {}
    try { renderRotationCalendar(); } catch (_) {}
    toast("Gym schedule saved.");
  }

  function openGymScheduleModal() {
    document.querySelector(".clean-modal-backdrop")?.remove();
    ensureGymClean();

    const backdrop = document.createElement("div");
    backdrop.className = "clean-modal-backdrop";
    backdrop.innerHTML = `
      <section class="clean-modal" role="dialog" aria-modal="true">
        <div class="clean-modal-head">
          <div><p class="eyebrow blue">Gym</p><h3>Gym schedule</h3></div>
          <button type="button" class="clean-modal-close">×</button>
        </div>
        <div class="clean-gym-schedule-list">
          ${GYM_EDITOR_ORDER.map(day => {
            const active = Boolean(state.meta.gymClean.schedule[day]);
            const selected = state.meta.gymClean.schedule[day] || GYM_WORKOUTS[0];
            return `
              <div class="clean-gym-schedule-row ${active ? "active" : ""}" data-day="${day}">
                <button type="button" class="clean-gym-toggle" aria-pressed="${active ? "true" : "false"}">
                  <strong>${day.slice(0, 3)}</strong><span>${active ? "On" : "Off"}</span>
                </button>
                <select ${active ? "" : "disabled"}>
                  ${GYM_WORKOUTS.map(workout => `<option value="${escapeHtml(workout)}"${workout === selected ? " selected" : ""}>${escapeHtml(workout)}</option>`).join("")}
                </select>
              </div>`;
          }).join("")}
        </div>
        <div class="clean-modal-actions">
          <button type="button" class="btn secondary clean-modal-cancel">Cancel</button>
          <button type="button" class="btn blue clean-modal-save">Save</button>
        </div>
      </section>`;

    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) backdrop.remove();
    });
    backdrop.querySelector(".clean-modal-close")?.addEventListener("click", () => backdrop.remove());
    backdrop.querySelector(".clean-modal-cancel")?.addEventListener("click", () => backdrop.remove());
    backdrop.querySelector(".clean-modal-save")?.addEventListener("click", () => saveGymScheduleFromModal(backdrop.querySelector(".clean-modal")));

    backdrop.querySelectorAll(".clean-gym-toggle").forEach(button => {
      button.addEventListener("click", () => {
        const row = button.closest(".clean-gym-schedule-row");
        const active = !row.classList.contains("active");
        row.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.querySelector("span").textContent = active ? "On" : "Off";
        row.querySelector("select").disabled = !active;
      });
    });
  }

  function replaceGymPageCompletely() {
    const oldButton = document.querySelector('.tab[data-tab="gymPage"]');
    const page = document.getElementById("gymPage");
    if (!oldButton || !page) return;

    /* Clone strips every old Gym listener from the stable base. */
    const button = oldButton.cloneNode(true);
    oldButton.replaceWith(button);

    page.innerHTML = `
      <div class="clean-gym-page">
        <section class="card clean-gym-hero">
          <div><p class="eyebrow blue">Training</p><h2>Gym</h2><p>Simple workout logging with one weekly schedule.</p></div>
          <div class="clean-gym-today" id="cleanGymTodayBadge">Loading…</div>
        </section>

        <section class="card clean-gym-week-card">
          <div class="panel-title">
            <div><p class="eyebrow blue">Schedule</p><h3>Your week</h3></div>
            <button class="clean-gym-settings" id="cleanGymSettings" type="button" aria-label="Edit gym schedule" title="Edit gym schedule">⚙</button>
          </div>
          <div class="clean-gym-week" id="cleanGymWeekGrid"></div>
        </section>

        <section class="card clean-gym-log-card">
          <div class="clean-gym-log-head">
            <div>
              <p class="eyebrow blue">Workout</p>
              <h3 id="cleanGymWorkoutTitle">Loading…</h3>
              <p id="cleanGymDateLabel"></p>
            </div>
            <div class="clean-gym-nav">
              <button id="cleanGymPrev" type="button">← Previous workout</button>
              <button id="cleanGymToday" type="button">Today</button>
              <button id="cleanGymNext" type="button">Next workout →</button>
            </div>
          </div>
          <div id="cleanGymWorkoutBody"></div>
          <div class="clean-gym-actions" id="cleanGymActions">
            <p id="cleanGymSaveStatus"></p>
            <div>
              <button class="btn secondary" id="cleanGymSave" type="button">Save workout</button>
              <button class="btn blue" id="cleanGymComplete" type="button">Save + complete</button>
            </div>
          </div>
        </section>

        <section class="card clean-gym-history-card">
          <div class="panel-title"><div><p class="eyebrow blue">History</p><h3>Recent workouts</h3></div></div>
          <div class="clean-gym-history" id="cleanGymHistory"></div>
        </section>
      </div>`;

    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
      document.querySelectorAll(".page").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      page.classList.add("active");
      cleanGymSelectedDate = getTodayKey();
      renderCleanGym();
    });

    document.querySelectorAll(".tab").forEach(tab => {
      if (tab === button) return;
      tab.addEventListener("click", () => {
        button.classList.remove("active");
        page.classList.remove("active");
      });
    });

    document.getElementById("cleanGymSettings")?.addEventListener("click", openGymScheduleModal);
    document.getElementById("cleanGymToday")?.addEventListener("click", () => setGymSelectedDate(getTodayKey()));
    document.getElementById("cleanGymPrev")?.addEventListener("click", () => {
      const target = nextScheduledWorkout(cleanGymSelectedDate || getTodayKey(), -1);
      if (target) setGymSelectedDate(target);
      else toast("No earlier workout in this schedule.");
    });
    document.getElementById("cleanGymNext")?.addEventListener("click", () => {
      const target = nextScheduledWorkout(cleanGymSelectedDate || getTodayKey(), 1);
      if (target) setGymSelectedDate(target);
    });
    document.getElementById("cleanGymSave")?.addEventListener("click", () => saveCleanGym(false));
    document.getElementById("cleanGymComplete")?.addEventListener("click", () => saveCleanGym(true));

    cleanGymSelectedDate = getTodayKey();
    renderCleanGym();
  }

  /* -------------------------- backup/admin cleanup -------------------------- */

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `locked-os-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function updateBackupStatus() {
    const status = document.getElementById("cleanBackupStatus");
    if (!status) return;

    let localCount = 0;
    try {
      const entries = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "[]");
      localCount = Array.isArray(entries) ? entries.length : 0;
    } catch (_) {}

    if (!supabaseClient) {
      status.textContent = `${localCount} local recovery snapshots`;
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
      status.textContent = latest?.backed_up_at
        ? `${localCount} local snapshots · cloud history active`
        : `${localCount} local snapshots · cloud backup table ready`;
    } catch (_) {
      status.textContent = `${localCount} local snapshots`;
    }
  }

  function installBackupCardAndOrder() {
    const grid = document.querySelector("#adminRoutinePanel .admin-grid");
    const rotation = grid?.querySelector(".rotation-admin-card");
    if (!grid || !rotation) return;

    document.getElementById("gymScheduleAdminCard")?.remove();

    let backup = document.getElementById("cleanBackupCard");
    if (!backup) {
      backup = document.createElement("section");
      backup.className = "card admin-card clean-backup-card";
      backup.id = "cleanBackupCard";
      backup.innerHTML = `
        <p class="eyebrow blue">Data protection</p>
        <h2>Automatic backups</h2>
        <p id="cleanBackupStatus">Checking backup status…</p>
        <div class="clean-backup-actions">
          <button class="btn blue" id="cleanDownloadBackup" type="button">Download full backup</button>
          <button class="btn secondary" id="cleanRecoveryHistory" type="button">Recovery history</button>
        </div>`;
      grid.appendChild(backup);
      backup.querySelector("#cleanDownloadBackup")?.addEventListener("click", downloadBackup);
      backup.querySelector("#cleanRecoveryHistory")?.addEventListener("click", () => {
        window.location.href = "recover-data.html";
      });
    }

    /* Rotation comes before Data Protection. */
    if (rotation.nextSibling !== backup) grid.insertBefore(rotation, backup);
    updateBackupStatus();
  }

  function installStyles() {
    if (document.getElementById("cleanRebuildStyles")) return;
    const style = document.createElement("style");
    style.id = "cleanRebuildStyles";
    style.textContent = `
      .rotation-chip{color:var(--text)!important;border:1px solid rgba(42,30,18,.06)!important}
      .rotation-chip.gym{background:#dceef6!important}
      .rotation-chip.mk677{background:#e7edf9!important}
      .rotation-chip.tretinoin{background:#eadff4!important}
      .rotation-chip.microneedle{background:#e1f0ea!important}
      .rotation-chip.sheets{background:#e6eef0!important}
      .rotation-chip.shave{background:#f1e7e1!important}
      .rotation-chip.lips{background:#f3e3ea!important}
      .rotation-chip.custom{background:#e8e6f2!important}

      .clean-gym-page{display:grid;gap:16px}
      .clean-gym-hero{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:24px}
      .clean-gym-hero h2{margin:0;font-size:clamp(2rem,5vw,3rem)}
      .clean-gym-hero p:not(.eyebrow){margin:7px 0 0;color:var(--muted);font-weight:750}
      .clean-gym-today{padding:10px 14px;border-radius:999px;background:var(--blue-soft);font-weight:900}
      .clean-gym-week-card,.clean-gym-log-card,.clean-gym-history-card{padding:20px}
      .clean-gym-settings{width:34px;height:34px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.55);cursor:pointer;color:var(--text);font-size:1rem}
      .clean-gym-week{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}
      .clean-gym-day{border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.45);padding:12px;text-align:left;color:var(--text);cursor:pointer}
      .clean-gym-day strong,.clean-gym-day span{display:block}.clean-gym-day span{margin-top:4px;color:var(--muted);font-size:.78rem;font-weight:800}
      .clean-gym-day.today{border-color:rgba(37,132,184,.38)}.clean-gym-day.selected{background:var(--blue-soft)}
      .clean-gym-log-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.clean-gym-log-head h3{margin:0;font-size:1.65rem}.clean-gym-log-head p{color:var(--muted);font-weight:800}
      .clean-gym-nav{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.clean-gym-nav button{border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.56);padding:9px 11px;color:var(--text);font:inherit;font-size:.76rem;font-weight:900;cursor:pointer}
      .clean-gym-exercises{display:grid;gap:10px;margin-top:17px}.clean-gym-exercise{display:grid;grid-template-columns:minmax(170px,1.15fr) minmax(120px,.7fr) repeat(2,minmax(170px,1fr));gap:10px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.4)}
      .clean-gym-exercise-name strong,.clean-gym-exercise-name span,.clean-gym-previous span,.clean-gym-previous strong{display:block}.clean-gym-exercise-name span,.clean-gym-previous span{color:var(--muted);font-size:.72rem;font-weight:850;margin-top:3px}.clean-gym-previous strong{font-size:.78rem;line-height:1.55}
      .clean-gym-set{display:grid;grid-template-columns:1fr 1fr;gap:7px}.clean-gym-set label{display:grid;gap:4px}.clean-gym-set span{font-size:.68rem;color:var(--muted);font-weight:900}.clean-gym-set input{min-width:0;width:100%;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.72);padding:9px;color:var(--text);font:inherit;font-weight:800}
      .clean-gym-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:16px}.clean-gym-actions>div{display:flex;gap:8px}.clean-gym-actions p{min-height:18px;color:var(--muted);font-weight:800}
      .clean-gym-rest,.clean-gym-empty{padding:22px;border:1px dashed var(--line);border-radius:16px;color:var(--muted);display:grid;gap:5px;margin-top:14px}.clean-gym-rest strong{color:var(--text)}
      .clean-gym-history{display:grid;gap:8px;margin-top:12px}.clean-gym-history-row{display:flex;justify-content:space-between;gap:14px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.42);padding:11px 13px;color:var(--text);cursor:pointer}.clean-gym-history-row span{color:var(--muted);font-weight:800}
      .clean-modal-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(20,16,12,.44);display:grid;place-items:center;padding:18px;backdrop-filter:blur(8px)}
      .clean-modal{width:min(610px,100%);max-height:92vh;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:23px;padding:20px;box-shadow:0 24px 80px rgba(20,14,8,.25)}
      .clean-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;margin-bottom:15px}.clean-modal-head h3{margin:0;font-size:1.8rem}.clean-modal-close{width:36px;height:36px;border:0;border-radius:999px;background:rgba(42,30,18,.07);font-size:1.4rem;color:var(--text);cursor:pointer}
      .clean-gym-schedule-list{display:grid;gap:8px}.clean-gym-schedule-row{display:grid;grid-template-columns:88px 1fr;gap:8px}.clean-gym-toggle{border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.45);color:var(--text);display:flex;justify-content:space-between;align-items:center;padding:0 11px;cursor:pointer}.clean-gym-toggle span{font-size:.68rem;color:var(--muted);font-weight:900}.clean-gym-schedule-row.active .clean-gym-toggle{background:var(--blue-soft);border-color:rgba(37,132,184,.35)}.clean-gym-schedule-row select{min-height:46px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.7);padding:0 11px;color:var(--text);font:inherit;font-weight:800}.clean-gym-schedule-row select:disabled{opacity:.42}
      .clean-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:17px}
      .clean-backup-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
      @media(max-width:900px){.clean-gym-exercise{grid-template-columns:1fr 1fr}.clean-gym-week{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:600px){.clean-gym-hero,.clean-gym-log-head,.clean-gym-actions{display:grid}.clean-gym-nav{justify-content:start}.clean-gym-exercise{grid-template-columns:1fr}.clean-gym-week{grid-template-columns:1fr 1fr}.clean-gym-actions>div{display:grid;grid-template-columns:1fr 1fr}.clean-gym-schedule-row{grid-template-columns:78px 1fr}}
    `;
    document.head.appendChild(style);
  }

  function finalInstall() {
    if (typeof state === "undefined" || typeof render !== "function") return;

    ensureMeta();
    recoverTaskSchedulesFromSnapshots();
    ensureGymClean();
    coreSaveLocalState();

    installStyles();
    installRoutineAuthority();
    wrapAddTaskScheduling();
    replaceGymPageCompletely();
    installBackupCardAndOrder();

    try { render(); } catch (error) { console.error("LOCKED OS clean render:", error); }
    try { renderRotationCalendar(); } catch (_) {}

    document.querySelectorAll('[data-tab="adminPage"],[data-admin-panel="adminRoutinePanel"]').forEach(button => {
      button.addEventListener("click", () => setTimeout(() => {
        installBackupCardAndOrder();
        try { renderRotationCalendar(); } catch (_) {}
      }, 0));
    });
  }

  /*
    Wait until DOMContentLoaded + one task, so the current inline script has
    finished installing its own task-day UI. This clean layer then becomes the
    final authority instead of competing with it.
  */
  window.addEventListener("DOMContentLoaded", () => setTimeout(finalInstall, 25));
})();

/* ===== FLATTENED: gym sequence / recovery ===== */
(() => {
  "use strict";

  const FLAG = "__lockedOsGymSequenceRecovery20260911";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const ANCHOR_DATE = "2026-09-11";
  const VAULT_KEY = "locked_os_gym_sessions_vault_v2";
  const ROTATION_FLAG = "gymChestRotationAnchored20260911";
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const ROTATION = [
    "Chest + side delts",
    "Back + rear delts",
    "Arms",
    "Legs + Abs"
  ];
  const DESIRED_SCHEDULE = {
    Friday: "Chest + side delts",
    Saturday: "Back + rear delts",
    Monday: "Arms",
    Wednesday: "Legs + Abs"
  };

  const CHEST_EXERCISES = new Set([
    "Incline Dumbbell Bench Press",
    "Machine Chest Press",
    "Cable Fly / Pec Deck",
    "Cable Lateral Raise",
    "Machine Lateral Raise"
  ]);

  let sequenceRefreshTimer = null;

  const clone = value => JSON.parse(JSON.stringify(value));
  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeWorkoutName(value) {
    const name = String(value || "").trim();
    if (ROTATION.includes(name)) return name;
    if (name === "Push") return "Chest + side delts";
    if (name === "Pull") return "Back + rear delts";
    if (name === "Legs") return "Legs + Abs";
    if (name === "Arms + Abs") return "Arms";
    return name;
  }

  function setCompleteness(set) {
    let score = 0;
    if (Number(set?.weight) > 0) score += 2;
    if (Number(set?.reps) > 0) score += 2;
    return score;
  }

  function exerciseCompleteness(exercise) {
    return safeArray(exercise?.sets).reduce((sum, set) => sum + setCompleteness(set), 0);
  }

  function sessionCompleteness(session) {
    let score = session?.completed ? 1000 : 0;
    score += safeArray(session?.exercises).reduce(
      (sum, exercise) => sum + exerciseCompleteness(exercise),
      0
    );
    return score;
  }

  function mergeSets(a, b) {
    const out = [];
    for (let index = 0; index < Math.max(safeArray(a).length, safeArray(b).length, 2); index += 1) {
      const left = safeArray(a)[index] || {};
      const right = safeArray(b)[index] || {};
      const chosen = setCompleteness(right) > setCompleteness(left) ? right : left;
      out.push({
        weight: Number(chosen?.weight) > 0 ? Number(chosen.weight) : 0,
        reps: Number(chosen?.reps) > 0 ? Math.round(Number(chosen.reps)) : 0
      });
    }
    return out.slice(0, 2);
  }

  function mergeExercises(a, b) {
    const map = new Map();

    const ingest = list => {
      for (const exercise of safeArray(list)) {
        const name = String(exercise?.name || "").trim();
        if (!name) continue;
        const current = map.get(name);
        if (!current) {
          map.set(name, { name, sets: mergeSets([], exercise.sets) });
        } else {
          current.sets = mergeSets(current.sets, exercise.sets);
        }
      }
    };

    ingest(a);
    ingest(b);
    return [...map.values()];
  }

  function mergeTwoSessions(a, b) {
    if (!a) return b ? clone(b) : null;
    if (!b) return clone(a);

    const richer = sessionCompleteness(b) > sessionCompleteness(a) ? b : a;
    const latestUpdatedAt = [String(a.updatedAt || ""), String(b.updatedAt || "")]
      .filter(Boolean)
      .sort()
      .at(-1) || "";

    return {
      ...clone(richer),
      id: richer.id || a.id || b.id || `gym-recovered-${richer.date}`,
      date: richer.date || a.date || b.date,
      workout: normalizeWorkoutName(richer.workout || a.workout || b.workout),
      completed: Boolean(a.completed || b.completed),
      exercises: mergeExercises(a.exercises, b.exercises),
      updatedAt: latestUpdatedAt
    };
  }

  function normalizeSession(raw, fallbackDate = "") {
    if (!raw || typeof raw !== "object") return null;

    const date = validDateKey(raw.date)
      ? raw.date
      : (validDateKey(raw.dayKey) ? raw.dayKey : fallbackDate);

    if (!validDateKey(date)) return null;

    return {
      id: String(raw.id || `gym-recovered-${date}`),
      date,
      workout: normalizeWorkoutName(raw.workout || raw.workoutName || ""),
      completed: Boolean(raw.completed || raw.done),
      exercises: safeArray(raw.exercises).map(exercise => ({
        name: String(exercise?.name || "").trim(),
        sets: mergeSets([], exercise?.sets)
      })).filter(exercise => exercise.name),
      updatedAt: String(raw.updatedAt || raw.updated_at || raw.savedAt || "")
    };
  }

  function mergeSessionCollection(...lists) {
    const byDate = new Map();

    for (const list of lists) {
      for (const raw of safeArray(list)) {
        const session = normalizeSession(raw);
        if (!session) continue;
        byDate.set(session.date, mergeTwoSessions(byDate.get(session.date), session));
      }
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function extractSessions(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return [];

    const meta = snapshot.meta && typeof snapshot.meta === "object" ? snapshot.meta : {};
    const sessions = [];

    sessions.push(...safeArray(meta.gymClean?.sessions));
    sessions.push(...safeArray(meta.gymTrackerV2?.sessions));
    sessions.push(...safeArray(meta.gymTracker?.sessions));

    /*
      Some very old copies may have date-keyed gym objects.
    */
    for (const source of [meta.gymSessions, snapshot.gymSessions]) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      for (const [date, value] of Object.entries(source)) {
        const session = normalizeSession(value, date);
        if (session) sessions.push(session);
      }
    }

    return sessions;
  }

  function inspectPossibleSnapshot(value, sessions, depth = 0) {
    if (depth > 3 || value == null) return;

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        inspectPossibleSnapshot(parsed, sessions, depth + 1);
      } catch (_) {}
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) inspectPossibleSnapshot(item, sessions, depth + 1);
      return;
    }

    if (typeof value !== "object") return;

    sessions.push(...extractSessions(value));

    if (value.state) inspectPossibleSnapshot(value.state, sessions, depth + 1);
    if (value.serialized) inspectPossibleSnapshot(value.serialized, sessions, depth + 1);
    if (value.snapshot) inspectPossibleSnapshot(value.snapshot, sessions, depth + 1);
  }

  function readVaultSessions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(VAULT_KEY) || "[]");
      return safeArray(parsed);
    } catch (_) {
      return [];
    }
  }

  function writeVaultSessions(sessions) {
    try {
      localStorage.setItem(VAULT_KEY, JSON.stringify(mergeSessionCollection(sessions)));
    } catch (error) {
      console.warn("LOCKED OS: gym vault write failed.", error);
    }
  }

  function localRecoverySessions() {
    const sessions = [];

    /*
      Current live state first.
    */
    sessions.push(...extractSessions(state));

    /*
      Dedicated gym vault.
    */
    sessions.push(...readVaultSessions());

    /*
      Scan every LOCKED OS localStorage entry. This catches:
      - v4-v17 app saves
      - clean recovery snapshots
      - older recovery-snapshot formats
      - gym-safe backups from the previous patch
    */
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.toLowerCase().includes("locked_os")) continue;

        let raw = "";
        try { raw = localStorage.getItem(key) || ""; } catch (_) {}
        if (!raw) continue;

        inspectPossibleSnapshot(raw, sessions);
      }
    } catch (error) {
      console.warn("LOCKED OS: local workout recovery scan failed.", error);
    }

    return mergeSessionCollection(sessions);
  }

  function ensureGymCleanState() {
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean = state.meta.gymClean && typeof state.meta.gymClean === "object"
      ? state.meta.gymClean
      : {};

    if (!state.meta.gymClean.schedule || typeof state.meta.gymClean.schedule !== "object") {
      state.meta.gymClean.schedule = clone(DESIRED_SCHEDULE);
    }
    state.meta.gymClean.sessions = safeArray(state.meta.gymClean.sessions);
  }

  function markCompletionFromLooks(sessions) {
    const byDate = new Map(sessions.map(session => [session.date, session]));

    for (const [date, day] of Object.entries(state.days || {})) {
      if (!validDateKey(date) || !day || typeof day !== "object") continue;
      const completedInLooks = safeArray(day.looksDone).includes("gym");
      if (!completedInLooks) continue;

      let session = byDate.get(date);
      if (!session) {
        session = {
          id: `gym-completion-recovered-${date}`,
          date,
          workout: date === ANCHOR_DATE ? "Chest + side delts" : "",
          completed: true,
          exercises: [],
          updatedAt: ""
        };
        byDate.set(date, session);
      } else {
        session.completed = true;
      }
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function forceAnchorSchedule() {
    ensureGymCleanState();

    if (state.meta[ROTATION_FLAG] === true) return false;

    const current = state.meta.gymClean.schedule || {};
    const legacyDefault = {
      Monday: "Chest + side delts",
      Wednesday: "Back + rear delts",
      Friday: "Arms",
      Saturday: "Legs + Abs"
    };
    const sameAsLegacyDefault =
      Object.keys(current).length === Object.keys(legacyDefault).length &&
      Object.entries(legacyDefault).every(([day, workout]) => current[day] === workout);

    let changed = false;
    if (!Object.keys(current).length || sameAsLegacyDefault) {
      state.meta.gymClean.schedule = clone(DESIRED_SCHEDULE);
      changed = true;
    }

    /* A genuinely customized schedule is preserved. */
    state.meta[ROTATION_FLAG] = true;
    return changed;
  }

  function reconcileRecoveredSessions(extraSessions = []) {
    ensureGymCleanState();

    const before = JSON.stringify(state.meta.gymClean.sessions || []);
    const combined = mergeSessionCollection(
      state.meta.gymClean.sessions,
      localRecoverySessions(),
      extraSessions
    );
    state.meta.gymClean.sessions = markCompletionFromLooks(combined);

    /*
      If the recovered Sept 11 workout clearly contains chest exercises, label
      it Chest + side delts so the current workout form can populate the sets.
    */
    const todaySession = state.meta.gymClean.sessions.find(session => session.date === ANCHOR_DATE);
    if (todaySession) {
      const chestMatches = safeArray(todaySession.exercises)
        .filter(exercise => CHEST_EXERCISES.has(exercise.name))
        .length;

      if (chestMatches >= 2 || !todaySession.workout) {
        todaySession.workout = "Chest + side delts";
      }
    }

    writeVaultSessions(state.meta.gymClean.sessions);
    return before !== JSON.stringify(state.meta.gymClean.sessions);
  }

  /*
    Keep the vault updated before every future app save.
  */
  if (typeof saveState === "function" && !saveState.__gymVaultV2) {
    const baseSaveState = saveState;
    const wrappedSaveState = function(...args) {
      ensureGymCleanState();
      writeVaultSessions(state.meta.gymClean.sessions);
      return baseSaveState(...args);
    };
    wrappedSaveState.__gymVaultV2 = true;
    saveState = wrappedSaveState;
  }

  /*
    Never let a remote state discard a richer local/vault workout log.
  */
  if (typeof applyRemoteState === "function" && !applyRemoteState.__gymVaultV2) {
    const baseApplyRemoteState = applyRemoteState;
    const wrappedApplyRemoteState = function(remoteState, ...args) {
      try {
        const copy = clone(remoteState || {});
        copy.meta = copy.meta && typeof copy.meta === "object" ? copy.meta : {};
        copy.meta.gymClean = copy.meta.gymClean && typeof copy.meta.gymClean === "object"
          ? copy.meta.gymClean
          : {};

        copy.meta.gymClean.sessions = mergeSessionCollection(
          readVaultSessions(),
          state?.meta?.gymClean?.sessions,
          copy.meta.gymClean.sessions
        );

        if (!copy.meta.gymClean.schedule || typeof copy.meta.gymClean.schedule !== "object") {
          copy.meta.gymClean.schedule = clone(DESIRED_SCHEDULE);
        }

        const result = baseApplyRemoteState(copy, ...args);
        reconcileRecoveredSessions();
        return result;
      } catch (error) {
        console.error("LOCKED OS: gym-safe remote merge failed.", error);
        return baseApplyRemoteState(remoteState, ...args);
      }
    };
    wrappedApplyRemoteState.__gymVaultV2 = true;
    applyRemoteState = wrappedApplyRemoteState;
  }

  function workoutForDate(dayKey) {
    ensureGymCleanState();
    if (!validDateKey(dayKey) || dayKey < ANCHOR_DATE) return "";
    return String(state.meta.gymClean.schedule?.[getRoutineDayName(dayKey)] || "");
  }

  function sessionForDate(dayKey) {
    ensureGymCleanState();
    return state.meta.gymClean.sessions.find(session => session?.date === dayKey) || null;
  }

  function nextWorkoutDates(startKey = getTodayKey(), count = 5) {
    const output = [];
    let cursor = keyToLocalDate(startKey);

    /*
      Include the selected/start date when it is a training day.
    */
    for (let step = 0; step < 45 && output.length < count; step += 1) {
      const key = formatDateKey(cursor);
      const workout = workoutForDate(key);
      if (workout) output.push({ date: key, workout });
      cursor = addDays(cursor, 1);
    }
    return output;
  }

  function renderNextWorkoutStrip() {
    const grid = document.getElementById("cleanGymWeekGrid");
    if (!grid) return;

    const heading = grid.closest(".clean-gym-week-card")?.querySelector(".panel-title h3");
    if (heading) heading.textContent = "Next workouts";

    const today = getTodayKey();
    const items = nextWorkoutDates(today, 5);

    grid.innerHTML = "";
    for (const item of items) {
      const date = keyToLocalDate(item.date);
      const session = sessionForDate(item.date);
      const card = document.createElement("div");
      card.className = `clean-gym-day${item.date === today ? " today selected" : ""}`;
      card.innerHTML = `
        <strong>${DAY_NAMES[date.getDay()].slice(0, 3)} · ${date.getMonth() + 1}/${date.getDate()}</strong>
        <span>${escapeHtml(item.workout)}${session?.completed ? " ✓" : ""}</span>`;
      grid.appendChild(card);
    }
  }

  function scheduleStripRefresh(delay = 0) {
    clearTimeout(sequenceRefreshTimer);
    sequenceRefreshTimer = setTimeout(renderNextWorkoutStrip, delay);
  }

  /*
    The clean rebuild re-renders its week strip after navigation/save. Refresh
    the sequential strip immediately afterward without a MutationObserver.
  */
  document.addEventListener("click", event => {
    if (
      event.target.closest("#cleanGymPrev") ||
      event.target.closest("#cleanGymNext") ||
      event.target.closest("#cleanGymToday") ||
      event.target.closest("#cleanGymSave") ||
      event.target.closest("#cleanGymComplete") ||
      event.target.closest(".clean-modal-save") ||
      event.target.closest('[data-tab="gymPage"]')
    ) {
      scheduleStripRefresh(25);
    }

    if (
      event.target.closest("#cleanGymSave") ||
      event.target.closest("#cleanGymComplete")
    ) {
      setTimeout(() => {
        reconcileRecoveredSessions();
        writeVaultSessions(state.meta?.gymClean?.sessions || []);
      }, 30);
    }
  });

  /*
    Replace the Gym schedule gear's initial mapping once so Friday starts on
    Chest + side delts. After this one migration the user can edit the schedule
    normally and it will not be forced again.
  */
  function installAnchorAndRecover() {
    if (typeof state === "undefined" || typeof saveState !== "function") return;

    ensureGymCleanState();
    const scheduleChanged = forceAnchorSchedule();
    const recoveryChanged = reconcileRecoveredSessions();

    if (scheduleChanged || recoveryChanged) {
      saveState();
    }

    /*
      Ensure the Looksmaxxing workout label uses the same mapping even if it was
      rendered just before this patch initialized.
    */
    try { if (typeof render === "function") render(); } catch (_) {}
    scheduleStripRefresh(25);
  }

  async function recoverFromSupabaseBackups() {
    if (!supabaseClient || typeof state === "undefined") return;

    try {
      const { data, error } = await supabaseClient
        .from("locked_os_state_backups")
        .select("state, backed_up_at")
        .eq("id", SUPABASE_ROW_ID)
        .order("backup_id", { ascending: false })
        .limit(50);

      if (error || !Array.isArray(data) || !data.length) return;

      const sessions = [];
      for (const row of data) {
        sessions.push(...extractSessions(row?.state));
      }

      if (!sessions.length) return;

      const changed = reconcileRecoveredSessions(sessions);
      if (changed) {
        saveState();
        try { if (typeof render === "function") render(); } catch (_) {}
        scheduleStripRefresh(25);

        const today = state.meta?.gymClean?.sessions?.find(session => session.date === ANCHOR_DATE);
        if (today && sessionCompleteness(today) > 0 && typeof toast === "function") {
          toast("Recovered saved workout data from backup.");
        }
      }
    } catch (error) {
      /*
        Backup table is optional. Local recovery still works if it is absent.
      */
      console.warn("LOCKED OS: cloud workout-backup recovery unavailable.", error);
    }
  }

  const start = () => {
    setTimeout(() => {
      installAnchorAndRecover();
      recoverFromSupabaseBackups();
    }, 80);
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

/* ===== FLATTENED: gym UI ===== */
(() => {
  "use strict";

  const FLAG = "__lockedOsGymUiFinal20260911";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const START = "2026-09-11";
  const SCHEDULE = {
    Friday: "Chest + side delts",
    Saturday: "Back + rear delts",
    Monday: "Arms",
    Wednesday: "Legs + Abs"
  };
  const EXERCISES = {
    "Chest + side delts": [
      "Incline Dumbbell Bench Press",
      "Machine Chest Press",
      "Cable Fly / Pec Deck",
      "Cable Lateral Raise",
      "Machine Lateral Raise"
    ],
    "Back + rear delts": [
      "Lat Pulldown",
      "Chest-Supported Row",
      "Seated Cable Row, both arms",
      "Reverse Pec Deck"
    ],
    "Arms": [
      "Triceps Pressdown",
      "Overhead Cable Triceps Extension",
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
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let selectedDate = "";

  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function ensureGym() {
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean = state.meta.gymClean && typeof state.meta.gymClean === "object"
      ? state.meta.gymClean
      : {};
    state.meta.gymClean.sessions = Array.isArray(state.meta.gymClean.sessions)
      ? state.meta.gymClean.sessions
      : [];

    /*
      Keep the requested training order authoritative. This also guarantees
      Friday 9/11 is Chest + side delts.
    */
    if (
      !state.meta.gymClean.schedule ||
      typeof state.meta.gymClean.schedule !== "object" ||
      Array.isArray(state.meta.gymClean.schedule) ||
      !Object.keys(state.meta.gymClean.schedule).length
    ) {
      state.meta.gymClean.schedule = { ...SCHEDULE };
    }
  }

  function workoutFor(dayKey) {
    ensureGym();
    if (!validDateKey(dayKey) || dayKey < START) return "";
    return state.meta.gymClean.schedule[getRoutineDayName(dayKey)] || "";
  }

  function sessionFor(dayKey) {
    ensureGym();
    return state.meta.gymClean.sessions.find(session => session?.date === dayKey) || null;
  }

  function sessionForWrite(dayKey) {
    ensureGym();
    let session = sessionFor(dayKey);
    if (!session) {
      session = {
        id: `gym-final-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date: dayKey,
        workout: workoutFor(dayKey),
        completed: false,
        exercises: [],
        updatedAt: new Date().toISOString()
      };
      state.meta.gymClean.sessions.push(session);
    }
    return session;
  }

  function adjacentWorkout(dayKey, direction) {
    let cursor = keyToLocalDate(dayKey);
    for (let step = 0; step < 60; step += 1) {
      cursor = addDays(cursor, direction);
      const key = formatDateKey(cursor);
      if (key < START) return null;
      if (workoutFor(key)) return key;
    }
    return null;
  }

  function sequenceFrom(dayKey, count = 5) {
    const items = [];
    let cursor = keyToLocalDate(dayKey);

    /*
      If selected date is a rest day, begin at the next actual workout.
    */
    for (let step = 0; step < 60 && items.length < count; step += 1) {
      const key = formatDateKey(cursor);
      const workout = workoutFor(key);
      if (workout) items.push({ date: key, workout });
      cursor = addDays(cursor, 1);
    }
    return items;
  }

  function previousExercise(name, beforeDate) {
    ensureGym();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => validDateKey(session?.date) && session.date < beforeDate)
      .sort((a, b) => b.date.localeCompare(a.date));

    for (const session of sessions) {
      const match = Array.isArray(session.exercises)
        ? session.exercises.find(exercise => exercise?.name === name)
        : null;
      if (match) return match;
    }
    return null;
  }

  function setText(set) {
    return Number(set?.weight) > 0 && Number(set?.reps) > 0
      ? `${Number(set.weight)} lb × ${Number(set.reps)}`
      : "—";
  }

  function renderSequence() {
    const grid = document.getElementById("cleanGymWeekGrid");
    if (!grid) return;

    const heading = grid.closest(".clean-gym-week-card")?.querySelector(".panel-title h3");
    if (heading) heading.textContent = "Next workouts";

    const items = sequenceFrom(selectedDate || getTodayKey(), 5);
    grid.innerHTML = "";

    for (const item of items) {
      const date = keyToLocalDate(item.date);
      const session = sessionFor(item.date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `clean-gym-day${item.date === selectedDate ? " selected" : ""}${item.date === getTodayKey() ? " today" : ""}`;
      button.innerHTML = `
        <strong>${DAYS[date.getDay()].slice(0, 3)} · ${date.getMonth() + 1}/${date.getDate()}</strong>
        <span>${escapeHtml(item.workout)}${session?.completed ? " ✓" : ""}</span>`;
      button.addEventListener("click", () => {
        selectedDate = item.date;
        renderAllGym();
      });
      grid.appendChild(button);
    }
  }

  function renderWorkoutForm() {
    const body = document.getElementById("cleanGymWorkoutBody");
    const title = document.getElementById("cleanGymWorkoutTitle");
    const dateLabel = document.getElementById("cleanGymDateLabel");
    const actions = document.getElementById("cleanGymActions");
    const status = document.getElementById("cleanGymSaveStatus");
    if (!body || !title || !dateLabel || !actions) return;

    if (!validDateKey(selectedDate)) selectedDate = getTodayKey();

    const date = keyToLocalDate(selectedDate);
    const workout = workoutFor(selectedDate);
    const session = sessionFor(selectedDate);

    dateLabel.textContent = `${DAYS[date.getDay()]}, ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
    if (status) status.textContent = "";

    if (!workout) {
      const next = adjacentWorkout(selectedDate, 1);
      title.textContent = "Rest day";
      body.innerHTML = `
        <div class="clean-gym-rest">
          <strong>Rest day</strong>
          <span>${next ? `Next workout: ${escapeHtml(workoutFor(next))}` : "No next workout found."}</span>
        </div>`;
      actions.hidden = true;
      return;
    }

    actions.hidden = false;
    title.textContent = workout;

    const list = document.createElement("div");
    list.className = "clean-gym-exercises";

    for (const name of EXERCISES[workout] || []) {
      const current = session?.exercises?.find(exercise => exercise?.name === name) || { sets: [] };
      const previous = previousExercise(name, selectedDate);

      const row = document.createElement("div");
      row.className = "clean-gym-exercise";
      row.dataset.exercise = name;
      row.innerHTML = `
        <div class="clean-gym-exercise-name">
          <strong>${escapeHtml(name)}</strong>
          <span>2 working sets</span>
        </div>
        <div class="clean-gym-previous">
          <span>Previous</span>
          <strong>${escapeHtml(setText(previous?.sets?.[0]))}<br>${escapeHtml(setText(previous?.sets?.[1]))}</strong>
        </div>
        ${[0,1].map(index => {
          const set = current.sets?.[index] || {};
          return `
            <div class="clean-gym-set">
              <label>
                <span>Set ${index + 1} lb</span>
                <input data-set="${index}" data-field="weight" type="number" min="0" max="2000" step="0.5" value="${Number(set.weight) || ""}" placeholder="Weight">
              </label>
              <label>
                <span>Reps</span>
                <input data-set="${index}" data-field="reps" type="number" min="0" max="100" step="1" value="${Number(set.reps) || ""}" placeholder="Reps">
              </label>
            </div>`;
        }).join("")}`;
      list.appendChild(row);
    }

    body.innerHTML = "";
    body.appendChild(list);
  }

  function renderHistory() {
    const list = document.getElementById("cleanGymHistory");
    if (!list) return;

    ensureGym();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => validDateKey(session?.date))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    if (!sessions.length) {
      list.innerHTML = '<div class="clean-gym-empty">No saved workouts yet.</div>';
      return;
    }

    list.innerHTML = "";
    for (const session of sessions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clean-gym-history-row";
      button.innerHTML = `
        <span>${escapeHtml(session.date)}</span>
        <strong>${escapeHtml(session.workout || workoutFor(session.date) || "Workout")}${session.completed ? " ✓" : ""}</strong>`;
      button.addEventListener("click", () => {
        selectedDate = session.date;
        renderAllGym();
      });
      list.appendChild(button);
    }
  }

  function renderAllGym() {
    ensureGym();
    const badge = document.getElementById("cleanGymTodayBadge");
    if (badge) badge.textContent = workoutFor(getTodayKey()) || "Rest day";

    renderSequence();
    renderWorkoutForm();
    renderHistory();
  }

  function collectForm() {
    const exercises = [];
    let invalid = false;

    document.querySelectorAll("#cleanGymWorkoutBody .clean-gym-exercise").forEach(row => {
      const sets = [0, 1].map(index => {
        const weight = Number(row.querySelector(`[data-set="${index}"][data-field="weight"]`)?.value || 0);
        const reps = Number(row.querySelector(`[data-set="${index}"][data-field="reps"]`)?.value || 0);
        if ((weight > 0) !== (reps > 0)) invalid = true;
        return {
          weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
          reps: Number.isFinite(reps) ? Math.max(0, Math.round(reps)) : 0
        };
      });
      exercises.push({ name: row.dataset.exercise || "", sets });
    });

    return { exercises, invalid };
  }

  function saveWorkout(markComplete) {
    const workout = workoutFor(selectedDate);
    const status = document.getElementById("cleanGymSaveStatus");
    if (!workout) return;

    const collected = collectForm();
    if (collected.invalid) {
      if (status) status.textContent = "Each entered set needs both weight and reps.";
      return;
    }

    if (markComplete) {
      const missing = collected.exercises.some(exercise =>
        exercise.sets.some(set => !(set.weight > 0 && set.reps > 0))
      );
      if (missing) {
        if (status) status.textContent = "Fill both sets for every exercise before completing.";
        return;
      }
    }

    const session = sessionForWrite(selectedDate);
    session.workout = workout;
    session.exercises = collected.exercises;
    if (markComplete) session.completed = true;
    session.updatedAt = new Date().toISOString();

    saveState();

    if (status) {
      status.textContent = markComplete
        ? "Workout saved and completed."
        : "Workout saved.";
    }

    if (typeof toast === "function") {
      toast(markComplete ? "Workout completed." : "Workout saved.");
    }

    renderSequence();
    renderHistory();
    try { renderWeeklyReview(); } catch (_) {}
  }

  function replaceControl(id, handler) {
    const old = document.getElementById(id);
    if (!old) return;
    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);
    fresh.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      handler();
    });
  }

  function installNavigation() {
    replaceControl("cleanGymPrev", () => {
      const target = adjacentWorkout(selectedDate || getTodayKey(), -1);
      if (target) {
        selectedDate = target;
        renderAllGym();
      } else if (typeof toast === "function") {
        toast("No earlier workout.");
      }
    });

    replaceControl("cleanGymNext", () => {
      const target = adjacentWorkout(selectedDate || getTodayKey(), 1);
      if (target) {
        selectedDate = target;
        renderAllGym();
      }
    });

    replaceControl("cleanGymToday", () => {
      selectedDate = getTodayKey();
      renderAllGym();
    });

    replaceControl("cleanGymSave", () => saveWorkout(false));
    replaceControl("cleanGymComplete", () => saveWorkout(true));
  }

  function makeLooksGymReadOnly() {
    /*
      User wants Gym scheduling controlled only from the Gym page.
      Keep the current workout name visible, but remove every shifter/Set action.
    */
    const ids = [
      "workoutPrevBtn",
      "workoutNextBtn",
      "setWorkoutBtn",
      "workoutRotationStatus"
    ];

    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) element.style.display = "none";
    }

    const preview = document.getElementById("workoutPreviewName");
    if (preview) {
      preview.textContent = workoutFor(getTodayKey()) || "Rest day";
      preview.setAttribute("aria-live", "polite");
    }

    /*
      If the old controls sit in their own toolbar/container, collapse the
      container only when it contains no other useful visible controls.
    */
    for (const id of ["workoutPrevBtn", "workoutNextBtn", "setWorkoutBtn"]) {
      const el = document.getElementById(id);
      const parent = el?.parentElement;
      if (!parent) continue;
      const visibleUseful = [...parent.children].some(child => {
        if (child === el) return false;
        const childId = child.id || "";
        if (["workoutPrevBtn","workoutNextBtn","setWorkoutBtn","workoutRotationStatus"].includes(childId)) return false;
        return child.offsetParent !== null;
      });
      if (!visibleUseful) parent.style.display = "none";
    }
  }

  function installStyles() {
    if (document.getElementById("gymUiFinalStyles")) return;
    const style = document.createElement("style");
    style.id = "gymUiFinalStyles";
    style.textContent = `
      /* Always one horizontal workout row. Never wrap Friday 9/18 underneath. */
      #cleanGymWeekGrid.clean-gym-week,
      #cleanGymWeekGrid {
        display:flex!important;
        flex-wrap:nowrap!important;
        gap:9px!important;
        overflow-x:auto!important;
        overflow-y:hidden!important;
        padding-bottom:3px;
        scrollbar-width:thin;
      }
      #cleanGymWeekGrid .clean-gym-day {
        flex:1 0 150px!important;
        min-width:150px!important;
        max-width:none!important;
      }
      @media(min-width:1050px){
        #cleanGymWeekGrid .clean-gym-day {
          flex:1 1 0!important;
          min-width:0!important;
        }
      }

      /* Looksmaxxing Gym is display-only. */
      #workoutPrevBtn,
      #workoutNextBtn,
      #setWorkoutBtn,
      #workoutRotationStatus {
        display:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (typeof state === "undefined") return;

    ensureGym();
    selectedDate = getTodayKey();

    installStyles();
    installNavigation();
    makeLooksGymReadOnly();
    renderAllGym();

    /*
      Re-apply read-only Looks Gym after full app renders, because renderLooks()
      can rewrite the workout preview text.
    */
    document.querySelectorAll('[data-tab="looksPage"],[data-tab="gymPage"]').forEach(button => {
      if (button.dataset.gymUiFinalBound === "true") return;
      button.dataset.gymUiFinalBound = "true";
      button.addEventListener("click", () => setTimeout(() => {
        makeLooksGymReadOnly();
        if (button.dataset.tab === "gymPage") {
          installNavigation();
          renderAllGym();
        }
      }, 0));
    });

    /*
      A save elsewhere in the app can trigger render(); keep the Looks controls
      hidden without observing the entire DOM.
    */
    window.addEventListener("focus", () => {
      makeLooksGymReadOnly();
    });
  }

  const start = () => setTimeout(install, 100);
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

/* ===== FLATTENED: gym log/navigation ===== */
(() => {
  "use strict";

  const FLAG = "__lockedOsGymLogNavFix20260911";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const START = "2026-09-11";
  const SCHEDULE = {
    Friday: "Chest + side delts",
    Saturday: "Back + rear delts",
    Monday: "Arms",
    Wednesday: "Legs + Abs"
  };
  const EXERCISES = {
    "Chest + side delts": [
      "Incline Dumbbell Bench Press",
      "Machine Chest Press",
      "Cable Fly / Pec Deck",
      "Cable Lateral Raise",
      "Machine Lateral Raise"
    ],
    "Back + rear delts": [
      "Lat Pulldown",
      "Chest-Supported Row",
      "Seated Cable Row, both arms",
      "Reverse Pec Deck"
    ],
    "Arms": [
      "Triceps Pressdown",
      "Overhead Cable Triceps Extension",
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
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let uiSelectedDate = "";
  let stripAnchorDate = "";

  const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function ensureGym() {
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean = state.meta.gymClean && typeof state.meta.gymClean === "object"
      ? state.meta.gymClean
      : {};
    state.meta.gymClean.sessions = Array.isArray(state.meta.gymClean.sessions)
      ? state.meta.gymClean.sessions
      : [];
    if (
      !state.meta.gymClean.schedule ||
      typeof state.meta.gymClean.schedule !== "object" ||
      Array.isArray(state.meta.gymClean.schedule) ||
      !Object.keys(state.meta.gymClean.schedule).length
    ) {
      state.meta.gymClean.schedule = { ...SCHEDULE };
    }
  }

  function workoutFor(dayKey) {
    ensureGym();
    if (!validDateKey(dayKey) || dayKey < START) return "";
    return state.meta.gymClean.schedule[getRoutineDayName(dayKey)] || "";
  }

  function sessionFor(dayKey) {
    ensureGym();
    return state.meta.gymClean.sessions.find(session => session?.date === dayKey) || null;
  }

  function sessionForWrite(dayKey) {
    ensureGym();
    let session = sessionFor(dayKey);
    if (!session) {
      session = {
        id: `gym-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        date: dayKey,
        workout: workoutFor(dayKey),
        completed: false,
        exercises: [],
        updatedAt: new Date().toISOString()
      };
      state.meta.gymClean.sessions.push(session);
    }
    return session;
  }

  function adjacentWorkout(dayKey, direction) {
    let cursor = keyToLocalDate(dayKey);
    for (let step = 0; step < 90; step += 1) {
      cursor = addDays(cursor, direction);
      const key = formatDateKey(cursor);
      if (key < START) return null;
      if (workoutFor(key)) return key;
    }
    return null;
  }

  function firstWorkoutOnOrAfter(dayKey) {
    if (validDateKey(dayKey) && workoutFor(dayKey)) return dayKey;
    let cursor = keyToLocalDate(validDateKey(dayKey) ? dayKey : getTodayKey());
    for (let step = 0; step < 30; step += 1) {
      const key = formatDateKey(cursor);
      if (workoutFor(key)) return key;
      cursor = addDays(cursor, 1);
    }
    return START;
  }

  function stripDates(anchorKey, count = 5) {
    const items = [];
    let key = firstWorkoutOnOrAfter(anchorKey);

    while (key && items.length < count) {
      items.push({ date: key, workout: workoutFor(key) });
      key = adjacentWorkout(key, 1);
    }
    return items;
  }

  function stripContains(dayKey) {
    return stripDates(stripAnchorDate || getTodayKey(), 5).some(item => item.date === dayKey);
  }

  function ensureSelectedVisible() {
    if (!validDateKey(uiSelectedDate)) uiSelectedDate = firstWorkoutOnOrAfter(getTodayKey());
    if (!validDateKey(stripAnchorDate)) stripAnchorDate = firstWorkoutOnOrAfter(getTodayKey());

    if (!stripContains(uiSelectedDate)) {
      /*
        When moving outside the current 5 cards, shift the window so the
        selected workout is visible as the first card.
      */
      stripAnchorDate = uiSelectedDate;
    }
  }

  function previousExercise(name, beforeDate) {
    ensureGym();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => validDateKey(session?.date) && session.date < beforeDate)
      .sort((a, b) => b.date.localeCompare(a.date));

    for (const session of sessions) {
      const match = Array.isArray(session.exercises)
        ? session.exercises.find(exercise => exercise?.name === name)
        : null;
      if (match) return match;
    }
    return null;
  }

  function setText(set) {
    return Number(set?.weight) > 0 && Number(set?.reps) > 0
      ? `${Number(set.weight)} lb × ${Number(set.reps)}`
      : "—";
  }

  function formatDate(dayKey) {
    const date = keyToLocalDate(dayKey);
    return `${DAYS[date.getDay()]}, ${date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric"
    })}`;
  }

  function renderStableStrip({ scroll = true } = {}) {
    const grid = document.getElementById("cleanGymWeekGrid");
    if (!grid) return;

    ensureSelectedVisible();

    const heading = grid.closest(".clean-gym-week-card")?.querySelector(".panel-title h3");
    if (heading) heading.textContent = "Next workouts";

    const items = stripDates(stripAnchorDate, 5);
    grid.innerHTML = "";

    for (const item of items) {
      const date = keyToLocalDate(item.date);
      const session = sessionFor(item.date);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.gymStripDate = item.date;
      button.className =
        `clean-gym-day gym-strip-card` +
        `${item.date === uiSelectedDate ? " selected gym-strip-selected" : ""}` +
        `${item.date === getTodayKey() ? " today" : ""}`;

      button.innerHTML = `
        <strong>${DAYS[date.getDay()].slice(0, 3)} · ${date.getMonth() + 1}/${date.getDate()}</strong>
        <span>${escapeHtml(item.workout)}${session?.completed ? " ✓" : ""}</span>`;

      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        uiSelectedDate = item.date;
        renderGymUi();
      });

      grid.appendChild(button);
    }

    if (scroll) {
      requestAnimationFrame(() => {
        const selected = grid.querySelector(`[data-gym-strip-date="${CSS.escape(uiSelectedDate)}"]`);
        selected?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center"
        });
      });
    }
  }

  function renderWorkoutForm() {
    const body = document.getElementById("cleanGymWorkoutBody");
    const title = document.getElementById("cleanGymWorkoutTitle");
    const dateLabel = document.getElementById("cleanGymDateLabel");
    const actions = document.getElementById("cleanGymActions");
    const status = document.getElementById("cleanGymSaveStatus");
    if (!body || !title || !dateLabel || !actions) return;

    if (!validDateKey(uiSelectedDate)) {
      uiSelectedDate = firstWorkoutOnOrAfter(getTodayKey());
    }

    const workout = workoutFor(uiSelectedDate);
    const session = sessionFor(uiSelectedDate);

    dateLabel.textContent = formatDate(uiSelectedDate);
    if (status) status.textContent = "";

    if (!workout) {
      title.textContent = "Rest day";
      body.innerHTML = '<div class="clean-gym-rest"><strong>Rest day</strong></div>';
      actions.hidden = true;
      return;
    }

    actions.hidden = false;
    title.textContent = workout;

    const list = document.createElement("div");
    list.className = "clean-gym-exercises";

    for (const name of EXERCISES[workout] || []) {
      const current = session?.exercises?.find(exercise => exercise?.name === name) || { sets: [] };
      const previous = previousExercise(name, uiSelectedDate);

      const row = document.createElement("div");
      row.className = "clean-gym-exercise";
      row.dataset.exercise = name;

      row.innerHTML = `
        <div class="clean-gym-exercise-name">
          <strong>${escapeHtml(name)}</strong>
          <span>2 working sets</span>
        </div>
        <div class="clean-gym-previous">
          <span>Previous</span>
          <strong>${escapeHtml(setText(previous?.sets?.[0]))}<br>${escapeHtml(setText(previous?.sets?.[1]))}</strong>
        </div>
        ${[0, 1].map(index => {
          const set = current.sets?.[index] || {};
          return `
            <div class="clean-gym-set">
              <label>
                <span>Set ${index + 1} lb</span>
                <input data-set="${index}" data-field="weight" type="number" min="0" max="2000" step="0.5"
                  value="${Number(set.weight) || ""}" placeholder="Weight">
              </label>
              <label>
                <span>Reps</span>
                <input data-set="${index}" data-field="reps" type="number" min="0" max="100" step="1"
                  value="${Number(set.reps) || ""}" placeholder="Reps">
              </label>
            </div>`;
        }).join("")}`;

      list.appendChild(row);
    }

    body.innerHTML = "";
    body.appendChild(list);
  }

  function renderHistory() {
    const list = document.getElementById("cleanGymHistory");
    if (!list) return;

    ensureGym();
    const sessions = [...state.meta.gymClean.sessions]
      .filter(session => validDateKey(session?.date))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);

    if (!sessions.length) {
      list.innerHTML = '<div class="clean-gym-empty">No saved workout logs yet.</div>';
      return;
    }

    list.innerHTML = "";

    for (const session of sessions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clean-gym-history-row gym-log-row";

      const setCount = (session.exercises || []).reduce(
        (total, exercise) =>
          total + (exercise.sets || []).filter(set => Number(set?.weight) > 0 && Number(set?.reps) > 0).length,
        0
      );

      button.innerHTML = `
        <div class="gym-log-row-copy">
          <span>${escapeHtml(session.date)}</span>
          <strong>${escapeHtml(session.workout || workoutFor(session.date) || "Workout")}${session.completed ? " ✓" : ""}</strong>
          <small>${setCount ? `${setCount} logged set${setCount === 1 ? "" : "s"}` : "Open workout log"}</small>
        </div>
        <span class="gym-log-open">View log →</span>`;

      button.addEventListener("click", event => {
        event.preventDefault();
        openWorkoutLog(session.date);
      });

      list.appendChild(button);
    }
  }

  function renderGymUi() {
    ensureGym();
    ensureSelectedVisible();

    const badge = document.getElementById("cleanGymTodayBadge");
    if (badge) badge.textContent = workoutFor(getTodayKey()) || "Rest day";

    renderStableStrip();
    renderWorkoutForm();
    renderHistory();
  }

  function collectForm() {
    const exercises = [];
    let invalid = false;

    document.querySelectorAll("#cleanGymWorkoutBody .clean-gym-exercise").forEach(row => {
      const sets = [0, 1].map(index => {
        const weight = Number(
          row.querySelector(`[data-set="${index}"][data-field="weight"]`)?.value || 0
        );
        const reps = Number(
          row.querySelector(`[data-set="${index}"][data-field="reps"]`)?.value || 0
        );

        if ((weight > 0) !== (reps > 0)) invalid = true;

        return {
          weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
          reps: Number.isFinite(reps) ? Math.max(0, Math.round(reps)) : 0
        };
      });

      exercises.push({
        name: row.dataset.exercise || "",
        sets
      });
    });

    return { exercises, invalid };
  }

  function saveWorkout(markComplete) {
    const workout = workoutFor(uiSelectedDate);
    const status = document.getElementById("cleanGymSaveStatus");
    if (!workout) return;

    const collected = collectForm();

    if (collected.invalid) {
      if (status) status.textContent = "Each entered set needs both weight and reps.";
      return;
    }

    if (markComplete) {
      const missing = collected.exercises.some(exercise =>
        exercise.sets.some(set => !(set.weight > 0 && set.reps > 0))
      );

      if (missing) {
        if (status) status.textContent = "Fill both sets for every exercise before completing.";
        return;
      }
    }

    const session = sessionForWrite(uiSelectedDate);
    session.workout = workout;
    session.exercises = collected.exercises;
    if (markComplete) session.completed = true;
    session.updatedAt = new Date().toISOString();

    saveState();

    if (status) {
      status.textContent = markComplete
        ? "Workout saved and completed."
        : "Workout saved.";
    }

    if (typeof toast === "function") {
      toast(markComplete ? "Workout completed." : "Workout saved.");
    }

    renderStableStrip({ scroll: false });
    renderHistory();
    try { renderWeeklyReview(); } catch (_) {}
  }

  function openWorkoutLog(dayKey) {
    const session = sessionFor(dayKey);
    if (!session) return;

    document.querySelector(".gym-log-modal-backdrop")?.remove();

    const modal = document.createElement("div");
    modal.className = "gym-log-modal-backdrop";

    const exerciseRows = (session.exercises || []).map(exercise => {
      const sets = (exercise.sets || []).slice(0, 2);
      return `
        <div class="gym-log-exercise">
          <div class="gym-log-exercise-name">${escapeHtml(exercise.name || "Exercise")}</div>
          <div class="gym-log-sets">
            ${[0, 1].map(index => {
              const set = sets[index];
              return `
                <div class="gym-log-set">
                  <span>Set ${index + 1}</span>
                  <strong>${escapeHtml(setText(set))}</strong>
                </div>`;
            }).join("")}
          </div>
        </div>`;
    }).join("");

    modal.innerHTML = `
      <section class="gym-log-modal" role="dialog" aria-modal="true" aria-labelledby="gymLogModalTitle">
        <div class="gym-log-modal-head">
          <div>
            <p class="eyebrow blue">Workout log</p>
            <h3 id="gymLogModalTitle">${escapeHtml(session.workout || workoutFor(dayKey) || "Workout")}</h3>
            <p>${escapeHtml(formatDate(dayKey))}</p>
          </div>
          <button class="gym-log-close" type="button" aria-label="Close">×</button>
        </div>

        <div class="gym-log-status ${session.completed ? "complete" : ""}">
          ${session.completed ? "✓ Completed workout" : "Saved workout"}
        </div>

        <div class="gym-log-exercises">
          ${exerciseRows || '<div class="clean-gym-empty">This saved log has no set data.</div>'}
        </div>

        <div class="gym-log-modal-actions">
          <button class="btn secondary gym-log-edit" type="button">Open in workout editor</button>
          <button class="btn blue gym-log-done" type="button">Done</button>
        </div>
      </section>`;

    document.body.appendChild(modal);

    const close = () => modal.remove();

    modal.addEventListener("click", event => {
      if (event.target === modal) close();
    });

    modal.querySelector(".gym-log-close")?.addEventListener("click", close);
    modal.querySelector(".gym-log-done")?.addEventListener("click", close);
    modal.querySelector(".gym-log-edit")?.addEventListener("click", () => {
      uiSelectedDate = dayKey;
      if (!stripContains(dayKey)) stripAnchorDate = dayKey;
      close();
      renderGymUi();
      document.querySelector(".clean-gym-log-card")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function replaceControl(id, handler) {
    const old = document.getElementById(id);
    if (!old) return;

    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);

    fresh.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handler();
    }, { capture: true });
  }

  function installControls() {
    replaceControl("cleanGymPrev", () => {
      const target = adjacentWorkout(uiSelectedDate || firstWorkoutOnOrAfter(getTodayKey()), -1);
      if (!target) {
        if (typeof toast === "function") toast("No earlier workout.");
        return;
      }

      uiSelectedDate = target;

      /*
        Keep the selected workout in the current 5-card window if possible.
        If it falls outside, shift the strip window.
      */
      if (!stripContains(target)) stripAnchorDate = target;
      renderGymUi();
    });

    replaceControl("cleanGymNext", () => {
      const target = adjacentWorkout(uiSelectedDate || firstWorkoutOnOrAfter(getTodayKey()), 1);
      if (!target) return;

      uiSelectedDate = target;
      if (!stripContains(target)) stripAnchorDate = target;
      renderGymUi();
    });

    replaceControl("cleanGymToday", () => {
      uiSelectedDate = firstWorkoutOnOrAfter(getTodayKey());
      stripAnchorDate = firstWorkoutOnOrAfter(getTodayKey());
      renderGymUi();
    });

    replaceControl("cleanGymSave", () => saveWorkout(false));
    replaceControl("cleanGymComplete", () => saveWorkout(true));
  }

  function keepLooksGymReadOnly() {
    for (const id of [
      "workoutPrevBtn",
      "workoutNextBtn",
      "setWorkoutBtn",
      "workoutRotationStatus"
    ]) {
      const element = document.getElementById(id);
      if (element) element.style.display = "none";
    }

    const preview = document.getElementById("workoutPreviewName");
    if (preview) preview.textContent = workoutFor(getTodayKey()) || "Rest day";
  }

  function installStyles() {
    if (document.getElementById("gymLogNavFixStyles")) return;

    const style = document.createElement("style");
    style.id = "gymLogNavFixStyles";
    style.textContent = `
      #cleanGymWeekGrid {
        display:flex!important;
        flex-wrap:nowrap!important;
        overflow-x:auto!important;
        overflow-y:hidden!important;
        gap:9px!important;
        scroll-behavior:smooth;
        scrollbar-width:thin;
        padding:2px 2px 7px;
      }

      #cleanGymWeekGrid .gym-strip-card {
        flex:0 0 160px!important;
        min-width:160px!important;
        max-width:160px!important;
        transition:border-color .15s ease, background .15s ease, transform .15s ease;
      }

      #cleanGymWeekGrid .gym-strip-card.gym-strip-selected {
        background:var(--blue-soft)!important;
        border-color:rgba(37,132,184,.65)!important;
        box-shadow:0 0 0 2px rgba(37,132,184,.12);
        transform:translateY(-1px);
      }

      @media(min-width:1050px){
        #cleanGymWeekGrid .gym-strip-card {
          flex:1 1 0!important;
          min-width:0!important;
          max-width:none!important;
        }
      }

      .gym-log-row {
        align-items:center!important;
        text-align:left;
      }

      .gym-log-row-copy {
        display:grid;
        gap:2px;
      }

      .gym-log-row-copy span,
      .gym-log-row-copy small {
        color:var(--muted);
        font-weight:800;
      }

      .gym-log-row-copy small {
        font-size:.72rem;
      }

      .gym-log-open {
        color:var(--blue);
        font-size:.76rem;
        font-weight:900!important;
        white-space:nowrap;
      }

      .gym-log-modal-backdrop {
        position:fixed;
        inset:0;
        z-index:10020;
        display:grid;
        place-items:center;
        padding:18px;
        background:rgba(20,16,12,.48);
        backdrop-filter:blur(8px);
      }

      .gym-log-modal {
        width:min(680px,100%);
        max-height:90vh;
        overflow:auto;
        padding:20px;
        border:1px solid var(--line);
        border-radius:24px;
        background:var(--card);
        box-shadow:0 26px 90px rgba(20,14,8,.28);
      }

      .gym-log-modal-head {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:15px;
      }

      .gym-log-modal-head h3 {
        margin:0;
        font-size:1.75rem;
      }

      .gym-log-modal-head p:not(.eyebrow) {
        margin:5px 0 0;
        color:var(--muted);
        font-weight:800;
      }

      .gym-log-close {
        width:36px;
        height:36px;
        border:0;
        border-radius:999px;
        background:rgba(42,30,18,.07);
        color:var(--text);
        font-size:1.4rem;
        cursor:pointer;
      }

      .gym-log-status {
        display:inline-flex;
        margin:15px 0 12px;
        padding:7px 10px;
        border-radius:999px;
        background:rgba(42,30,18,.07);
        font-size:.75rem;
        font-weight:900;
      }

      .gym-log-status.complete {
        background:var(--blue-soft);
      }

      .gym-log-exercises {
        display:grid;
        gap:8px;
      }

      .gym-log-exercise {
        display:grid;
        grid-template-columns:minmax(160px,1fr) minmax(220px,1fr);
        gap:12px;
        align-items:center;
        padding:12px 13px;
        border:1px solid var(--line);
        border-radius:15px;
        background:rgba(255,255,255,.42);
      }

      .gym-log-exercise-name {
        font-weight:900;
      }

      .gym-log-sets {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
      }

      .gym-log-set {
        display:grid;
        gap:2px;
        padding:8px 9px;
        border-radius:11px;
        background:rgba(42,30,18,.045);
      }

      .gym-log-set span {
        color:var(--muted);
        font-size:.68rem;
        font-weight:900;
      }

      .gym-log-set strong {
        font-size:.82rem;
      }

      .gym-log-modal-actions {
        display:flex;
        justify-content:flex-end;
        gap:8px;
        margin-top:17px;
      }

      @media(max-width:600px){
        .gym-log-exercise {
          grid-template-columns:1fr;
        }

        .gym-log-modal-actions {
          display:grid;
          grid-template-columns:1fr 1fr;
        }
      }

      #workoutPrevBtn,
      #workoutNextBtn,
      #setWorkoutBtn,
      #workoutRotationStatus {
        display:none!important;
      }
    `;

    document.head.appendChild(style);
  }

  function install() {
    if (typeof state === "undefined") return;

    ensureGym();

    uiSelectedDate = firstWorkoutOnOrAfter(getTodayKey());
    stripAnchorDate = firstWorkoutOnOrAfter(getTodayKey());

    installStyles();
    installControls();
    keepLooksGymReadOnly();
    renderGymUi();

    document.querySelectorAll('[data-tab="gymPage"],[data-tab="looksPage"]').forEach(button => {
      if (button.dataset.gymLogNavFixBound === "true") return;
      button.dataset.gymLogNavFixBound = "true";

      button.addEventListener("click", () => {
        setTimeout(() => {
          keepLooksGymReadOnly();

          if (button.dataset.tab === "gymPage") {
            installControls();
            renderGymUi();
          }
        }, 0);
      });
    });

    window.addEventListener("focus", keepLooksGymReadOnly);
  }

  const start = () => setTimeout(install, 120);

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

/* ===== FLATTENED: task stability ===== */
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

/* ===== FLATTENED: hide Today's gym card ===== */
(() => {
  "use strict";

  const FLAG = "__lockedOsHideTodaysGymCard";
  if (window[FLAG]) return;
  window[FLAG] = true;

  function normalizeText(value) {
    return String(value || "")
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function hideTodaysGymCard() {
    const looksPage = document.getElementById("looksPage");
    if (!looksPage) return;

    /*
      Preferred path: older/current versions use this preview element inside
      the standalone Today's gym card. We hide its card only — not the Gym task.
    */
    const preview = looksPage.querySelector("#workoutPreviewName");
    if (preview) {
      const card = preview.closest(".card, section");
      if (card && looksPage.contains(card)) {
        card.style.display = "none";
        card.dataset.hiddenTodaysGymCard = "true";
        return;
      }
    }

    /*
      Fallback for any markup variation: locate a heading/label whose own text
      is exactly "Today's gym", then hide only its nearest card.
    */
    const candidates = looksPage.querySelectorAll(
      "h1,h2,h3,h4,h5,h6,.eyebrow,.card-title,.panel-title,strong,span,p"
    );

    for (const element of candidates) {
      const text = normalizeText(element.textContent);

      if (text !== "today's gym" && text !== "todays gym") continue;

      const card = element.closest(".card, section");
      if (!card || !looksPage.contains(card)) continue;

      /*
        Safety: never hide an individual routine task row.
      */
      if (card.classList.contains("looks-task") || card.classList.contains("task-row")) {
        continue;
      }

      card.style.display = "none";
      card.dataset.hiddenTodaysGymCard = "true";
      return;
    }
  }

  function install() {
    hideTodaysGymCard();

    const looksPage = document.getElementById("looksPage");
    if (!looksPage) return;

    /*
      Looksmaxxing can re-render its cards after task changes. Watch only this
      page and re-hide the one standalone card if it is recreated.
    */
    const observer = new MutationObserver(() => {
      hideTodaysGymCard();
    });

    observer.observe(looksPage, {
      childList: true,
      subtree: true
    });

    document.querySelector('[data-tab="looksPage"]')?.addEventListener("click", () => {
      requestAnimationFrame(hideTodaysGymCard);
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();

/* ===== QA HARDENING ===== */
(() => {
  "use strict";

  const QA_FLAG = "__lockedOsQaAudited20260911";
  if (window[QA_FLAG]) return;
  window[QA_FLAG] = true;

  const DIRTY_KEY = "locked_os_supabase_dirty_clean";
  const GYM_SCHEDULE_VERSION = "gymScheduleVersion";
  let qaPollTimer = null;
  let qaGymScheduleBaseline = "";

  function qaClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function qaIsRestDay(dayKey) {
    return String(getWorkoutName(dayKey) || "") === "Rest day";
  }

  function qaGymSession(dayKey) {
    return (state?.meta?.gymClean?.sessions || []).find(session => session?.date === dayKey) || null;
  }

  function qaScheduledDaysForCustomTask(task) {
    const direct = Array.isArray(task?.days) ? task.days : [];
    if (direct.length) return direct;
    const mapped = state?.meta?.customTaskSchedules?.[task?.id];
    return Array.isArray(mapped) && mapped.length ? mapped : [
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
    ];
  }

  /*
    BUG FIX: startup sync must not bypass the task/day conflict safeguards.
    If a prior write failed and the local dirty flag is present, the complete
    local state is authoritative and is retried instead of being overwritten
    by an older cloud row.
  */
  loadSupabaseState = async function() {
    if (!supabaseClient) {
      if (syncStatus) syncStatus.textContent = "Saved locally. Supabase is not connected.";
      return;
    }

    const localBeforeLoad = qaClone(state);
    const wasDirty = localStorage.getItem(DIRTY_KEY) === "1";
    const result = await fetchSupabaseState();

    if (!result?.ok) {
      state = localBeforeLoad;
      normalizeState();
      saveLocalState();
      subscribeToSupabaseState();
      qaStartPolling();
      if (syncStatus) syncStatus.textContent = "Supabase load failed. Local data kept safe.";
      return;
    }

    if (result.row?.state && typeof result.row.state === "object") {
      if (wasDirty) {
        state = localBeforeLoad;
        normalizeState();
        saveLocalState();
        localRevision = Math.max(1, localRevision);
        await saveSupabaseState();
        if (syncStatus) syncStatus.textContent = "Restored pending local changes to Supabase.";
      } else {
        /*
          applyRemoteState is already wrapped by the task stability layer, so
          task tombstones and per-day versions are respected here.
        */
        applyRemoteState(
          result.row.state,
          "Synced with Supabase.",
          { force: true, updatedAt: result.row.updated_at || "" }
        );
      }
    } else {
      state = localBeforeLoad;
      normalizeState();
      saveLocalState();
      localRevision = Math.max(1, localRevision);
      localStorage.setItem(DIRTY_KEY, "1");
      await saveSupabaseState();
    }

    subscribeToSupabaseState();
    qaStartPolling();
  };

  function qaStartPolling() {
    if (!supabaseClient || qaPollTimer) return;
    qaPollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (mainApp.classList.contains("hidden")) return;
      if (hasPendingLocalChanges()) return;
      refreshSupabaseState();
    }, 5000);
  }

  /*
    BUG FIX: the original bottom-of-index DOMContentLoaded patch overwrote the
    immediate task-checkbox implementation. Re-install one authoritative,
    selected-day-aware transaction handler after every startup patch is done.
  */
  function qaInstallTaskTransactions() {
    setLooksStatus = function(task, status) {
      const dayKey = typeof lockedOsLooksKey === "function"
        ? lockedOsLooksKey()
        : getTodayKey();

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
      syncWaterTask(day, dayKey);
      day.looksCompleted =
        new Set([...(day.looksDone || []), ...(day.looksSkipped || [])]).size ===
        getLooksTaskIds(dayKey).length;

      saveState();

      /*
        Immediate full Looks render avoids stale rows / double-click races while
        preserving the selected historical day.
      */
      renderLooks();
      renderDayStreak();
    };
  }

  /*
    BUG FIX: final Gym UI used to rewrite state.meta.gymClean.schedule to a
    constant during every render. The flattened file removes those resets.
    This final validator only repairs malformed/empty schedules.
  */
  function qaValidateGymSchedule() {
    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
    state.meta.gymClean =
      state.meta.gymClean && typeof state.meta.gymClean === "object"
        ? state.meta.gymClean
        : {};

    const allowed = new Set([
      "Chest + side delts",
      "Back + rear delts",
      "Arms",
      "Legs + Abs"
    ]);

    const current = state.meta.gymClean.schedule;
    if (!current || typeof current !== "object" || Array.isArray(current)) return;

    for (const [day, workout] of Object.entries(current)) {
      if (![
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
      ].includes(day) || !allowed.has(workout)) {
        delete current[day];
      }
    }
  }

  /*
    BUG FIX: Rotation Calendar now obeys deleted built-ins and uses edited
    custom-task names. Daily custom tasks remain excluded.
  */
  function qaInstallRotationAuthority() {
    const baseRotation = getRotationTasksForDay;

    getRotationTasksForDay = function(dayKey) {
      const allowedTaskIds = new Set(getLooksTaskIds(dayKey));
      const typeToTaskId = {
        gym: "gym",
        tretinoin: "tretinoin",
        shave: "shave-manage-brows",
        microneedle: "microneedle-eyebrows",
        sheets: "wash-bed-sheets",
        lips: "lip-care"
      };

      let items = (baseRotation(dayKey) || []).filter(item => {
        if (item?.type === "custom") return false;
        if (item?.type === "mk677") return true;
        const taskId = typeToTaskId[item?.type];
        return !taskId || allowedTaskIds.has(taskId);
      });

      const dayName = getRoutineDayName(dayKey);
      const customTasks = Array.isArray(state?.meta?.looksCustomTasks)
        ? state.meta.looksCustomTasks
        : [];
      const existing = new Set(
        items.map(item => String(item?.label || "").trim().toLowerCase())
      );

      for (const task of customTasks) {
        if (!task?.id || !allowedTaskIds.has(task.id)) continue;

        const days = qaScheduledDaysForCustomTask(task);
        if (days.length >= 7 || !days.includes(dayName)) continue;

        const label = String(getLooksTaskTitle(task) || "").trim();
        if (!label || existing.has(label.toLowerCase())) continue;

        items.push({ label, type: "custom" });
        existing.add(label.toLowerCase());
      }

      return items;
    };
  }

  /*
    BUG FIX: Rest days are not failed Gym days. Weekly Review denominator is
    scheduled training days only, and skipped training days stay "Skipped".
  */
  function qaInstallWeeklyGymLogic() {
    getWeeklyGymStatus = function(dayKey, day) {
      if (qaIsRestDay(dayKey)) return "Rest day";

      const session = qaGymSession(dayKey);
      if (session?.completed) return "Done";

      const done = new Set(day?.looksDone || []);
      const skipped = new Set(day?.looksSkipped || []);
      if (done.has("gym")) return "Done";
      if (skipped.has("gym")) return "Skipped";
      if (dayKey === getTodayKey()) return "Not yet";
      return "Didn't go";
    };

    const baseRenderWeeklyReview = renderWeeklyReview;
    renderWeeklyReview = function() {
      baseRenderWeeklyReview();

      const dayKeys = getWeeklyReviewKeys();
      let scheduled = 0;
      let doneCount = 0;
      let skippedCount = 0;
      let missedCount = 0;
      let notYetCount = 0;

      const rows = [...document.querySelectorAll("#weeklyDayList .weekly-day-row")];

      dayKeys.forEach((dayKey, index) => {
        const day = state.days?.[dayKey] || createDayRecord();
        const status = getWeeklyGymStatus(dayKey, day);
        const metric = rows[index]?.querySelector(".weekly-day-metric.gym-status");

        if (status === "Rest day") {
          if (metric) {
            metric.className = "weekly-day-metric gym-status rest-day";
            const strong = metric.querySelector("strong");
            if (strong) strong.textContent = "Rest";
          }
          return;
        }

        scheduled += 1;
        if (status === "Done") doneCount += 1;
        else if (status === "Skipped") skippedCount += 1;
        else if (status === "Not yet") notYetCount += 1;
        else missedCount += 1;
      });

      const value = document.getElementById("weeklyGymDays");
      const meta = document.getElementById("weeklyGymMeta");

      if (value) value.textContent = scheduled ? `${doneCount}/${scheduled}` : "0/0";

      if (meta) {
        const parts = [];
        if (skippedCount) parts.push(`${skippedCount} skipped`);
        if (missedCount) parts.push(`${missedCount} missed`);
        if (notYetCount) parts.push("today not yet");

        meta.textContent = scheduled === 0
          ? "No training days scheduled yet"
          : parts.length
            ? parts.join(" · ")
            : "All scheduled workouts completed";
      }
    };
  }

  /*
    BUG FIX: Completing a workout in Gym should resolve the matching Gym task
    on Looksmaxxing for that same date.
  */
  function qaSyncCompletedGymSession(dayKey) {
    if (!isDateKey(dayKey) || qaIsRestDay(dayKey)) return false;

    const session = qaGymSession(dayKey);
    if (!session?.completed) return false;

    const day = ensureDay(dayKey);
    const done = new Set(day.looksDone || []);
    const skipped = new Set(day.looksSkipped || []);
    if (done.has("gym") && !skipped.has("gym")) return false;

    done.add("gym");
    skipped.delete("gym");
    day.looksDone = [...done];
    day.looksSkipped = [...skipped];
    day.looksCompleted =
      new Set([...day.looksDone, ...day.looksSkipped]).size ===
      getLooksTaskIds(dayKey).length;

    return true;
  }

  function qaInstallGymCompletionSync() {
    /*
      Document capture runs before the Gym button's target-capture handler,
      which deliberately stops propagation. Delay the reconciliation until that
      handler has finished saving the session.
    */
    document.addEventListener("click", event => {
      if (!event.target.closest("#cleanGymComplete")) return;

      setTimeout(() => {
        const selected = document.querySelector(
          "#cleanGymWeekGrid [data-gym-strip-date].gym-strip-selected"
        );
        const dayKey = selected?.dataset?.gymStripDate;
        if (!dayKey) return;

        if (qaSyncCompletedGymSession(dayKey)) {
          saveState();
          try { renderLooks(); } catch (_) {}
          try { renderWeeklyReview(); } catch (_) {}
        }
      }, 0);
    }, true);

    let changed = false;
    for (const session of state?.meta?.gymClean?.sessions || []) {
      if (session?.completed && qaSyncCompletedGymSession(session.date)) changed = true;
    }
    if (changed) saveState();
  }

  /*
    BUG FIX: the HTML still described an obsolete Mon/Wed/Sat default after the
    Friday-anchored tretinoin schedule was introduced.
  */
  function qaInstallTretinoinNote() {
    const baseRenderAdmin = renderAdmin;

    renderAdmin = function() {
      baseRenderAdmin();
      const note = document.querySelector(".tret-admin-note");
      if (!note) return;

      const days = getTretinoinDays().map(day => day.slice(0, 3));
      note.textContent =
        `Current nights: ${days.join(", ")}. ` +
        (days.length === 7
          ? "Tretinoin appears every night."
          : "Changing frequency applies from today forward.");
    };
  }

  /*
    BUG FIX: Gym schedule edits are versioned too. A stale device can no longer
    overwrite a newer saved weekly schedule merely by syncing later.
  */
  function qaInstallGymScheduleVersioning() {
    const scheduleFingerprint = snapshot => JSON.stringify(snapshot?.meta?.gymClean?.schedule || {});
    qaGymScheduleBaseline = scheduleFingerprint(state);

    if (typeof saveState === "function" && !saveState.__qaGymScheduleVersioned) {
      const baseSaveState = saveState;
      const wrappedSaveState = function(...args) {
        state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};
        const current = scheduleFingerprint(state);
        if (current !== qaGymScheduleBaseline) {
          state.meta[GYM_SCHEDULE_VERSION] = new Date().toISOString();
          qaGymScheduleBaseline = current;
        }
        return baseSaveState(...args);
      };
      wrappedSaveState.__qaGymScheduleVersioned = true;
      saveState = wrappedSaveState;
    }

    if (typeof applyRemoteState === "function" && !applyRemoteState.__qaGymScheduleVersioned) {
      const baseApplyRemoteState = applyRemoteState;
      const wrappedApplyRemoteState = function(remoteState, ...args) {
        const remote = qaClone(remoteState || {});
        remote.meta = remote.meta && typeof remote.meta === "object" ? remote.meta : {};
        remote.meta.gymClean = remote.meta.gymClean && typeof remote.meta.gymClean === "object"
          ? remote.meta.gymClean
          : {};

        const localVersion = String(state?.meta?.[GYM_SCHEDULE_VERSION] || "");
        const remoteVersion = String(remote.meta?.[GYM_SCHEDULE_VERSION] || "");

        if (localVersion && (!remoteVersion || localVersion > remoteVersion)) {
          remote.meta.gymClean.schedule = qaClone(state?.meta?.gymClean?.schedule || {});
          remote.meta[GYM_SCHEDULE_VERSION] = localVersion;
        }

        const result = baseApplyRemoteState(remote, ...args);
        qaGymScheduleBaseline = scheduleFingerprint(state);
        return result;
      };
      wrappedApplyRemoteState.__qaGymScheduleVersioned = true;
      applyRemoteState = wrappedApplyRemoteState;
    }
  }

  function qaInstallRuntimeGuards() {
    /*
      Prevent one optional panel renderer from taking down the entire app.
      Core renderers are still allowed to throw during development, but the
      user-facing render() gets isolated calls for the feature panels that have
      historically changed most often.
    */
    const originalRender = render;
    render = function() {
      try {
        originalRender();
      } catch (error) {
        console.error("LOCKED OS render error:", error);

        /*
          Attempt the essential views individually so one broken optional card
          does not leave the entire interface unusable.
        */
        const safeCalls = [
          renderTaskLists,
          renderProgress,
          renderPhoneLock,
          renderDayStreak,
          renderLooks,
          renderWeeklyReview,
          renderMk677,
          renderAdmin
        ];

        for (const fn of safeCalls) {
          try { if (typeof fn === "function") fn(); } catch (inner) {
            console.error("LOCKED OS isolated renderer error:", inner);
          }
        }
      }
    };
  }

  function qaRunInvariantRepair() {
    qaValidateGymSchedule();

    /*
      Normalize current days only after final routine authority is installed so
      obsolete task IDs cannot remain in checked/skipped arrays.
    */
    for (const dayKey of Object.keys(state.days || {})) {
      if (!isDateKey(dayKey)) continue;
      state.days[dayKey] = normalizeDay(dayKey, state.days[dayKey]);
    }

    saveLocalState();
  }

  function qaInstall() {
    qaInstallTaskTransactions();
    qaInstallRotationAuthority();
    qaInstallWeeklyGymLogic();
    qaInstallGymCompletionSync();
    qaInstallTretinoinNote();
    qaInstallGymScheduleVersioning();
    qaInstallRuntimeGuards();
    qaRunInvariantRepair();

    try { render(); } catch (_) {}
    try { renderRotationCalendar(); } catch (_) {}
  }

  /*
    All earlier Gym/task layers finish by 150 ms. Install the audited final
    authority afterward so later timers cannot replace these fixes.
  */
  setTimeout(qaInstall, 225);
})();



"use strict";

/*
  LOCKED OS — RESTORE RECENT WORKOUTS ONLY
  This intentionally loads the exact current build unchanged, then restores
  only the Recent Workouts -> Workout Log UI.

  Pinned current build:
  1eb4b5273bb03dc6ee3027d3bc2c597441a623f8
*/



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
    document.addEventListener("locked-os-workout-saved", () => scheduleRefresh(50));
  }

  const start = () => setTimeout(install, 350);

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();



"use strict";

/*
  LOCKED OS — 2026-09-16 USER PATCH

  This file loads the exact GitHub main build that existed immediately before
  this patch, then layers only the requested changes on top.

  Intentionally preserved:
    - Trusted-device auto-unlock stays enabled.
    - Gym ranking / XP system stays removed.

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
    4) Tretinoin routine setting:
       - Add an "Every other day" mode in Admin -> Routine settings
       - Turning the normal +/- frequency controls resumes weekly-frequency mode
    5) Gym schedule:
       - Monday: Arms
       - Tuesday: Legs + Abs
       - Thursday: Chest + side delts
       - Friday: Back + rear delts
*/



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
  const TRET_EOD_META_KEY = "tretinoinEveryOtherDayV1";
  const GYM_SCHEDULE_MIGRATION_KEY = "gymScheduleSep17V1";
  const DESIRED_GYM_SCHEDULE = {
    Monday: "Arms",
    Tuesday: "Legs + Abs",
    Thursday: "Chest + side delts",
    Friday: "Back + rear delts"
  };

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
  /* TRETINOIN: EVERY-OTHER-DAY ADMIN MODE                                */
  /* -------------------------------------------------------------------- */

  function tretEveryOtherConfig(targetState = (typeof state !== "undefined" ? state : null)) {
    if (!targetState || typeof targetState !== "object") return null;
    targetState.meta = targetState.meta && typeof targetState.meta === "object" && !Array.isArray(targetState.meta)
      ? targetState.meta
      : {};
    const raw = targetState.meta[TRET_EOD_META_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return {
      enabled: Boolean(raw.enabled),
      startDayKey: validDateKey(raw.startDayKey) ? raw.startDayKey : ""
    };
  }

  function isTretEveryOtherActive() {
    return Boolean(tretEveryOtherConfig()?.enabled);
  }

  function setTretEveryOtherMode(enabled) {
    if (typeof state === "undefined" || !state || typeof state !== "object") return;
    state.meta = state.meta && typeof state.meta === "object" && !Array.isArray(state.meta) ? state.meta : {};
    const existing = tretEveryOtherConfig() || {};
    state.meta[TRET_EOD_META_KEY] = {
      enabled: Boolean(enabled),
      startDayKey: enabled
        ? (existing.startDayKey || (typeof getTodayKey === "function" ? getTodayKey() : TREADMILL_START))
        : (existing.startDayKey || "")
    };
    try { if (typeof saveState === "function") saveState(); else persistSoon(); } catch (_) { persistSoon(); }
    try { if (typeof render === "function") render(); } catch (_) {}
    setTimeout(ensureTretEveryOtherUi, 0);
  }

  function installTretEveryOtherScheduleLogic() {
    if (typeof getTretinoinDays !== "function" || getTretinoinDays.__sep17EveryOtherDay) return;
    const beforeGetTretinoinDays = getTretinoinDays;
    const wrapped = function(dayKey = (typeof getTodayKey === "function" ? getTodayKey() : "")) {
      const config = tretEveryOtherConfig();
      if (!config?.enabled || !validDateKey(dayKey) || !validDateKey(config.startDayKey)) {
        return beforeGetTretinoinDays(dayKey);
      }

      const current = dateKeyToUtcDay(dayKey);
      const start = dateKeyToUtcDay(config.startDayKey);
      if (!Number.isFinite(current) || !Number.isFinite(start) || current < start) {
        return beforeGetTretinoinDays(dayKey);
      }

      if ((current - start) % 2 !== 0) return [];
      const dayName = typeof getRoutineDayName === "function"
        ? getRoutineDayName(dayKey)
        : ALL_DAYS[(typeof keyToLocalDate === "function" ? keyToLocalDate(dayKey) : new Date(`${dayKey}T12:00:00`)).getDay()];
      return dayName ? [dayName] : [];
    };
    wrapped.__sep17EveryOtherDay = true;
    getTretinoinDays = wrapped;
  }

  function refreshTretEveryOtherUi() {
    const button = document.getElementById("tretinoinEveryOtherDayBtn");
    if (!button) return;
    const active = isTretEveryOtherActive();
    button.classList.toggle("blue", active);
    button.classList.toggle("secondary", !active);
    const pressed = active ? "true" : "false";
    if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
    const buttonText = active ? "Every other day ✓" : "Every other day";
    if (button.textContent !== buttonText) button.textContent = buttonText;

    if (!active) return;
    const value = document.getElementById("tretinoinFrequencyValue");
    const label = document.getElementById("tretinoinFrequencyLabel");
    if (value && value.textContent !== "EOD") value.textContent = "EOD";
    if (label && label.textContent !== "Every other day") label.textContent = "Every other day";

    const config = tretEveryOtherConfig();
    const note = document.getElementById("tretinoinEveryOtherDayNote");
    if (note) {
      const start = config?.startDayKey || "";
      const text = start ? `Alternating schedule active from ${start}.` : "Alternating schedule active.";
      if (note.textContent !== text) note.textContent = text;
    }
  }

  function ensureTretEveryOtherUi() {
    const card = document.querySelector(".tretinoin-admin-card");
    const control = card?.querySelector(".tret-frequency-control");
    if (!card || !control) return false;

    let wrap = document.getElementById("tretinoinEveryOtherDayWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "tretinoinEveryOtherDayWrap";
      wrap.style.display = "grid";
      wrap.style.gap = "7px";
      wrap.style.marginTop = "12px";
      wrap.innerHTML = `
        <button class="btn secondary compact" id="tretinoinEveryOtherDayBtn" type="button" aria-pressed="false">Every other day</button>
        <p id="tretinoinEveryOtherDayNote" style="margin:0;color:var(--muted);font-size:.76rem;font-weight:800;line-height:1.4;">Use this instead of a fixed number of nights per week.</p>
      `;
      control.insertAdjacentElement("afterend", wrap);
      document.getElementById("tretinoinEveryOtherDayBtn")?.addEventListener("click", () => {
        setTretEveryOtherMode(!isTretEveryOtherActive());
      });

      ["tretinoinFrequencyDown", "tretinoinFrequencyUp"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", () => {
          if (isTretEveryOtherActive()) setTretEveryOtherMode(false);
        }, true);
      });
    }

    refreshTretEveryOtherUi();
    return true;
  }

  function installTretUiObserver() {
    ensureTretEveryOtherUi();
    const card = document.querySelector(".tretinoin-admin-card");
    if (!card || card.__sep17TretObserver) return;
    card.__sep17TretObserver = true;
    const observer = new MutationObserver(() => {
      requestAnimationFrame(() => {
        ensureTretEveryOtherUi();
        refreshTretEveryOtherUi();
      });
    });
    observer.observe(card, { childList: true, subtree: true, characterData: true });
  }

  /* -------------------------------------------------------------------- */
  /* GYM WEEKDAY SCHEDULE MIGRATION                                       */
  /* -------------------------------------------------------------------- */

  function applyRequestedGymSchedule() {
    if (typeof state === "undefined" || !state || typeof state !== "object") return false;
    state.meta = state.meta && typeof state.meta === "object" && !Array.isArray(state.meta) ? state.meta : {};
    state.meta.gymClean = state.meta.gymClean && typeof state.meta.gymClean === "object" && !Array.isArray(state.meta.gymClean)
      ? state.meta.gymClean
      : { version: 1, sessions: [] };

    if (state.meta[GYM_SCHEDULE_MIGRATION_KEY]) return false;
    state.meta.gymClean.schedule = { ...DESIRED_GYM_SCHEDULE };
    state.meta[GYM_SCHEDULE_MIGRATION_KEY] = true;
    return true;
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
      
      changed = applyRequestedGymSchedule() || changed;
      installTretEveryOtherScheduleLogic();
      if (changed) {
        persistSoon();
        try { if (typeof render === "function") render(); } catch (_) {}
      }
      ensureTretEveryOtherUi();
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
      if (!title.includes("treadmill") || meta.taskDetailsV3?.[task.id]) continue;
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
      if (!wasReversePecDeck) facePullRow.dataset.exercise = "Reverse Pec Deck";
      const label = facePullRow.querySelector(".clean-gym-exercise-name strong");
      if (label && label.textContent !== "Reverse Pec Deck") label.textContent = "Reverse Pec Deck";
      if (!wasReversePecDeck) {
        const dayKey = visibleGymDayKey();
        fillExerciseRow(facePullRow, exerciseForDay(dayKey, "Reverse Pec Deck"), previousExercise(dayKey, "Reverse Pec Deck"));
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
    installTretEveryOtherScheduleLogic();
    installTretUiObserver();
    protectGlucoseDuringRemoteApply();

    let changed = false;
    changed = recoverGlucoseHistory() || changed;
    changed = migrateExistingTreadmillTask() || changed;
    
    changed = applyRequestedGymSchedule() || changed;

    if (changed) {
      persistSoon();
      try { if (typeof render === "function") render(); } catch (_) {}
    }
    installGymDomObserver();
    ensureTretEveryOtherUi();
    queueGymDomPatch();

    /* Some existing LOCKED OS patches install their own wrappers on a zero-delay
       timer. Re-assert this final layer after those have finished. */
    setTimeout(() => {
      installRecurrenceFilter();
      installEveryOtherDayModalOption();
      installTretEveryOtherScheduleLogic();
      installTretUiObserver();
      protectGlucoseDuringRemoteApply();
      let laterChanged = false;
      laterChanged = recoverGlucoseHistory() || laterChanged;
      laterChanged = migrateExistingTreadmillTask() || laterChanged;
      
      laterChanged = applyRequestedGymSchedule() || laterChanged;
      if (laterChanged) {
        persistSoon();
        try { if (typeof render === "function") render(); } catch (_) {}
      }
      ensureTretEveryOtherUi();
      queueGymDomPatch();
    }, 0);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", installFinalPatchLayer);
  } else {
    installFinalPatchLayer();
  }
})();

/* October 2026: one sync owner, full task editor, and exercise progress. */
(() => {
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const BASE_KEY = 'locked_os_sync_base_v3';
  const DIRTY_KEY = 'locked_os_supabase_dirty_clean';
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const previousSave = (read('locked_os_recovery_snapshots_clean') || []).find(entry => entry.label === 'saved-to-supabase');
  let recoveredBase = null;
  try { recoveredBase = previousSave?.state || JSON.parse(previousSave?.serialized || 'null'); } catch {}
  const storedBase = read(BASE_KEY);
  let base = storedBase || (window.lockedOsInitiallyDirty ? recoveredBase || {} : copy(state));
  let earlyUserEdit = false;
  document.addEventListener('click', event => { if (!ready && event.target.closest('.task-main,.task-menu-action')) earlyUserEdit = true; }, true);
  let diskSnapshot = read(STORAGE_KEY) || copy(state);
  let busy = false, refreshing = false, retry = null, deferredRender = false;
  let ready = false;
  let baseTimestamp = '';

  // Three-way merge applies only edits made since this device's last confirmed
  // cloud snapshot. Sets merge per member; entity arrays merge per id/date.
  function merge(before, local, remote, path = []) {
    if (equal(local, before)) return copy(remote);
    if (equal(remote, before) || equal(local, remote)) return copy(local);
    if (Array.isArray(local) && Array.isArray(remote)) {
      const prior = Array.isArray(before) ? before : [];
      if ([...prior, ...local, ...remote].every(x => typeof x === 'string' || typeof x === 'number')) {
        const removed = new Set(prior.filter(x => !local.includes(x)));
        return [...new Set([...remote.filter(x => !removed.has(x)), ...local.filter(x => !prior.includes(x))])];
      }
      const identity = x => object(x) ? (path.at(-1) === 'sessions' ? x.date || x.id : x.id || x.date || x.dayKey || x.name) : null;
      if ([...prior, ...local, ...remote].every(x => identity(x))) {
        const b = new Map(prior.map(x => [identity(x), x]));
        const l = new Map(local.map(x => [identity(x), x]));
        const r = new Map(remote.map(x => [identity(x), x]));
        return [...new Set([...r.keys(), ...l.keys()])].map(key => merge(b.get(key), l.get(key), r.get(key), [...path, key])).filter(x => x !== undefined);
      }
      return copy(local);
    }
    if (object(local) && object(remote)) {
      const result = {};
      for (const key of new Set([...Object.keys(before || {}), ...Object.keys(local), ...Object.keys(remote)])) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        const value = merge(before?.[key], local[key], remote[key], [...path, key]);
        if (value !== undefined) result[key] = value;
      }
      // A task has exactly one status. A changed local status wins conflicts
      // on that task, without dropping other tasks changed on another device.
      for (const [doneKey, skipKey] of [['looksDone','looksSkipped'], ['lockedOsDone','lockedOsSkipped'], ['done','skipped']]) {
        if (!Array.isArray(result[doneKey])) continue;
        const status = (day, id) => day?.[doneKey]?.includes(id) ? 'done' : day?.[skipKey]?.includes(id) ? 'skip' : '';
        const ids = new Set([...(before?.[doneKey] || []), ...(before?.[skipKey] || []), ...(local[doneKey] || []), ...(local[skipKey] || [])]);
        for (const id of ids) {
          if (status(before,id) === status(local,id)) continue;
          result[doneKey] = result[doneKey].filter(x => x !== id);
          result[skipKey] = (result[skipKey] || []).filter(x => x !== id);
          if (status(local,id) === 'done') result[doneKey].push(id);
          if (status(local,id) === 'skip') result[skipKey].push(id);
        }
        result[skipKey] = (result[skipKey] || []).filter(id => !result[doneKey].includes(id));
      }
      return result;
    }
    return copy(local);
  }
  window.lockedOsMergeState = merge;

  function persist() {
    try {
      const disk = read(STORAGE_KEY);
      if (disk && !equal(disk, diskSnapshot)) state = merge(base, state, disk);
      diskSnapshot = copy(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(BASE_KEY, JSON.stringify(base));
      return true;
    } catch (error) {
      console.error('Local save failed', error);
      if (syncStatus) syncStatus.textContent = 'Device storage is full. Keep this tab open until cloud sync finishes.';
      return false;
    }
  }
  function pending() { return !equal(state, base); }
  function editing() {
    return document.querySelector('dialog[open], .looks-task-modal-backdrop, .task-row.editing, .task-menu[open]') ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || window.lockedOsGymDraftDirty;
  }
  function repaint() {
    if (mainApp.classList.contains('hidden')) return;
    if (editing() || window.lockedOsPointerDown) { deferredRender = true; return; }
    deferredRender = false;
    render();
    window.lockedOsRenderGymProgress?.();
  }
  function receive(remote, timestamp = '') {
    if (!object(remote)) return false;
    const before = copy(state);
    const disk = read(STORAGE_KEY);
    if (disk && !equal(disk, diskSnapshot)) { state = merge(base, state, disk); diskSnapshot = copy(disk); }
    state = merge(base, state, remote);
    base = copy(remote);
    baseTimestamp = timestamp;
    normalizeState();
    persist();
    if (pending()) localStorage.setItem(DIRTY_KEY, '1');
    else localStorage.removeItem(DIRTY_KEY);
    if (!equal(before,state)) repaint();
    return true;
  }
  async function fetchRow() {
    if (!supabaseClient) throw new Error('Cloud connection unavailable');
    const {data,error} = await supabaseClient.from(SUPABASE_TABLE).select('state, updated_at').eq('id',SUPABASE_ROW_ID).maybeSingle();
    if(error) throw error;
    return data;
  }
  function retryLater() {
    clearTimeout(retry);
    retry = setTimeout(() => { retry = null; if (!mainApp.classList.contains('hidden')) refresh(); }, 5000);
  }
  async function save() {
    if (!ready || mainApp.classList.contains('hidden')) return false;
    if (busy) { supabaseSaveQueued = true; return false; }
    if (!pending()) return true;
    busy = supabaseSaveInFlight = true;
    clearTimeout(saveTimer); saveTimer = null;
    let success = false;
    try {
      if (syncStatus) syncStatus.textContent = 'Syncing changes…';
      for (let attempt = 0; attempt < 5; attempt++) {
        const remote = await fetchRow();
        if (remote?.state) receive(remote.state,remote.updated_at);
        const snapshot = copy(state);
        if (!pending() && remote) { success = true; break; }
        const timestamp = new Date(Math.max(Date.now(), Date.parse(remote?.updated_at || '') + 1 || 0)).toISOString();
        const payload = { id: SUPABASE_ROW_ID, state: snapshot, updated_at: timestamp };
        // Compare-and-swap makes two simultaneous saves retry instead of
        // silently overwriting each other. Uses the existing table schema.
        const result = remote
          ? await supabaseClient.from(SUPABASE_TABLE).update(payload).eq('id',SUPABASE_ROW_ID).eq('updated_at',remote.updated_at).select('updated_at')
          : await supabaseClient.from(SUPABASE_TABLE).insert(payload).select('updated_at');
        if (result.error) {
          if (!remote && result.error.code === '23505') continue;
          throw result.error;
        }
        if (!result.data?.length) continue;
        base = snapshot;
        baseTimestamp = timestamp;
        latestSupabaseWriteAt = timestamp;
        syncedRevision = localRevision;
        persist();
        success = true;
        break;
      }
      if (!success) throw new Error('Concurrent save; retrying');
      if (!pending()) localStorage.removeItem(DIRTY_KEY);
      if (syncStatus) syncStatus.textContent = pending() ? 'Syncing newer changes…' : 'Synced across devices.';
      return true;
    } catch(error) {
      console.warn('Sync will retry:', error.message || error);
      persist();
      localStorage.setItem(DIRTY_KEY,'1');
      if (syncStatus) syncStatus.textContent = 'Saved on this device. Waiting to sync…';
      retryLater();
      return false;
    } finally {
      busy = supabaseSaveInFlight = false;
      supabaseSaveQueued = false;
      if (success && pending()) queueSupabaseSave(0);
    }
  }
  async function refresh() {
    if (!ready || refreshing || busy || mainApp.classList.contains('hidden')) return false;
    refreshing = true;
    try {
      const row = await fetchRow();
      if (row?.state) receive(row.state,row.updated_at);
      if (!row) { base = {}; persist(); }
      if (pending() || !row) { refreshing = false; return await save(); }
      if(syncStatus) syncStatus.textContent = 'Synced across devices.';
      return true;
    } catch(error) {
      if(syncStatus) syncStatus.textContent = 'Saved on this device. Waiting to sync…';
      retryLater();
      return false;
    } finally { refreshing = false; }
  }
  function installSync() {
    saveLocalState = persist;
    hasPendingLocalChanges = () => busy || pending();
    saveState = function() {
      localRevision++;
      localStorage.setItem(DIRTY_KEY,'1');
      persist();
      queueSupabaseSave();
      window.lockedOsRenderGymProgress?.();
    };
    queueSupabaseSave = function(delay = 180) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {saveTimer=null; save();},delay);
    };
    saveSupabaseState = save;
    refreshSupabaseState = refresh;
    loadSupabaseState = refresh;
    fetchSupabaseState = async () => { try {return {ok:true,row:await fetchRow()};}catch(error){return {ok:false,row:null,error};} };
    applyRemoteState = (remote, message, options = {}) => receive(remote, options.updatedAt || '');
    // Polling works even when Realtime replication is not enabled on the table.
    subscribeToSupabaseState = () => {};
  }
  installSync();
  window.addEventListener('online',refresh);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') refresh();
    else {persist(); if(pending()) save();}
  });
  document.addEventListener('pointerdown',()=>{window.lockedOsPointerDown=true;},true);
  const release = () => {window.lockedOsPointerDown=false; setTimeout(()=>{if(deferredRender)repaint();},200);};
  document.addEventListener('pointerup',release,true);
  document.addEventListener('pointercancel',release,true);
  document.addEventListener('focusout',()=>setTimeout(()=>{if(deferredRender)repaint();},100));
  window.addEventListener('storage',event=>{
    if(event.key===STORAGE_KEY && event.newValue && !mainApp.classList.contains('hidden')) {
      try {
        const incoming = read(STORAGE_KEY);
        if (!incoming) return;
        const merged = merge(base, state, incoming);
        diskSnapshot = copy(incoming);
        if (!equal(merged,state)) { state=merged; repaint(); }
        queueSupabaseSave(0);
      } catch(error) { console.warn('Could not read another tab update',error); }
    }
  });
  setInterval(()=>{
    if(document.visibilityState==='visible') { refresh(); if(deferredRender)repaint(); }
  },5000);

  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && formatDateKey(keyToLocalDate(value))===value;
  function appears(task,dayKey) {
    const schedule = task.schedule;
    if(!schedule) return true;
    if(schedule.start && dayKey<schedule.start) return false;
    if(schedule.end && dayKey>schedule.end) return false;
    if(schedule.type==='once') return dayKey===schedule.start;
    if(schedule.type==='everyOtherDay') return (keyToUtcDayNumber(dayKey)-keyToUtcDayNumber(schedule.start))%2===0;
    if(schedule.type==='weekly') return schedule.days.includes(getRoutineDayName(dayKey));
    return true;
  }
  window.lockedOsTaskAppears=appears;
  window.lockedOsUpdateTaskRow=(row,done,skipped)=>{
    row.classList.toggle('done',done); row.classList.toggle('skipped',skipped);
    const main=row.querySelector('.task-main'); main?.setAttribute('aria-pressed',String(done));
    const box=row.querySelector('.task-box'); if(box)box.textContent=done?'✓':skipped?'−':'';
    row.querySelector('.task-status')?.remove();
    if(skipped){const status=document.createElement('div'); status.className='task-status'; status.textContent='Skipped'; row.querySelector('.task-copy')?.append(status);}
    const skip=row.querySelector('.task-menu-action:not(.edit-action):not(.info-action):not(.add-action):not(.delete-action)');
    if(skip && /skip/i.test(skip.textContent))skip.textContent=skipped?'Unskip task':'Skip this task';
  };

  function editor(task,looks,onSave) {
    document.getElementById('taskEditorV3')?.close();
    document.getElementById('taskEditorV3')?.remove();
    const restoreFocus=document.activeElement;
    const details=looks ? state.meta.taskDetailsV3?.[task.id] || {} : task;
    const legacy=state.meta.customTaskRecurrenceV1?.[task.id];
    const schedule=details.schedule || (legacy ? {type:'everyOtherDay',start:legacy.startDayKey,days} : {type:task.days?.length<7?'weekly':'daily',start:'',end:'',days:task.days||state.meta.customTaskSchedules?.[task.id]||days});
    const sections=looks?['morning','midday','night']:['morning','afternoon','night'];
    const dialog=document.createElement('dialog'); dialog.id='taskEditorV3'; dialog.className='task-editor-v3';
    dialog.innerHTML=`<form method="dialog" id="taskEditorForm"><div class="task-editor-head"><h2>${task.id?'Edit task':'Add task'}</h2><button type="button" id="taskEditorClose" aria-label="Close">×</button></div>
      <label>Task name<input id="taskEditorName" required maxlength="160" autocomplete="off"></label>
      <label>Notes<textarea id="taskEditorNotes" rows="3" maxlength="4000" placeholder="Details or reminders"></textarea></label>
      <div class="task-editor-grid"><label>Section<select id="taskEditorSection">${sections.map(s=>`<option value="${s}">${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}</select></label>
      <label>Repeat<select id="taskEditorRepeat"><option value="daily">Every day</option><option value="once">One date only</option><option value="weekly">Selected weekdays</option><option value="everyOtherDay">Every other day</option></select></label></div>
      <div class="task-editor-grid"><label><span id="taskEditorDateLabel">Start date (optional)</span><input id="taskEditorStart" type="date"></label><label id="taskEditorEndLabel">End date (optional)<input id="taskEditorEnd" type="date"></label></div>
      <fieldset id="taskEditorDays"><legend>Show on these days</legend>${days.map((d,i)=>`<label><input type="checkbox" value="${d}"><span>${d.slice(0,3)}</span></label>`).join('')}</fieldset>
      <p id="taskEditorError" role="alert"></p><div class="task-editor-actions"><button type="button" class="btn secondary" id="taskEditorCancel">Cancel</button><button type="submit" class="btn blue">${task.id?'Save changes':'Add task'}</button></div></form>`;
    document.body.append(dialog);
    const el=id=>dialog.querySelector('#'+id);
    el('taskEditorName').value=task.title||'';
    el('taskEditorNotes').value=looks?state.meta.looksTaskInfo?.[task.id]||'':task.notes||'';
    el('taskEditorSection').value=details.section||task.section||sections[0];
    el('taskEditorRepeat').value=schedule.type;
    el('taskEditorStart').value=schedule.start||'';
    el('taskEditorEnd').value=schedule.end||'';
    dialog.querySelectorAll('[type=checkbox]').forEach(input=>input.checked=(schedule.days||days).includes(input.value));
    function update(){const type=el('taskEditorRepeat').value; el('taskEditorDays').hidden=type!=='weekly'; el('taskEditorStart').required=['once','everyOtherDay'].includes(type); el('taskEditorDateLabel').textContent=type==='once'?'Date':type==='everyOtherDay'?'Start date':'Start date (optional)'; el('taskEditorEndLabel').hidden=type==='once';}
    el('taskEditorRepeat').onchange=update; update();
    const close=()=>dialog.close();
    el('taskEditorClose').onclick=close;el('taskEditorCancel').onclick=close;
    dialog.addEventListener('close',()=>{dialog.remove(); if(restoreFocus?.isConnected)restoreFocus.focus(); if(deferredRender)repaint();});
    el('taskEditorForm').onsubmit=event=>{
      event.preventDefault();
      const title=el('taskEditorName').value.trim();
      const type=el('taskEditorRepeat').value,start=el('taskEditorStart').value,end=type==='once'?'':el('taskEditorEnd').value;
      const selected=[...dialog.querySelectorAll('[type=checkbox]:checked')].map(x=>x.value);
      let error='';
      if(!title)error='Enter a task name.';
      else if((start&&!validDate(start))||(end&&!validDate(end)))error='Choose a valid date.';
      else if(['once','everyOtherDay'].includes(type)&&!start)error='Choose a start date.';
      else if(end&&start&&end<start)error='The end date must be on or after the start date.';
      else if(type==='weekly'&&!selected.length)error='Select at least one weekday.';
      if(error){el('taskEditorError').textContent=error;return;}
      const value={title,notes:el('taskEditorNotes').value.trim(),section:el('taskEditorSection').value,schedule:{type,start,end,days:selected}};
      close();onSave(value);toast(task.id?'Task updated.':'Task added.');
    };
    dialog.showModal();el('taskEditorName').focus();
  }
  window.lockedOsTaskEditor=editor;

  function installTasks(){
    // Add/edit share the same form and store schedule metadata outside legacy
    // custom-task normalizers so dates survive reload and cloud sync.
    const oldRoutine=getLooksRoutine;
    getLooksRoutine=function(dayKey=getTodayKey()){
      const routine=oldRoutine(dayKey), overrides=state.meta.taskDetailsV3||{};
      const result={morning:[],midday:[],night:[]}, seen=new Set();
      for(const section of Object.keys(result))for(const task of routine[section]||[]){
        const details=overrides[task.id];
        if(details&&!appears(details,dayKey))continue;
        const destination=details?.section||section;
        if(result[destination]){result[destination].push(task);seen.add(task.id);}
      }
      // Rescheduling a built-in task must also allow dates outside its original
      // weekday schedule. Keep its identity and completion history.
      for(const [id,details] of Object.entries(overrides)){
        if(seen.has(id)||!details.task||!appears(details,dayKey)||state.meta.looksDeletedTaskIds?.includes(id))continue;
        result[details.section]?.push({...details.task,id,title:state.meta.looksTaskEdits?.[id]||details.task.title});
      }
      return result;
    };
    const oldRow=createTaskRow;
    createTaskRow=function(task,done,skipped,theme,onToggle,onSkip,onEdit,controls={}){
      const row=oldRow(task,done,skipped,theme,onToggle,onSkip,onEdit,controls);
      row.querySelector('.task-main')?.setAttribute('aria-pressed',String(done));
      if(theme==='looks-task'){
        const edit=row.querySelector('.edit-action');
        if(edit){const button=edit.cloneNode(true);edit.replaceWith(button);button.onclick=()=>{
          row.querySelector('details').open=false;
          editor({...task,section:controls.section},true,details=>{
            state.meta.taskDetailsV3 ||= {};
            state.meta.taskDetailsV3[task.id]={...details,task:{...task,section:controls.section}};
            state.meta.looksTaskEdits[task.id]=details.title;
            state.meta.looksTaskInfo ||= {};state.meta.looksTaskInfo[task.id]=details.notes;
            const custom=state.meta.looksCustomTasks.find(t=>t.id===task.id);
            if(custom){custom.days=[...days];custom.section=details.section;}
            state.meta.customTaskSchedules ||= {};state.meta.customTaskSchedules[task.id]=[...days];
            if(state.meta.customTaskRecurrenceV1)delete state.meta.customTaskRecurrenceV1[task.id];
            saveState();render();
          });
        };}
      }
      return row;
    };
    startInlineTaskAdd=function(row,menu,section,afterTaskId,onAdd){
      menu.open=false;
      editor({title:'',section},true,details=>{
        const ids=new Set(state.meta.looksCustomTasks.map(t=>t.id));
        onAdd(details.section,details.title,afterTaskId,days);
        const task=state.meta.looksCustomTasks.find(t=>!ids.has(t.id));
        if(task){state.meta.taskDetailsV3 ||= {};state.meta.taskDetailsV3[task.id]={...details,task:copy(task)};state.meta.looksTaskInfo ||= {};state.meta.looksTaskInfo[task.id]=details.notes;saveState();render();}
      });
    };
    setLooksStatus=function(task,kind){
      const key=typeof lockedOsLooksKey==='function'?lockedOsLooksKey():getTodayKey();
      const day=ensureDay(key),done=new Set(day.looksDone),skipped=new Set(day.looksSkipped);
      if(kind==='done'){if(done.has(task.id))done.delete(task.id);else{done.add(task.id);skipped.delete(task.id);}}
      else {if(skipped.has(task.id))skipped.delete(task.id);else{skipped.add(task.id);done.delete(task.id);}}
      if(task.meta==='morningWater'&&done.has(task.id))day.waterOz=Math.max(day.waterOz,LOOKS_MORNING_WATER_OZ);
      day.looksDone=[...done];day.looksSkipped=[...skipped];syncWaterTask(day,key);
      day.looksCompleted=getResolvedSet(day,'looks').size===getLooksTaskIds(key).length;
      saveState();
      document.querySelectorAll('.looks-task').forEach(row=>{if(row.dataset.taskId===task.id)window.lockedOsUpdateTaskRow(row,done.has(task.id),skipped.has(task.id));});
      refreshLooksProgressUI();renderDayStreak();renderWater();
    };
  }

  function progressData(exercise,metric,range){
    const cutoff=range==='all'?'0000-00-00':formatDateKey(addDays(keyToLocalDate(getTodayKey()),-Number(range)+1));
    const sessions=state.meta.gymClean?.sessions||[];
    return sessions.filter(s=>s.date>=cutoff && s.date<=getTodayKey()).sort((a,b)=>a.date.localeCompare(b.date)).flatMap(session=>{
      const sets=session.exercises?.filter(e=>e.name===exercise).flatMap(e=>e.sets||[]).filter(s=>Number.isFinite(Number(s.weight))&&Number(s.weight)>0&&Number.isFinite(Number(s.reps))&&Number(s.reps)>0)||[];
      if(!sets.length)return [];
      const value=metric==='volume'?sets.reduce((v,s)=>v+Number(s.weight)*Number(s.reps),0):Math.max(...sets.map(s=>Number(s.weight)));
      return [{dayKey:session.date,value,detail:sets.map(s=>`${s.weight} × ${s.reps}`).join(' · ')}];
    });
  }
  window.lockedOsGymProgressData=progressData;
  function renderProgress(){
    const page=document.getElementById('gymPage');if(!page)return;
    let panel=document.getElementById('gymProgressV3');
    if(!panel){panel=document.createElement('section');panel.id='gymProgressV3';panel.className='clean-gym-panel gym-progress-v3';panel.innerHTML=`<h3>Exercise progress</h3><p>Compare your saved working sets over time. Incomplete sets are excluded.</p><div class="gym-progress-controls"><label>Exercise<select id="gymProgressExercise"></select></label><label>Metric<select id="gymProgressMetric"><option value="weight">Heaviest working set (lb)</option><option value="volume">Total volume (lb × reps)</option></select></label><label>Range<select id="gymProgressRange"><option value="30">30 days</option><option value="90">90 days</option><option value="all">All time</option></select></label></div><p id="gymProgressSummary" aria-live="polite"></p><div class="weight-chart" id="gymProgressChart"></div><details><summary>View data</summary><div id="gymProgressTable"></div></details>`;page.append(panel);panel.querySelectorAll('select').forEach(s=>s.onchange=renderProgress);}
    const selector=document.getElementById('gymProgressExercise');
    const names=[...new Set((state.meta.gymClean?.sessions||[]).flatMap(s=>(s.exercises||[]).map(e=>e.name)).concat([...document.querySelectorAll('#cleanGymWorkoutBody .clean-gym-exercise')].map(r=>r.dataset.exercise)).filter(Boolean))].sort();
    const selected=selector.value;
    const signature=JSON.stringify(names);
    if(selector.dataset.names!==signature){selector.innerHTML=names.map(n=>`<option>${escapeHtml(n)}</option>`).join('');selector.dataset.names=signature;if(names.includes(selected))selector.value=selected;}
    const metric=document.getElementById('gymProgressMetric').value;
    const entries=progressData(selector.value,metric,document.getElementById('gymProgressRange').value);
    const unit=metric==='volume'?'lb × reps':'lb';
    renderMetricChart({chartId:'gymProgressChart',entries,valueKey:'value',unit,decimals:1,emptyText:'Save a workout with weight and reps to see your progress.',tooltipDetail:e=>e.detail});
    const first=entries[0]?.value,last=entries.at(-1)?.value;
    document.getElementById('gymProgressSummary').textContent=entries.length?`${entries.length} session${entries.length===1?'':'s'} · Latest: ${last.toFixed(1)} ${unit}${entries.length>1?` · Change: ${last-first>=0?'+':''}${(last-first).toFixed(1)} ${unit}`:' · Log another session to compare.'}`:'';
    document.getElementById('gymProgressTable').innerHTML=entries.length?`<table><thead><tr><th>Date</th><th>${metric==='volume'?'Volume':'Heaviest set'}</th><th>Sets</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${e.dayKey}</td><td>${e.value.toFixed(1)} ${unit}</td><td>${escapeHtml(e.detail)}</td></tr>`).join('')}</tbody></table>`:'No logged sets yet.';
  }
  window.lockedOsRenderGymProgress=renderProgress;
  document.addEventListener('locked-os-workout-saved',()=>{window.lockedOsGymDraftDirty=false;setTimeout(renderProgress,0);});
  document.addEventListener('input',e=>{if(e.target.closest('#cleanGymWorkoutBody'))window.lockedOsGymDraftDirty=true;});
  document.addEventListener('click',e=>{if(e.target.closest('#cleanGymPrev,#cleanGymNext,#cleanGymToday,[data-gym-strip-date]'))window.lockedOsGymDraftDirty=false;});
  // Legacy layers finish their one-time installation at 225 ms.
  setTimeout(()=>{
    installSync(); installTasks();
    if (!storedBase && !window.lockedOsInitiallyDirty && !earlyUserEdit) base = copy(state);
    ready=true;
    const header = mainApp.querySelector("header") || mainApp.firstElementChild;
    if (header && syncStatus) {
      const strip = document.createElement("div"); strip.className = "sync-strip-v3";
      syncStatus.setAttribute("role", "status");
      const retryButton = document.createElement("button"); retryButton.type = "button"; retryButton.textContent = "Sync now";
      retryButton.onclick = refresh; strip.append(syncStatus, retryButton); header.insertAdjacentElement("afterend", strip);
    }
    const oldRender=render;render=function(){oldRender();renderProgress();};
    repaint();refresh();
  },350);
})();
