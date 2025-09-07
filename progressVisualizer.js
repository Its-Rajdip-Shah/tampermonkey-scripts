// ==UserScript==
// @name         A1 Checklist + Stopwatch (Header v3 — stable render)
// @namespace    https://p00key.tools
// @version      1.8
// @description  Compact 3-line header (timer + buttons; marks bar; questions bar), checklist with lap-on-check, glass UI, tools, and chime.
// @match        https://canvas.sydney.edu.au/*
// @match        https://docs.google.com/*
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const UI_ID = "a1-checklist-overlay";
  const STORAGE_KEY = "a1_checklist_progress_v8";
  const TOTAL_QUESTIONS_TARGET = 38;

  // --- sound ---
  const SOUND_GAIN = 0.06,
    CHIME_MS = 220,
    CHIME_FREQS = [880, 1175];
  let audioCtx = null;
  function chime() {
    try {
      if (!audioCtx)
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const g = audioCtx.createGain();
      g.gain.value = SOUND_GAIN;
      g.connect(audioCtx.destination);
      CHIME_FREQS.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(g);
        const start = now + i * (CHIME_MS / 2000),
          end = start + CHIME_MS / 1000;
        o.start(start);
        g.gain.setValueAtTime(SOUND_GAIN, start);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        o.stop(end + 0.01);
      });
    } catch {}
  }

  // --- data ---
  const CHECKLIST = [
    {
      section: "1) Fundamentals of Security Engineering (25)",
      items: [
        {
          id: "q1a",
          label: "1a) Definitions: safety vs reliability vs security",
          marks: 5,
        },
        {
          id: "q1b1",
          label: "1b-i) Four components (list & explain)",
          marks: 2,
        },
        {
          id: "q1b2",
          label: "1b-ii) Apply framework: healthcare MFA/biometrics",
          marks: 8,
        },
        { id: "q1c1", label: "1c) MOVEit — goal + explanation", marks: 2 },
        {
          id: "q1c2",
          label: "1c) Okta Support — goal + explanation",
          marks: 2,
        },
        { id: "q1c3", label: "1c) MGM Resorts — goal + explanation", marks: 2 },
        { id: "q1c4", label: "1c) Medibank — goal + explanation", marks: 2 },
        { id: "q1c5", label: "1c) SolarWinds — goal + explanation", marks: 2 },
      ],
    },
    {
      section: "2) Social Engineering in Practice (25)",
      items: [
        { id: "q2_1", label: "Recon: Emily’s X/Twitter profile", marks: 5 },
        {
          id: "q2_2",
          label: "Extract keywords & guess password pattern",
          marks: 5,
        },
        { id: "q2_3", label: "Python: permutations + MD5 check", marks: 5 },
        { id: "q2_4", label: "Find matching email from dataset", marks: 5 },
        {
          id: "q2_5",
          label: "Report: plaintext pwd + MD5 + how to run",
          marks: 5,
        },
      ],
    },
    {
      section: "3) Access Control (25)",
      items: [
        { id: "q3a1", label: "3a-i) Two general forms (DAC vs MAC)", marks: 4 },
        {
          id: "q3a2",
          label: "3a-ii) Which cloud storage uses? Why?",
          marks: 3,
        },
        {
          id: "q3a3",
          label: "3a-iii) x86 access control ideas (two)",
          marks: 4,
        },
        {
          id: "q3a4",
          label: "3a-iv-a) Rule-based access control (+case)",
          marks: 2,
        },
        {
          id: "q3a5",
          label: "3a-iv-b) Attribute-based access control (+case)",
          marks: 2,
        },
        {
          id: "q3b1",
          label: "3b) Bell–LaPadula vs Biba: key difference",
          marks: 2,
        },
        {
          id: "q3c1",
          label: "3c-i) BLP: Sarah read financial_report.txt? (T/F)",
          marks: 2,
        },
        {
          id: "q3c2",
          label: "3c-ii) Biba: Michael edit company_memo.txt? (T/F)",
          marks: 2,
        },
        {
          id: "q3c3",
          label: "3c-iii) BLP: Thomas helps John via copy? (T/F)",
          marks: 2,
        },
        {
          id: "q3c4",
          label: "3c-iv) Biba: Emma modify strategic_plan.txt? (T/F)",
          marks: 2,
        },
      ],
    },
    {
      section: "4) Linux Access Control (25)",
      items: [
        { id: "q4a1", label: "4a-i) UID of user sheppard", marks: 1 },
        { id: "q4a2", label: "4a-ii) GID of group scientists", marks: 1 },
        { id: "q4a3", label: "4a-iii) Groups for user carter", marks: 1 },
        { id: "q4a4", label: "4a-iv) All users in group humans", marks: 1 },
        { id: "q4a5", label: "4a-v) Does ronan have sudo?", marks: 1 },
        { id: "q4a6", label: "4a-vi) Does carter have sudo?", marks: 1 },
        {
          id: "q4b1",
          label: "4b-i) Non-hidden files owned by teyla",
          marks: 1,
        },
        {
          id: "q4b2",
          label: "4b-ii) Files owned by teyla in group ancients",
          marks: 1,
        },
        {
          id: "q4b3",
          label: "4b-iii) File owned by mckay; carter/ladon write?",
          marks: 2,
        },
        {
          id: "q4b4",
          label: "4b-iv) kolya’s scripts: exec for kolya/ladon/todd?",
          marks: 6,
        },
        { id: "q4c1", label: "4c-i) /mission_reports owner & group", marks: 1 },
        {
          id: "q4c2",
          label: "4c-ii) As ladon, delete in military_reports?",
          marks: 2,
        },
        {
          id: "q4c3",
          label: "4c-iii) As ladon, delete in science_reports?",
          marks: 2,
        },
        {
          id: "q4c4",
          label: "4c-iv) Explain why only one delete works",
          marks: 2,
        },
        { id: "q4c5", label: "4c-v) Why /tmp setup matters + risks", marks: 2 },
      ],
    },
  ];

  // --- state helpers ---
  const loadState = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const saveState = (s) => localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  const getTimer = (s) =>
    s.timer || { running: false, elapsedMs: 0, startAt: 0, lapStartAt: 0 };
  const setTimer = (s, t) => {
    s.timer = t;
    saveState(s);
  };

  // --- utils ---
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000),
      h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      ss = s % 60;
    return `${pad(h)}:${pad(m)}:${pad(ss)}`;
  };
  const totalMarks = () =>
    CHECKLIST.reduce(
      (a, sec) => a + sec.items.reduce((x, it) => x + it.marks, 0),
      0
    );

  // --- styles (glass + 3-row header) ---
  GM_addStyle(`
    #${UI_ID}{
      position:fixed; right:24px; bottom:24px; width:480px; max-height:80vh; z-index:2147483647;
      color:#fff; background:rgba(30,30,35,0.6);
      backdrop-filter:blur(14px) saturate(120%); -webkit-backdrop-filter:blur(14px) saturate(120%);
      border:1px solid rgba(255,255,255,0.15); border-radius:18px; box-shadow:0 12px 36px rgba(0,0,0,0.4);
      overflow:hidden; font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    }
    #${UI_ID} *{ box-sizing:border-box; }

    #${UI_ID} .hdr{
      display:grid; grid-template-rows:auto auto auto; gap:6px; padding:8px 10px;
      background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03));
      border-bottom:1px solid rgba(255,255,255,.12);
      user-select:none;
    }
    #${UI_ID} .top{
      display:grid; grid-template-columns: 1fr auto auto auto auto; column-gap:8px; align-items:center; min-width:0;
    }
    #${UI_ID} .timer{
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-weight:700; font-size:12px;
      padding:3px 8px; border-radius:8px; background:rgba(255,255,255,.10); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    #${UI_ID} .btn{ background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); color:#fff; border-radius:9px; padding:3px 8px; font-size:12px; cursor:pointer; }
    #${UI_ID} .btn:hover{ background:rgba(255,255,255,.2); }
    #${UI_ID} .tools-wrap{ position:relative; }
    #${UI_ID} .tools-toggle{ width:28px; height:26px; border-radius:8px; display:grid; place-items:center; }
    #${UI_ID} .tools-menu{ position:absolute; right:0; top:30px; min-width:180px; background:rgba(40,40,50,.9); border:1px solid rgba(255,255,255,.18); border-radius:12px; backdrop-filter:blur(10px); overflow:hidden; display:none; }
    #${UI_ID} .tools-menu.show{ display:block; }
    #${UI_ID} .tools-menu button{ width:100%; text-align:left; padding:8px 10px; background:transparent; border:none; color:#fff; font-size:12px; }
    #${UI_ID} .tools-menu button:hover{ background:rgba(255,255,255,.08); }

    #${UI_ID} .line{ display:grid; grid-template-columns:auto 1fr auto; align-items:center; column-gap:10px; min-width:0; }
    #${UI_ID} .label{ font-size:12px; opacity:.9; }
    #${UI_ID} .value{ font-weight:700; font-size:12px; white-space:nowrap; }
    #${UI_ID} .hbar{ height:6px; background:rgba(255,255,255,.14); border-radius:999px; overflow:hidden; }
    #${UI_ID} .hbar span{ display:block; height:100%; width:0%; background:linear-gradient(90deg,#6EE7B7,#22C55E); }
    #${UI_ID} .hbar.q span{ background:linear-gradient(90deg,#93C5FD,#3B82F6); }

    #${UI_ID} .body{ padding:10px 12px; overflow:auto; max-height:calc(80vh - 120px); }
    #${UI_ID} .metric{ margin:6px 0 10px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:8px; }
    #${UI_ID} .metric .row{ display:flex; align-items:center; gap:10px; margin:6px 0; }
    #${UI_ID} .metric .label{ width:150px; font-size:12px; opacity:.9; }
    #${UI_ID} .metric .value{ font-weight:700; font-size:12px; min-width:72px; text-align:right; }
    #${UI_ID} .bar{ flex:1; height:8px; background:rgba(255,255,255,.12); border-radius:999px; overflow:hidden; }
    #${UI_ID} .bar > span{ display:block; height:100%; width:0%; background:linear-gradient(90deg,#6EE7B7,#22C55E); }

    #${UI_ID} .sec{ margin:12px 0 10px; border-top:1px dashed rgba(255,255,255,.18); padding-top:10px; }
    #${UI_ID} .sec h4{ margin:0 0 6px; font-size:12px; letter-spacing:.3px; opacity:.9; display:flex; justify-content:space-between; gap:8px; }
    #${UI_ID} .sec .substat{ font-weight:600; font-size:11px; opacity:.85; }
    #${UI_ID} .sec .subbar{ margin-top:4px; }
    #${UI_ID} .item{ display:grid; grid-template-columns: 90px auto; align-items:center; gap:8px; margin:6px 0; line-height:1.25; font-size:12px; }
    #${UI_ID} .timecell{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; opacity:.9; }
    #${UI_ID} .estimate{ opacity:.6; }
    #${UI_ID} input[type="checkbox"]{ transform:translateY(2px) scale(1.1); cursor:pointer; margin-right:6px; }

    #${UI_ID} .footer{ display:flex; align-items:center; gap:8px; padding:8px 12px; border-top:1px solid rgba(255,255,255,.12); background:linear-gradient(0deg,rgba(255,255,255,.06),rgba(255,255,255,.03)); }
    #${UI_ID} .stat{ font-size:12px; opacity:.9; }
    #${UI_ID} .bar2{ flex:1; height:6px; background:rgba(255,255,255,.12); border-radius:999px; overflow:hidden; }
    #${UI_ID} .bar2 > span{ display:block; height:100%; width:0%; background:linear-gradient(90deg,#93C5FD,#3B82F6); }

    #${UI_ID}.min .body, #${UI_ID}.min .footer{ display:none; }
  `);

  // ---------- BUILD ONCE ----------
  function buildUI() {
    if (document.getElementById(UI_ID)) return;

    // root
    const root = document.createElement("div");
    root.id = UI_ID;

    // HEADER
    const hdr = document.createElement("div");
    hdr.className = "hdr";

    // Row 1
    const top = document.createElement("div");
    top.className = "top";
    const timer = document.createElement("div");
    timer.className = "timer";
    timer.textContent = "00:00:00";
    const btnPlay = document.createElement("button");
    btnPlay.className = "btn";
    btnPlay.title = "Start";
    btnPlay.textContent = "▶";
    const btnPause = document.createElement("button");
    btnPause.className = "btn";
    btnPause.title = "Pause";
    btnPause.textContent = "⏸";
    const btnReset = document.createElement("button");
    btnReset.className = "btn";
    btnReset.title = "Reset";
    btnReset.textContent = "↺";

    const toolsWrap = document.createElement("div");
    toolsWrap.className = "tools-wrap";
    const toolsBtn = document.createElement("button");
    toolsBtn.className = "btn tools-toggle";
    toolsBtn.title = "Tools";
    toolsBtn.textContent = "⋮";
    const toolsMenu = document.createElement("div");
    toolsMenu.className = "tools-menu";
    const bExport = document.createElement("button");
    bExport.textContent = "Export progress";
    const bImport = document.createElement("button");
    bImport.textContent = "Import progress";
    const bReset = document.createElement("button");
    bReset.textContent = "Reset progress";
    toolsMenu.append(bExport, bImport, bReset);
    toolsWrap.append(toolsBtn, toolsMenu);

    const btnMin = document.createElement("button");
    btnMin.className = "btn";
    btnMin.title = "Minimise";
    btnMin.textContent = "˅";
    top.append(timer, btnPlay, btnPause, btnReset, toolsWrap, btnMin);

    // Row 2 (Marks)
    const line1 = document.createElement("div");
    line1.className = "line";
    const l1 = document.createElement("div");
    l1.className = "label";
    l1.textContent = "Marks";
    const bar1 = document.createElement("div");
    bar1.className = "hbar";
    const fill1 = document.createElement("span");
    bar1.append(fill1);
    const v1 = document.createElement("div");
    v1.className = "value";
    line1.append(l1, bar1, v1);

    // Row 3 (Questions)
    const line2 = document.createElement("div");
    line2.className = "line";
    const l2 = document.createElement("div");
    l2.className = "label";
    l2.textContent = "Questions";
    const bar2 = document.createElement("div");
    bar2.className = "hbar q";
    const fill2 = document.createElement("span");
    bar2.append(fill2);
    const v2 = document.createElement("div");
    v2.className = "value";
    line2.append(l2, bar2, v2);

    hdr.append(top, line1, line2);

    // BODY
    const body = document.createElement("div");
    body.className = "body";

    // global metrics (kept)
    const metrics = document.createElement("div");
    metrics.className = "metric";
    const rowMarks = document.createElement("div");
    rowMarks.className = "row";
    const lblMarks = document.createElement("div");
    lblMarks.className = "label";
    lblMarks.textContent = "Marks attempted";
    const valMarks = document.createElement("div");
    valMarks.className = "value";
    const barMarks = document.createElement("div");
    barMarks.className = "bar";
    const fillMarks = document.createElement("span");
    barMarks.append(fillMarks);
    rowMarks.append(lblMarks, valMarks, barMarks);

    const rowQs = document.createElement("div");
    rowQs.className = "row";
    const lblQs = document.createElement("div");
    lblQs.className = "label";
    lblQs.textContent = "Questions done";
    const valQs = document.createElement("div");
    valQs.className = "value";
    const barQs = document.createElement("div");
    barQs.className = "bar";
    const fillQs = document.createElement("span");
    barQs.append(fillQs);
    rowQs.append(lblQs, valQs, barQs);

    metrics.append(rowMarks, rowQs);
    body.append(metrics);

    // sections
    CHECKLIST.forEach((sec) => {
      const secEl = document.createElement("div");
      secEl.className = "sec";
      const h4 = document.createElement("h4");
      const left = document.createElement("span");
      left.textContent = sec.section;
      const right = document.createElement("span");
      right.className = "substat";
      h4.append(left, right);
      const miniBar = document.createElement("div");
      miniBar.className = "bar subbar";
      const miniFill = document.createElement("span");
      miniBar.append(miniFill);
      secEl.append(h4, miniBar);

      sec.items.forEach((it) => {
        const row = document.createElement("label");
        row.className = "item";
        const timeCell = document.createElement("div");
        timeCell.className = "timecell estimate";
        timeCell.dataset.id = it.id;
        timeCell.textContent = "est. 00:00:00";
        const rightBox = document.createElement("div");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.id = it.id;
        cb.dataset.marks = String(it.marks);
        cb.checked = !!loadState()[it.id];
        const text = document.createElement("span");
        text.textContent = `${it.label}  (${it.marks})`;
        rightBox.append(cb, text);
        row.append(timeCell, rightBox);
        secEl.appendChild(row);
      });

      secEl._miniFill = miniFill;
      secEl._substat = right;
      secEl._sectionData = sec;
      body.appendChild(secEl);
    });

    // FOOTER
    const footer = document.createElement("div");
    footer.className = "footer";
    const stat = document.createElement("div");
    stat.className = "stat";
    const fbar = document.createElement("div");
    fbar.className = "bar2";
    const ffill = document.createElement("span");
    fbar.append(ffill);
    footer.append(stat, fbar);

    // attach
    root.append(hdr, body, footer);
    document.body.appendChild(root);

    // ---- logic ----
    function totals() {
      const all = [...root.querySelectorAll('input[type="checkbox"]')];
      const done = all.filter((cb) => cb.checked);
      const qDone = done.length,
        qTotal = all.length;
      const marksDone = done.reduce(
        (s, cb) => s + Number(cb.dataset.marks || 0),
        0
      );
      return { qDone, qTotal, marksDone, marksTotal: totalMarks() };
    }
    function updateSections() {
      root.querySelectorAll(".sec").forEach((secEl) => {
        const cbs = [...secEl.querySelectorAll('input[type="checkbox"]')];
        const d = cbs.filter((c) => c.checked).length,
          t = cbs.length;
        const pct = t ? Math.round((d / t) * 100) : 0;
        secEl._substat.textContent = `${d}/${t} (${pct}%)`;
        secEl._miniFill.style.width = pct + "%";
      });
    }
    function updateAll() {
      const { qDone, qTotal, marksDone, marksTotal } = totals();
      const denom = TOTAL_QUESTIONS_TARGET || qTotal;

      const pctM = Math.round((marksDone / marksTotal) * 100);
      fill1.style.width = pctM + "%";
      v1.textContent = `${marksDone}/${marksTotal} (${pctM}%)`;

      const pctQ = Math.round((qDone / denom) * 100);
      fill2.style.width = Math.min(100, (qDone / denom) * 100) + "%";
      v2.textContent = `${qDone}/${denom} (${pctQ}%)`;
      v2.title = `Actual list has ${qTotal} items`;

      // body metrics
      valMarks.textContent = `${marksDone}/${marksTotal} (${pctM}%)`;
      fillMarks.style.width = pctM + "%";
      valQs.textContent = `${qDone}/${denom} (${pctQ}%)`;
      fillQs.style.width = Math.min(100, (qDone / denom) * 100) + "%";

      // footer
      stat.textContent = `Overall: ${qDone}/${denom} • ${marksDone}% marks attempted`;
      ffill.style.width = Math.min(100, (qDone / denom) * 100) + "%";

      updateSections();
    }

    // stopwatch + estimates
    let raf = 0;
    const tick = () => {
      const s = loadState();
      const t = getTimer(s);
      let elapsed = t.elapsedMs;
      if (t.running) elapsed += Date.now() - t.startAt;
      timer.textContent = fmt(elapsed);

      const sum = totalMarks();
      root.querySelectorAll(".timecell").forEach((cell) => {
        const id = cell.dataset.id,
          cb = root.querySelector(`input[type="checkbox"][data-id="${id}"]`);
        const marks = Number(cb?.dataset?.marks || 0),
          share = marks / sum;
        const est = Math.max(0, share * elapsed);
        const info = loadState()[`time_${id}`];
        if (info && info.locked) {
          cell.textContent = fmt(info.ms);
          cell.classList.remove("estimate");
        } else {
          cell.textContent = "est. " + fmt(est);
          cell.classList.add("estimate");
        }
      });

      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      const s = loadState();
      const t = getTimer(s);
      if (!t.running) {
        const now = Date.now();
        t.running = true;
        t.startAt = now;
        if (!t.lapStartAt) t.lapStartAt = now;
        setTimer(s, t);
        if (!raf) raf = requestAnimationFrame(tick);
      }
    };
    const pause = () => {
      const s = loadState();
      const t = getTimer(s);
      if (t.running) {
        const now = Date.now();
        t.elapsedMs += now - t.startAt;
        t.running = false;
        setTimer(s, t);
      }
    };
    const reset = () => {
      setTimer(loadState(), {
        running: false,
        elapsedMs: 0,
        startAt: 0,
        lapStartAt: 0,
      });
      cancelAnimationFrame(raf);
      raf = 0;
      tick();
    };

    // events
    root.addEventListener("change", (e) => {
      const el = e.target;
      if (!(el && el.type === "checkbox")) return;
      const id = el.dataset.id;
      const s = loadState();
      s[id] = el.checked;
      saveState(s);
      if (el.checked) {
        chime();
        let tm = getTimer(s);
        const now = Date.now();
        if (!tm.running && tm.elapsedMs === 0 && !tm.lapStartAt) {
          tm.running = true;
          tm.startAt = now;
          tm.lapStartAt = now;
        }
        const lapStart = tm.lapStartAt || now;
        const lapMs = tm.running ? now - lapStart : 0;
        const key = `time_${id}`;
        const prior = s[key];
        if (!prior || !prior.locked) {
          s[key] = { ms: lapMs, locked: true };
          saveState(s);
          const cell = root.querySelector(`.timecell[data-id="${id}"]`);
          if (cell) {
            cell.textContent = fmt(lapMs);
            cell.classList.remove("estimate");
          }
        }
        tm.lapStartAt = now;
        setTimer(loadState(), tm);
      }
      updateAll();
    });

    toolsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toolsMenu.classList.toggle("show");
    });
    document.addEventListener("click", () =>
      toolsMenu.classList.remove("show")
    );
    bExport.addEventListener("click", () => {
      const data = localStorage.getItem(STORAGE_KEY) || "{}";
      navigator.clipboard
        .writeText(data)
        .then(() => alert("Checklist JSON copied."));
    });
    bImport.addEventListener("click", () => {
      const txt = prompt("Paste previously exported JSON:");
      if (!txt) return;
      try {
        const parsed = JSON.parse(txt);
        saveState(parsed);
        root
          .querySelectorAll('input[type="checkbox"]')
          .forEach((cb) => (cb.checked = !!parsed[cb.dataset.id]));
        root.querySelectorAll(".timecell").forEach((cell) => {
          const info = parsed[`time_${cell.dataset.id}`];
          if (info && info.locked) {
            cell.textContent = fmt(info.ms);
            cell.classList.remove("estimate");
          } else {
            cell.textContent = "est. 00:00:00";
            cell.classList.add("estimate");
          }
        });
        updateAll();
      } catch {
        alert("Invalid JSON.");
      }
    });
    bReset.addEventListener("click", () => {
      if (!confirm("Reset all checklist progress AND timer?")) return;
      localStorage.removeItem(STORAGE_KEY);
      root
        .querySelectorAll('input[type="checkbox"]')
        .forEach((cb) => (cb.checked = false));
      root.querySelectorAll(".timecell").forEach((cell) => {
        cell.textContent = "est. 00:00:00";
        cell.classList.add("estimate");
      });
      reset();
      updateAll();
    });

    btnPlay.addEventListener("click", (e) => {
      e.stopPropagation();
      start();
    });
    btnPause.addEventListener("click", (e) => {
      e.stopPropagation();
      pause();
    });
    btnReset.addEventListener("click", (e) => {
      e.stopPropagation();
      reset();
    });
    btnMin.addEventListener("click", (e) => {
      e.stopPropagation();
      root.classList.toggle("min");
      const min = root.classList.contains("min");
      btnMin.textContent = min ? "˄" : "˅";
      btnMin.title = min ? "Expand" : "Minimise";
    });

    // boot
    tick();
    updateAll();
  }

  // Build ASAP (and retry once in case SPA replaces DOM)
  function safeBuild() {
    try {
      buildUI();
    } catch (e) {
      console.error("A1 overlay error:", e);
      setTimeout(buildUI, 250);
    }
  }
  safeBuild();
})();
