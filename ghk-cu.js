"use strict";

(() => {
  const APPOINTMENT_SEED_VERSION = 1;
  const DEFAULT_APPOINTMENTS = [
    { id: "appt-dermatologist-2026-09-12", title: "Dermatologist", date: "2026-09-12", time: "10:00", notes: "Dermatology appointment" },
    { id: "appt-orthodontist-2026-10-15", title: "Orthodontist", date: "2026-10-15", time: "15:00", notes: "Maxilla consultation" }
  ];
  let appointmentEditId = null;

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
      (Array.isArray(snapshot?.meta?.forumHub?.guides) && snapshot.meta.forumHub.guides.length > 0);
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
      @media(max-width:680px){.forums-hero,.appointments-hero{padding:17px;align-items:flex-start;flex-direction:column}.feature-card{padding:16px}.feature-two-col{grid-template-columns:1fr}.resource-card-head,.appointment-card-head{flex-direction:column}.resource-add-details{position:static}.resource-add-popdown{position:static;width:100%;margin-top:10px;box-shadow:none}}
    `;
    document.head.appendChild(style);
  }

  function highlightGhkToday() {
    const day = new Date().getDay();
    document.querySelectorAll("[data-ghk-day]").forEach(el => el.classList.toggle("today", Number(el.dataset.ghkDay) === day));
    const badge = document.getElementById("ghkTodayBadge");
    if (badge) badge.textContent = day >= 1 && day <= 5 ? "Today · morning" : "Today · no reminder";
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
  function installRenderWrapper(){if(typeof render!=="function"||render.__featureWrapped)return;const base=render;const wrapped=function(...args){const result=base(...args);highlightGhkToday();renderAppointments();renderForums();return result;};wrapped.__featureWrapped=true;render=wrapped;}

  window.addEventListener("DOMContentLoaded",()=>{
    if(typeof state==="undefined")return;
    injectStyles();ensureFeatureState();installMeaningfulStateSupport();installMainTab();installAppointmentsPanel();installHandlers();installRenderWrapper();highlightGhkToday();
    if(typeof saveLocalState==="function")saveLocalState();renderAppointments();renderForums();
  });
})();
