// ==UserScript==
// @name         ChatGPT Warm Sepia Theme (Unified, Code Blended)
// @namespace    https://example.com
// @version      1.6
// @description  Warm sepia theme: nav, sidebar, messages, composer, overlay fixes, and code blocks that blend with the page
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  GM_addStyle(`
    /* ---------- Base ---------- */
    body {
      background: #F4ECD8 !important;     /* parchment page */
      color: #3B2F2F !important;          /* dark brown text */
    }
    ::selection {
      background: #E6D6B8 !important;     /* warm highlight */
      color: #2C2424 !important;
      text-shadow: none !important;
    }

    /* ---------- Top nav bar ---------- */
    .bg-token-main-surface-primary,
    header.sticky.top-0,
    header[role="banner"] {
      background: #E9DFC7 !important;     /* match sidebar beige */
      color: #3B2F2F !important;
    }

    /* ---------- Sidebar & elevated surfaces ---------- */
    nav[aria-label="Chat history"],
    [class*="sidebar"],
    .bg-token-bg-elevated-secondary,
    .bg-token-bg-elevated-secondary\\/20 {
      background: #E9DFC7 !important;
      color: #3B2F2F !important;
    }

    /* ---------- Messages ---------- */
    [data-message-author-role="assistant"] {
      background: #EADDC8 !important;     /* soft sepia */
      color: #3B2F2F !important;
      border-radius: 12px !important;
      padding: 12px !important;
    }
    [data-message-author-role="user"] {
      background: #DCC9A3 !important;     /* richer beige */
      color: #3B2F2F !important;
      border-radius: 12px !important;
      padding: 12px !important;
    }

    /* ---------- Composer bar + input ---------- */
    .bg-token-bg-primary,
    div:has(> textarea) {
      background: #F2E6CE !important;     /* bottom strip */
      border-top: 1px solid #C2A878 !important;
      position: relative !important;
      z-index: 9999 !important;           /* above any fade overlay */
    }
    textarea,
    input[type="text"],
    input[type="search"] {
      background: #F9F1E3 !important;     /* lighter parchment to pop */
      color: #3B2F2F !important;
      border: 1px solid #C2A878 !important;
      border-radius: 10px !important;
      position: relative !important;
      z-index: 10000 !important;
    }
    textarea::placeholder,
    input::placeholder {
      color: #7A6A54 !important;
      opacity: 1 !important;
    }

    /* Neutralize explicit dark utilities that sometimes appear */
    [class*="bg-\\[\\#303030\\]"] { background: #F2E6CE !important; }

    /* ---------- Kill EXACT bottom overlay gradient ---------- */
    .content-fade.single-line:after,
    .content-fade:after {
      background: none !important;
      box-shadow: none !important;
      opacity: 0 !important;
      z-index: -9999 !important;
      pointer-events: none !important;
      content: "" !important;
      position: absolute !important;
      inset: 0 !important;
    }

    /* ---------- Code blocks + inline code (blend with page) ---------- */
    /* Inline code (no pill background) */
    :not(pre) > code {
      background: none !important;
      color: #2C2424 !important;
      border: none !important;
      border-radius: 0 !important;
      padding: 0 !important;
    }
    /* Block code (no box) */
    pre {
      background: none !important;
      color: #2C2424 !important;
      border: none !important;
      border-radius: 0 !important;
      padding: 0 !important;
      overflow-x: auto !important;
      font-size: 0.95em !important;
      line-height: 1.5 !important;
    }
    /* Override dark prose-invert that applied gray boxes to code */
    .dark\\:prose-invert:is(.dark *) :where(code):not(:where([class~=not-prose],[class~=not-prose] *)) {
      background: none !important;
      color: #2C2424 !important;
    }
  `);
})();
