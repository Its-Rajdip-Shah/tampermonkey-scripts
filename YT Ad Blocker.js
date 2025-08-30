// ==UserScript==
// @name         YT AD Blocker
// @namespace    https://example.com
// @version      0.8
// @description  Force YouTube video ads (including 1/2 → 2/2 pods) to 16×; restore user speed after; hide feed ads
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const AD_SPEED = 16.0;
  const CHECK_MS = 150;
  const LOG = false;
  const TOGGLE_HOTKEY = "KeyJ"; // Alt+J toggles

  const log = (...a) => LOG && console.log("[Ad16x]", ...a);

  let enabled = true;
  let playerEl = null;
  let videoEl = null;

  // We track a whole "ad session" (pod). We save user speed once when pod starts,
  // and only restore after the pod fully ends.
  let inAdPod = false;
  let userSpeedBeforePod = 1.0;

  // ---------- Utilities ----------
  function getPlayer() {
    return (
      document.querySelector(".html5-video-player") ||
      document.querySelector("#movie_player")
    );
  }
  function getVideo() {
    const p = getPlayer();
    return (p && p.querySelector("video")) || document.querySelector("video");
  }

  // Robust ad detector: multiple signals
  function isAdShowing() {
    const p = playerEl || getPlayer();
    if (
      p &&
      (p.classList.contains("ad-showing") ||
        p.classList.contains("ad-interrupting"))
    )
      return true;

    const adModule = document.querySelector(".video-ads.ytp-ad-module");
    if (adModule) {
      if (
        adModule.querySelector(".ytp-ad-player-overlay-layout") ||
        adModule.querySelector(".ytp-ad-persistent-progress-bar") ||
        adModule.querySelector(".ytp-visit-advertiser-link") ||
        adModule.querySelector(".ytp-ad-skip-button") ||
        adModule.querySelector(".ytp-ad-skip-button-modern") ||
        adModule.querySelector('[id^="ad-badge:"]') ||
        adModule.querySelector(".ytp-ad-preview-container") ||
        adModule.querySelector(".ytp-ad-text")
      )
        return true;
    }
    return false;
  }

  function setSpeed(v, rate) {
    if (!v) return;
    try {
      v.playbackRate = rate;
    } catch {}
  }

  // ---------- Feed ad hider ----------
  function hideFeedAds() {
    document.querySelectorAll("ytd-ad-slot-renderer").forEach((el) => {
      if (el.style.display !== "none") {
        el.style.display = "none";
        log("Hid feed ad", el);
      }
    });
  }

  // ---------- Core logic ----------
  function enterAdPodIfNeeded() {
    if (!inAdPod) {
      inAdPod = true;
      userSpeedBeforePod = (videoEl && videoEl.playbackRate) || 1.0;
      log("Ad POD start; remember user speed", userSpeedBeforePod);
    }
    // Every time we see an ad event (e.g., 2/2 starts with a new <video>), clamp again
    setSpeed(videoEl, AD_SPEED);
  }

  function exitAdPodIfNeeded() {
    if (inAdPod) {
      inAdPod = false;
      // Restore to user speed from before the pod began
      setSpeed(videoEl, userSpeedBeforePod);
      log("Ad POD end; restore user speed", userSpeedBeforePod);
    }
  }

  function enforce() {
    if (!enabled) return;

    // Keep references fresh
    const p = getPlayer();
    if (p && p !== playerEl) {
      playerEl = p;
      log("Player changed");
      bindVideoEvents(); // rebind on player change; will grab current video
    }
    const v = getVideo();
    if (v && v !== videoEl) {
      videoEl = v;
      log("Video changed");
      bindPerVideoEvents(videoEl); // new <video> (typical between ad 1/2 → 2/2)
    }

    // Detect ad state
    if (isAdShowing()) {
      enterAdPodIfNeeded();
      // Sometimes YT resets rate during ad; clamp repeatedly
      if (videoEl && videoEl.playbackRate !== AD_SPEED)
        setSpeed(videoEl, AD_SPEED);
    } else {
      exitAdPodIfNeeded();
    }
  }

  // ---------- Event wiring ----------
  // When SPA nav finishes, re-evaluate
  function bindNavEvents() {
    document.addEventListener("yt-navigate-finish", () => {
      log("yt-navigate-finish");
      playerEl = getPlayer();
      videoEl = getVideo();
      hideFeedAds();
      if (videoEl) bindPerVideoEvents(videoEl);
    });
  }

  // Observe DOM changes to catch ad overlay/video swaps
  function observeDom() {
    const obs = new MutationObserver((ms) => {
      for (const m of ms) {
        // If video-ads subtree changes during a pod (e.g., ad 2 replaces ad 1)
        if (
          m.target &&
          (m.target.classList?.contains("video-ads") ||
            m.target.id === "movie_player")
        ) {
          log("Mutation in ad/player area");
        }
      }
      // Always keep refs current
      const v = getVideo();
      if (v && v !== videoEl) {
        videoEl = v;
        log("Video swapped (MutationObserver)");
        bindPerVideoEvents(videoEl);
      }
      hideFeedAds();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function bindVideoEvents() {
    const v = getVideo();
    if (!v) return;
    if (v !== videoEl) {
      videoEl = v;
      log("bindVideoEvents -> grabbed video");
    }
    bindPerVideoEvents(videoEl);
  }

  // Bind to *this* video element to handle ad 2/2 creation/reset
  function bindPerVideoEvents(v) {
    if (!v || v._ad16xBound) return;
    v._ad16xBound = true;

    const reassert = () => {
      if (!enabled) return;
      if (isAdShowing()) {
        // Still within ad pod (even if 2/2 just began)
        enterAdPodIfNeeded();
        setSpeed(v, AD_SPEED);
        log("Reassert 16x on video event");
      }
    };

    // When a new media stream attaches (typical at start of ad 2/2)
    v.addEventListener("loadedmetadata", reassert, true);
    v.addEventListener("loadeddata", reassert, true);
    v.addEventListener("canplay", reassert, true);
    v.addEventListener("playing", reassert, true);

    // If YT or the ad resets the rate, snap back
    v.addEventListener(
      "ratechange",
      () => {
        if (!enabled) return;
        if (isAdShowing() && v.playbackRate !== AD_SPEED) {
          setSpeed(v, AD_SPEED);
          log("Clamped after ratechange");
        }
        // If user changes during content, remember for later restore
        if (!isAdShowing()) {
          // only update when not in ad
          userSpeedBeforePod = v.playbackRate || 1.0;
        }
      },
      true
    );

    // Some pods briefly swap src or empty the video
    const srcObs = new MutationObserver(() => reassert());
    srcObs.observe(v, { attributes: true, attributeFilter: ["src"] });
  }

  // Toggle with Alt+J
  function addHotkey() {
    window.addEventListener("keydown", (e) => {
      if (e.altKey && e.code === TOGGLE_HOTKEY) {
        enabled = !enabled;
        toast(`Ad 16× ${enabled ? "enabled" : "disabled"}`);
      }
    });
  }

  // Tiny toast
  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      Object.assign(toastEl.style, {
        position: "fixed",
        zIndex: 999999,
        right: "12px",
        bottom: "12px",
        padding: "8px 10px",
        borderRadius: "6px",
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        font: "12px system-ui, sans-serif",
        pointerEvents: "none",
      });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    setTimeout(() => (toastEl.style.opacity = "0"), 1200);
  }

  // ---------- Boot ----------
  playerEl = getPlayer();
  videoEl = getVideo();
  bindNavEvents();
  observeDom();
  bindVideoEvents();
  addHotkey();
  hideFeedAds();

  // Main loop (lightweight clamp + feed hide)
  setInterval(() => {
    enforce();
    hideFeedAds();
  }, CHECK_MS);
})();
