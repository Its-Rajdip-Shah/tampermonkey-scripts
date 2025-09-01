// ==UserScript==
// @name         Pinterest Ad Hider — Sponsored Cards
// @namespace    https://example.com
// @version      1.0
// @description  Hide Pinterest ad cards ("Sponsored") by setting display:none on the card container.
// @match        https://www.pinterest.com/*
// @match        https://pinterest.com/*
// @match        https://au.pinterest.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  // Optional CSS fast-path (modern browsers support :has)
  try {
    if (typeof GM_addStyle === "function") {
      GM_addStyle(`
        .Yl-.MIw.Hb7[data-grid-item="true"]:has([title="Sponsored"]),
        .Yl-.MIw.Hb7[data-grid-item="true"]:has([aria-label="Sponsored"]),
        [role="listitem"][data-grid-item="true"]:has([title="Sponsored"]),
        [role="listitem"][data-grid-item="true"]:has([aria-label="Sponsored"]) {
          display: none !important;
        }
      `);
    }
  } catch (_) {
    /* ignore if :has unsupported in CSS engine */
  }

  const CARD_SELECTOR =
    '.Yl-.MIw.Hb7[data-grid-item="true"], [role="listitem"][data-grid-item="true"], [data-grid-item="true"][role="listitem"]';
  const SPONSORED_SELECTOR = '[title="Sponsored"], [aria-label="Sponsored"]';

  function hideCard(el) {
    const card = el.closest(CARD_SELECTOR);
    if (card && !card.dataset.adHidden) {
      card.style.display = "none";
      card.dataset.adHidden = "1";
      return true;
    }
    return false;
  }

  function scan(root = document) {
    let hid = 0;
    root.querySelectorAll(SPONSORED_SELECTOR).forEach((el) => {
      if (hideCard(el)) hid++;
    });
    return hid;
  }

  // Initial pass
  scan();

  // Observe dynamic content and attribute changes
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;

          // If the added node itself is the Sponsored label
          if (node.matches && node.matches(SPONSORED_SELECTOR)) hideCard(node);

          // Or if it contains one
          if (node.querySelectorAll) {
            node.querySelectorAll(SPONSORED_SELECTOR).forEach(hideCard);
          }
        });
      }

      if (m.type === "attributes" && m.target instanceof Element) {
        if (m.attributeName === "title" || m.attributeName === "aria-label") {
          if (m.target.matches(SPONSORED_SELECTOR)) hideCard(m.target);
        }
      }
    }
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title", "aria-label"],
  });

  // Safety: periodic light rescan (Pinterest recycles DOM nodes)
  setInterval(scan, 3000);
})();
