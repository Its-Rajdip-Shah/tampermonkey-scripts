// ==UserScript==
// @name         YT ad blocker (remote-arm HS, minimal toast)
// @namespace    https://example.com
// @version      2.2
// @description  Fast-forward during ads; restore speed; robust skip detection; auto-arm Hammerspoon -> click -> disarm. Only one toast: "HAMMERING AD" (cherry red, 4s). Also force-hide .style-scope.ytd-ad-slot-renderer and related ad slots.
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  // ===== CONFIG =====
  const AD_SPEED = 100.0; // your chosen turbo rate
  const POLL_MS = 150;
  const VERIFY_MS = 1500;
  const RETRY_COOLDOWN = 1200;
  const LOG = false;

  // Hammerspoon (Option 3)
  const HS_HOST = "127.0.0.1";
  const HS_PORT = 8777;
  const ARM_TOKEN = "REPLACE_WITH_LONG_RANDOM_SECRET"; // must match HS
  const HS_URL = (p) => `http://${HS_HOST}:${HS_PORT}${p}`;
  const HS_ARM = () =>
    HS_URL(`/yt-arm?token=${encodeURIComponent(ARM_TOKEN)}&t=${Date.now()}`);
  const HS_DISARM = () =>
    HS_URL(`/yt-disarm?token=${encodeURIComponent(ARM_TOKEN)}&t=${Date.now()}`);
  const HS_SKIP = (x, y) => HS_URL(`/yt-skip?x=${x}&y=${y}&t=${Date.now()}`);

  // ===== STATE =====
  let playerEl = null,
    videoEl = null;
  let inAdPod = false,
    userSpeedBeforePod = 1.0;
  let handlingAd = false,
    failCount = 0,
    lastAttemptAt = 0,
    attempting = false;
  let HS_CALL_PER_AD = false;

  // ===== UTIL =====
  const log = (...a) => LOG && console.log("[YT AdCtl]", ...a);
  const getPlayer = () =>
    document.querySelector(".html5-video-player") ||
    document.querySelector("#movie_player");
  const getVideo = () =>
    getPlayer()?.querySelector("video") || document.querySelector("video");
  const isAdShowing = () => {
    const p = playerEl || getPlayer();
    return !!(
      p &&
      (p.classList.contains("ad-showing") ||
        p.classList.contains("ad-interrupting"))
    );
  };
  const inViewport = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < (window.innerHeight || 0) &&
      r.left < (window.innerWidth || 0)
    );
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ===== SINGLE EPHEMERAL TOAST: "HAMMERING AD" =====
  let hammerToastEl = null,
    hammerToastTimer = null;
  function showHammerToast() {
    if (!hammerToastEl) {
      hammerToastEl = document.createElement("div");
      Object.assign(hammerToastEl.style, {
        position: "fixed",
        zIndex: 2147483647,
        right: "12px",
        bottom: "12px",
        background: "#d2042d" /* cherry red */,
        color: "#fff",
        font: "12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
        borderRadius: "10px",
        padding: "10px 12px",
        boxShadow: "0 8px 24px rgba(0,0,0,.35)",
        userSelect: "none",
        cursor: "default",
      });
      hammerToastEl.textContent = "HAMMERING AD";
      document.documentElement.appendChild(hammerToastEl);
    } else {
      hammerToastEl.textContent = "HAMMERING AD";
      hammerToastEl.style.display = "block";
    }
    if (hammerToastTimer) clearTimeout(hammerToastTimer);
    hammerToastTimer = setTimeout(() => {
      if (hammerToastEl) hammerToastEl.style.display = "none";
    }, 4000);
  }

  // ===== FEED/GRID AD HIDE (CSS + JS backup) =====
  (function injectHideCSS() {
    const css = `
      /* Force-hide all ad slot containers (requested class + related) */
      .style-scope.ytd-ad-slot-renderer,
      ytd-ad-slot-renderer,
      ytd-in-feed-ad-layout-renderer,
      .ytd-in-feed-ad-layout-renderer,
      #player-ads {
        display: none !important;
      }

      /* Also keep cards that contain ad slots out of the grid (fast path) */
      ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
      ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer){
        display: none !important;
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);
  })();

  // Full list to hide directly (backup for CSS)
  const HIDE_SEL = [
    ".style-scope.ytd-ad-slot-renderer",
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    ".ytd-in-feed-ad-layout-renderer",
    "#player-ads",
  ].join(",");

  const SELECTOR_CARD = "ytd-rich-item-renderer";
  const SELECTOR_AD = "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer";

  function hideAdStuff(root = document) {
    // Hide direct ad nodes
    root.querySelectorAll(HIDE_SEL).forEach((el) => {
      if (el && el.style.display !== "none") el.style.display = "none";
    });
    // Hide entire cards that contain ad nodes
    root.querySelectorAll(SELECTOR_CARD).forEach((card) => {
      if (card.__ytAdHidden) return;
      if (card.querySelector(SELECTOR_AD)) {
        card.style.display = "none";
        card.__ytAdHidden = true;
      }
    });
  }

  function observeFeed() {
    const target =
      document.querySelector("ytd-rich-grid-renderer") ||
      document.querySelector("ytd-browse") ||
      document.body;

    const mo = new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches?.(HIDE_SEL)) {
            n.style.display = "none";
          } else {
            hideAdStuff(n);
          }
        }
    });
    mo.observe(target, { childList: true, subtree: true });

    document.addEventListener("yt-navigate-finish", () => {
      hideAdStuff();
      const pa = document.getElementById("player-ads");
      if (pa) pa.style.display = "none";
    });
  }

  // ===== ROBUST SKIP DETECTION =====
  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-skip-ad-button.ytp-button",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-player-overlay .ytp-ad-skip-button",
  ];
  function getSkipCandidates() {
    const set = new Set();
    for (const sel of SKIP_SELECTORS)
      document.querySelectorAll(sel)?.forEach((el) => set.add(el));
    const p = getPlayer();
    if (p)
      p.querySelectorAll("button")?.forEach((b) => {
        const cls =
          (b.className || "") + " " + (b.parentElement?.className || "");
        const label = (
          b.getAttribute("aria-label") ||
          b.textContent ||
          ""
        ).toLowerCase();
        if (/\bytp-.*skip.*button\b/i.test(cls) || /skip/.test(label))
          set.add(b);
      });
    return Array.from(set);
  }
  function isButtonReady(btn) {
    if (!btn) return false;
    const cs = getComputedStyle(btn);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (btn.getAttribute("aria-disabled") === "true") return false;
    if (!inViewport(btn)) return false;
    const cls =
      (btn.className || "") + " " + (btn.parentElement?.className || "");
    if (/\bytp-.*skip.*button\b/i.test(cls)) return true;
    const label = (
      btn.getAttribute("aria-label") ||
      btn.textContent ||
      ""
    ).toLowerCase();
    return /skip/.test(label);
  }
  function getSkipBtn() {
    const candidates = getSkipCandidates().filter(isButtonReady);
    if (!candidates.length) return null;
    candidates.sort(
      (a, b) =>
        b.getBoundingClientRect().width * b.getBoundingClientRect().height -
        a.getBoundingClientRect().width * a.getBoundingClientRect().height
    );
    return candidates[0];
  }

  // ===== SPEED CONTROL =====
  function enterAdPodIfNeeded() {
    if (!inAdPod) {
      inAdPod = true;
      HS_CALL_PER_AD = false;
      videoEl = getVideo();
      userSpeedBeforePod = (videoEl && videoEl.playbackRate) || 1.0;
      // Only toast once per ad (4s auto-hide)
      showHammerToast();
    }
    videoEl = getVideo();
    if (videoEl && videoEl.playbackRate !== AD_SPEED) {
      try {
        videoEl.playbackRate = AD_SPEED;
      } catch {}
    }
  }
  function exitAdPodIfNeeded() {
    if (!inAdPod) return;
    inAdPod = false;
    videoEl = getVideo();
    if (videoEl && videoEl.playbackRate !== userSpeedBeforePod) {
      try {
        videoEl.playbackRate = userSpeedBeforePod;
      } catch {}
    }
  }

  // ===== HS: arm -> click -> disarm (silent) =====
  const _beacons = [];
  const ping = (url) => {
    const i = new Image();
    i.src = url;
    _beacons.push(i);
    return i;
  };
  async function armClickDisarm(btn) {
    try {
      const r = btn.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      ping(HS_ARM());
      await wait(60);
      ping(HS_SKIP(x, y));
      setTimeout(() => ping(HS_DISARM()), 1500);
    } catch (e) {
      /* silent */
    }
  }

  // ===== PROGRAMMATIC FALLBACK (silent) =====
  async function attemptProgrammatic(btn) {
    if (!btn || attempting) return false;
    const now = performance.now();
    if (now - lastAttemptAt < RETRY_COOLDOWN) return false;
    attempting = true;
    lastAttemptAt = now;
    try {
      btn.focus?.({ preventScroll: true });
    } catch {}
    try {
      btn.click?.();
    } catch {}
    await wait(VERIFY_MS);
    const ok = !isAdShowing();
    attempting = false;
    return ok;
  }

  // Real-key hijack (silent)
  function keyHijack(e) {
    if (!handlingAd || !isAdShowing()) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const btn = getSkipBtn();
    if (!btn) return;
    try {
      btn.focus?.({ preventScroll: true });
    } catch {}
  }

  // ===== AD LIFECYCLE =====
  async function handleAd() {
    handlingAd = true;
    document.addEventListener("keydown", keyHijack, true);

    while (isAdShowing()) {
      enterAdPodIfNeeded();
      hideAdStuff();

      const v = getVideo();
      if (!(v && !v.paused && v.readyState >= 2)) {
        await wait(250);
        continue;
      }

      const btn = getSkipBtn();
      if (btn && !HS_CALL_PER_AD) {
        HS_CALL_PER_AD = true;
        await armClickDisarm(btn);
        await attemptProgrammatic(btn);
      }
      await wait(POLL_MS);
    }

    exitAdPodIfNeeded();
    document.removeEventListener("keydown", keyHijack, true);
    handlingAd = false;
    failCount = 0;
    lastAttemptAt = 0;
    attempting = false;
    HS_CALL_PER_AD = false;
  }

  function tick() {
    const p = getPlayer();
    if (p && p !== playerEl) playerEl = p;
    hideAdStuff();
    if (isAdShowing()) {
      if (!handlingAd) {
        handleAd().catch((err) => {
          console.error("[YT AdCtl] handler error", err);
          document.removeEventListener("keydown", keyHijack, true);
          handlingAd = false;
          exitAdPodIfNeeded();
        });
      } else {
        enterAdPodIfNeeded();
      }
    } else {
      exitAdPodIfNeeded();
      document.removeEventListener("keydown", keyHijack, true);
      handlingAd = false;
      HS_CALL_PER_AD = false;
    }
    setTimeout(tick, POLL_MS);
  }

  function boot() {
    playerEl = getPlayer();
    videoEl = getVideo();
    hideAdStuff();
    observeFeed();
    tick();
  }
  document.addEventListener("yt-navigate-finish", () => {
    playerEl = getPlayer();
    exitAdPodIfNeeded();
    document.removeEventListener("keydown", keyHijack, true);
    handlingAd = false;
    HS_CALL_PER_AD = false;
    hideAdStuff();
  });
  boot();
})();
