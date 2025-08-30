// ==UserScript==
// @name         ChatGPT: Prompt Navigator + Bookmarks (Glass Card auto-hide, dynamic height, Option+↑/↓)
// @namespace    https://example.com
// @version      2.5
// @description  Jump between your prompts (Option+Down/Up), bookmark prompts, clear all bookmarks, and auto-hide the glass card when empty (max height 30em, 2-line clamp)
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const HOTKEY_NEXT = { altKey: true, key: "ArrowDown" };
  const HOTKEY_PREV = { altKey: true, key: "ArrowUp" };
  const SCROLL_BEHAVIOR = "smooth";
  const HEADER_OFFSET_PX = 80;
  const CARD_WIDTH_EM = 10;
  const MAX_CARD_HEIGHT_EM = 30;
  const BOOKMARK_SNIPPET_LEN = 80;
  const STORAGE_KEY = "lct-bookmarks:" + location.pathname;

  GM_addStyle(`
    .lct-user-prompt { scroll-margin-top: ${HEADER_OFFSET_PX}px; position: relative; }
    .lct-flash { animation: lctFlash 750ms ease-in-out; }
    @keyframes lctFlash { 0%{box-shadow:0 0 0 0 rgba(140,160,255,0);} 20%{box-shadow:0 0 0 8px rgba(140,160,255,0.25);} 100%{box-shadow:0 0 0 0 rgba(140,160,255,0);} }

    .lct-bm-btn {
      position: absolute; top: 8px; right: -4px;
      width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid #C7B68A;
      background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      z-index: 5;
    }
    .lct-bm-btn:hover { transform: scale(1.06); background: rgba(140,160,255,0.08); }
    .lct-bm-btn::after { content:'★'; font-size:13px; opacity:0; transition:opacity 120ms ease; color:#fff; }
    .lct-bm-btn.lct-active { background: rgba(199,182,138,0.78); border-color: rgba(199,182,138,1); }
    .lct-bm-btn.lct-active::after { opacity:1; }

    .lct-card {
      position: fixed;
      top: 50%; right: 0;
      transform: translateY(-50%);
      width: ${CARD_WIDTH_EM}em;
      height: auto; max-height: ${MAX_CARD_HEIGHT_EM}em;
      display: flex; flex-direction: column;

      background: rgba(58,58,56,0.35);
      border-left: 1px solid rgba(255,255,255,0.18);
      border-top: 1px solid rgba(255,255,255,0.10);
      border-bottom: 1px solid rgba(255,255,255,0.10);
      box-shadow: -8px 0 18px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.25);
      backdrop-filter: blur(12px) saturate(125%);
      -webkit-backdrop-filter: blur(12px) saturate(125%);
      color:#ECECEA; z-index:999995;
      border-radius:10px 0 0 10px;
      overflow:hidden;
      font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    }

    .lct-card-head {
      flex: 0 0 auto; padding: 6px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.12);
      font-size:11px; font-weight:600;
      display:flex; align-items:center; justify-content:space-between;
    }
    .lct-card-actions { display:flex; gap:6px; align-items:center; }
    .lct-btn-clear {
      font-size:10px; padding:2px 6px; border-radius:6px; cursor:pointer;
      border:1px solid rgba(255,255,255,0.3);
      background:rgba(255,255,255,0.08); color:#ECECEA;
    }
    .lct-btn-clear:hover { background:rgba(255,255,255,0.18); }
    .lct-card-count { opacity:.8; font-weight:600; font-size:10px; }

    .lct-card-list { flex:1 1 auto; overflow:auto; padding:6px; display:grid; gap:6px; }
    .lct-item {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 8px; padding:6px;
      line-height:1.2; font-size:12px; cursor:pointer;
      display:flex; flex-direction:column;
    }
    .lct-item:hover { background: rgba(255,255,255,0.12); }
    .lct-item .lct-item-meta { opacity:.7; margin-bottom:3px; font-size:9px; }
    .lct-item .lct-item-text {
      display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;
      overflow:hidden; text-overflow:ellipsis;
    }

    .lct-hud {
      position: fixed; bottom: 16px; right: 0px;
      padding:6px 10px; font-size:12px;
      background: rgba(0,0,0,0.6); color:#fff; border-radius:8px;
      z-index:999996; pointer-events:none; user-select:none;
      font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    }
  `);

  const USER_SELECTORS = [
    '[data-message-author-role="user"]',
    'div[data-testid="conversation-turn"][data-role="user"]',
    'article[data-message-author-role="user"]',
  ].join(",");

  const getAllUserBlocks = () =>
    Array.from(document.querySelectorAll(USER_SELECTORS));
  const textOfUserBlock = (el) =>
    (el.textContent || "").replace(/\s+/g, " ").trim();
  const escapeHTML = (s) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  const hash = (str) => {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  };

  let userBlocks = [];
  let currentIndex = -1;
  let bookmarks = new Map();

  const loadBookmarks = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) bookmarks = new Map(JSON.parse(raw).map((x) => [x.hash, x]));
    } catch {}
  };
  const saveBookmarks = () => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...bookmarks.values()])
      );
    } catch {}
  };

  const indexNearestToViewportTop = (arr) => {
    let idx = 0,
      best = Infinity,
      top = HEADER_OFFSET_PX + 1;
    arr.forEach((el, i) => {
      const d = Math.abs(el.getBoundingClientRect().top - top);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    return idx;
  };
  const scrollToEl = (el) => {
    if (!el) return;
    el.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: "start" });
    el.classList.remove("lct-flash");
    void el.offsetWidth;
    el.classList.add("lct-flash");
  };
  const scrollToIndex = (idx) => {
    if (idx < 0 || idx >= userBlocks.length) return;
    currentIndex = idx;
    scrollToEl(userBlocks[idx]);
    updateHUD();
  };
  const jump = (delta) => {
    if (!userBlocks.length) return;
    let idx =
      currentIndex >= 0 ? currentIndex : indexNearestToViewportTop(userBlocks);
    idx = (idx + delta + userBlocks.length) % userBlocks.length;
    scrollToIndex(idx);
  };

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
    hud.textContent = `Your prompts: ${pos}/${userBlocks.length} (Option+↑/↓)`;
  };

  const card = document.createElement("aside");
  card.className = "lct-card";
  card.innerHTML = `<div class="lct-card-head"><div>Bookmarks</div>
    <div class="lct-card-actions"><span class="lct-card-count">0</span>
    <button class="lct-btn-clear">Clear</button></div></div><div class="lct-card-list"></div>`;
  document.documentElement.appendChild(card);
  const cardCount = card.querySelector(".lct-card-count");
  const cardList = card.querySelector(".lct-card-list");
  const clearBtn = card.querySelector(".lct-btn-clear");

  clearBtn.addEventListener("click", () => {
    bookmarks.clear();
    saveBookmarks();
    renderCard();
    userBlocks.forEach((el) => {
      const btn = el.querySelector(".lct-bm-btn");
      if (btn) btn.classList.remove("lct-active");
    });
  });

  const renderCard = () => {
    cardList.innerHTML = "";
    const items = [...bookmarks.values()];
    cardCount.textContent = `${items.length}`;
    if (!items.length) {
      card.style.display = "none";
      return;
    } else {
      card.style.display = "flex";
    }
    const mapHashToEl = new Map();
    userBlocks.forEach((el) =>
      mapHashToEl.set(el.getAttribute("data-lct-hash"), el)
    );
    items.forEach((bm, i) => {
      const li = document.createElement("div");
      li.className = "lct-item";
      li.innerHTML = `<div class="lct-item-meta">#${
        i + 1
      }</div><div class="lct-item-text">${escapeHTML(bm.snippet)}</div>`;
      li.addEventListener("click", () => scrollToEl(mapHashToEl.get(bm.hash)));
      cardList.appendChild(li);
    });
  };

  const ensureBookmarkButtons = () => {
    userBlocks.forEach((el) => {
      el.classList.add("lct-user-prompt");
      if (!el.hasAttribute("data-lct-hash"))
        el.setAttribute(
          "data-lct-hash",
          hash(textOfUserBlock(el).slice(0, 400))
        );
      const h = el.getAttribute("data-lct-hash");
      let btn = el.querySelector(".lct-bm-btn");
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lct-bm-btn";
        btn.title = "Bookmark this prompt";
        el.appendChild(btn);
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (bookmarks.has(h)) {
            bookmarks.delete(h);
            btn.classList.remove("lct-active");
          } else {
            const snippet = textOfUserBlock(el).slice(0, BOOKMARK_SNIPPET_LEN);
            bookmarks.set(h, { hash: h, snippet });
            btn.classList.add("lct-active");
          }
          saveBookmarks();
          renderCard();
        });
      }
      btn.classList.toggle("lct-active", bookmarks.has(h));
    });
  };

  const handleKeydown = (e) => {
    if (
      e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      (e.key === HOTKEY_NEXT.key || e.key === HOTKEY_PREV.key)
    ) {
      e.preventDefault();
      e.stopPropagation();
      jump(e.key === HOTKEY_NEXT.key ? 1 : -1);
    }
  };
  window.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("keydown", handleKeydown, true);

  const refreshAll = () => {
    userBlocks = getAllUserBlocks();
    ensureBookmarkButtons();
    if (currentIndex < 0 && userBlocks.length)
      currentIndex = indexNearestToViewportTop(userBlocks);
    renderCard();
    updateHUD();
  };
  new MutationObserver(() => {
    clearTimeout(refreshAll._t);
    refreshAll._t = setTimeout(refreshAll, 150);
  }).observe(document.documentElement, { childList: true, subtree: true });

  const boot = () => {
    loadBookmarks();
    refreshAll();
  };
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", boot)
    : boot();
})();
