"use strict";

(() => {
  const GHK_VIAL_APPEARANCE = new Set(["clear", "cloudy", "hazy", "particles", "discolored", "other"]);
  const GHK_SITE_REACTIONS = new Set(["none", "mild", "moderate", "severe"]);

  function ghkDefaultState() {
    return { logs: {} };
  }

  function ghkEnsureState() {
    if (!state.ghkCu || typeof state.ghkCu !== "object" || Array.isArray(state.ghkCu)) {
      state.ghkCu = ghkDefaultState();
    }
    if (!state.ghkCu.logs || typeof state.ghkCu.logs !== "object" || Array.isArray(state.ghkCu.logs)) {
      state.ghkCu.logs = {};
    }
    return state.ghkCu;
  }

  function ghkSeverity(value) {
    const parsed = Math.round(Number(value));
    return Number.isFinite(parsed) ? Math.max(0, Math.min(3, parsed)) : 0;
  }

  function ghkOptionalNumber(value, min, max) {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
    return Math.round(parsed * 10) / 10;
  }

  function ghkNormalizeLog(dayKey, raw = {}) {
    const vialAppearance = GHK_VIAL_APPEARANCE.has(raw.vialAppearance) ? raw.vialAppearance : "clear";
    const siteReaction = GHK_SITE_REACTIONS.has(raw.siteReaction) ? raw.siteReaction : "none";
    return {
      date: isDateKey(dayKey) ? dayKey : getTodayKey(),
      weight: ghkOptionalNumber(raw.weight, 50, 500),
      vialAppearance,
      siteReaction,
      facialPuffiness: ghkSeverity(raw.facialPuffiness),
      bruising: ghkSeverity(raw.bruising),
      headacheDizziness: ghkSeverity(raw.headacheDizziness),
      nausea: ghkSeverity(raw.nausea),
      rashHives: ghkSeverity(raw.rashHives),
      notes: String(raw.notes || "").trim().slice(0, 500)
    };
  }

  function ghkGetLogs() {
    const ghk = ghkEnsureState();
    return Object.entries(ghk.logs)
      .filter(([dayKey]) => isDateKey(dayKey))
      .map(([dayKey, raw]) => ({ dayKey, ...ghkNormalizeLog(dayKey, raw) }))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }

  function ghkFormatDate(dayKey) {
    return keyToLocalDate(dayKey).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function ghkSetStatus(message, type = "") {
    const status = $("ghkSaveStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("good", type === "good");
    status.classList.toggle("bad", type === "bad");
  }

  function ghkSaveLog() {
    const dayKey = $("ghkDate")?.value || "";
    if (!isDateKey(dayKey)) {
      ghkSetStatus("Choose a valid date.", "bad");
      return;
    }

    const vialAppearance = $("ghkVialAppearance")?.value || "clear";
    const siteReaction = $("ghkSiteReaction")?.value || "none";
    if (!GHK_VIAL_APPEARANCE.has(vialAppearance) || !GHK_SITE_REACTIONS.has(siteReaction)) {
      ghkSetStatus("Choose valid monitoring values.", "bad");
      return;
    }

    const log = ghkNormalizeLog(dayKey, {
      weight: $("ghkWeight")?.value,
      vialAppearance,
      siteReaction,
      facialPuffiness: $("ghkFacialPuffiness")?.value,
      bruising: $("ghkBruising")?.value,
      headacheDizziness: $("ghkHeadacheDizziness")?.value,
      nausea: $("ghkNausea")?.value,
      rashHives: $("ghkRashHives")?.value,
      notes: $("ghkNotes")?.value
    });

    const ghk = ghkEnsureState();
    ghk.logs[dayKey] = log;

    if (Number.isFinite(log.weight)) {
      state.weights = state.weights || {};
      state.weights[dayKey] = log.weight;
    }

    saveState();
    renderGhkCu();
    if (typeof renderWeightTracker === "function") renderWeightTracker();
    ghkSetStatus(`Saved ${ghkFormatDate(dayKey)}.`, "good");
    if (typeof toast === "function") toast("GHK-Cu monitoring saved.");
  }

  function ghkDeleteLog(dayKey) {
    const ghk = ghkEnsureState();
    if (!ghk.logs[dayKey]) return;
    delete ghk.logs[dayKey];
    saveState();
    renderGhkCu();
    ghkSetStatus(`Removed ${ghkFormatDate(dayKey)}.`, "good");
  }

  function ghkSeverityLabel(value) {
    return ["None", "Mild", "Moderate", "Severe"][ghkSeverity(value)];
  }

  function ghkRenderHistory(logs) {
    const list = $("ghkHistoryList");
    if (!list) return;
    list.innerHTML = "";

    const recent = [...logs].reverse().slice(0, 14);
    if (!recent.length) {
      list.innerHTML = '<div class="ghk-history-empty">No GHK-Cu monitoring entries yet.</div>';
      return;
    }

    for (const log of recent) {
      const row = document.createElement("div");
      row.className = "ghk-history-row";
      row.innerHTML = `
        <div class="ghk-history-main">
          <div class="ghk-history-date"><strong>${escapeHtml(ghkFormatDate(log.dayKey))}</strong><span>${Number.isFinite(log.weight) ? `${log.weight.toFixed(1)} lb` : "No weight"}</span></div>
          <div class="ghk-history-chips">
            <span>Vial: ${escapeHtml(log.vialAppearance)}</span>
            <span>Site: ${escapeHtml(log.siteReaction)}</span>
            <span>Puffiness: ${ghkSeverityLabel(log.facialPuffiness)}</span>
            ${log.rashHives ? `<span class="warn">Rash/hives: ${ghkSeverityLabel(log.rashHives)}</span>` : ""}
          </div>
          ${log.notes ? `<p>${escapeHtml(log.notes)}</p>` : ""}
        </div>
        <button class="ghk-delete-btn" type="button" aria-label="Delete GHK-Cu entry for ${escapeHtml(log.dayKey)}">×</button>`;
      row.querySelector("button")?.addEventListener("click", () => ghkDeleteLog(log.dayKey));
      list.appendChild(row);
    }
  }

  function ghkFillFormFromDate() {
    const dayKey = $("ghkDate")?.value || getTodayKey();
    if (!isDateKey(dayKey)) return;
    const existing = ghkEnsureState().logs[dayKey];
    const log = existing ? ghkNormalizeLog(dayKey, existing) : null;

    if ($("ghkWeight")) $("ghkWeight").value = log?.weight ?? state.weights?.[dayKey] ?? "";
    if ($("ghkVialAppearance")) $("ghkVialAppearance").value = log?.vialAppearance || "clear";
    if ($("ghkSiteReaction")) $("ghkSiteReaction").value = log?.siteReaction || "none";
    if ($("ghkFacialPuffiness")) $("ghkFacialPuffiness").value = String(log?.facialPuffiness ?? 0);
    if ($("ghkBruising")) $("ghkBruising").value = String(log?.bruising ?? 0);
    if ($("ghkHeadacheDizziness")) $("ghkHeadacheDizziness").value = String(log?.headacheDizziness ?? 0);
    if ($("ghkNausea")) $("ghkNausea").value = String(log?.nausea ?? 0);
    if ($("ghkRashHives")) $("ghkRashHives").value = String(log?.rashHives ?? 0);
    if ($("ghkNotes")) $("ghkNotes").value = log?.notes || "";

    const badge = $("ghkSavedBadge");
    if (badge) badge.textContent = existing ? `Saved ${ghkFormatDate(dayKey)}` : "Not saved";
  }

  function renderGhkCu() {
    const page = $("ghkCuPage");
    if (!page) return;
    ghkEnsureState();

    const date = $("ghkDate");
    if (date && !date.value) date.value = getTodayKey();
    ghkFillFormFromDate();

    const logs = ghkGetLogs();
    ghkRenderHistory(logs);

    const count = $("ghkEntryCount");
    if (count) count.textContent = `${logs.length} ${logs.length === 1 ? "entry" : "entries"}`;
  }

  const originalNormalizeState = normalizeState;
  normalizeState = function lockedOsNormalizeStateWithGhk(...args) {
    const changed = originalNormalizeState(...args);
    const hadValidGhk = Boolean(state?.ghkCu && typeof state.ghkCu === "object" && !Array.isArray(state.ghkCu) && state.ghkCu.logs && typeof state.ghkCu.logs === "object");
    ghkEnsureState();
    return changed || !hadValidGhk;
  };

  const originalHasMeaningfulState = hasMeaningfulState;
  hasMeaningfulState = function lockedOsMeaningfulStateWithGhk(snapshot) {
    if (snapshot?.ghkCu?.logs && Object.keys(snapshot.ghkCu.logs).length > 0) return true;
    return originalHasMeaningfulState(snapshot);
  };

  const originalRender = render;
  render = function lockedOsRenderWithGhk(...args) {
    const result = originalRender(...args);
    renderGhkCu();
    return result;
  };

  $("saveGhkLogBtn")?.addEventListener("click", ghkSaveLog);
  $("ghkDate")?.addEventListener("change", () => {
    ghkSetStatus("");
    ghkFillFormFromDate();
  });

  renderGhkCu();
})();
