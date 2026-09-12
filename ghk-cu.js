"use strict";

/*
  LOCKED OS — remove only the "Today's gym" card from Looksmaxxing.
  Everything else is loaded unchanged from the currently deployed build.
*/
(() => {
  const baseUrl = "https://cdn.jsdelivr.net/gh/policypal1/LOCKED-OS@8fbd984123c48a3b82e4cf46c0a1eb9d171bb22f/ghk-cu.js";

  try {
    const request = new XMLHttpRequest();
    request.open("GET", baseUrl, false);
    request.send(null);

    if (request.status < 200 || request.status >= 300) {
      throw new Error(`HTTP ${request.status}`);
    }

    (0, eval)(request.responseText + "\n//# sourceURL=locked-os-current-base.js");
  } catch (error) {
    console.error("LOCKED OS: could not load current base.", error);
  }
})();

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