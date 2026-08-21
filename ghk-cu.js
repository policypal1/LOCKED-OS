"use strict";

(() => {
  function setupAdminSubtabs() {
    const buttons = [...document.querySelectorAll(".admin-subtab")];
    const panels = [...document.querySelectorAll(".admin-subpanel")];
    if (!buttons.length || !panels.length) return;

    const activate = panelId => {
      buttons.forEach(button => button.classList.toggle("active", button.dataset.adminPanel === panelId));
      panels.forEach(panel => panel.classList.toggle("active", panel.id === panelId));
      if (panelId === "weeklyPage" && typeof renderWeeklyReview === "function") renderWeeklyReview();
    };

    buttons.forEach(button => {
      button.addEventListener("click", () => activate(button.dataset.adminPanel));
    });
  }

  function renderGhkWeekPlanner() {
    const today = new Date().getDay();
    document.querySelectorAll(".ghk-day").forEach(day => {
      day.classList.toggle("today", Number(day.dataset.ghkDay) === today);
    });

    const badge = document.getElementById("ghkTodayBadge");
    if (!badge) return;
    badge.textContent = today >= 1 && today <= 5 ? "Today · morning" : "Weekend · no reminder";
  }

  setupAdminSubtabs();
  renderGhkWeekPlanner();
})();
