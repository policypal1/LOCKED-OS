"use strict";

/*
  Locked OS add-on: Appointments + Forums
  Drop this file in the repo root and load it after ghk-cu.js:
  <script defer src="locked-os-features.js"></script>
*/

(() => {
  const FEATURE_VERSION = 1;
  const APPOINTMENT_SEED_VERSION = 1;

  const DEFAULT_APPOINTMENTS = [
    {
      id: "appt-dermatologist-2026-09-12",
      title: "Dermatologist",
      date: "2026-09-12",
      time: "10:00",
      notes: "Dermatology appointment"
    },
    {
      id: "appt-orthodontist-2026-10-15",
      title: "Orthodontist",
      date: "2026-10-15",
      time: "15:00",
      notes: "Maxilla consultation"
    }
  ];

  let appointmentEditId = null;

  function safeText(value, max = 2000) {
    return String(value ?? "").trim().slice(0, max);
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function validDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function validTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
  }

  function normalizeUrl(raw) {
    const value = safeText(raw, 1000);
    if (!value) return "";
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) return "";
      return url.toString();
    } catch {
      try {
        const url = new URL(`https://${value}`);
        if (!["http:", "https:"].includes(url.protocol)) return "";
        return url.toString();
      } catch {
        return "";
      }
    }
  }

  function getHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "Link";
    }
  }

  function getYouTubeId(rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!url) return "";

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      let id = "";

      if (host === "youtu.be") {
        id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
        if (parsed.pathname === "/watch") {
          id = parsed.searchParams.get("v") || "";
        } else {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (["shorts", "embed", "live"].includes(parts[0])) id = parts[1] || "";
        }
      }

      return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : "";
    } catch {
      return "";
    }
  }

  function ensureFeatureState() {
    if (typeof state !== "object" || !state) return false;

    state.meta = state.meta && typeof state.meta === "object" ? state.meta : {};

    if (!Array.isArray(state.meta.appointments)) {
      state.meta.appointments = [];
    }

    if (state.meta.appointmentSeedVersion !== APPOINTMENT_SEED_VERSION) {
      const existingIds = new Set(state.meta.appointments.map(item => item?.id));
      for (const appointment of DEFAULT_APPOINTMENTS) {
        if (!existingIds.has(appointment.id)) {
          state.meta.appointments.push({ ...appointment });
        }
      }
      state.meta.appointmentSeedVersion = APPOINTMENT_SEED_VERSION;
    }

    state.meta.appointments = state.meta.appointments
      .filter(item => item && typeof item === "object")
      .map(item => ({
        id: safeText(item.id, 120) || makeId("appt"),
        title: safeText(item.title, 120) || "Appointment",
        date: validDateKey(item.date) ? item.date : "",
        time: validTime(item.time) ? item.time : "",
        notes: safeText(item.notes, 500)
      }))
      .filter(item => item.date);

    if (!state.meta.forumHub || typeof state.meta.forumHub !== "object" || Array.isArray(state.meta.forumHub)) {
      state.meta.forumHub = { resources: [], guides: [] };
    }

    if (!Array.isArray(state.meta.forumHub.resources)) {
      state.meta.forumHub.resources = [];
    }
    if (!Array.isArray(state.meta.forumHub.guides)) {
      state.meta.forumHub.guides = [];
    }

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

    state.meta.forumHub.guides = state.meta.forumHub.guides
      .filter(item => item && typeof item === "object")
      .map(item => ({
        id: safeText(item.id, 120) || makeId("guide"),
        title: safeText(item.title, 160) || "Untitled guide",
        content: String(item.content ?? "").slice(0, 20000),
        updatedAt: safeText(item.updatedAt, 80) || new Date().toISOString()
      }));

    state.meta.lockedOsFeatureVersion = FEATURE_VERSION;
    return true;
  }

  function persist() {
    ensureFeatureState();
    if (typeof saveState === "function") saveState();
    else if (typeof saveLocalState === "function") saveLocalState();
  }

  function installMeaningfulStateSupport() {
    if (typeof hasMeaningfulState !== "function" || hasMeaningfulState.__lockedOsFeatureWrapped) return;

    const base = hasMeaningfulState;
    const wrapped = function hasMeaningfulStateWithFeatures(snapshot) {
      if (base(snapshot)) return true;
      return (
        Array.isArray(snapshot?.meta?.appointments) && snapshot.meta.appointments.length > 0
      ) || (
        Array.isArray(snapshot?.meta?.forumHub?.resources) && snapshot.meta.forumHub.resources.length > 0
      ) || (
        Array.isArray(snapshot?.meta?.forumHub?.guides) && snapshot.meta.forumHub.guides.length > 0
      );
    };
    wrapped.__lockedOsFeatureWrapped = true;
    hasMeaningfulState = wrapped;
  }

  function injectStyles() {
    if (document.getElementById("lockedOsFeatureStyles")) return;

    const style = document.createElement("style");
    style.id = "lockedOsFeatureStyles";
    style.textContent = `
      .forums-tab {
        border: 1px solid rgba(126, 87, 194, .24);
      }

      .forums-page {
        display: grid;
        gap: 16px;
      }

      .forums-hero,
      .appointments-hero {
        padding: 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        background:
          radial-gradient(circle at top right, rgba(126, 87, 194, .14), transparent 19rem),
          rgba(255,250,241,.86);
      }

      .forums-hero h2,
      .appointments-hero h2,
      .forums-page h3,
      .appointments-panel h3 {
        margin: 0;
        letter-spacing: -.035em;
      }

      .forums-hero h2,
      .appointments-hero h2 {
        font-size: clamp(2rem, 5vw, 3.1rem);
      }

      .forums-hero p:not(.eyebrow),
      .appointments-hero p:not(.eyebrow) {
        margin: 9px 0 0;
        color: var(--muted);
        font-weight: 750;
        line-height: 1.5;
        max-width: 720px;
      }

      .forums-hero-badge,
      .appointment-next-badge {
        padding: 12px 16px;
        border-radius: 999px;
        background: rgba(126, 87, 194, .11);
        color: #6140a1;
        font-weight: 950;
        white-space: nowrap;
      }

      .forums-grid {
        display: grid;
        grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
        gap: 16px;
        align-items: start;
      }

      .forums-stack {
        display: grid;
        gap: 16px;
      }

      .feature-card {
        padding: 20px;
      }

      .feature-card .panel-title {
        align-items: flex-start;
      }

      .feature-card-copy {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: .9rem;
        font-weight: 700;
        line-height: 1.45;
      }

      .feature-form {
        display: grid;
        gap: 11px;
        margin-top: 16px;
      }

      .feature-field {
        display: grid;
        gap: 6px;
      }

      .feature-field > span {
        color: var(--muted);
        font-size: .78rem;
        font-weight: 900;
      }

      .feature-field input,
      .feature-field select,
      .feature-field textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 13px;
        background: rgba(255,255,255,.58);
        color: var(--text);
        font: inherit;
        font-weight: 750;
        outline: none;
        padding: 11px 12px;
      }

      .feature-field textarea {
        min-height: 112px;
        resize: vertical;
        line-height: 1.5;
      }

      .feature-field input:focus,
      .feature-field select:focus,
      .feature-field textarea:focus {
        border-color: rgba(37,132,184,.55);
        box-shadow: 0 0 0 3px rgba(37,132,184,.10);
      }

      .feature-two-col {
        display: grid;
        grid-template-columns: repeat(2, minmax(0,1fr));
        gap: 10px;
      }

      .feature-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .feature-status {
        min-height: 18px;
        margin: 0;
        color: var(--muted);
        font-size: .82rem;
        font-weight: 800;
      }

      .feature-status.good { color: #2f8f56; }
      .feature-status.bad { color: #a2372a; }

      .resource-list,
      .guide-list,
      .appointment-list {
        display: grid;
        gap: 12px;
        margin-top: 14px;
      }

      .resource-card,
      .guide-card,
      .appointment-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: rgba(255,255,255,.42);
        overflow: hidden;
      }

      .resource-card-body,
      .guide-card-body,
      .appointment-card-body {
        padding: 15px;
      }

      .resource-card-head,
      .guide-card-head,
      .appointment-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      .resource-card-head h4,
      .guide-card-head h4,
      .appointment-card-head h4 {
        margin: 0;
        font-size: 1rem;
        line-height: 1.25;
      }

      .resource-meta,
      .guide-meta,
      .appointment-meta {
        margin-top: 5px;
        color: var(--muted);
        font-size: .78rem;
        font-weight: 800;
      }

      .resource-note,
      .guide-content,
      .appointment-notes {
        margin: 10px 0 0;
        color: var(--muted);
        font-size: .88rem;
        font-weight: 700;
        line-height: 1.5;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .resource-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 11px;
        color: #176a98;
        font-size: .84rem;
        font-weight: 900;
        text-decoration: none;
      }

      .resource-link:hover { text-decoration: underline; }

      .resource-embed {
        aspect-ratio: 16 / 9;
        background: #111;
      }

      .resource-embed iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
      }

      .resource-type-pill {
        flex: 0 0 auto;
        padding: 5px 9px;
        border-radius: 999px;
        background: rgba(37,132,184,.09);
        color: var(--blue-dark);
        font-size: .7rem;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: .03em;
      }

      .resource-type-pill.forum {
        background: rgba(126,87,194,.11);
        color: #6140a1;
      }

      .resource-type-pill.video {
        background: rgba(182,66,66,.09);
        color: #9d342e;
      }

      .feature-mini-btn {
        appearance: none;
        border: 0;
        border-radius: 10px;
        padding: 7px 10px;
        background: rgba(42,30,18,.07);
        color: var(--text);
        font: inherit;
        font-size: .76rem;
        font-weight: 900;
        cursor: pointer;
      }

      .feature-mini-btn:hover { background: rgba(42,30,18,.12); }
      .feature-mini-btn.danger { color: #a2372a; }

      .card-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .feature-empty {
        padding: 22px 16px;
        border: 1px dashed var(--line);
        border-radius: 16px;
        color: var(--muted);
        text-align: center;
        font-size: .86rem;
        font-weight: 800;
      }

      .forums-source-note {
        margin: 0;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(126,87,194,.07);
        color: var(--muted);
        font-size: .82rem;
        font-weight: 750;
        line-height: 1.45;
      }

      .appointments-panel {
        display: grid;
        gap: 16px;
      }

      .appointment-date-block {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 12px;
        align-items: center;
      }

      .appointment-date-chip {
        width: 54px;
        min-height: 58px;
        border-radius: 15px;
        display: grid;
        place-items: center;
        align-content: center;
        background: rgba(37,132,184,.09);
        color: var(--blue-dark);
      }

      .appointment-date-chip strong {
        font-size: 1.25rem;
        line-height: 1;
      }

      .appointment-date-chip span {
        margin-top: 3px;
        font-size: .67rem;
        font-weight: 950;
        text-transform: uppercase;
      }

      .appointment-countdown {
        display: inline-block;
        margin-top: 8px;
        color: #2f8f56;
        font-size: .78rem;
        font-weight: 900;
      }

      .appointment-card.past {
        opacity: .62;
      }

      .appointment-card.past .appointment-countdown {
        color: var(--muted);
      }

      .admin-subtab.appointments-subtab {
        color: var(--muted);
      }

      .admin-subtab.appointments-subtab.active {
        background: var(--text);
        color: var(--card);
      }

      @media (max-width: 900px) {
        .forums-grid { grid-template-columns: 1fr; }
      }

      @media (max-width: 680px) {
        .forums-hero,
        .appointments-hero {
          padding: 17px;
          align-items: flex-start;
          flex-direction: column;
        }

        .feature-card { padding: 16px; }
        .feature-two-col { grid-template-columns: 1fr; }
        .resource-card-head,
        .guide-card-head,
        .appointment-card-head {
          flex-direction: column;
        }
        .card-actions {
          justify-content: flex-start;
        }
      }
    `;
    document.head.appendChild(style);
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

    const adminTab = [...nav.querySelectorAll(".tab")].find(item => item.dataset.tab === "adminPage");
    if (adminTab) nav.insertBefore(button, adminTab);
    else nav.appendChild(button);

    const page = document.createElement("section");
    page.className = "page";
    page.id = "forumsPage";
    page.innerHTML = `
      <div class="forums-page">
        <section class="card forums-hero">
          <div>
            <p class="eyebrow blue">Saved research</p>
            <h2>Forums</h2>
            <p>Keep useful videos, forum threads, articles, and your own looksmaxxing guides in one searchable place.</p>
          </div>
          <div class="forums-hero-badge" id="forumResourceCount">0 saved</div>
        </section>

        <p class="forums-source-note">
          YouTube links embed automatically. Forum and article links are saved as source cards because many sites block third-party iframe embedding. Treat forum claims as unverified until you check stronger sources.
        </p>

        <div class="forums-grid">
          <div class="forums-stack">
            <section class="card feature-card">
              <div class="panel-title">
                <div>
                  <p class="eyebrow blue">Add source</p>
                  <h3>Save a video or forum thread</h3>
                  <p class="feature-card-copy">Paste the link once and keep it with a title and notes.</p>
                </div>
              </div>
              <div class="feature-form">
                <label class="feature-field">
                  <span>Title</span>
                  <input id="forumResourceTitle" maxlength="160" placeholder="Example: Jaw development video" type="text" />
                </label>
                <label class="feature-field">
                  <span>URL</span>
                  <input id="forumResourceUrl" maxlength="1000" placeholder="https://..." type="url" />
                </label>
                <div class="feature-two-col">
                  <label class="feature-field">
                    <span>Type</span>
                    <select id="forumResourceType">
                      <option value="video">Video</option>
                      <option value="forum">Forum thread</option>
                      <option value="article">Article</option>
                      <option value="other">Other link</option>
                    </select>
                  </label>
                  <label class="feature-field">
                    <span>Notes</span>
                    <input id="forumResourceNotes" maxlength="1000" placeholder="Why you saved it" type="text" />
                  </label>
                </div>
                <button class="btn blue" id="saveForumResourceBtn" type="button">Save resource</button>
                <p class="feature-status" id="forumResourceStatus"></p>
              </div>
            </section>

            <section class="card feature-card">
              <div class="panel-title">
                <div>
                  <p class="eyebrow blue">My notes</p>
                  <h3>Create a guide</h3>
                  <p class="feature-card-copy">Write your own reference guides and update them whenever you want.</p>
                </div>
              </div>
              <div class="feature-form">
                <input id="guideEditId" type="hidden" />
                <label class="feature-field">
                  <span>Guide title</span>
                  <input id="guideTitle" maxlength="160" placeholder="Example: Hair routine notes" type="text" />
                </label>
                <label class="feature-field">
                  <span>Guide</span>
                  <textarea id="guideContent" maxlength="20000" placeholder="Write your guide here..."></textarea>
                </label>
                <div class="feature-actions">
                  <button class="btn blue" id="saveGuideBtn" type="button">Save guide</button>
                  <button class="btn secondary hidden" id="cancelGuideEditBtn" type="button">Cancel edit</button>
                </div>
                <p class="feature-status" id="guideStatus"></p>
              </div>
            </section>
          </div>

          <div class="forums-stack">
            <section class="card feature-card">
              <div class="panel-title">
                <div>
                  <p class="eyebrow blue">Library</p>
                  <h3>Saved resources</h3>
                </div>
                <span class="badge blue" id="forumLibraryBadge">0 items</span>
              </div>
              <div class="resource-list" id="forumResourceList"></div>
            </section>

            <section class="card feature-card">
              <div class="panel-title">
                <div>
                  <p class="eyebrow blue">Reference</p>
                  <h3>My guides</h3>
                </div>
                <span class="badge" id="guideCountBadge">0 guides</span>
              </div>
              <div class="guide-list" id="guideList"></div>
            </section>
          </div>
        </div>
      </div>
    `;

    adminPage.parentNode.insertBefore(page, adminPage);

    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
      document.querySelectorAll(".page").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      page.classList.add("active");
      renderForums();
    });

    document.querySelectorAll(".tab").forEach(tab => {
      if (tab === button) return;
      tab.addEventListener("click", () => {
        button.classList.remove("active");
        page.classList.remove("active");
      });
    });
  }

  function installAppointmentsPanel() {
    if (document.getElementById("appointmentsAdminPanel")) return;

    const subtabs = document.querySelector(".admin-subtabs");
    const weeklyPanel = document.getElementById("weeklyPage");
    if (!subtabs || !weeklyPanel) return;

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
      <section class="card appointments-hero">
        <div>
          <p class="eyebrow blue">Calendar</p>
          <h2>Doctor's appointments</h2>
          <p>Keep upcoming appointments in one place and add or edit them as plans change.</p>
        </div>
        <div class="appointment-next-badge" id="appointmentNextBadge">Loading…</div>
      </section>

      <div class="admin-grid routine-admin-grid">
        <section class="card admin-card">
          <p class="eyebrow blue">Schedule</p>
          <h2 id="appointmentFormHeading">Add appointment</h2>
          <div class="feature-form">
            <label class="feature-field">
              <span>Appointment</span>
              <input id="appointmentTitle" maxlength="120" placeholder="Dermatologist" type="text" />
            </label>
            <div class="feature-two-col">
              <label class="feature-field">
                <span>Date</span>
                <input id="appointmentDate" type="date" />
              </label>
              <label class="feature-field">
                <span>Time</span>
                <input id="appointmentTime" type="time" />
              </label>
            </div>
            <label class="feature-field">
              <span>Notes</span>
              <textarea id="appointmentNotes" maxlength="500" placeholder="Optional notes"></textarea>
            </label>
            <div class="feature-actions">
              <button class="btn blue" id="saveAppointmentBtn" type="button">Add appointment</button>
              <button class="btn secondary hidden" id="cancelAppointmentEditBtn" type="button">Cancel edit</button>
            </div>
            <p class="feature-status" id="appointmentStatus"></p>
          </div>
        </section>

        <section class="card admin-card">
          <div class="panel-title">
            <div>
              <p class="eyebrow blue">Upcoming</p>
              <h2>Your appointments</h2>
            </div>
            <span class="badge blue" id="appointmentCountBadge">0 upcoming</span>
          </div>
          <div class="appointment-list" id="appointmentList"></div>
        </section>
      </div>
    `;

    weeklyPanel.parentNode.insertBefore(panel, weeklyPanel.nextSibling);

    const activateAdminPanel = panelId => {
      document.querySelectorAll(".admin-subtab").forEach(item => {
        item.classList.toggle("active", item.dataset.adminPanel === panelId);
      });
      document.querySelectorAll(".admin-subpanel").forEach(item => {
        item.classList.toggle("active", item.id === panelId);
      });

      if (panelId === "appointmentsAdminPanel") renderAppointments();
      if (panelId === "weeklyPage" && typeof renderWeeklyReview === "function") renderWeeklyReview();
    };

    document.querySelectorAll(".admin-subtab").forEach(tab => {
      tab.addEventListener("click", () => activateAdminPanel(tab.dataset.adminPanel));
    });
  }

  function formatAppointmentDate(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function formatAppointmentTime(time) {
    if (!validTime(time)) return "Time not set";
    const [hour, minute] = time.split(":").map(Number);
    const date = new Date(2000, 0, 1, hour, minute);
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function appointmentMoment(item) {
    const time = validTime(item.time) ? item.time : "23:59";
    const [year, month, day] = item.date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute);
  }

  function appointmentCountdown(item) {
    const now = new Date();
    const moment = appointmentMoment(item);
    const diff = moment.getTime() - now.getTime();
    const dayMs = 86400000;

    if (diff < 0) return "Past appointment";

    const days = Math.ceil(diff / dayMs);
    if (days <= 1) return "Coming up today";
    if (days === 2) return "Tomorrow";
    return `${days - 1} days away`;
  }

  function resetAppointmentForm() {
    appointmentEditId = null;
    const title = document.getElementById("appointmentTitle");
    const date = document.getElementById("appointmentDate");
    const time = document.getElementById("appointmentTime");
    const notes = document.getElementById("appointmentNotes");
    if (title) title.value = "";
    if (date) date.value = "";
    if (time) time.value = "";
    if (notes) notes.value = "";

    const heading = document.getElementById("appointmentFormHeading");
    const save = document.getElementById("saveAppointmentBtn");
    const cancel = document.getElementById("cancelAppointmentEditBtn");
    if (heading) heading.textContent = "Add appointment";
    if (save) save.textContent = "Add appointment";
    if (cancel) cancel.classList.add("hidden");
  }

  function setStatus(id, message, type = "") {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("good", type === "good");
    el.classList.toggle("bad", type === "bad");
  }

  function saveAppointment() {
    ensureFeatureState();

    const title = safeText(document.getElementById("appointmentTitle")?.value, 120);
    const date = safeText(document.getElementById("appointmentDate")?.value, 20);
    const time = safeText(document.getElementById("appointmentTime")?.value, 10);
    const notes = safeText(document.getElementById("appointmentNotes")?.value, 500);

    if (!title) {
      setStatus("appointmentStatus", "Enter the appointment name.", "bad");
      document.getElementById("appointmentTitle")?.focus();
      return;
    }
    if (!validDateKey(date)) {
      setStatus("appointmentStatus", "Choose a valid date.", "bad");
      document.getElementById("appointmentDate")?.focus();
      return;
    }
    if (time && !validTime(time)) {
      setStatus("appointmentStatus", "Choose a valid time.", "bad");
      return;
    }

    if (appointmentEditId) {
      const item = state.meta.appointments.find(entry => entry.id === appointmentEditId);
      if (item) Object.assign(item, { title, date, time, notes });
      setStatus("appointmentStatus", "Appointment updated.", "good");
    } else {
      state.meta.appointments.push({
        id: makeId("appt"),
        title,
        date,
        time,
        notes
      });
      setStatus("appointmentStatus", "Appointment added.", "good");
    }

    persist();
    resetAppointmentForm();
    renderAppointments();
    if (typeof toast === "function") toast("Appointment saved.");
  }

  function editAppointment(id) {
    ensureFeatureState();
    const item = state.meta.appointments.find(entry => entry.id === id);
    if (!item) return;

    appointmentEditId = id;
    document.getElementById("appointmentTitle").value = item.title;
    document.getElementById("appointmentDate").value = item.date;
    document.getElementById("appointmentTime").value = item.time || "";
    document.getElementById("appointmentNotes").value = item.notes || "";

    document.getElementById("appointmentFormHeading").textContent = "Edit appointment";
    document.getElementById("saveAppointmentBtn").textContent = "Save changes";
    document.getElementById("cancelAppointmentEditBtn").classList.remove("hidden");
    document.getElementById("appointmentTitle")?.focus();
  }

  function deleteAppointment(id) {
    ensureFeatureState();
    const item = state.meta.appointments.find(entry => entry.id === id);
    if (!item) return;
    if (!window.confirm(`Delete "${item.title}"?`)) return;

    state.meta.appointments = state.meta.appointments.filter(entry => entry.id !== id);
    if (appointmentEditId === id) resetAppointmentForm();
    persist();
    renderAppointments();
    if (typeof toast === "function") toast("Appointment deleted.");
  }

  function renderAppointments() {
    if (!document.getElementById("appointmentList")) return;
    ensureFeatureState();

    const items = [...state.meta.appointments].sort((a, b) => appointmentMoment(a) - appointmentMoment(b));
    const now = new Date();
    const upcoming = items.filter(item => appointmentMoment(item) >= now);
    const past = items.filter(item => appointmentMoment(item) < now);

    const badge = document.getElementById("appointmentCountBadge");
    if (badge) badge.textContent = `${upcoming.length} upcoming`;

    const nextBadge = document.getElementById("appointmentNextBadge");
    if (nextBadge) {
      nextBadge.textContent = upcoming.length
        ? `Next · ${upcoming[0].title} · ${formatAppointmentDate(upcoming[0].date)}`
        : "No upcoming appointments";
    }

    const list = document.getElementById("appointmentList");
    list.innerHTML = "";

    const renderOne = (item, isPast) => {
      const dateObj = new Date(`${item.date}T12:00:00`);
      const card = document.createElement("div");
      card.className = `appointment-card${isPast ? " past" : ""}`;

      const body = document.createElement("div");
      body.className = "appointment-card-body";

      const head = document.createElement("div");
      head.className = "appointment-card-head";

      const dateBlock = document.createElement("div");
      dateBlock.className = "appointment-date-block";

      const chip = document.createElement("div");
      chip.className = "appointment-date-chip";
      const chipDay = document.createElement("strong");
      chipDay.textContent = String(dateObj.getDate());
      const chipMonth = document.createElement("span");
      chipMonth.textContent = dateObj.toLocaleDateString(undefined, { month: "short" });
      chip.append(chipDay, chipMonth);

      const info = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = item.title;
      const meta = document.createElement("div");
      meta.className = "appointment-meta";
      meta.textContent = `${formatAppointmentDate(item.date)} · ${formatAppointmentTime(item.time)}`;
      const countdown = document.createElement("span");
      countdown.className = "appointment-countdown";
      countdown.textContent = appointmentCountdown(item);
      info.append(title, meta, countdown);
      dateBlock.append(chip, info);

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "feature-mini-btn";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => editAppointment(item.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "feature-mini-btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteAppointment(item.id));

      actions.append(edit, remove);
      head.append(dateBlock, actions);
      body.appendChild(head);

      if (item.notes) {
        const notes = document.createElement("p");
        notes.className = "appointment-notes";
        notes.textContent = item.notes;
        body.appendChild(notes);
      }

      card.appendChild(body);
      list.appendChild(card);
    };

    upcoming.forEach(item => renderOne(item, false));

    if (!upcoming.length && !past.length) {
      const empty = document.createElement("div");
      empty.className = "feature-empty";
      empty.textContent = "No appointments saved yet.";
      list.appendChild(empty);
      return;
    }

    if (past.length) {
      const pastLabel = document.createElement("div");
      pastLabel.className = "feature-empty";
      pastLabel.textContent = "Past appointments";
      list.appendChild(pastLabel);
      past.slice().reverse().forEach(item => renderOne(item, true));
    }
  }

  function saveResource() {
    ensureFeatureState();

    const title = safeText(document.getElementById("forumResourceTitle")?.value, 160);
    const url = normalizeUrl(document.getElementById("forumResourceUrl")?.value);
    let type = safeText(document.getElementById("forumResourceType")?.value, 20);
    const notes = safeText(document.getElementById("forumResourceNotes")?.value, 1000);

    if (!title) {
      setStatus("forumResourceStatus", "Enter a title.", "bad");
      document.getElementById("forumResourceTitle")?.focus();
      return;
    }
    if (!url) {
      setStatus("forumResourceStatus", "Enter a valid http or https URL.", "bad");
      document.getElementById("forumResourceUrl")?.focus();
      return;
    }

    if (getYouTubeId(url)) type = "video";
    if (!["video", "forum", "article", "other"].includes(type)) type = "other";

    state.meta.forumHub.resources.unshift({
      id: makeId("resource"),
      title,
      url,
      type,
      notes,
      createdAt: new Date().toISOString()
    });

    persist();
    document.getElementById("forumResourceTitle").value = "";
    document.getElementById("forumResourceUrl").value = "";
    document.getElementById("forumResourceNotes").value = "";
    setStatus("forumResourceStatus", "Resource saved.", "good");
    renderForums();
    if (typeof toast === "function") toast("Resource saved.");
  }

  function deleteResource(id) {
    ensureFeatureState();
    const item = state.meta.forumHub.resources.find(entry => entry.id === id);
    if (!item) return;
    if (!window.confirm(`Delete "${item.title}"?`)) return;

    state.meta.forumHub.resources = state.meta.forumHub.resources.filter(entry => entry.id !== id);
    persist();
    renderForums();
  }

  function renderResources() {
    const list = document.getElementById("forumResourceList");
    if (!list) return;

    const resources = state.meta.forumHub.resources;
    list.innerHTML = "";

    const badge = document.getElementById("forumLibraryBadge");
    const hero = document.getElementById("forumResourceCount");
    if (badge) badge.textContent = `${resources.length} item${resources.length === 1 ? "" : "s"}`;
    if (hero) hero.textContent = `${resources.length} saved`;

    if (!resources.length) {
      const empty = document.createElement("div");
      empty.className = "feature-empty";
      empty.textContent = "No saved videos or forum threads yet.";
      list.appendChild(empty);
      return;
    }

    for (const item of resources) {
      const card = document.createElement("article");
      card.className = "resource-card";

      const youtubeId = getYouTubeId(item.url);
      if (youtubeId) {
        const embed = document.createElement("div");
        embed.className = "resource-embed";

        const iframe = document.createElement("iframe");
        iframe.loading = "lazy";
        iframe.src = `https://www.youtube-nocookie.com/embed/${youtubeId}`;
        iframe.title = item.title;
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = "strict-origin-when-cross-origin";

        embed.appendChild(iframe);
        card.appendChild(embed);
      }

      const body = document.createElement("div");
      body.className = "resource-card-body";

      const head = document.createElement("div");
      head.className = "resource-card-head";

      const info = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = item.title;

      const meta = document.createElement("div");
      meta.className = "resource-meta";
      meta.textContent = getHost(item.url);

      info.append(title, meta);

      const right = document.createElement("div");
      right.className = "card-actions";

      const pill = document.createElement("span");
      pill.className = `resource-type-pill ${item.type}`;
      pill.textContent = youtubeId ? "video" : item.type;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "feature-mini-btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteResource(item.id));

      right.append(pill, remove);
      head.append(info, right);
      body.appendChild(head);

      if (item.notes) {
        const note = document.createElement("p");
        note.className = "resource-note";
        note.textContent = item.notes;
        body.appendChild(note);
      }

      const link = document.createElement("a");
      link.className = "resource-link";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open original ↗";
      body.appendChild(link);

      card.appendChild(body);
      list.appendChild(card);
    }
  }

  function resetGuideForm() {
    const editId = document.getElementById("guideEditId");
    const title = document.getElementById("guideTitle");
    const content = document.getElementById("guideContent");
    const save = document.getElementById("saveGuideBtn");
    const cancel = document.getElementById("cancelGuideEditBtn");

    if (editId) editId.value = "";
    if (title) title.value = "";
    if (content) content.value = "";
    if (save) save.textContent = "Save guide";
    if (cancel) cancel.classList.add("hidden");
  }

  function saveGuide() {
    ensureFeatureState();

    const editId = safeText(document.getElementById("guideEditId")?.value, 120);
    const title = safeText(document.getElementById("guideTitle")?.value, 160);
    const content = String(document.getElementById("guideContent")?.value ?? "").trim().slice(0, 20000);

    if (!title) {
      setStatus("guideStatus", "Enter a guide title.", "bad");
      document.getElementById("guideTitle")?.focus();
      return;
    }
    if (!content) {
      setStatus("guideStatus", "Write something in the guide.", "bad");
      document.getElementById("guideContent")?.focus();
      return;
    }

    if (editId) {
      const item = state.meta.forumHub.guides.find(entry => entry.id === editId);
      if (item) {
        item.title = title;
        item.content = content;
        item.updatedAt = new Date().toISOString();
      }
      setStatus("guideStatus", "Guide updated.", "good");
    } else {
      state.meta.forumHub.guides.unshift({
        id: makeId("guide"),
        title,
        content,
        updatedAt: new Date().toISOString()
      });
      setStatus("guideStatus", "Guide saved.", "good");
    }

    persist();
    resetGuideForm();
    renderForums();
    if (typeof toast === "function") toast("Guide saved.");
  }

  function editGuide(id) {
    ensureFeatureState();
    const item = state.meta.forumHub.guides.find(entry => entry.id === id);
    if (!item) return;

    document.getElementById("guideEditId").value = item.id;
    document.getElementById("guideTitle").value = item.title;
    document.getElementById("guideContent").value = item.content;
    document.getElementById("saveGuideBtn").textContent = "Save changes";
    document.getElementById("cancelGuideEditBtn").classList.remove("hidden");
    document.getElementById("guideTitle")?.focus();
  }

  function deleteGuide(id) {
    ensureFeatureState();
    const item = state.meta.forumHub.guides.find(entry => entry.id === id);
    if (!item) return;
    if (!window.confirm(`Delete "${item.title}"?`)) return;

    state.meta.forumHub.guides = state.meta.forumHub.guides.filter(entry => entry.id !== id);
    if (document.getElementById("guideEditId")?.value === id) resetGuideForm();
    persist();
    renderForums();
  }

  function renderGuides() {
    const list = document.getElementById("guideList");
    if (!list) return;

    const guides = state.meta.forumHub.guides;
    list.innerHTML = "";

    const badge = document.getElementById("guideCountBadge");
    if (badge) badge.textContent = `${guides.length} guide${guides.length === 1 ? "" : "s"}`;

    if (!guides.length) {
      const empty = document.createElement("div");
      empty.className = "feature-empty";
      empty.textContent = "No personal guides yet.";
      list.appendChild(empty);
      return;
    }

    for (const item of guides) {
      const card = document.createElement("article");
      card.className = "guide-card";

      const body = document.createElement("div");
      body.className = "guide-card-body";

      const head = document.createElement("div");
      head.className = "guide-card-head";

      const info = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = item.title;
      const meta = document.createElement("div");
      meta.className = "guide-meta";
      const updated = new Date(item.updatedAt);
      meta.textContent = Number.isNaN(updated.getTime())
        ? "Saved guide"
        : `Updated ${updated.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
      info.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "feature-mini-btn";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => editGuide(item.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "feature-mini-btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteGuide(item.id));

      actions.append(edit, remove);
      head.append(info, actions);

      const content = document.createElement("p");
      content.className = "guide-content";
      content.textContent = item.content;

      body.append(head, content);
      card.appendChild(body);
      list.appendChild(card);
    }
  }

  function renderForums() {
    if (!document.getElementById("forumsPage")) return;
    ensureFeatureState();
    renderResources();
    renderGuides();
  }

  function installEventHandlers() {
    document.getElementById("saveAppointmentBtn")?.addEventListener("click", saveAppointment);
    document.getElementById("cancelAppointmentEditBtn")?.addEventListener("click", () => {
      resetAppointmentForm();
      setStatus("appointmentStatus", "");
    });

    document.getElementById("saveForumResourceBtn")?.addEventListener("click", saveResource);
    document.getElementById("forumResourceUrl")?.addEventListener("keydown", event => {
      if (event.key === "Enter") saveResource();
    });

    document.getElementById("saveGuideBtn")?.addEventListener("click", saveGuide);
    document.getElementById("cancelGuideEditBtn")?.addEventListener("click", () => {
      resetGuideForm();
      setStatus("guideStatus", "");
    });
  }

  function installRenderWrapper() {
    if (typeof render !== "function" || render.__lockedOsFeatureWrapped) return;

    const baseRender = render;
    const wrapped = function renderWithForumsAndAppointments(...args) {
      const result = baseRender(...args);
      ensureFeatureState();
      renderAppointments();
      renderForums();
      return result;
    };
    wrapped.__lockedOsFeatureWrapped = true;
    render = wrapped;
  }

  window.addEventListener("DOMContentLoaded", () => {
    if (typeof state === "undefined") return;

    injectStyles();
    ensureFeatureState();
    installMeaningfulStateSupport();
    installMainTab();
    installAppointmentsPanel();
    installEventHandlers();
    installRenderWrapper();

    // Save only to local storage at startup. Normal app saves will sync these
    // additions through the existing Supabase state object.
    if (typeof saveLocalState === "function") saveLocalState();

    renderAppointments();
    renderForums();
  });
})();
