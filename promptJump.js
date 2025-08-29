// ==UserScript==
// @name         ChatGPT: Prompt Navigator + Bookmarks (Fixed Glass Card, Option+↑/↓)
// @namespace    https://example.com
// @version      2.2
// @description  Jump between your prompts (Option+Down/Up), bookmark prompts, and navigate via a fixed right-side glass card (3em x 7em, centered)
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  // -------- Settings --------
  const HOTKEY_NEXT = { altKey: true, key: "ArrowDown" }; // Option+↓ -> next user prompt
  const HOTKEY_PREV = { altKey: true, key: "ArrowUp" }; // Option+↑ -> prev user prompt
  const SCROLL_BEHAVIOR = "smooth";
  const HEADER_OFFSET_PX = 80; // adjust if a sticky header overlaps
  const CARD_WIDTH_EM = 10; // 3em width
  const CARD_HEIGHT_EM = 30; // 7em height
  const BOOKMARK_SNIPPET_LEN = 80; // chars in card list preview
  const STORAGE_KEY = "lct-bookmarks:" + location.pathname; // per-convo (session)

  // -------- Styles (glass morphism with #3A3A38) --------
  // #3A3A38 -> rgba(58,58,56, alpha)
  GM_addStyle(`
    .lct-user-prompt { scroll-margin-top: ${HEADER_OFFSET_PX}px; position: relative; }
    .lct-flash { animation: lctFlash 750ms ease-in-out; }
    @keyframes lctFlash {
      0% { box-shadow: 0 0 0 0 rgba(140,160,255,0.0); }
      20% { box-shadow: 0 0 0 8px rgba(140,160,255,0.25); }
      100% { box-shadow: 0 0 0 0 rgba(140,160,255,0.0); }
    }

    /* Bookmark circle on each of your prompts */
    .lct-bm-btn {
      position: absolute; top: 8px; right: -4px;
      width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid #C7B68A;
      background: rgba(0,0,0,0.0); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      z-index: 5;
    }
    .lct-bm-btn:hover { transform: scale(1.06); background: rgba(140,160,255,0.08); }
    .lct-bm-btn::after {
      content: '★'; font-size: 13px; opacity: 0.0; transition: opacity 120ms ease;
      color: #ffffff;
    }
    .lct-bm-btn.lct-active { background: rgba(199,182,138,0.78); border-color: rgba(199,182,138,1); }
    .lct-bm-btn.lct-active::after { opacity: 1; }

    /* Fixed glass card (3em x 7em), right-attached, vertically centered */
    .lct-card {
      position: fixed;
      top: 50%;
      right: 0em;
      transform: translateY(-50%);
      width: ${CARD_WIDTH_EM}em;
      height: ${CARD_HEIGHT_EM}em;
      display: flex;
      flex-direction: column;

      /* Glass morphism using #3A3A38 */
      background: rgba(58,58,56, 0.35);
      border-left: 1px solid rgba(255,255,255,0.18);
      border-top: 1px solid rgba(255,255,255,0.10);
      border-bottom: 1px solid rgba(255,255,255,0.10);
      box-shadow: -8px 0 18px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.25);
      backdrop-filter: blur(12px) saturate(125%);
      -webkit-backdrop-filter: blur(12px) saturate(125%);
      color: #ECECEA;
      z-index: 999995;

      border-radius: 10px 0 0 10px; /* slight rounding on left edge */
      overflow: hidden;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    }

    .lct-card-head {
      flex: 0 0 auto;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.12);
      font-size: 11px;
      font-weight: 600;
      display: flex; align-items: center; justify-content: space-between;
      letter-spacing: 0.2px;
    }
    .lct-card-count { opacity: 0.8; font-weight: 600; font-size: 10px; }
    .lct-card-list {
      flex: 1 1 auto;
      overflow: auto;
      padding: 6px;
      display: grid;
      gap: 6px;
    }
    .lct-item {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 8px;
      padding: 6px;
      line-height: 1.2;
      font-size: 10px;
      cursor: pointer;
    }
    .lct-item:hover { background: rgba(255,255,255,0.12); }
    .lct-item .lct-item-meta { opacity: 0.7; margin-bottom: 3px; font-size: 9px; }

    /* HUD counter nudged left so it doesn't sit under the card */
    .lct-hud {
      position: fixed;
      bottom: 16px;
      right: 0em;
      border-radius: 10px 0 0 10px;
      padding: 6px 10px; font-size: 12px;
      background: rgba(0,0,0,0.6); color: #fff; border-radius: 8px;
      z-index: 999996; pointer-events: none; user-select: none;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    }

    /* Keep bookmark circle visible on narrower screens */
    @media (max-width: 1100px) {
      .lct-bm-btn { right: -28px; }
    }
  `);

  // -------- DOM helpers --------
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

  const textOfUserBlock = (el) => {
    let t = el.textContent || "";
    t = t.replace(/\s+/g, " ").trim();
    return t;
  };

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

  // Simple hash to identify a prompt
  const hash = (str) => {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  };

  // -------- State --------
  let userBlocks = [];
  let currentIndex = -1;

  // bookmarks: Map<hash, {hash, snippet}>
  let bookmarks = new Map();

  const loadBookmarks = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        bookmarks = new Map(arr.map((x) => [x.hash, x]));
      }
    } catch {}
  };
  const saveBookmarks = () => {
    try {
      const arr = Array.from(bookmarks.values());
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {}
  };

  // -------- Navigation (Option+↑/↓, cyclic) --------
  const indexNearestToViewportTop = (arr) => {
    let idx = 0,
      best = Infinity;
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
    const el = userBlocks[currentIndex];
    scrollToEl(el);
    updateHUD();
  };

  const jump = (delta) => {
    if (!userBlocks.length) return;
    let idx =
      currentIndex >= 0 ? currentIndex : indexNearestToViewportTop(userBlocks);
    idx += delta;
    if (idx < 0) idx = userBlocks.length - 1;
    else if (idx >= userBlocks.length) idx = 0;
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

  // -------- Fixed Glass Card --------
  const card = document.createElement("aside");
  card.className = "lct-card";
  card.innerHTML = `
    <div class="lct-card-head">
      <div>Bookmarks</div>
      <div class="lct-card-count">0</div>
    </div>
    <div class="lct-card-list"></div>
  `;
  document.documentElement.appendChild(card);
  const cardCount = card.querySelector(".lct-card-count");
  const cardList = card.querySelector(".lct-card-list");

  const renderCard = () => {
    cardList.innerHTML = "";
    const items = Array.from(bookmarks.values());
    cardCount.textContent = `${items.length}`;

    if (!items.length) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.8";
      empty.style.fontSize = "10px";
      empty.textContent = "—";
      cardList.appendChild(empty);
      return;
    }

    // hash -> element map
    const mapHashToEl = new Map();
    userBlocks.forEach((el) => {
      const h = el.getAttribute("data-lct-hash");
      if (h) mapHashToEl.set(h, el);
    });

    items.forEach((bm, i) => {
      const li = document.createElement("div");
      li.className = "lct-item";
      li.innerHTML = `
        <div class="lct-item-meta">#${i + 1}</div>
        <div class="lct-item-text">${escapeHTML(bm.snippet)}</div>
      `;
      li.addEventListener("click", () => {
        const target = mapHashToEl.get(bm.hash);
        if (target) scrollToEl(target);
      });
      cardList.appendChild(li);
    });
  };

  // -------- Bookmark buttons on each user block --------
  const ensureBookmarkButtons = () => {
    userBlocks.forEach((el) => {
      el.classList.add("lct-user-prompt");

      // assign a stable hash per block
      if (!el.hasAttribute("data-lct-hash")) {
        const snippetForHash = textOfUserBlock(el).slice(0, 400); // longer slice for stability
        el.setAttribute("data-lct-hash", hash(snippetForHash));
      }
      const h = el.getAttribute("data-lct-hash");

      // button exists?
      let btn = el.querySelector(":scope > .lct-bm-btn");
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
            const full = textOfUserBlock(el);
            const snippet =
              full.length > BOOKMARK_SNIPPET_LEN
                ? full.slice(0, BOOKMARK_SNIPPET_LEN) + "…"
                : full;
            bookmarks.set(h, { hash: h, snippet });
            btn.classList.add("lct-active");
          }
          saveBookmarks();
          renderCard();
        });
      }
      // sync active
      btn.classList.toggle("lct-active", bookmarks.has(h));
    });
  };

  // -------- Keyboard handling (works even inside input) --------
  const isOurHotkey = (e) =>
    e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    (e.key === HOTKEY_NEXT.key || e.key === HOTKEY_PREV.key);

  const handleKeydown = (e) => {
    if (!isOurHotkey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function")
      e.stopImmediatePropagation();
    jump(e.key === HOTKEY_NEXT.key ? +1 : -1);
  };
  window.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("keydown", handleKeydown, true);

  // -------- Observer & boot --------
  const refreshAll = () => {
    userBlocks = getAllUserBlocks();
    ensureBookmarkButtons();
    if (currentIndex < 0 && userBlocks.length) {
      currentIndex = indexNearestToViewportTop(userBlocks);
    }
    renderCard();
    updateHUD();
  };

  const obs = new MutationObserver(() => {
    if (refreshAll._t) clearTimeout(refreshAll._t);
    refreshAll._t = setTimeout(refreshAll, 150);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  const boot = () => {
    loadBookmarks();
    refreshAll();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
