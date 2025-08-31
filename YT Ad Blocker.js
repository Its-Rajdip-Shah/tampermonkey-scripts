// ==UserScript==
// @name         YT ad blocker
// @namespace    https://example.com
// @version      1.0
// @description  Force 16× during ads (pods), restore user speed after; hide feed/in-feed ads; skip ads via key-hijack (Enter/Space) with programmatic fallback and clear toasts.
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  // ========= CONFIG =========
  const AD_SPEED = 50.0; // playbackRate during ads
  const POLL_MS = 150; // main poll
  const VERIFY_MS = 1500; // verify window after a programmatic click
  const RETRY_COOLDOWN = 1200; // spacing between programmatic attempts while "ready"
  const TOAST_DEDUP_MS = 400; // avoid spamming identical messages
  const LOG = false;

  // ========= STATE =========
  let playerEl = null;
  let videoEl = null;

  // Ad pod & speed restore
  let inAdPod = false;
  let userSpeedBeforePod = 1.0;

  // Skip state
  let handlingAd = false;
  let failCount = 0;
  let lastAttemptAt = 0;
  let attempting = false;
  let readyAnnounced = false;

  // General UI state
  let waitingToastShown = false;
  let waitingPlayToastShown = false;

  // ========= HELPERS =========
  const log = (...a) => LOG && console.log("[YT AdCtl]", ...a);

  const getPlayer = () =>
    document.querySelector(".html5-video-player") ||
    document.querySelector("#movie_player");

  const getVideo = () => {
    const p = getPlayer();
    return (p && p.querySelector("video")) || document.querySelector("video");
  };

  const isAdShowing = () => {
    const p = playerEl || getPlayer();
    return !!(
      p &&
      (p.classList.contains("ad-showing") ||
        p.classList.contains("ad-interrupting"))
    );
  };

  // "Unstoppable" per your spec: no <div class="ytp-skip-ad">
  const hasSkipContainer = () => !!document.querySelector("div.ytp-skip-ad");

  const getSkipBtn = () => document.querySelector(".ytp-skip-ad-button");

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

  // Readiness (NO opacity check — 0.5 is fine for mouse/activation)
  function isButtonReady(btn) {
    if (!btn) return false;
    const cs = getComputedStyle(btn);
    if (cs.display === "none") return false;
    if (cs.visibility === "hidden") return false;
    if (btn.getAttribute("aria-disabled") === "true") return false;
    if (!inViewport(btn)) return false;
    const label = (
      btn.getAttribute("aria-label") ||
      btn.textContent ||
      ""
    ).toLowerCase();
    if (!/skip/.test(label)) return false;
    if (/\bin\b\s*\d/.test(label)) return false; // avoid “in 5”
    return true;
  }

  const setSpeed = (v, rate) => {
    try {
      v.playbackRate = rate;
    } catch {}
  };
  const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));

  // ========= TOASTS =========
  let toastEl,
    lastToast = "",
    lastToastAt = 0;
  function toast(msg, ms = 1200) {
    const now = performance.now();
    if (msg === lastToast && now - lastToastAt < TOAST_DEDUP_MS) return;
    lastToast = msg;
    lastToastAt = now;

    if (!toastEl) {
      toastEl = document.createElement("div");
      Object.assign(toastEl.style, {
        position: "fixed",
        zIndex: 999999,
        right: "12px",
        bottom: "12px",
        padding: "8px 10px",
        borderRadius: "8px",
        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        font: "12px system-ui, sans-serif",
        pointerEvents: "none",
        boxShadow: "0 6px 18px rgba(0,0,0,.25)",
        transition: "opacity .2s, transform .2s",
        opacity: "0",
        transform: "translateY(6px)",
      });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    toastEl.style.transform = "translateY(0)";
    setTimeout(() => {
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translateY(6px)";
    }, ms);
  }

  // ========= FEED / IN-FEED / PLAYER AD HIDE =========
  function hideFeedAds() {
    document
      .querySelectorAll(
        "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, #player-ads"
      )
      .forEach((el) => {
        if (el.style.display !== "none") el.style.display = "none";
      });
  }

  // ========= 16× DURING ADS / RESTORE AFTER =========
  function enterAdPodIfNeeded() {
    if (!inAdPod) {
      inAdPod = true;
      videoEl = getVideo();
      userSpeedBeforePod = (videoEl && videoEl.playbackRate) || 1.0;
      log("Ad POD start; saved speed", userSpeedBeforePod);
    }
    // clamp during ad
    videoEl = getVideo();
    if (videoEl && videoEl.playbackRate !== AD_SPEED)
      setSpeed(videoEl, AD_SPEED);
  }

  function exitAdPodIfNeeded() {
    if (!inAdPod) return;
    inAdPod = false;
    videoEl = getVideo();
    if (videoEl && videoEl.playbackRate !== userSpeedBeforePod) {
      setSpeed(videoEl, userSpeedBeforePod);
      toast(`🎬 Restored speed to ${userSpeedBeforePod}×`, 1000);
    }
    log("Ad POD end; restored speed", userSpeedBeforePod);
  }

  // ========= SKIP: PROGRAMMATIC ATTEMPT (fallback) =========
  async function attemptProgrammatic(btn, reason = "periodic") {
    if (!btn || attempting) return false;
    const now = performance.now();
    if (now - lastAttemptAt < RETRY_COOLDOWN) return false;

    attempting = true;
    lastAttemptAt = now;
    toast("skipping with approach 1", 900);
    log(`Attempt(${reason}): focus+click`);

    try {
      btn.focus?.({ preventScroll: true });
    } catch {}
    try {
      btn.click?.();
    } catch {}

    await waitMs(VERIFY_MS);
    const ok = !isAdShowing();
    if (!ok) {
      failCount += 1;
      toast(`fail${failCount}`, 900);
    }
    attempting = false;
    return ok;
  }

  // ========= SKIP: KEY HIJACK (trusted path) =========
  // If you press Enter/Space while Skip is ready, focus the button
  // BEFORE the event reaches its target. We do NOT stop the event:
  // the focused <button> receives your trusted key and activates.
  function keyHijack(e) {
    if (!handlingAd || !isAdShowing()) return;
    if (e.key !== "Enter" && e.key !== " ") return;

    const btn = getSkipBtn();
    if (!isButtonReady(btn)) return;

    try {
      btn.focus?.({ preventScroll: true });
    } catch {}
    // Do NOT stop propagation or prevent default:
    // your real key continues and triggers the focused button.
  }

  // ========= AD LIFECYCLE (skip + 16× + feed hide) =========
  async function handleAd() {
    handlingAd = true;
    failCount = 0;
    readyAnnounced = false;
    waitingToastShown = false;
    waitingPlayToastShown = false;

    toast("Ad detected", 900);

    // Add key hijack while the ad is active
    document.addEventListener("keydown", keyHijack, true);

    // Quick "unstoppable" per your spec
    if (!hasSkipContainer()) {
      toast("unstoppable ad", 2000);
      // still apply 16× during ad; restore after
      while (isAdShowing()) {
        enterAdPodIfNeeded();
        hideFeedAds();
        await waitMs(POLL_MS);
      }
      exitAdPodIfNeeded();
      cleanupSkip();
      handlingAd = false;
      return;
    }

    // While ad active, maintain 16× and hide feed ads; await playable
    while (isAdShowing()) {
      enterAdPodIfNeeded();
      hideFeedAds();

      const v = getVideo();
      if (!(v && !v.paused && v.readyState >= 2)) {
        if (!waitingPlayToastShown) {
          toast("waiting for ad to play…", 900);
          waitingPlayToastShown = true;
        }
        await waitMs(250);
        continue;
      } else {
        waitingPlayToastShown = false;
      }

      // Skip readiness & actions
      const btn = getSkipBtn();
      const ready = isButtonReady(btn);

      if (!ready) {
        if (!waitingToastShown) {
          toast("waiting for skip button", 900);
          waitingToastShown = true;
        }
      } else {
        if (!readyAnnounced) {
          readyAnnounced = true;
          toast("Press Enter/Space to skip (I’ll aim it)", 1400);
        }
        waitingToastShown = false;
        // Also try programmatic click as fallback (some builds allow it)
        await attemptProgrammatic(btn, "periodic");
      }

      await waitMs(POLL_MS);
    }

    // Ad ended — success
    toast("✅ AD SKIPPED", 1200);
    exitAdPodIfNeeded();
    cleanupSkip();
    handlingAd = false;
  }

  function cleanupSkip() {
    document.removeEventListener("keydown", keyHijack, true);
  }

  // ========= MAIN LOOP =========
  function tick() {
    const p = getPlayer();
    if (p && p !== playerEl) playerEl = p;

    // Maintain feed/player ad hiding even out of ads
    hideFeedAds();

    if (isAdShowing()) {
      if (!handlingAd) {
        handleAd().catch((err) => {
          console.error("[YT AdCtl] handler error", err);
          cleanupSkip();
          handlingAd = false;
          exitAdPodIfNeeded();
        });
      } else {
        // keep 16× clamped during ad
        enterAdPodIfNeeded();
      }
    } else {
      // no ad — ensure speed is restored
      exitAdPodIfNeeded();
      cleanupSkip();
      handlingAd = false;
      // reset UI state
      failCount = 0;
      readyAnnounced = false;
      waitingToastShown = false;
      waitingPlayToastShown = false;
      lastToast = "";
    }

    setTimeout(tick, POLL_MS);
  }

  // ========= SPA RESET =========
  document.addEventListener("yt-navigate-finish", () => {
    playerEl = getPlayer();
    exitAdPodIfNeeded();
    cleanupSkip();
    handlingAd = false;
    failCount = 0;
    readyAnnounced = false;
    waitingToastShown = false;
    waitingPlayToastShown = false;
    lastToast = "";
    // keep feed/player ads hidden after navigation too
    hideFeedAds();
  });

  // ========= BOOT =========
  playerEl = getPlayer();
  videoEl = getVideo();
  hideFeedAds();
  tick();
})();
