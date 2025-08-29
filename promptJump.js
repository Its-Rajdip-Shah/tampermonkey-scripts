// ==UserScript==
// @name         ChatGPT: Jump Between *Your* Prompts (Option+↑/↓, cyclic, works in input)
// @namespace    https://example.com
// @version      1.3
// @description  Option+Down/Up to jump between your own prompts (skip assistant responses), wrap-around, and works even when the textbox is focused
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  // -------- Settings --------
  const HOTKEY_NEXT = { altKey: true, key: "ArrowDown" }; // Option+↓ -> next user prompt
  const HOTKEY_PREV = { altKey: true, key: "ArrowUp" }; // Option+↑ -> prev user prompt
  const SCROLL_BEHAVIOR = "smooth"; // 'auto' or 'smooth'
  const HEADER_OFFSET_PX = 80; // adjust if header overlaps scrolled-to content

  // -------- Styles --------
  GM_addStyle(`
    .lct-user-prompt {
      scroll-margin-top: ${HEADER_OFFSET_PX}px;
    }
    .lct-flash {
      animation: lctFlash 750ms ease-in-out;
    }
    @keyframes lctFlash {
      0% { box-shadow: 0 0 0 0 rgba(140,160,255,0.0); }
      20% { box-shadow: 0 0 0 6px rgba(140,160,255,0.25); }
      100% { box-shadow: 0 0 0 0 rgba(140,160,255,0.0); }
    }
    .lct-hud {
      position: fixed;
      bottom: 16px;
      right: 16px;
      padding: 6px 10px;
      font-size: 12px;
      background: rgba(0,0,0,0.6);
      color: #fff;
      border-radius: 8px;
      z-index: 999999;
      pointer-events: none;
      user-select: none;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    }
  `);

  // -------- Helpers --------
  const USER_SELECTORS = [
    '[data-message-author-role="user"]',
    'div[data-testid="conversation-turn"][data-role="user"]',
    'article[data-message-author-role="user"]',
  ].join(",");

  const getAllUserBlocks = () => {
    const nodes = Array.from(document.querySelectorAll(USER_SELECTORS));
    const seen = new Set();
    return nodes.filter((n) => {
      if (!n || !(n instanceof Element)) return false;
      if (seen.has(n)) return false;
      seen.add(n);
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  };

  const markUserBlocks = (blocks) => {
    blocks.forEach((b) => b.classList.add("lct-user-prompt"));
  };

  // -------- State --------
  let userBlocks = [];
  let currentIndex = -1;

  const indexNearestToViewportTop = (arr) => {
    let idx = 0;
    let best = Infinity;
    const top = HEADER_OFFSET_PX + 1;
    arr.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top - top);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    return idx;
  };

  const refreshBlocks = () => {
    userBlocks = getAllUserBlocks();
    markUserBlocks(userBlocks);
    if (currentIndex < 0 && userBlocks.length) {
      currentIndex = indexNearestToViewportTop(userBlocks);
    }
    updateHUD();
  };

  const scrollToIndex = (idx) => {
    if (idx < 0 || idx >= userBlocks.length) return;
    currentIndex = idx;
    const el = userBlocks[currentIndex];
    el.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: "start" });
    el.classList.remove("lct-flash");
    void el.offsetWidth;
    el.classList.add("lct-flash");
    updateHUD();
  };

  // -------- Cyclic jump (wrap-around) --------
  const jump = (delta) => {
    if (!userBlocks.length) return;

    let idx =
      currentIndex >= 0 ? currentIndex : indexNearestToViewportTop(userBlocks);
    idx += delta;

    // wrap around
    if (idx < 0) {
      idx = userBlocks.length - 1;
    } else if (idx >= userBlocks.length) {
      idx = 0;
    }

    scrollToIndex(idx);
  };

  // -------- HUD --------
  const hud = document.createElement("div");
  hud.className = "lct-hud";
  document.documentElement.appendChild(hud);

  const updateHUD = () => {
    if (!userBlocks.length) {
      hud.style.display = "none";
      return;
    }
    hud.style.display = "block";
    const pos =
      (currentIndex >= 0
        ? currentIndex
        : indexNearestToViewportTop(userBlocks)) + 1;
    hud.textContent = `Your prompts: ${pos}/${userBlocks.length}  (Option+↑/↓)`;
  };

  // -------- Key handling (works even inside the input) --------
  const isOurHotkey = (e) =>
    e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    (e.key === HOTKEY_NEXT.key || e.key === HOTKEY_PREV.key);

  const handleKeydown = (e) => {
    // Only act on our hotkeys
    if (!isOurHotkey(e)) return;

    // Prevent the input/textarea from also handling Option+ArrowUp/Down
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function")
      e.stopImmediatePropagation();

    jump(e.key === HOTKEY_NEXT.key ? +1 : -1);
  };

  // Capture early so we win over site handlers (works in input too)
  window.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("keydown", handleKeydown, true);

  // -------- Observe DOM changes to keep list fresh --------
  const obs = new MutationObserver(() => {
    if (refreshBlocks._t) clearTimeout(refreshBlocks._t);
    refreshBlocks._t = setTimeout(refreshBlocks, 150);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // -------- Boot --------
  const boot = () => refreshBlocks();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
