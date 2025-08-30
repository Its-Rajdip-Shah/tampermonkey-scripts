// ==UserScript==
// @name         ChatGPT Desert Sandy Night (image bg)
// @namespace    https://example.com
// @version      2.2
// @description  Dark desert-night theme with custom image background; sand text + warm accents
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  GM_addStyle(`
    /* ---------- Base with background image ---------- */
    body {
      background-color: #2B2B29 !important;
      background-image: url("https://github.com/Its-Rajdip-Shah/custom-gpt-theme/blob/main/THE%20BG.jpg?raw=true") !important;
      background-size: cover !important;
      background-position: center center !important;
      background-attachment: fixed !important;
      color: #AF9F80 !important;
    }

    /* Overlay to control opacity/darkness */
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background: rgba(43, 43, 43, 0.65);   /* 0.1 opacity overlay */
      
    }

    /* ---------- Top nav & sidebar ---------- */
    .bg-token-main-surface-primary,
    header.sticky.top-0,
    header[role="banner"],
    nav[aria-label="Chat history"],
    [class*="sidebar"],
    .bg-token-bg-elevated-secondary,
    .bg-token-bg-elevated-secondary\\/20 {
      background: rgba(43, 43, 41, 0.65) !important;  /* semi-transparent dark panel (from #2B2B29) */
      color: #AF9F80 !important;
      backdrop-filter: blur(6px) !important;
    }

    /* ---------- Messages ---------- */
    [data-message-author-role="assistant"] {
      background: rgba(58, 57, 47, 0.24) !important; /* warm lifted surface */
      color: #C7B68A !important;
      border: none !important;
      border-radius: 12px !important;
      padding: 12px !important;
      backdrop-filter: blur(4px) !important;
      -webkit-backdrop-filter: blur(16px) saturate(140%);
      backdrop-filter: blur(16px) saturate(140%);
    }
    [data-message-author-role="user"] {
      background: rgba(55, 54, 49, 0) !important; /* slightly different warm tone */
      color: #AF9F80 !important;
      padding: 12px !important;
      backdrop-filter: blur(4px) !important;
    }

    .user-message-bubble-color{
        color: #C7B68A !important;
        border: 1px solid rgba(199, 182, 138, 0.3) !important;
    }

    strong, h3, h1, h2, h4, h5, th{
        color: #C7B68A !important;
    }



    /* ---------- Composer bar + input ---------- */
    .bg-token-bg-primary,
    div:has(> textarea) {
      background: rgba(43, 43, 41, 0.85) !important;
      border-top: 1px solid #CBBE9955 !important;
      position: relative !important;
      z-index: 9999 !important;
      backdrop-filter: blur(6px) !important;
    }
    textarea,
    input[type="text"],
    input[type="search"] {
      background: rgba(55, 54, 49, 0.9) !important;
      color: #AF9F80 !important;
      border: 1px solid #CBBE9955 !important;
      border-radius: 10px !important;
      position: relative !important;
      z-index: 10000 !important;
    }
    textarea::placeholder,
    input::placeholder {
      color: #827761 !important;
      opacity: 1 !important;
    }

    /* ---------- Kill overlay gradient ---------- */
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

    /* ---------- Code styling ---------- */
    :not(pre) > code {
      background: none !important;
      color: #E7DCC0 !important; /* warm inline code */
      font-weight: 500 !important;
    }
    pre {
      background: none !important;
      color: #D9CBA6 !important; /* readable sand for code blocks */
      text-shadow: 0 0 6px #D9CBA666;
      border: 1px solid rgba(199, 182, 138, 0.3) !important;
      padding: 0 !important;
      font-size: 0.95em !important;
      line-height: 1.5 !important;
    }
  `);
})();
