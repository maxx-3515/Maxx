// ==UserScript==
// @name         Maxx Custom Script
// @namespace    maxx
// @version      1.1
// @description  Maxx Script
// @author       Maxx
// @run-at       document-end
// @match        *://*/*
// @grant        none
// @charset      utf-8
// @updateURL    https://raw.githubusercontent.com/maxx-3515/Maxx/main/dist/maxx.user.js
// @downloadURL  https://raw.githubusercontent.com/maxx-3515/Maxx/main/dist/maxx.user.js
// ==/UserScript==

// module: selected-search module | c2VsZWN0ZWQtc2VhcmNoIG1vZHVsZQ==
// module: event-filter module | ZXZlbnQtZmlsdGVyIG1vZHVsZQ==
// module: hex-decoder module | aGV4LWRlY29kZXIgbW9kdWxl
// module: log-prettier module | bG9nLXByZXR0aWVyIG1vZHVsZQ==
// module: offense-filter module | b2ZmZW5zZS1maWx0ZXIgbW9kdWxl
// module: offense-masker module | b2ZmZW5zZS1tYXNrZXIgbW9kdWxl
// module: quick-open-offenses module | cXVpY2stb3Blbi1vZmZlbnNlcyBtb2R1bGU=
// module: clear-queue-ticket-opened module | Y2xlYXItcXVldWUtdGlja2V0LW9wZW5lZCBtb2R1bGU=
// module: close-ticket module | Y2xvc2UtdGlja2V0IG1vZHVsZQ==
// module: test-module | dGVzdC1tb2R1bGU=
// module: test-module | dGVzdC1tb2R1bGU=


(() => {
  // src/modules/selected_search/config.js
  var config_default = {
    name: "selected-search module",
    // module-id: c2VsZWN0ZWQtc2VhcmNoIG1vZHVsZQ==
    enabled: true,
    match: ["*://*/*"],
    iframe: true,
    ui: {
      offsetX: 8,
      offsetY: -10,
      zIndex: 999999
    },
    engines: {
      vt: {
        label: "VT",
        class: "mx-vt",
        priority: 100,
        url: (q) => `https://www.virustotal.com/gui/search/${q}`,
        match: ["*://*.vnpt.vn/*"],
        condition: (text, { isHash: isHash2, isIP: isIP2, isDomain: isDomain2 }) => {
          return isHash2(text) || isIP2(text) || isDomain2(text);
        }
      },
      google: {
        label: "G",
        class: "mx-google",
        priority: 10,
        url: (q) => `https://www.google.com/search?q=${q}`,
        match: ["*://*/*"],
        condition: () => true
      },
      // AlienVault OTX engine
      otx: {
        label: "OTX",
        class: "mx-otx",
        priority: 90,
        url: (q, { isIP: isIP2, isDomain: isDomain2, isHash: isHash2 }) => {
          if (isIP2(q)) {
            return `https://otx.alienvault.com/indicator/ip/${q}`;
          }
          if (isDomain2(q)) {
            return `https://otx.alienvault.com/indicator/domain/${q}`;
          }
          if (isHash2(q)) {
            return `https://otx.alienvault.com/indicator/file/${q}`;
          }
          return `https://otx.alienvault.com/browse/global/indicators`;
        },
        match: ["*://*/*"],
        condition: (t, { isIP: isIP2, isDomain: isDomain2, isHash: isHash2 }) => isIP2(t) || isDomain2(t) || isHash2(t)
      },
      // Hybrid Analysis engine
      ha: {
        label: "HA",
        class: "mx-ha",
        priority: 85,
        url: (q) => `https://www.hybrid-analysis.com/search?query=${q}`,
        match: ["*://*/*"],
        condition: (t, { isHash: isHash2 }) => isHash2(t)
      },
      // MalwareBazaar engine
      mb: {
        label: "MB",
        class: "mx-mb",
        priority: 80,
        url: (q) => `https://bazaar.abuse.ch/browse.php?search=${q}`,
        match: ["*://*/*"],
        condition: (t, { isHash: isHash2 }) => isHash2(t)
      },
      // Whois Lookup engine
      whois: {
        label: "WHO",
        class: "mx-whois",
        priority: 40,
        url: (q) => `https://www.viewdns.info/whois/?domain=${q}`,
        match: ["*://*/*"],
        condition: (t, { isDomain: isDomain2 }) => isDomain2(t)
      }
    }
  };

  // src/modules/selected_search/index.js
  function isMatch(url, patterns = []) {
    if (!patterns || patterns.length === 0) return true;
    return patterns.some((p) => {
      const regex = new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      return regex.test(url);
    });
  }
  function isIP(text) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(text);
  }
  function isDomain(text) {
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text);
  }
  function isHash(text) {
    return /^[a-f0-9]{32}$/i.test(text) || /^[a-f0-9]{40}$/i.test(text) || /^[a-f0-9]{64}$/i.test(text);
  }
  function selectedSearch(ctx) {
    if (!config_default.enabled) return;
    const { engines, ui } = config_default;
    const url = ctx?.url || location.href;
    let box = null;
    let initialized = false;
    let selectedText = "";
    let lastEngineKey = "";
    let scheduled = false;
    const engineCache = /* @__PURE__ */ new Map();
    function ensureUI() {
      if (initialized) return;
      initialized = true;
      if (!document.getElementById("mx-selected-search-style")) {
        const style = document.createElement("style");
        style.id = "mx-selected-search-style";
        style.textContent = `
				.mx-search-box {
					position: fixed;
					display: flex;
					gap: 6px;
					padding: 6px;
					background: rgba(15,23,42,.85);
					backdrop-filter: blur(6px);
					border-radius: 999px;
					box-shadow: 0 10px 30px rgba(0,0,0,.4);
					transform: scale(.6);
					opacity: 0;
					pointer-events: none;
					transition: all .18s cubic-bezier(.25,.8,.25,1);
					z-index: ${ui?.zIndex ?? 999999};
				}

				.mx-search-box.show {
					transform: scale(1);
					opacity: 1;
					pointer-events: auto;
				}

				.mx-btn {
					width: 34px;
					height: 34px;
					border-radius: 50%;
					display: grid;
					place-items: center;
					cursor: pointer;
					font-weight: 700;
					font-size: 13px;
					color: #fff;
					user-select: none;
					transition: all .15s ease;
				}

				.mx-btn:hover {
					transform: scale(1.15) rotate(6deg);
					box-shadow: 0 0 12px currentColor;
				}

				.mx-google {
					background: radial-gradient(circle,#60a5fa,#2563eb);
				}

				.mx-vt {
					background: radial-gradient(circle,#34d399,#059669);
				}
			`;
        document.head.appendChild(style);
      }
      box = document.createElement("div");
      box.className = "mx-search-box";
      document.body.appendChild(box);
    }
    function getActiveEngines(text) {
      if (engineCache.has(text)) {
        return engineCache.get(text);
      }
      const result = Object.values(engines).filter((engine) => {
        if (engine.match && !isMatch(url, engine.match)) return false;
        if (engine.exclude && isMatch(url, engine.exclude)) return false;
        if (typeof engine.condition === "function") {
          if (!engine.condition(text, {
            isIP,
            isDomain,
            isHash
          })) {
            return false;
          }
        }
        return true;
      }).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      engineCache.set(text, result);
      return result;
    }
    function renderButtons(activeEngines) {
      const key = activeEngines.map((e) => e.label).join("|");
      if (key === lastEngineKey) return;
      lastEngineKey = key;
      box.innerHTML = "";
      activeEngines.forEach((engine) => {
        const btn = document.createElement("div");
        btn.className = `mx-btn ${engine.class || ""}`;
        btn.textContent = engine.label;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!selectedText) return;
          window.open(engine.url(encodeURIComponent(selectedText), { isIP, isDomain, isHash }), "_blank");
          hide();
        });
        box.appendChild(btn);
      });
    }
    function show(rect) {
      box.style.left = rect.right + (ui?.offsetX ?? 8) + "px";
      box.style.top = rect.top + (ui?.offsetY ?? -10) + "px";
      box.classList.add("show");
    }
    function hide() {
      if (!box) return;
      box.classList.remove("show");
      selectedText = "";
      lastEngineKey = "";
    }
    function handleSelection() {
      if (document.hidden) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        hide();
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        hide();
        return;
      }
      ensureUI();
      selectedText = text;
      const activeEngines = getActiveEngines(text);
      if (activeEngines.length === 0) {
        hide();
        return;
      }
      renderButtons(activeEngines);
      try {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width || rect.height) show(rect);
      } catch {
        hide();
      }
    }
    function scheduleSelectionCheck() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        handleSelection();
      });
    }
    document.addEventListener("mouseup", scheduleSelectionCheck);
    document.addEventListener("selectionchange", scheduleSelectionCheck);
    document.addEventListener("mousedown", (e) => {
      if (box && !box.contains(e.target)) hide();
    });
  }

  // src/modules/soc/siem/offense_filter/config.js
  var config_default2 = {
    /* ==========================
            MODULE META
    ========================== */
    name: "offense-filter module",
    // module-id: b2ZmZW5zZS1maWx0ZXIgbW9kdWxl
    enabled: true,
    match: ["*://*.vnpt.vn/console/qradar/*"],
    exclude: [],
    runAt: "document-end",
    iframe: true,
    frames: ["PAGE_SEM"],
    priority: 10,
    selector: {
      toolbarButtons: "#toolbarButtons",
      table: "#tableSection table#defaultTable",
      thead: "#tableSection table#defaultTable thead",
      tbody: "#tableSection table#defaultTable tbody",
      rows: "#tableSection table#defaultTable tbody tr",
      cell_domain: 'td[propertyname="domain"]',
      cell_description: 'td[propertyname="offenseDescription"]',
      cell_offenseId: 'td[propertyname="offenseId"]'
    },
    defaultRules: {
      noise: [],
      important: []
    }
  };

  // src/modules/soc/siem/offense_filter/index.js
  function offenseFilterModule(ctx) {
    const sel = config_default2.selector || {};
    const DOMAIN_KEY = (location.hostname || "unknown").toLowerCase();
    const { siem } = ctx;
    const S = {
      toolbarButtons: sel.toolbarButtons || "#toolbarButtons",
      rows: sel.rows,
      cellsTarget: `${sel.cell_domain}, ${sel.cell_description}`,
      cell_id: sel.cell_offenseId || "td:nth-child(2)"
    };
    function getTargetDocs() {
      const docs = [];
      if (siem && siem.scope) {
        siem.scope(siem.getSelfFrameId(), { self: true, children: true }, (fCtx) => {
          if (fCtx.document) docs.push(fCtx.document);
        });
      } else {
        docs.push(document);
      }
      return docs;
    }
    const ST_ENABLED = "MX_OF_ENABLED";
    const ST_RULES = "MX_OF_RULES";
    const ST_COLORS = "MX_OF_COLORS";
    const ST_BUILDER_ON = "MX_OF_BUILDER_ON";
    const ST_BUILDER_DRAFT = `MX_OF_DRAFT_${DOMAIN_KEY}`;
    const POS_KEY = `MX_OF_POS_${DOMAIN_KEY}`;
    const ST_MARKED_IDS = `MX_OF_MARKED_IDS_${DOMAIN_KEY}`;
    let enabled = loadBool(ST_ENABLED, false);
    let builderEnabled = loadBool(ST_BUILDER_ON, false);
    let builderOpen = true;
    function loadBool(key, def) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? def : v === "1";
      } catch {
        return def;
      }
    }
    function saveBool(key, val) {
      try {
        localStorage.setItem(key, val ? "1" : "0");
      } catch {
      }
    }
    let rawRules = loadRules();
    let noiseGroups = compileRules(rawRules.noise);
    let importantGroups = compileRules(rawRules.important);
    function loadRules() {
      try {
        const raw = localStorage.getItem(ST_RULES);
        if (raw) return JSON.parse(raw);
      } catch {
      }
      return config_default2.defaultRules || { noise: [], important: [] };
    }
    function saveRules(r) {
      try {
        localStorage.setItem(ST_RULES, JSON.stringify(r));
      } catch {
      }
    }
    let markedIds = loadMarkedIds();
    function loadMarkedIds() {
      try {
        const raw = localStorage.getItem(ST_MARKED_IDS);
        if (raw) {
          const p = JSON.parse(raw);
          let mNoise = p.manualNoise !== void 0 ? p.manualNoise : p.noiseIds || [];
          let mImp = p.manualImportant !== void 0 ? p.manualImportant : p.importantIds || [];
          return {
            manualNoise: mNoise,
            manualImportant: mImp,
            dynamicNoise: p.dynamicNoise || [],
            dynamicImportant: p.dynamicImportant || [],
            noiseIds: p.noiseIds || [],
            importantIds: p.importantIds || []
          };
        }
      } catch {
      }
      return {
        manualNoise: [],
        manualImportant: [],
        dynamicNoise: [],
        dynamicImportant: [],
        noiseIds: [],
        importantIds: []
      };
    }
    const MAX_SAVED_IDS = 500;
    function saveMarkedIds() {
      try {
        if (markedIds.manualNoise.length > MAX_SAVED_IDS) {
          markedIds.manualNoise = markedIds.manualNoise.slice(-MAX_SAVED_IDS);
        }
        if (markedIds.manualImportant.length > MAX_SAVED_IDS) {
          markedIds.manualImportant = markedIds.manualImportant.slice(-MAX_SAVED_IDS);
        }
        markedIds.noiseIds = [.../* @__PURE__ */ new Set([...markedIds.manualNoise, ...markedIds.dynamicNoise])];
        markedIds.importantIds = [.../* @__PURE__ */ new Set([...markedIds.manualImportant, ...markedIds.dynamicImportant])];
        localStorage.setItem(ST_MARKED_IDS, JSON.stringify(markedIds));
      } catch {
      }
    }
    ctx.offenseFilterAPI = {
      getMarkedIds: () => markedIds,
      markAsNoise: (id) => {
        if (!id) return;
        markedIds.manualImportant = markedIds.manualImportant.filter((i) => i !== id);
        markedIds.manualNoise = markedIds.manualNoise.filter((i) => i !== id);
        markedIds.manualNoise.push(id);
        saveMarkedIds();
        if (enabled) getTargetDocs().forEach((doc) => runScan(doc));
      },
      markAsImportant: (id) => {
        if (!id) return;
        markedIds.manualNoise = markedIds.manualNoise.filter((i) => i !== id);
        markedIds.manualImportant = markedIds.manualImportant.filter((i) => i !== id);
        markedIds.manualImportant.push(id);
        saveMarkedIds();
        if (enabled) getTargetDocs().forEach((doc) => runScan(doc));
      },
      unmark: (id) => {
        if (!id) return;
        markedIds.manualNoise = markedIds.manualNoise.filter((i) => i !== id);
        markedIds.manualImportant = markedIds.manualImportant.filter((i) => i !== id);
        saveMarkedIds();
        if (enabled) getTargetDocs().forEach((doc) => runScan(doc));
      }
    };
    let hlColors = loadColors();
    function loadColors() {
      try {
        const raw = localStorage.getItem(ST_COLORS);
        if (raw) return JSON.parse(raw);
      } catch {
      }
      return {
        noise: { text: "", bg: "", opacity: "0.4" },
        important: { text: "#b91c1c", bg: "#fef2f2", opacity: "1" }
      };
    }
    function normalizeWhitespace(str) {
      return String(str || "").replace(/\s+/g, " ").trim();
    }
    function parseToken(tokenStr) {
      const t = normalizeWhitespace(tokenStr);
      if (!t) return null;
      const regexMatch = t.match(/^\/(.+)\/([gimsuy]*)$/);
      if (regexMatch) {
        try {
          return new RegExp(regexMatch[1], regexMatch[2].replace(/[gy]/g, ""));
        } catch (e) {
          return t;
        }
      }
      return t;
    }
    function compileRules(groups) {
      if (!Array.isArray(groups)) return [];
      return groups.filter((g) => Array.isArray(g) && g.length > 0).map((g) => g.map(parseToken).filter((t) => t)).filter((g) => g.length > 0);
    }
    function isMatched(text, groups) {
      if (!groups.length) return false;
      return groups.some(
        (group) => group.every((token) => {
          if (token instanceof RegExp) {
            token.lastIndex = 0;
            return token.test(text);
          }
          return text.includes(token);
        })
      );
    }
    function getRowSearchText(tr) {
      const tds = tr.querySelectorAll("td");
      if (!tds || tds.length === 0) return "";
      return Array.from(tds).map((td) => td.textContent || "").join(" ").replace(/\s+/g, " ");
    }
    function getRowOffenseId(tr) {
      const idCell = tr.querySelector(S.cell_id);
      if (!idCell) return null;
      if (idCell.dataset.offenseId) return idCell.dataset.offenseId;
      const rawText = idCell.textContent || "";
      const idOnly = rawText.replace(/\D/g, "");
      return idOnly ? idOnly : null;
    }
    function getTokenFromTd(td) {
      const cached = td?.dataset?.mxOfToken;
      if (cached) return cached;
      function extractText(node) {
        if (node.nodeType === 3) return node.nodeValue || "";
        if (node.nodeType === 1) {
          const tag = node.tagName.toLowerCase();
          if (tag === "script" || tag === "style") return "";
          if (node.classList && node.classList.contains("mx-of-cell-btn")) return "";
          if (node.classList && node.classList.contains("mx-offense-mask-icon")) return "";
          let text = "";
          for (const child of node.childNodes) text += extractText(child);
          return text;
        }
        return "";
      }
      const token = normalizeWhitespace(extractText(td));
      td.dataset.mxOfToken = token;
      return token;
    }
    function applyColorsToDOM(doc, c = hlColors) {
      const r = doc.documentElement?.style;
      if (!r) return;
      r.setProperty("--mx-of-n-text", c.noise.text || "inherit");
      r.setProperty("--mx-of-n-bg", c.noise.bg || "transparent");
      r.setProperty("--mx-of-n-op", c.noise.opacity || "0.4");
      r.setProperty("--mx-of-i-text", c.important.text || "#b91c1c");
      r.setProperty("--mx-of-i-bg", c.important.bg || "#fef2f2");
    }
    function injectStyle2(doc) {
      if (!doc || doc.getElementById("mx-of-style")) return;
      const style = doc.createElement("style");
      style.id = "mx-of-style";
      style.textContent = `
            :root { --mx-of-n-text: inherit; --mx-of-n-bg: transparent; --mx-of-n-op: 0.4; --mx-of-i-text: #b91c1c; --mx-of-i-bg: #fef2f2; }
            tr.mx-of-noise { opacity: var(--mx-of-n-op) !important; transition: opacity 0.2s; }
            tr.mx-of-noise:hover { opacity: 0.8 !important; }
            tr.mx-of-noise:not(.datarowselected):not([selected="true"]) td { color: var(--mx-of-n-text) !important; background-color: var(--mx-of-n-bg) !important; }
            tr.mx-of-important:not(.datarowselected):not([selected="true"]) td { color: var(--mx-of-i-text) !important; background-color: var(--mx-of-i-bg) !important; font-weight: 500; }
            tr.mx-of-important { border: 2px solid var(--mx-of-i-text) !important; }
            .mx-of-wrap { display:inline-flex; align-items:center; gap:6px; margin-left:6px; padding:2px 6px; border:1px solid #888; border-radius:4px; order: 2;}
            .mx-of-btn { padding:2px 8px; border:1px solid #888; border-radius:3px; cursor:pointer; font-size:12px; user-select:none; }
            .mx-of-btn:hover { filter:brightness(0.95); }
            td.mx-of-cell-host { position: relative; padding-right: 24px !important; }
            td.mx-of-cell-host .mx-of-cell-btn {
                position: absolute; right: 4px; top: 50%; transform: translateY(-50%); display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center;
                border-radius: 3px; border: 1px solid rgba(0,0,0,.3); font-size: 12px; background: #fff; color: #000; cursor: pointer; opacity: 0; transition: opacity 0.1s; user-select: none;
            }
            td.mx-of-cell-host:hover .mx-of-cell-btn { opacity: 1; }
            td.mx-of-cell-selected { background: #fff4b8 !important; color: #333 !important; }
            td.mx-of-cell-draft-match { background-color: #d1f7d1 !important; color: #004d00 !important; }
            .mx-of-builder { position: fixed; z-index: 999999; width: 400px; background: #fff; border: 1px solid rgba(0,0,0,.2); border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.15); display: flex; flex-direction: column; font-size: 12px; }
            .mx-of-builder__head { cursor: move; background: #f8f9fa; display: flex; align-items: center; padding: 8px 10px; border-bottom: 1px solid rgba(0,0,0,.1); user-select: none; font-weight: bold;}
            .mx-of-builder__ctrl { cursor: pointer; padding: 2px 6px; border-radius: 4px; color: #555; }
            .mx-of-builder__ctrl:hover { background: #eee; }
            .mx-of-builder-trigger { position: fixed; z-index: 999999; width: 32px; height: 32px; background: #333; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,.2); user-select: none;}
            .mx-of-builder__body { padding: 8px; max-height: 300px; overflow: auto; }
            .mx-of-builder__token { display: flex; gap: 6px; padding: 6px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 6px; background: #fff; align-items: flex-start;}
            .mx-of-builder__input { flex: 1; border: none; outline: none; font-family: monospace; white-space: pre-wrap; word-break: break-all; min-height: 16px;}
            .mx-of-builder__input:focus { background: #f0f4f8; }
            .mx-of-builder__foot { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #ddd; }
            .mx-of-builder__btn { flex: 1; text-align: center; padding: 6px; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; user-select: none; }
            .mx-of-builder__btn:hover { background: #f9f9f9; }
            .mx-of-modal { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:999999; display:flex; align-items:center; justify-content:center; }
            .mx-of-panel { width: 800px; max-width: 95vw; background:#fff; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,.2); display:flex; flex-direction:column; }
            .mx-of-head { padding:10px 15px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; font-weight:bold; }
            .mx-of-body { padding:15px; display:flex; flex-direction:column; gap:10px; }
            .mx-of-textarea { width:100%; height:300px; font-family:monospace; padding:10px; border:1px solid #ccc; border-radius:4px; outline:none; white-space:pre; }
            .mx-of-foot { padding:10px 15px; border-top:1px solid #eee; display:flex; justify-content:space-between; }
            .mx-of-mini { font-size:12px; padding:6px 10px; border:1px solid #ccc; border-radius:6px; cursor:pointer; background:#fff; }
            .mx-of-mini:hover { filter:brightness(0.95); }
        `;
      if (doc.head) doc.head.appendChild(style);
      applyColorsToDOM(doc);
    }
    function runScan(doc) {
      if (!enabled) return;
      markedIds = loadMarkedIds();
      markedIds.dynamicNoise = [];
      markedIds.dynamicImportant = [];
      doc.querySelectorAll(S.rows).forEach((tr) => {
        const text = getRowSearchText(tr);
        const oId = getRowOffenseId(tr);
        tr.classList.remove("mx-of-noise", "mx-of-important");
        if (oId && markedIds.manualImportant.includes(oId)) {
          tr.classList.add("mx-of-important");
        } else if (oId && markedIds.manualNoise.includes(oId)) {
          tr.classList.add("mx-of-noise");
        } else if (isMatched(text, importantGroups)) {
          tr.classList.add("mx-of-important");
          if (oId) markedIds.dynamicImportant.push(oId);
        } else if (isMatched(text, noiseGroups)) {
          tr.classList.add("mx-of-noise");
          if (oId) markedIds.dynamicNoise.push(oId);
        }
      });
      saveMarkedIds();
      injectCellButtons(doc);
    }
    function clearScan(doc) {
      doc.querySelectorAll(S.rows).forEach((tr) => tr.classList.remove("mx-of-noise", "mx-of-important"));
    }
    let builderTokens = [];
    function loadAndClampPosition(el, doc) {
      if (!el) return;
      const savedPos = JSON.parse(localStorage.getItem(POS_KEY) || "{}");
      if (savedPos.top && savedPos.left) {
        el.style.top = savedPos.top;
        el.style.left = savedPos.left;
        el.style.bottom = "auto";
        el.style.right = "auto";
        requestAnimationFrame(() => {
          if (el.style.display === "none") return;
          let top = el.offsetTop, left = el.offsetLeft;
          const win = doc.defaultView || window;
          const maxL = win.innerWidth - el.offsetWidth, maxT = win.innerHeight - el.offsetHeight;
          if (left < 0) left = 0;
          if (top < 0) top = 0;
          if (left > maxL && maxL > 0) left = maxL;
          if (top > maxT && maxT > 0) top = maxT;
          el.style.top = top + "px";
          el.style.left = left + "px";
        });
      } else {
        el.style.bottom = "20px";
        el.style.right = "20px";
        el.style.top = "auto";
        el.style.left = "auto";
      }
    }
    function makeDraggable(handle, moveEl, doc, isTrigger = false) {
      let p1 = 0, p2 = 0, p3 = 0, p4 = 0, dragging = false;
      handle.onmousedown = (e) => {
        if (e.target.closest(".mx-of-builder__ctrl")) return;
        e.preventDefault();
        dragging = false;
        p3 = e.clientX;
        p4 = e.clientY;
        const win = doc.defaultView || window;
        doc.onmouseup = () => {
          doc.onmouseup = doc.onmousemove = null;
          if (dragging)
            localStorage.setItem(POS_KEY, JSON.stringify({ top: moveEl.style.top, left: moveEl.style.left }));
          else if (isTrigger) {
            builderOpen = true;
            syncBuilderUI(doc);
          }
        };
        doc.onmousemove = (e2) => {
          e2.preventDefault();
          dragging = true;
          p1 = p3 - e2.clientX;
          p2 = p4 - e2.clientY;
          p3 = e2.clientX;
          p4 = e2.clientY;
          let t = moveEl.offsetTop - p2, l = moveEl.offsetLeft - p1;
          const ml = win.innerWidth - moveEl.offsetWidth, mt = win.innerHeight - moveEl.offsetHeight;
          if (l < 0) l = 0;
          if (t < 0) t = 0;
          if (l > ml) l = ml;
          if (t > mt) t = mt;
          moveEl.style.top = t + "px";
          moveEl.style.left = l + "px";
          moveEl.style.bottom = "auto";
          moveEl.style.right = "auto";
        };
      };
    }
    function syncBuilderUI(doc) {
      const bp = doc.querySelector(".mx-of-builder");
      const tb = doc.querySelector(".mx-of-builder-trigger");
      if (!bp || !tb) return;
      if (builderEnabled) {
        if (builderOpen) {
          bp.style.display = "flex";
          tb.style.display = "none";
          loadAndClampPosition(bp, doc);
        } else {
          bp.style.display = "none";
          tb.style.display = "flex";
          loadAndClampPosition(tb, doc);
        }
      } else {
        bp.style.display = "none";
        tb.style.display = "none";
      }
    }
    function injectBuilderPanel(doc) {
      if (doc.querySelector(".mx-of-builder")) return;
      const builderPanel = doc.createElement("div");
      builderPanel.className = "mx-of-builder";
      const triggerBtn = doc.createElement("div");
      triggerBtn.className = "mx-of-builder-trigger";
      triggerBtn.innerHTML = "OF";
      doc.body.appendChild(triggerBtn);
      const head = doc.createElement("div");
      head.className = "mx-of-builder__head";
      head.innerHTML = `<span>Offense Builder</span><div style="margin-left:auto"><span class="mx-of-builder__ctrl btn-min">−</span><span class="mx-of-builder__ctrl btn-close">✕</span></div>`;
      head.querySelector(".btn-min").onclick = () => {
        builderOpen = false;
        syncBuilderUI(doc);
      };
      head.querySelector(".btn-close").onclick = () => {
        builderEnabled = false;
        saveBool(ST_BUILDER_ON, false);
        syncBuilderUI(doc);
        resetAllSelectedCellsInDOM(doc);
      };
      const body = doc.createElement("div");
      body.className = "mx-of-builder__body";
      const foot = doc.createElement("div");
      foot.className = "mx-of-builder__foot";
      const btnClear = doc.createElement("div");
      btnClear.className = "mx-of-builder__btn";
      btnClear.textContent = "Clear";
      btnClear.onclick = () => {
        builderTokens = [];
        updateBuilderPanel(doc);
        resetAllSelectedCellsInDOM(doc);
      };
      const btnNoise = doc.createElement("div");
      btnNoise.className = "mx-of-builder__btn";
      btnNoise.textContent = "Save Noise";
      btnNoise.style.color = "#64748b";
      btnNoise.onclick = () => saveRuleFromBuilder("noise", doc);
      const btnImp = doc.createElement("div");
      btnImp.className = "mx-of-builder__btn";
      btnImp.textContent = "Save Important";
      btnImp.style.color = "#b91c1c";
      btnImp.onclick = () => saveRuleFromBuilder("important", doc);
      foot.append(btnClear, btnNoise, btnImp);
      builderPanel.append(head, body, foot);
      doc.body.appendChild(builderPanel);
      makeDraggable(triggerBtn, triggerBtn, doc, true);
      makeDraggable(head, builderPanel, doc, false);
      try {
        const d = localStorage.getItem(ST_BUILDER_DRAFT);
        if (d) builderTokens = JSON.parse(d);
      } catch {
      }
      updateBuilderPanel(doc);
      syncBuilderUI(doc);
    }
    function updateBuilderPanel(doc) {
      const bp = doc.querySelector(".mx-of-builder");
      if (!bp) return;
      const body = bp.querySelector(".mx-of-builder__body");
      body.innerHTML = "";
      try {
        localStorage.setItem(ST_BUILDER_DRAFT, JSON.stringify(builderTokens));
      } catch {
      }
      if (builderTokens.length === 0) {
        body.innerHTML = "<div style='opacity:.6'>Click [+] ở cột Domain/Description để thêm rule.</div>";
      } else {
        builderTokens.forEach((token) => {
          const row = doc.createElement("div");
          row.className = "mx-of-builder__token";
          const input = doc.createElement("div");
          input.className = "mx-of-builder__input";
          input.contentEditable = "true";
          input.textContent = token;
          input.oninput = (e) => {
            const idx = builderTokens.indexOf(token);
            if (idx > -1) {
              builderTokens[idx] = e.target.textContent;
              token = e.target.textContent;
            }
            localStorage.setItem(ST_BUILDER_DRAFT, JSON.stringify(builderTokens));
            resetAllSelectedCellsInDOM(doc);
            injectCellButtons(doc);
          };
          input.onkeydown = (e) => e.stopPropagation();
          const x = doc.createElement("div");
          x.textContent = "✕";
          x.style.cursor = "pointer";
          x.onclick = () => {
            builderTokens = builderTokens.filter((t) => t !== token);
            updateBuilderPanel(doc);
            resetAllSelectedCellsInDOM(doc);
          };
          row.append(input, x);
          body.appendChild(row);
        });
      }
    }
    function saveRuleFromBuilder(type, doc) {
      if (!builderTokens.length) return;
      rawRules[type].push([...builderTokens]);
      saveRules(rawRules);
      noiseGroups = compileRules(rawRules.noise);
      importantGroups = compileRules(rawRules.important);
      builderTokens = [];
      updateBuilderPanel(doc);
      resetAllSelectedCellsInDOM(doc);
      if (enabled) runScan(doc);
    }
    function injectCellButtons(doc) {
      if (!builderEnabled) return;
      doc.querySelectorAll(S.rows).forEach((row) => {
        row.querySelectorAll(S.cellsTarget).forEach((td) => {
          if (td.dataset.mxOfInited === "1") return;
          td.dataset.mxOfInited = "1";
          td.classList.add("mx-of-cell-host");
          const token = getTokenFromTd(td);
          if (!token) return;
          const btn = doc.createElement("span");
          btn.className = "mx-of-cell-btn";
          const isSelected = builderTokens.includes(token);
          btn.textContent = isSelected ? "-" : "+";
          td.classList.toggle("mx-of-cell-selected", isSelected);
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (builderTokens.includes(token)) builderTokens = builderTokens.filter((t) => t !== token);
            else builderTokens.push(token);
            updateBuilderPanel(doc);
            resetAllSelectedCellsInDOM(doc);
            injectCellButtons(doc);
          };
          td.appendChild(btn);
        });
      });
    }
    function resetAllSelectedCellsInDOM(doc) {
      doc.querySelectorAll("td.mx-of-cell-selected, td.mx-of-cell-host").forEach((td) => {
        const token = getTokenFromTd(td);
        const isSelected = builderTokens.includes(token);
        td.classList.toggle("mx-of-cell-selected", isSelected);
        const btn = td.querySelector(".mx-of-cell-btn");
        if (btn) btn.textContent = isSelected ? "-" : "+";
      });
    }
    function openEditorModal(doc) {
      if (doc.querySelector(".mx-of-modal")) return;
      const modal = doc.createElement("div");
      modal.className = "mx-of-modal";
      const panel = doc.createElement("div");
      panel.className = "mx-of-panel";
      modal.onmousedown = modal.onclick = panel.onmousedown = panel.onclick = (e) => e.stopPropagation();
      modal.onkeydown = modal.onkeyup = modal.onkeypress = (e) => e.stopPropagation();
      const head = doc.createElement("div");
      head.className = "mx-of-head";
      head.innerHTML = `<span>Offense Filter Settings</span>`;
      const closeBtn = doc.createElement("div");
      closeBtn.className = "mx-of-mini";
      closeBtn.textContent = "Close";
      closeBtn.onclick = () => modal.remove();
      head.appendChild(closeBtn);
      const body = doc.createElement("div");
      body.className = "mx-of-body";
      const cUI = doc.createElement("div");
      cUI.style = "display:flex; gap:20px; background:#f8f9fa; padding:10px; border-radius:6px; font-size:12px; border:1px solid #ddd;";
      cUI.innerHTML = `
            <div><b>Lọc nhiễu (Noise):</b>
                <label>Chữ: <input type="color" id="of-c-n-t" value="${hlColors.noise.text || "#000000"}"></label>
                <label>Nền: <input type="color" id="of-c-n-b" value="${hlColors.noise.bg || "#ffffff"}"></label>
                <label>Mờ: <input type="range" id="of-c-n-o" min="0.1" max="1" step="0.1" value="${hlColors.noise.opacity}"></label>
            </div>
            <div><b>Quan trọng (Important):</b>
                <label>Chữ: <input type="color" id="of-c-i-t" value="${hlColors.important.text || "#b91c1c"}"></label>
                <label>Nền: <input type="color" id="of-c-i-b" value="${hlColors.important.bg || "#fef2f2"}"></label>
            </div>
        `;
      const applyC = () => {
        hlColors = {
          noise: {
            text: cUI.querySelector("#of-c-n-t").value,
            bg: cUI.querySelector("#of-c-n-b").value,
            opacity: cUI.querySelector("#of-c-n-o").value
          },
          important: { text: cUI.querySelector("#of-c-i-t").value, bg: cUI.querySelector("#of-c-i-b").value }
        };
        applyColorsToDOM(doc, hlColors);
      };
      cUI.querySelectorAll("input").forEach((i) => i.addEventListener("input", applyC));
      const textarea = doc.createElement("textarea");
      textarea.className = "mx-of-textarea";
      textarea.spellcheck = false;
      textarea.value = JSON.stringify(rawRules, null, 2);
      body.append(cUI, textarea);
      const foot = doc.createElement("div");
      foot.className = "mx-of-foot";
      const btnSave = doc.createElement("div");
      btnSave.className = "mx-of-mini";
      btnSave.textContent = "Save & Apply JSON";
      btnSave.style.borderColor = "#1f6feb";
      btnSave.style.color = "#1f6feb";
      btnSave.onclick = () => {
        try {
          const parsed = JSON.parse(textarea.value);
          rawRules = parsed;
          saveRules(rawRules);
          noiseGroups = compileRules(rawRules.noise);
          importantGroups = compileRules(rawRules.important);
          try {
            localStorage.setItem(ST_COLORS, JSON.stringify(hlColors));
          } catch {
          }
          if (enabled) runScan(doc);
          closeBtn.textContent = "Saved! Close";
        } catch (e) {
          alert("JSON Lỗi cú pháp!");
        }
      };
      foot.append(btnSave);
      panel.append(head, body, foot);
      modal.appendChild(panel);
      doc.body.appendChild(modal);
    }
    function injectToolbar(doc) {
      const tb = doc.querySelector(".shade " + S.toolbarButtons) || doc.querySelector(S.toolbarButtons);
      if (!tb || tb.querySelector(".mx-of-wrap")) return;
      const wrap = doc.createElement("div");
      wrap.className = "mx-of-wrap";
      const btnToggle = doc.createElement("div");
      btnToggle.className = "mx-of-btn";
      const syncT = () => {
        btnToggle.textContent = enabled ? "Filter: ON" : "Filter: OFF";
        btnToggle.style.background = enabled ? "#b91c1c" : "";
        btnToggle.style.color = enabled ? "#fff" : "";
      };
      btnToggle.onclick = () => {
        enabled = !enabled;
        saveBool(ST_ENABLED, enabled);
        syncT();
        if (enabled) runScan(doc);
        else clearScan(doc);
      };
      syncT();
      const btnBuilder = doc.createElement("div");
      btnBuilder.className = "mx-of-btn";
      btnBuilder.textContent = "Builder";
      btnBuilder.onclick = () => {
        builderEnabled = !builderEnabled;
        saveBool(ST_BUILDER_ON, builderEnabled);
        builderOpen = true;
        syncBuilderUI(doc);
        injectCellButtons(doc);
        if (builderEnabled) injectBuilderPanel(doc);
      };
      const btnRules = doc.createElement("div");
      btnRules.className = "mx-of-btn";
      btnRules.textContent = "Rules";
      btnRules.onclick = () => openEditorModal(doc);
      wrap.append(btnToggle, btnBuilder, btnRules);
      tb.appendChild(wrap);
    }
    let raf = 0;
    setInterval(() => {
      getTargetDocs().forEach((doc) => {
        const root = doc.querySelector("#tableSection");
        if (!root) return;
        injectStyle2(doc);
        injectToolbar(doc);
        if (builderEnabled) injectBuilderPanel(doc);
        if (doc._mxOfObservedRoot !== root) {
          doc._mxOfObservedRoot = root;
          if (doc._mxOfObserver) doc._mxOfObserver.disconnect();
          if (builderEnabled) injectCellButtons(doc);
          if (enabled) runScan(doc);
          doc._mxOfObserver = new MutationObserver(() => {
            injectToolbar(doc);
            if (builderEnabled) {
              injectBuilderPanel(doc);
              injectCellButtons(doc);
            }
            if (!enabled) return;
            if (doc._mxOfTimer) clearTimeout(doc._mxOfTimer);
            doc._mxOfTimer = setTimeout(() => {
              runScan(doc);
            }, 250);
          });
          doc._mxOfObserver.observe(root, { childList: true, subtree: true });
        }
      });
    }, 1e3);
  }
  if (false) {
    window.__MAXX_DEV_ENTRY__ = offenseFilterModule;
  }

  // src/modules/soc/siem/log_prettier/config.js
  var config_default3 = {
    name: "log-prettier module",
    // module-id: bG9nLXByZXR0aWVyIG1vZHVsZQ==
    enabled: true,
    match: ["*://*.vnpt.vn/console/qradar/*"],
    exclude: [],
    runAt: "document-end",
    iframe: true,
    once: false,
    priority: 10,
    selector: {
      container: "div.binaryWidget",
      pre: "pre.utf"
    },
    /**
     * =========================
     * FORMAT RULES
     * =========================
     * - match(raw): boolean
     * - format(raw): string
     */
    formats: [
      {
        name: "sysmon-operational",
        match(raw) {
          return raw.includes("Microsoft-Windows-Sysmon/Operational");
        },
        format(raw) {
          return raw.replace(/^<\d+>.*?\s(?=\w+=)/, (m) => m + "\n\n").replace(/[\r\n\t]+/g, " ").replace(/\s+(?=\w+=)/g, "\n").replace(
            /Message=([\s\S]*?)(?=\n[A-Z][a-zA-Z]+=?|$)/,
            (_, msg) => "Message:\n" + msg.replace(/\s+(?=[A-Z][a-zA-Z]+:)/g, "\n  ").replace(/:\s+/g, ": ").replace(/\s+(?=Parent)/g, "\n  ")
          ).replace(/(CommandLine:)\s*(.+)/g, (_, k, v) => `${k}
    ${v}`).replace(/(ParentCommandLine:)\s*(.+)/g, (_, k, v) => `${k}
    ${v}`).replace(
            /Hashes:\s*([^\n]+)/,
            (_, hashes) => "Hashes:\n" + hashes.split(",").map((h) => "  " + h.trim()).join("\n")
          ).replace(/(ParentProcessGuid:[^\n]+)/, (m) => m.includes("Parent Process:") ? m : "\nParent Process:\n  " + m).replace(/(ParentProcessId:[^\n]+)/, "  $1").replace(/(ParentImage:[^\n]+)/, "  $1").replace(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, "[IP:$&]").replace(/(CommandLine:\n\s+)(.+)/g, (_, k, v) => `${k}▶ ${v}`).replace(/([A-Z]:\\[^\s\n]+)/g, "📁 $1");
        }
      }
    ]
  };

  // src/modules/soc/siem/log_prettier/index.js
  var ICON_CLASS = "mx-log-format-icon";
  var ICON_DATA = "data-mx-raw";
  var STYLE_ID = "mx-log-prettier-style";
  function injectStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
		.mx-log-wrap {
			position: relative;
		}

		.${ICON_CLASS} {
			position: absolute;
			top: 6px;
			right: 6px;
			width: 18px;
			height: 18px;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			opacity: 0.55;
			border-radius: 50%;
			background: rgba(37, 99, 235, 0.08);
			transition: all 0.15s ease;
		}

		.${ICON_CLASS}:hover {
			opacity: 1;
			background: rgba(37, 99, 235, 0.18);
			transform: rotate(90deg);
		}

		.${ICON_CLASS} img {
			width: 12px;
			height: 12px;
			pointer-events: none;
		}

		pre.mx-formatted {
			white-space: pre-wrap;
			font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
			font-size: 13px;
			line-height: 1.65;
		}
	`;
    doc.head.appendChild(style);
  }
  function resolveFormat(raw) {
    for (const rule of config_default3.formats || []) {
      try {
        if (rule.match(raw)) return rule.format(raw);
      } catch (e) {
        console.warn("[log-prettier]", rule.name, e);
      }
    }
    return null;
  }
  function createIcon(doc) {
    const icon = doc.createElement("span");
    icon.className = ICON_CLASS;
    const img = doc.createElement("img");
    img.src = "https://cdn-icons-png.flaticon.com/512/1828/1828911.png";
    img.alt = "format log";
    icon.appendChild(img);
    return icon;
  }
  function attach(pre) {
    if (!pre || pre.dataset.mxBound === "1") return;
    pre.dataset.mxBound = "1";
    const doc = pre.ownerDocument;
    let wrap = pre.parentElement;
    if (!wrap.classList.contains("mx-log-wrap")) {
      wrap = doc.createElement("div");
      wrap.className = "mx-log-wrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
    }
    if (wrap.querySelector(`.${ICON_CLASS}`)) return;
    const icon = createIcon(doc);
    wrap.appendChild(icon);
    icon.addEventListener("click", () => {
      const raw = pre.getAttribute(ICON_DATA);
      if (!raw) {
        const original = pre.textContent;
        const formatted = resolveFormat(original);
        if (!formatted) return;
        pre.setAttribute(ICON_DATA, original);
        pre.textContent = formatted;
        pre.classList.add("mx-formatted");
      } else {
        pre.textContent = raw;
        pre.removeAttribute(ICON_DATA);
        pre.classList.remove("mx-formatted");
      }
    });
  }
  function findPre(doc) {
    const { container, pre } = config_default3.selector;
    if (container) {
      const wrap = doc.querySelector(container);
      if (wrap) {
        const p = wrap.querySelector(pre || "pre");
        if (p) return p;
      }
    }
    return doc.querySelector("#GUID_6 pre, pre.utf, pre");
  }
  function observe(doc) {
    const scan = () => {
      const pre = findPre(doc);
      if (pre) attach(pre);
    };
    scan();
    new MutationObserver(scan).observe(doc.body, {
      childList: true,
      subtree: true
    });
  }
  function logPrettier() {
    try {
      const doc = document;
      if (!doc.body) return;
      injectStyle(doc);
      observe(doc);
    } catch {
    }
  }

  // src/modules/soc/siem/hex_decoder/config.js
  var config_default4 = {
    name: "hex-decoder module",
    // module-id: aGV4LWRlY29kZXIgbW9kdWxl
    enabled: true,
    match: ["*://*.vnpt.vn/console/qradar/*"],
    exclude: [],
    runAt: "document-end",
    iframe: true,
    once: true,
    priority: 10,
    selector: {
      iframeId: ["PAGE_EVENTVIEWER", "mainPage"],
      toolbarClass: ["shade"],
      eventViewerLogContainerClass: [".utf.text-wrap"],
      eventTableCells: ["#tableSection .grid.dashboard-grid tbody tr td"]
    }
  };

  // src/modules/soc/siem/hex_decoder/index.js
  function runHexDecoderModule(ctx) {
    const sel = config_default4.selector;
    function isAllowedIframe() {
      if (!sel.iframeId || !sel.iframeId.length) return false;
      const frame = window.frameElement;
      if (!frame || !frame.id) return false;
      return sel.iframeId.includes(frame.id);
    }
    if (!isAllowedIframe()) return;
    let enabled = false;
    const ORIGINAL_TEXT = /* @__PURE__ */ new Map();
    function isLikelyHex(str) {
      if (!str) return false;
      const s = str.trim();
      if (s.length < 12 || s.length % 2 !== 0) return false;
      if (!/^[0-9a-fA-F]+$/.test(s)) return false;
      if (/^[0-9]+$/.test(s)) return false;
      if (!/[a-fA-F]/.test(s)) return false;
      return true;
    }
    function isReadableText(str) {
      if (!str) return false;
      let printable = 0;
      for (const ch of str) {
        const c = ch.charCodeAt(0);
        if (c >= 32 && c <= 126 || c === 10 || c === 13 || c === 9) {
          printable++;
        }
      }
      return printable / str.length > 0.7;
    }
    function hexToTextSmart(hex) {
      try {
        const bytes = hex.match(/.{1,2}/g).map((b) => parseInt(b, 16));
        let nullCount = 0;
        for (let i = 1; i < bytes.length; i += 2) {
          if (bytes[i] === 0) nullCount++;
        }
        if (nullCount / (bytes.length / 2) > 0.3) {
          const stripped = bytes.filter((b) => b !== 0);
          return new TextDecoder("utf-8").decode(new Uint8Array(stripped));
        }
        return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
      } catch {
        return null;
      }
    }
    function processNode(node) {
      const parentTag = node.parentElement?.tagName.toLowerCase();
      if (parentTag === "script" || parentTag === "style") return;
      const raw = node.nodeValue;
      if (!raw) return;
      const hexChunks = raw.match(/[0-9a-fA-F]{12,}/g);
      if (!hexChunks) return;
      let replaced = raw;
      let changed = false;
      for (let hex of hexChunks) {
        if (hex.length % 2 !== 0) {
          hex = hex.substring(0, hex.length - 1);
        }
        if (!isLikelyHex(hex)) continue;
        let decoded = hexToTextSmart(hex);
        if (!decoded) continue;
        decoded = decoded.replace(/\u0000+/g, " ");
        if (decoded.includes("�") || !isReadableText(decoded)) continue;
        replaced = replaced.replace(hex, decoded);
        changed = true;
      }
      if (changed) {
        ORIGINAL_TEXT.set(node, raw);
        node.nodeValue = replaced;
        if (node.parentElement) {
          node.parentElement.style.color = "#b00000";
          node.parentElement.style.fontWeight = "500";
        }
      }
    }
    function getTargets() {
      const elements = [];
      sel.eventViewerLogContainerClass?.forEach((s) => {
        document.querySelectorAll(s).forEach((el) => elements.push(el));
      });
      sel.eventTableCells?.forEach((s) => {
        document.querySelectorAll(s).forEach((td) => {
          td.querySelectorAll("span").forEach((sp) => elements.push(sp));
        });
      });
      return elements;
    }
    function enableDecode() {
      getTargets().forEach((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
          if (!ORIGINAL_TEXT.has(node)) {
            processNode(node);
          }
        }
      });
    }
    function disableDecode() {
      ORIGINAL_TEXT.forEach((original, node) => {
        node.nodeValue = original;
        if (node.parentElement) {
          node.parentElement.style.color = "";
          node.parentElement.style.fontWeight = "";
        }
      });
      ORIGINAL_TEXT.clear();
    }
    function toggle() {
      enabled = !enabled;
      enabled ? enableDecode() : disableDecode();
      updateButton();
    }
    let btn;
    function updateButton() {
      if (!btn) return;
      btn.style.background = enabled ? "#8b0000" : "";
      btn.style.color = enabled ? "#fff" : "";
    }
    function injectButton() {
      const shade = document.querySelector(".shade");
      if (!shade) return;
      const toolbar = shade.querySelector("#toolbarButtons");
      if (!toolbar || toolbar.querySelector(".mx-hex-decode-btn")) return;
      btn = document.createElement("div");
      btn.className = "mx-hex-decode-btn";
      btn.textContent = "Hex Decode";
      toolbar.style.display = "flex";
      btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            margin-left: 6px;
            border: 1px solid #888;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            user-select: none;
            order: 2;
        `;
      btn.addEventListener("click", toggle);
      toolbar.appendChild(btn);
    }
    injectButton();
  }
  if (false) {
    window.__MAXX_DEV_ENTRY__ = runHexDecoderModule;
  }

  // src/modules/soc/ticket/note_shift/config.js
  var config_default5 = {
    name: "test-module",
    // module-id: dGVzdC1tb2R1bGU=
    enabled: true,
    match: ["*://*.vnpt.vn/*ticket*"],
    exclude: [],
    runAt: "document-end",
    iframe: false,
    once: true,
    priority: 10,
    style: {
      btnNoteShift: {
        width: "180px",
        padding: "10px",
        backgroundColor: "#007bff",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer"
      },
      screenNoteShift: {
        position: "fixed",
        top: "0px",
        right: "0px",
        width: "1000px",
        height: "800px"
      }
    },
    api: {
      all_ticket: "/api/v1/ticket_overviews?view=all_ticket"
    },
    mapping: {
      STATE_LABEL: {
        mss: {
          new: "Mới",
          open: "Chưa xử lý",
          resolve: "Đã xử lý",
          inprocess: "Đang xử lý"
        },
        siem: {
          new: "Mới",
          open: "Chưa xử lý",
          inprocess: "Đang xử lý",
          "pending reminder": "Chờ xử lý",
          "pending close": "Chờ đóng",
          resolve: "Đã xử lý",
          closed: "Đã đóng",
          merged: "Gộp ticket"
        }
      },
      SPECIAL_ORG: {
        125: "VNPOST",
        132: "CIC",
        3: "ABBank"
      },
      CATEGORY_LABEL: {
        base: {
          "Scan Web": ["scan web", "lỗ hổng", "rà quét lỗ hổng", "scan port", "scan hệ thống website"],
          Bruteforce: ["bruteforce"],
          Command: ["command", "thực thi lệnh"],
          "Kata alert": ["kata"],
          "Change password": ["đổi mật khẩu"],
          Malware: ["mã độc", "malware"],
          "ngừng đẩy log": ["ngừng đẩy log"],
          "create file": ["tạo file", "create file"],
          "xác minh hành vi": ["xác minh hành vi"]
        },
        /**
         * Target-specific overrides / extensions
         * ưu tiên match trước base
         */
        mss: {
          "lock acc": ["khóa tài khoản"],
          "create acc": ["tạo mới tài khoản", "create user"]
        },
        siem: {
          // hiện chưa có rule riêng cho siem
          // sau này thêm vào đây
        }
      }
    }
  };

  // src/modules/soc/ticket/helper/zammad_api.js
  async function zammadFetch(url, options = {}) {
    const fullUrl = url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
    const headers = {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...options.headers || {}
    };
    const res = await fetch(fullUrl, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers,
      body: options.body
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `[ZammadFetch] ${res.status} ${res.statusText}
${text}`
      );
    }
    return res.json();
  }

  // src/modules/soc/ticket/helper/domObserver.js
  function observeWhenVisible(selector, callback, {
    root = document.body,
    debounce = 150,
    once = false,
    attributes = ["style", "class"]
  } = {}) {
    let lastEl = null;
    let lastVisible = false;
    let timer = null;
    let stopped = false;
    function isVisible(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    }
    function trigger(el) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (stopped) return;
        callback(el);
        if (once) observer.disconnect();
      }, debounce);
    }
    const observer = new MutationObserver(() => {
      if (stopped) return;
      const el = root.querySelector(selector);
      if (!el) {
        lastEl = null;
        lastVisible = false;
        return;
      }
      const visible = isVisible(el);
      if (el !== lastEl) {
        lastEl = el;
        lastVisible = visible;
        if (visible) trigger(el);
        return;
      }
      if (!lastVisible && visible) {
        lastVisible = true;
        trigger(el);
        return;
      }
      if (visible) {
        trigger(el);
      }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: attributes,
      characterData: true
    });
    return {
      stop() {
        stopped = true;
        observer.disconnect();
        clearTimeout(timer);
      }
    };
  }

  // src/modules/soc/ticket/note_shift/index.js
  async function fetchAllTickets(target) {
    const api = config_default5.api.all_ticket;
    return zammadFetch(api);
  }
  function injectNoteShiftStyle() {
    if (document.getElementById("maxx-note-style")) return;
    const style = document.createElement("style");
    style.id = "maxx-note-style";
    style.textContent = `
/* ===============================
   NOTE GIAO CA – THEME MATCH
================================ */

.maxx-note-shift-container {
    max-width: 960px;
    padding: 16px 20px;
    background: var(--background-secondary);
    color: var(--text-normal);
}

/* ===== Header ===== */
.maxx-note-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 600;
    color: var(--header-primary);
    margin-bottom: 14px;
}

/* ===== Shift Buttons ===== */
.maxx-shift-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
}

.maxx-shift-buttons button {
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--button-background);
    color: var(--text-normal);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
}

.maxx-shift-buttons button small {
    color: var(--text-muted);
    font-size: 11px;
}

.maxx-shift-buttons button:hover {
    background: var(--background-secondary-hover);
}

.maxx-shift-buttons button.active {
    background: var(--button-primary-background);
    color: var(--text-inverted);
    border-color: var(--button-primary-background);
}

/* ===== Time Row ===== */
.maxx-time-row {
    display: flex;
    align-items: flex-end;
    gap: 14px;
    margin-bottom: 18px;
    flex-wrap: wrap;
}

.maxx-time-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.maxx-time-group label {
    font-size: 11px;
    color: var(--text-muted);
    letter-spacing: 0.3px;
}

/* ===== Input ===== */
.maxx-time-group input {
    height: 32px;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--background-secondary);
    color: var(--text-normal);
}

.maxx-time-group input:focus {
    outline: none;
    border-color: var(--border-highlight);
}

/* ===== Confirm Button ===== */
.maxx-confirm-btn {
    height: 32px;
    padding: 0 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    background: var(--button-primary-background);
    color: var(--button-primary-text);
    font-weight: 500;
}

.maxx-confirm-btn:hover {
    background: var(--button-primary-background-active);
}

/* ===== Output ===== */
.maxx-note-output {
    margin-top: 10px;
}

.maxx-note-output .title {
    font-weight: 600;
    margin-bottom: 6px;
    color: var(--header-primary);
}

.maxx-note-text {
    width: 100%;
    min-height: 120px;
    resize: vertical;
    padding: 8px 10px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: monospace;
}

.maxx-note-text:focus {
    outline: none;
    border-color: var(--border-highlight);
}
    .maxx-note-preview {
    padding: 10px;
    margin-bottom: 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: monospace;
    white-space: pre-wrap;
}

.maxx-note-preview a {
    color: var(--text-link);
    text-decoration: underline;
}

.maxx-note-preview a:hover {
    color: var(--highlight);
}
.maxx-note-output .title {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.maxx-copy-btn {
    height: 26px;
    padding: 0 10px;
    font-size: 12px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--button-background);
    color: var(--text-normal);
    cursor: pointer;
}

.maxx-copy-btn:hover {
    background: var(--background-secondary-hover);
}

.maxx-note-editor {
    min-height: 140px;
    padding: 10px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: monospace;
    white-space: pre-wrap;
    outline: none;
}

.maxx-note-editor a {
    color: var(--text-link);
    text-decoration: underline;
    cursor: pointer;
    user-select: text;
}


    `;
    document.head.appendChild(style);
  }
  function toggleOverviewHeaderTitle(isNoteShiftOn) {
    const titleEl = document.querySelector(".overview-table .page-header .page-header-title h2");
    if (!titleEl) return;
    if (!titleEl.dataset.maxxOriginTitle) {
      titleEl.dataset.maxxOriginTitle = titleEl.textContent;
    }
    if (isNoteShiftOn) {
      titleEl.textContent = "Note Giao Ca";
    } else {
      titleEl.textContent = titleEl.dataset.maxxOriginTitle;
    }
  }
  function toggleNoteShiftScreen() {
    const pageContent = document.querySelector(".overview-table .page-content");
    const tableOverview = pageContent?.querySelector(".table-overview");
    if (!pageContent || !tableOverview) return;
    let screen = pageContent.querySelector(".maxx-note-shift-screen");
    if (!screen) {
      screen = document.createElement("div");
      screen.className = "maxx-note-shift-screen";
      tableOverview.style.display = "none";
      pageContent.appendChild(screen);
      toggleOverviewHeaderTitle(true);
      injectNoteShiftStyle();
      renderNoteShiftTimePicker(screen, async ({ start, end }) => {
        return `✔ Note giao ca từ ${start} đến ${end}`;
      });
      return;
    }
    screen.remove();
    tableOverview.style.display = "";
    toggleOverviewHeaderTitle(false);
  }
  function noteShiftBtn(config, pageHeaderEl) {
    if (!pageHeaderEl) return;
    if (pageHeaderEl.querySelector(".maxx-btn-note-shift")) {
      return;
    }
    const btnNoteShift = document.createElement("button");
    btnNoteShift.innerText = "Note Giao Ca";
    btnNoteShift.className = "maxx-btn-note-shift";
    for (const [key, value] of Object.entries(config.style.btnNoteShift)) {
      btnNoteShift.style[key] = value;
    }
    pageHeaderEl.appendChild(btnNoteShift);
    btnNoteShift.onclick = () => {
      toggleNoteShiftScreen();
      btnNoteShift.classList.toggle("active");
      btnNoteShift.innerText = btnNoteShift.classList.contains("active") ? "Quay lại" : "Note Giao Ca";
    };
  }
  function getShiftTime(shift) {
    const now = /* @__PURE__ */ new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 864e5);
    let start, end;
    switch (shift) {
      case 1:
        start = new Date(today.setHours(6, 0, 0, 0));
        end = new Date(today.setHours(14, 0, 0, 0));
        break;
      case 2:
        start = new Date(today.setHours(14, 0, 0, 0));
        end = new Date(today.setHours(22, 0, 0, 0));
        break;
      case 3:
        start = new Date(yesterday.setHours(22, 0, 0, 0));
        end = new Date(today.setHours(6, 0, 0, 0));
        break;
    }
    return {
      start: toLocalDateTimeInput(start),
      end: toLocalDateTimeInput(end)
    };
  }
  function matchCategoryByMap(title, map) {
    if (!map || typeof map !== "object") return null;
    for (const [category, keywords] of Object.entries(map)) {
      if (!Array.isArray(keywords)) continue;
      if (keywords.some((kw) => typeof kw === "string" && title.includes(kw))) {
        return category;
      }
    }
    return null;
  }
  var TZ_OFFSET_MIN = 0 * 60;
  function extractTicketsFromDOM(config) {
    const table = document.querySelector("table");
    if (!table) return [];
    const headers = table.querySelectorAll("thead th");
    const columnMap = {};
    headers.forEach((th, index) => {
      const key = th.getAttribute("data-column-key");
      if (key) columnMap[key] = index;
    });
    const rows = table.querySelectorAll("tbody tr.item");
    const tickets = [];
    rows.forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      const getText = (key) => {
        const idx = columnMap[key];
        return idx !== void 0 && tds[idx] ? tds[idx].textContent.trim() : "";
      };
      const id = tr.getAttribute("data-id");
      const number = getText("number");
      const title = getText("title");
      const stateText = getText("state_id").toLowerCase();
      let timeString = null;
      const timeColIdx = columnMap["created_at"] !== void 0 ? columnMap["created_at"] : columnMap["updated_at"];
      if (timeColIdx !== void 0 && tds[timeColIdx]) {
        const timeEl = tds[timeColIdx].querySelector("time");
        if (timeEl) timeString = timeEl.getAttribute("datetime");
      }
      const customerText = getText("customer_id");
      let organization_id = null;
      for (const [orgId, orgName] of Object.entries(config.mapping.SPECIAL_ORG)) {
        if (customerText.includes(orgName)) {
          organization_id = Number(orgId);
          break;
        }
      }
      if (id && number && timeString) {
        tickets.push({
          id: Number(id),
          number,
          title,
          organization_id,
          created_at: timeString,
          // Giả lập cho giống key API
          _stateName: stateText
          // Lưu lại state dạng chữ để xử lý riêng
        });
      }
    });
    return tickets;
  }
  function isDomEnoughForShift(domTickets, shiftStart, shiftEnd) {
    if (!domTickets || domTickets.length === 0) return false;
    const isDesc = new Date(domTickets[0].created_at) >= new Date(domTickets[domTickets.length - 1].created_at);
    const firstTicketTime = new Date(isDesc ? domTickets[0].created_at : domTickets[domTickets.length - 1].created_at);
    const lastTicketTime = new Date(isDesc ? domTickets[domTickets.length - 1].created_at : domTickets[0].created_at);
    const isBottomCovered = lastTicketTime <= shiftStart;
    const isTopCovered = firstTicketTime >= shiftEnd || shiftEnd > /* @__PURE__ */ new Date();
    return isBottomCovered && isTopCovered;
  }
  function toLocalDateTimeInput(date) {
    const local = new Date(date.getTime() + TZ_OFFSET_MIN * 6e4);
    const pad = (n) => String(n).padStart(2, "0");
    return local.getFullYear() + "-" + pad(local.getMonth() + 1) + "-" + pad(local.getDate()) + "T" + pad(local.getHours()) + ":" + pad(local.getMinutes());
  }
  function renderNoteShiftTimePicker(screenEl) {
    screenEl.innerHTML = "";
    const container = document.createElement("div");
    container.className = "maxx-note-shift-container";
    container.innerHTML = `
        <div class="maxx-shift-buttons">
            <button data-shift="1">Ca 1<br><small>06:00 - 14:00</small></button>
            <button data-shift="2">Ca 2<br><small>14:00 - 22:00</small></button>
            <button data-shift="3">Ca 3<br><small>22:00 - 06:00</small></button>
        </div>

        <div class="maxx-time-row">
            <div class="maxx-time-group">
                <label>START TIME</label>
                <input type="datetime-local" class="maxx-start-time">
            </div>

            <div class="maxx-time-group">
                <label>END TIME</label>
                <input type="datetime-local" class="maxx-end-time">
            </div>

            <button class="maxx-confirm-btn">Xác nhận</button>
        </div>

        <div class="maxx-note-output">
            <div class="title">
                📄 Nội dung note giao ca
                <button class="maxx-copy-btn">Copy Note</button>
            </div>

            <div class="maxx-note-editor" tabindex="0"></div>

        </div>
    `;
    screenEl.appendChild(container);
    const startInput = container.querySelector(".maxx-start-time");
    const endInput = container.querySelector(".maxx-end-time");
    const noteText = container.querySelector(".maxx-note-text");
    container.querySelectorAll("[data-shift]").forEach((btn) => {
      btn.onclick = () => {
        container.querySelectorAll("[data-shift]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const { start, end } = getShiftTime(Number(btn.dataset.shift));
        startInput.value = start;
        endInput.value = end;
      };
    });
    container.querySelector(".maxx-confirm-btn").onclick = async () => {
      const start = startInput.value;
      const end = endInput.value;
      if (!start || !end) {
        alert("Vui lòng chọn đầy đủ thời gian");
        return;
      }
      const target = detectTargetByURL();
      if (!target) {
        alert("❌ Không xác định được hệ thống");
        return;
      }
      const shiftLabel = container.querySelector("[data-shift].active")?.innerText?.split("\n")[0] || "Ca";
      const editorEl = container.querySelector(".maxx-note-editor");
      const copyBtn = container.querySelector(".maxx-copy-btn");
      editorEl.textContent = "⏳ Đang crawl dữ liệu...";
      copyBtn.onclick = null;
      try {
        const { noteHTML, copyText } = await processData({
          target,
          startTime: start,
          endTime: end,
          shiftLabel
        });
        editorEl.innerHTML = noteHTML;
        copyBtn.onclick = async () => {
          if (!copyText) {
            alert("Không có nội dung để copy");
            return;
          }
          await navigator.clipboard.writeText(copyText);
          copyBtn.innerText = "Đã copy";
          setTimeout(() => copyBtn.innerText = "Copy Note", 1500);
        };
        editorEl.addEventListener("copy", (e) => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) return;
          e.preventDefault();
          e.clipboardData.setData("text/plain", sel.toString());
        });
      } catch (err) {
        editorEl.textContent = err.message === "SESSION_INVALID_OR_NOT_LOGIN" ? "❌ Bạn chưa đăng nhập hệ thống này" : "❌ Lỗi xử lý dữ liệu";
      }
    };
  }
  function filterCategory(target, ticket) {
    const title = ticket.title?.toLowerCase() || "";
    const CATEGORY = config_default5?.mapping?.CATEGORY_LABEL;
    if (!CATEGORY) return "re-check";
    if (target && CATEGORY[target]) {
      const targetMatch = matchCategoryByMap(title, CATEGORY[target]);
      if (targetMatch) return targetMatch;
    }
    if (CATEGORY.base) {
      const baseMatch = matchCategoryByMap(title, CATEGORY.base);
      if (baseMatch) return baseMatch;
    }
    return "re-check";
  }
  function groupTicketsString(target, tickets) {
    if (!tickets.length) return "";
    tickets.sort((a, b) => filterCategory(target, a).localeCompare(filterCategory(target, b)));
    let result = "";
    let current = "";
    let temp = [];
    for (const t of tickets) {
      const cat = filterCategory(target, t);
      if (!current) current = cat;
      if (cat === current) {
        temp.push(buildTicketLink(target, t));
      } else {
        result += `${temp.join(", ")} ${current}; `;
        current = cat;
        temp = [buildTicketLink(target, t)];
      }
    }
    if (temp.length) {
      result += `${temp.join(", ")} ${current}`;
    }
    return result.trim();
  }
  function detectTargetByURL() {
    const host = location.hostname;
    if (host.includes("ticket")) return "siem";
    if (host.includes("dashboard-soc")) return "mss";
    return null;
  }
  function cleanTitle(title = "") {
    return String(title).replace(/\[[^\]]*\]/g, "").trim();
  }
  function buildTicketLink(target, ticket) {
    const id = ticket.id;
    const number = ticket.number;
    if (!id || !number) return number || "";
    const path = target === "mss" ? "/ticket/#ticket/zoom/" : "/#ticket/zoom/";
    return `<a href="${path}${id}" target="_blank">${number}</a>`;
  }
  async function processData({ target, startTime, endTime, shiftLabel }) {
    const { STATE_LABEL, SPECIAL_ORG } = config_default5.mapping;
    const start = new Date(startTime);
    const end = new Date(endTime);
    let ticketsAll = [];
    let stateMap = {};
    const domTickets = extractTicketsFromDOM(config_default5);
    if (isDomEnoughForShift(domTickets, start, end)) {
      console.log("⚡ Maxx Module: Dùng dữ liệu trực tiếp từ giao diện (DOM)");
      ticketsAll = domTickets;
    } else {
      console.log("🐌 Maxx Module: DOM thiếu dữ liệu, tiến hành gọi API...");
      const data = await fetchAllTickets(target);
      if (!data || !data.assets || !data.assets.Ticket) {
        throw new Error("SESSION_INVALID_OR_NOT_LOGIN");
      }
      const apiTickets = Object.values(data.assets.Ticket || {});
      if (!apiTickets.length) {
        throw new Error("NO_TICKET_DATA");
      }
      ticketsAll = apiTickets;
      stateMap = data.assets.TicketState || {};
    }
    const tickets = ticketsAll.filter((t) => {
      const time = new Date(t.created_at || t.updated_at);
      return time >= start && time <= end;
    });
    const stateCount = {};
    tickets.forEach((t) => {
      const stateName = t._stateName || stateMap[t.state_id]?.name || `#${t.state_id}`;
      const label = STATE_LABEL[target]?.[stateName] || stateName;
      stateCount[label] = (stateCount[label] || 0) + 1;
    });
    let summaryHTML = "";
    let summaryText = "";
    let recheckHTML = "";
    const recheckTickets = [];
    if (target === "mss") {
      const MSS_list = [];
      const org_lists = {};
      tickets.forEach((t) => {
        const isUnresolved = t._stateName ? ["new", "open"].includes(t._stateName) : [1, 2].includes(t.state_id);
        if (!isUnresolved) return;
        const cat = filterCategory(target, t);
        if (cat === "re-check") recheckTickets.push(t);
        if (SPECIAL_ORG[t.organization_id]) {
          const org = SPECIAL_ORG[t.organization_id];
          if (!org_lists[org]) org_lists[org] = [];
          org_lists[org].push(t);
        } else {
          MSS_list.push(t);
        }
      });
      const mssHTML = groupTicketsString(target, MSS_list);
      const mssText = mssHTML.replace(/<[^>]+>/g, "");
      if (mssHTML) {
        summaryHTML += `MSS: ${mssHTML} chưa xử lý.
`;
        summaryText += `MSS: ${mssText} chưa xử lý.
`;
      }
      Object.entries(org_lists).forEach(([org, list]) => {
        const html = groupTicketsString(target, list);
        const text = html.replace(/<[^>]+>/g, "");
        if (html) {
          summaryHTML += `${org}: ${html} chưa xử lý.
`;
          summaryText += `${org}: ${text} chưa xử lý.
`;
        }
      });
    }
    if (target === "siem") {
      const list = [];
      tickets.forEach((t) => {
        const isUnresolved = t._stateName ? ["new", "open"].includes(t._stateName) : [1, 2].includes(t.state_id);
        if (!isUnresolved) return;
        const cat = filterCategory(target, t);
        if (cat === "re-check") recheckTickets.push(t);
        list.push(t);
      });
      const siemHTML = groupTicketsString(target, list);
      const siemText = siemHTML.replace(/<[^>]+>/g, "");
      if (siemHTML) {
        summaryHTML += `SIEM: ${siemHTML} chưa xử lý.
`;
        summaryText += `SIEM: ${siemText} chưa xử lý.
`;
      }
    }
    if (recheckTickets.length) {
      recheckHTML += `
------
Danh sách Re-check:
`;
      recheckTickets.forEach((t) => {
        recheckHTML += `- ${buildTicketLink(target, t)}: ${cleanTitle(t.title)}
`;
      });
    }
    const block = [];
    block.push(`=== NOTE ${target.toUpperCase()} (${shiftLabel}) ===`);
    block.push(summaryHTML.trim());
    if (recheckHTML) block.push(recheckHTML.trim());
    block.push(`
Tổng ticket lọc: ${tickets.length}`);
    block.push(`Thống kê trạng thái:`);
    Object.entries(stateCount).forEach(([s, c]) => block.push(`- ${s}: ${c}`));
    block.push(`Lần chạy: ${(/* @__PURE__ */ new Date()).toLocaleString("vi-VN")}`);
    return {
      noteHTML: block.join("\n"),
      copyText: summaryText.trim()
      // ✅ CHỈ SUMMARY – KHÔNG HTML – KHÔNG RECHECK
    };
  }
  function noteShift(ctx) {
    if (!config_default5.enabled) return;
    observeWhenVisible(
      ".overview-table .page-header",
      (pageHeaderEl) => {
        noteShiftBtn(config_default5, pageHeaderEl);
      },
      {
        debounce: 150
      }
    );
    console.log("✅ Maxx Module Loaded: SOC Ticket Note Shift");
  }

  // src/modules/soc/ticket/close_ticket/config.js
  var config_default6 = {
    name: "close-ticket module",
    // module-id: Y2xvc2UtdGlja2V0IG1vZHVsZQ==
    enabled: true,
    match: ["*://*.vnpt.vn/*ticket*"],
    exclude: [],
    runAt: "document-end",
    iframe: false,
    once: true,
    priority: 10,
    options: {
      state: {
        closed: "4"
      },
      organization: {
        TT_ATTT: "18"
      }
    }
  };

  // src/modules/soc/ticket/close_ticket/index.js
  var domObserver = null;
  var currentTicketId = null;
  var STORAGE_KEY = "maxx_auto_next_enabled";
  var isAutoNextEnabled = () => localStorage.getItem(STORAGE_KEY) === "true";
  function getTicketId() {
    const el = document.querySelector(".ticket-number");
    return el ? el.textContent.trim() : null;
  }
  function injectStyleCSS() {
    if (document.getElementById("maxx-close-btn-style")) return;
    const style = document.createElement("style");
    style.id = "maxx-close-btn-style";
    style.innerHTML = `
    /* Style cũ giữ nguyên */
    .tabsSidebar-action {
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }
    .tabsSidebar-action .close-icon {
        font-size: 32px;
        font-weight: 700;
        line-height: 1;
        color: #9aa5ad;
        user-select: none;
    }
    .tabsSidebar-action:hover {
        background-color: #eef2f3;
    }
    .tabsSidebar-action:hover .close-icon {
        color: #d9534f;
    }
    .tabsSidebar-action.disabled {
        cursor: not-allowed;
    }

    /* Style mới cho Toggle Button */
    .btn-auto-next {
        display: inline-flex;
        align-items: center;
        padding: 0 8px;
        margin-left: 8px;
        height: 22px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 3px;
        border: 1px solid #ccc;
        cursor: pointer;
        user-select: none;
        transition: all 0.2s;
        background: #f5f5f5;
        color: #666;
        text-transform: uppercase;
		width: 100px;
    }
    .btn-auto-next.is-enabled {
        background: #28a745;
        color: #fff;
        border-color: #218838;
    }
  `;
    document.head.appendChild(style);
  }
  function updateToggleButtonStyle(btn) {
    const enabled = isAutoNextEnabled();
    if (enabled) {
      btn.classList.add("is-enabled");
      btn.textContent = "Auto Next: ON";
    } else {
      btn.classList.remove("is-enabled");
      btn.textContent = "Auto Next: OFF";
    }
  }
  function injectUI() {
    const pagination = document.querySelector("div.ticketZoom div.pagination");
    if (pagination && !pagination.querySelector(".btn-auto-next")) {
      const btnToggle = document.createElement("button");
      btnToggle.className = "btn-auto-next";
      btnToggle.type = "button";
      updateToggleButtonStyle(btnToggle);
      btnToggle.addEventListener("click", (e) => {
        e.preventDefault();
        const newState = !isAutoNextEnabled();
        localStorage.setItem(STORAGE_KEY, newState);
        updateToggleButtonStyle(btnToggle);
      });
      pagination.appendChild(btnToggle);
    }
    const tabsContainer = document.querySelector(".tabsSidebar-tabs");
    if (!tabsContainer) return;
    let closeBtn = tabsContainer.querySelector(".tabsSidebar-action");
    if (!closeBtn) {
      closeBtn = document.createElement("div");
      closeBtn.className = "tabsSidebar-tab tabsSidebar-action";
      closeBtn.title = "Close ticket";
      closeBtn.innerHTML = `<span class="close-icon">×</span>`;
      closeBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (closeBtn.classList.contains("disabled")) return;
        onCloseButtonClick();
      });
      tabsContainer.appendChild(closeBtn);
    }
    const shouldDisable = isTicketClosed() || !isAllowedGroup();
    closeBtn.classList.toggle("disabled", shouldDisable);
    if (!isAllowedGroup()) {
      closeBtn.title = "Kiểm tra trước khi đóng <<Organization not TT_ATTT>>";
    } else if (isTicketClosed()) {
      closeBtn.title = "Ticket đã được đóng";
    } else {
      closeBtn.title = "Close ticket";
    }
  }
  function onCloseButtonClick() {
    if (isTicketClosed() || !isAllowedGroup()) return;
    const closeBtn = document.querySelector(".tabsSidebar-action");
    if (closeBtn) {
      closeBtn.classList.add("disabled");
      closeBtn.title = "Ticket đang được đóng...";
    }
    const stateControl = document.querySelector('.form-control[name="state_id"]');
    if (!stateControl) return;
    stateControl.value = config_default6.options.state.closed;
    stateControl.dispatchEvent(new Event("change", { bubbles: true }));
    const updateButton = document.querySelector(".js-submitDropdown > button.js-submit");
    if (!updateButton) return;
    updateButton.click();
    if (isAutoNextEnabled()) {
      setTimeout(() => {
        const nextBtn = document.querySelector("div.ticketZoom div.pagination a.btn--split--first");
        if (nextBtn) {
          console.log("[close-ticket] Auto-moving to next ticket...");
          nextBtn.click();
        }
      }, 1e3);
    }
  }
  function isTicketClosed() {
    const stateControl = document.querySelector('.form-control[name="state_id"]');
    return stateControl ? String(stateControl.value) === String(config_default6.options.state.closed) : false;
  }
  function isAllowedGroup() {
    const groupInput = document.querySelector('.form-group[data-attribute-name="group_id"] input.searchableSelect-shadow');
    if (!groupInput) return false;
    return String(groupInput.value) === String(config_default6.options.organization.TT_ATTT);
  }
  function resetCloseButton() {
    const oldBtn = document.querySelector(".tabsSidebar-action");
    if (oldBtn) oldBtn.remove();
  }
  function observeDOM() {
    const appRoot = document.getElementById("app");
    if (!appRoot) {
      setTimeout(observeDOM, 500);
      return;
    }
    if (domObserver) return;
    domObserver = new MutationObserver(() => {
      const newTicketId = getTicketId();
      if (newTicketId && newTicketId !== currentTicketId) {
        currentTicketId = newTicketId;
        resetCloseButton();
      }
      injectUI();
    });
    domObserver.observe(appRoot, { childList: true, subtree: true });
  }
  function closeTicket(ctx) {
    if (!config_default6.enabled) return;
    injectStyleCSS();
    currentTicketId = getTicketId();
    injectUI();
    observeDOM();
  }
  if (false) {
    window.__MAXX_DEV_ENTRY__ = closeTicket;
  }

  // src/modules/soc/siem/offense_masker/config.js
  var config_default7 = {
    name: "offense-masker module",
    // module-id: b2ZmZW5zZS1tYXNrZXIgbW9kdWxl
    enabled: true,
    match: ["*://*.vnpt.vn/console/qradar/*"],
    exclude: [],
    runAt: "document-end",
    iframe: true,
    frames: ["PAGE_SEM"],
    once: true,
    priority: 10
  };

  // src/modules/soc/siem/offense_masker/index.js
  function offenseMasker(ctx) {
    if (!config_default7.enabled) return;
    const STORAGE_KEY2 = "MX_OFFENSE_MASKED_IDS";
    const CLEAR_BTN_ID = "MAXX_CLEAR_ALL_MASKS";
    const STYLE_ID2 = "mx-offense-masker-style";
    let maskedIds = loadMaskedIds();
    const offenseCellSelector = 'td[propertyname="offenseId"]';
    const tableRootSelector = "#tableSection";
    const toolbarButtonsSelector = "div.toolbar div#toolbarButtons";
    function getTargetDocs() {
      const docs = [];
      if (ctx.siem && ctx.siem.scope) {
        ctx.siem.scope(ctx.siem.getSelfFrameId(), { self: true, children: true }, (fCtx) => {
          if (fCtx.document) docs.push(fCtx.document);
        });
      } else {
        docs.push(document);
      }
      return docs;
    }
    function loadMaskedIds() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY2);
        return raw ? new Set(JSON.parse(raw)) : /* @__PURE__ */ new Set();
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    function saveMaskedIds() {
      try {
        localStorage.setItem(STORAGE_KEY2, JSON.stringify([...maskedIds]));
      } catch {
      }
    }
    function injectStyles(doc) {
      if (!doc?.head || doc.getElementById(STYLE_ID2)) return;
      const style = doc.createElement("style");
      style.id = STYLE_ID2;
      style.textContent = `
        ${toolbarButtonsSelector} { display: flex !important; }
        .mx-offense-mask-icon {
            display: inline-flex; align-items: center; justify-content: center;
            width: 14px; height: 14px; margin-left: 6px; cursor: pointer;
            font-size: 12px; user-select: none; opacity: 0; visibility: hidden;
            transition: opacity 0.15s ease, transform 0.15s ease; transform: scale(0.9);
        }
        td[propertyname="offenseId"]:hover > .mx-offense-mask-icon { opacity: 0.7; visibility: visible; }
        td[propertyname="offenseId"]:hover > .mx-offense-mask-icon:hover { opacity: 1; transform: scale(1); }
        tr.mx-offense-masked { background: yellow !important; color: #333 !important; }
        #${CLEAR_BTN_ID} { display: inline-flex; order: 1; align-items: center; gap: 4px; padding: 0 6px; border-radius: 2px; }
        #${CLEAR_BTN_ID}::before { content: "🧹"; font-size: 13px; opacity: 0.7; }
        #${CLEAR_BTN_ID}:hover::before { opacity: 1; }
        #${CLEAR_BTN_ID}:hover { background: rgba(0,0,0,0.08); }
        #${CLEAR_BTN_ID}.mx-disabled { opacity: 0.4; pointer-events: none; }
        `;
      doc.head.appendChild(style);
    }
    function ensureOffenseId(cell) {
      if (!cell) return "";
      if (cell.dataset.offenseId) return cell.dataset.offenseId;
      const id = Array.from(cell.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim();
      if (id) cell.dataset.offenseId = id;
      return id;
    }
    function updateClearButtonState(doc) {
      const btn = doc.getElementById(CLEAR_BTN_ID);
      if (!btn) return;
      const count = maskedIds.size;
      const label = btn.querySelector("span");
      if (label) {
        label.textContent = count > 0 ? `Clear Masks (${count})` : "Clear Masks";
      }
      if (count === 0) btn.classList.add("mx-disabled");
      else btn.classList.remove("mx-disabled");
    }
    function clearAllMasks(doc) {
      maskedIds.clear();
      saveMaskedIds();
      const tableRoot = doc.querySelector(tableRootSelector);
      if (tableRoot) {
        tableRoot.querySelectorAll("tr.mx-offense-masked").forEach((row) => row.classList.remove("mx-offense-masked"));
        tableRoot.querySelectorAll(".mx-offense-mask-icon").forEach((icon) => icon.textContent = "➕");
      }
      updateClearButtonState(doc);
    }
    function injectClearAllButton(doc) {
      const toolbar = doc.querySelector(toolbarButtonsSelector);
      if (!toolbar) return;
      let btn = doc.getElementById(CLEAR_BTN_ID);
      if (!btn) {
        btn = doc.createElement("div");
        btn.id = CLEAR_BTN_ID;
        btn.className = "DA_COMPONENT DA_SPEEDBUTTON";
        btn.title = "Clear all masked offenses";
        btn.style.lineHeight = "16px";
        btn.style.cursor = "default";
        btn.style.userSelect = "none";
        btn.innerHTML = `<span style="padding-left:2px;">Clear Masks</span>`;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          clearAllMasks(doc);
        });
        const last = toolbar.lastElementChild;
        last ? last.after(btn) : toolbar.appendChild(btn);
      }
      updateClearButtonState(doc);
    }
    function toggleMask(row, cell, icon, doc) {
      const offenseId = cell.dataset.offenseId;
      if (!offenseId) return;
      if (row.classList.contains("mx-offense-masked")) {
        row.classList.remove("mx-offense-masked");
        icon.textContent = "➕";
        maskedIds.delete(offenseId);
      } else {
        row.classList.add("mx-offense-masked");
        icon.textContent = "➖";
        maskedIds.add(offenseId);
      }
      saveMaskedIds();
      updateClearButtonState(doc);
    }
    function injectMasker(doc, cell) {
      if (!cell || cell.querySelector(".mx-offense-mask-icon")) return;
      const row = cell.closest("tr");
      if (!row) return;
      const offenseId = ensureOffenseId(cell);
      if (!offenseId) return;
      const icon = doc.createElement("span");
      icon.className = "mx-offense-mask-icon";
      icon.textContent = maskedIds.has(offenseId) ? "➖" : "➕";
      if (maskedIds.has(offenseId)) row.classList.add("mx-offense-masked");
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMask(row, cell, icon, doc);
      });
      cell.appendChild(icon);
    }
    function scanTable(doc) {
      const tableRoot = doc.querySelector(tableRootSelector);
      if (!tableRoot) return;
      maskedIds = loadMaskedIds();
      tableRoot.querySelectorAll(offenseCellSelector).forEach((cell) => injectMasker(doc, cell));
      updateClearButtonState(doc);
    }
    setInterval(() => {
      getTargetDocs().forEach((doc) => {
        const root = doc.querySelector(tableRootSelector);
        if (!root) return;
        injectStyles(doc);
        injectClearAllButton(doc);
        if (doc._mxMaskerObservedRoot !== root) {
          doc._mxMaskerObservedRoot = root;
          if (doc._mxMaskerObserver) {
            doc._mxMaskerObserver.disconnect();
          }
          scanTable(doc);
          doc._mxMaskerObserver = new MutationObserver(() => {
            injectClearAllButton(doc);
            if (doc._mxMaskerTimer) clearTimeout(doc._mxMaskerTimer);
            doc._mxMaskerTimer = setTimeout(() => {
              scanTable(doc);
            }, 250);
          });
          doc._mxMaskerObserver.observe(root, { childList: true, subtree: true });
        }
      });
    }, 1e3);
  }
  if (false) {
    window.__MAXX_DEV_ENTRY__ = offenseMasker;
  }

  // src/modules/soc/ticket/clear_queue_ticket_opened/config.js
  var config_default8 = {
    name: "clear-queue-ticket-opened module",
    // module-id: Y2xlYXItcXVldWUtdGlja2V0LW9wZW5lZCBtb2R1bGU=
    enabled: true,
    match: ["*://*.vnpt.vn/*ticket*"],
    exclude: [],
    runAt: "document-end",
    iframe: false,
    once: true,
    priority: 10,
    SELECTOR: {
      MENU: "div#navigation div.menu",
      TASKS_NAV: "div.tasks-navigation",
      CLOSE_TASK_BTN: ".nav-tab div.nav-tab-close",
      TASK_ITEM: ".nav-tab"
    }
  };

  // src/modules/soc/ticket/clear_queue_ticket_opened/index.js
  function clearQueueTicketOpened(ctx) {
    if (!config_default8.enabled) return;
    const BTN_ID = "MAXX_CLEAR_TASKS_OPENED";
    let observer = null;
    function injectStyles() {
      if (document.getElementById("maxx-clear-tasks-style")) return;
      const style = document.createElement("style");
      style.id = "maxx-clear-tasks-style";
      style.textContent = `
		.maxx-clear-tasks-opened {
            width: 100%;
			display: inline-flex;
			align-items: center;
			cursor: pointer;
			transition: color 0.2s ease;
		}
        .maxx-clear-tasks-opened:hover {
            background: var(--menu-background-active, #429ed7);
            color: var(--menu-text-active, #fff);
        }

		.maxx-clear-tasks-opened .maxx-icon-broom {
			display: inline-block;
            width: 24px;
            height: 24px;
            margin-right: 15px;
			transition: transform 0.25s ease;
			transform-origin: 20% 80%;
		}

		.maxx-clear-tasks-opened:hover .maxx-icon-broom {
			animation: maxx-broom-sweep 0.6s ease-in-out;
		}

		@keyframes maxx-broom-sweep {
			0% {
				transform: rotate(0deg) translateX(0);
			}
			30% {
				transform: rotate(-15deg) translateX(-2px);
			}
			60% {
				transform: rotate(10deg) translateX(2px);
			}
			100% {
				transform: rotate(0deg) translateX(0);
			}
		}
	`;
      document.head.appendChild(style);
    }
    function clearTasksOpened() {
      const closeBtns = document.querySelectorAll(config_default8.SELECTOR.CLOSE_TASK_BTN);
      if (closeBtns.length == 0) {
        return;
      }
      for (let i = 0; i < closeBtns.length; i++) {
        closeBtns[i].click();
      }
    }
    function injectCloseAllButton(menu) {
      if (!menu) return;
      if (menu.querySelector(`#${BTN_ID}`)) return;
      const btn = document.createElement("a");
      btn.id = BTN_ID;
      btn.className = "menu-item maxx-clear-tasks-opened";
      const icon = document.createElement("span");
      icon.className = "maxx-icon-broom";
      icon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M15 16h4v2h-4zm0-8h7v2h-7zm0 4h6v2h-6zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3zM14 5h-3l-1-1H6L5 5H2v2h12z"/></svg>
        `;
      const text = document.createElement("span");
      text.className = "maxx-btn-text";
      text.textContent = "Clear Tasks Opened";
      btn.appendChild(icon);
      btn.appendChild(text);
      btn.addEventListener("click", clearTasksOpened);
      menu.appendChild(btn);
      injectStyles();
    }
    function observeMenu() {
      if (observer) return;
      const run = () => {
        const menu = document.querySelector(config_default8.SELECTOR.MENU);
        if (menu) {
          injectCloseAllButton(menu);
        }
      };
      run();
      observer = new MutationObserver(run);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    observeMenu();
  }
  if (false) {
    window.__MAXX_DEV_ENTRY__ = clearQueueTicketOpened;
  }

  // src/modules/soc/siem/event_filter/config.js
  var config_default9 = {
    name: "event-filter module",
    // module-id: ZXZlbnQtZmlsdGVyIG1vZHVsZQ==
    enabled: true,
    match: ["*://*.vnpt.vn/console/qradar/*"],
    exclude: [],
    runAt: "document-end",
    iframe: true,
    frames: ["PAGE_EVENTVIEWER", "mainPage"],
    once: true,
    priority: 10,
    /* =========================
        RULE SYSTEM
    ========================= */
    ruleSchema: "event-filter@1.0",
    // localStorage key (runtime rules)
    ruleStorageKey: "MX_EVENT_FILTER_RULES_V1",
    // preset rule file (seed only)
    rulePreset: "./rules.preset.json",
    /* =========================
        SELECTORS
    ========================= */
    selector: {
      toolbarButtons: ["#toolbarButtons"],
      table: "#tableSection .grid.dashboard-grid",
      eventTableRow: "#tableSection .grid.dashboard-grid tbody tr",
      eventTableCellData: "#tableSection .grid.dashboard-grid tbody tr td > span > span",
      eventTableCell: "#tableSection .grid.dashboard-grid tbody tr td"
    },
    textPattern: []
  };

  // src/helper/logger.js
  function createLogger(moduleName = "unknown", options = {}) {
    const PREFIX = `[MAXX][${moduleName}]`;
    function isActive() {
      if (typeof options.active === "boolean") {
        return options.active;
      }
      if (false) {
        return true;
      }
      return false;
    }
    function base(style, label, ...args) {
      if (!isActive()) return;
      console.log(`%c${PREFIX} %c${label}`, "color:#9e9e9e;font-weight:bold", style, ...args);
    }
    return {
      log(...args) {
        base("color:#2196f3;font-weight:bold", "LOG", ...args);
      },
      warn(...args) {
        base("color:#ff9800;font-weight:bold", "WARN", ...args);
      },
      error(...args) {
        base("color:#f44336;font-weight:bold", "ERROR", ...args);
      }
    };
  }

  // src/modules/soc/siem/event_filter/index.js
  function eventFilterModule(ctx) {
    const logger = createLogger("siem:event_filter", { active: true });
    const sel = config_default9.selector || {};
    function pick(v, fallback = "") {
      if (Array.isArray(v)) return v[0] || fallback;
      return v || fallback;
    }
    const S = {
      toolbarButtons: pick(sel.toolbarButtons, "#toolbarButtons"),
      table: pick(sel.table, "#tableSection"),
      eventTableRow: pick(sel.eventTableRow, "#tableSection tbody tr"),
      eventTableCellData: pick(sel.eventTableCellData, "td")
    };
    function loadBuilderEnabled() {
      try {
        const v = localStorage.getItem(STORAGE_KEY_BUILDER_ENABLED);
        return v === "1";
      } catch {
        return false;
      }
    }
    function saveBuilderEnabled(val) {
      try {
        localStorage.setItem(STORAGE_KEY_BUILDER_ENABLED, val ? "1" : "0");
      } catch {
      }
    }
    function setBuilderEnabled(val) {
      builderEnabled = !!val;
      saveBuilderEnabled(builderEnabled);
      if (!builderEnabled) {
        cleanupBuilderCellUI({ removeButtons: true });
        document.querySelectorAll(".mx-ef-cell-draft-match").forEach((td) => td.classList.remove("mx-ef-cell-draft-match"));
      } else {
        injectCellButtons();
      }
      syncBuilderUI();
    }
    function getDomainKey() {
      return (location.hostname || "unknown").toLowerCase();
    }
    function loadAndClampPosition(el) {
      if (!el) return;
      const savedPos = JSON.parse(localStorage.getItem(POS_STORAGE_KEY) || "{}");
      if (savedPos.top && savedPos.left) {
        el.style.bottom = "auto";
        el.style.right = "auto";
        el.style.top = savedPos.top;
        el.style.left = savedPos.left;
        requestAnimationFrame(() => {
          if (el.style.display === "none") return;
          let currentTop = el.offsetTop;
          let currentLeft = el.offsetLeft;
          const maxLeft = window.innerWidth - el.offsetWidth;
          const maxTop = window.innerHeight - el.offsetHeight;
          let changed = false;
          if (currentLeft < 0) {
            currentLeft = 0;
            changed = true;
          }
          if (currentTop < 0) {
            currentTop = 0;
            changed = true;
          }
          if (currentLeft > maxLeft && maxLeft > 0) {
            currentLeft = maxLeft;
            changed = true;
          }
          if (currentTop > maxTop && maxTop > 0) {
            currentTop = maxTop;
            changed = true;
          }
          if (changed) {
            el.style.top = currentTop + "px";
            el.style.left = currentLeft + "px";
          }
        });
      } else {
        el.style.bottom = "20px";
        el.style.right = "20px";
        el.style.top = "auto";
        el.style.left = "auto";
      }
    }
    function makeDraggable(handleEl, moveEl, isTrigger = false) {
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      let isDragging = false;
      const dragMouseDown = (e) => {
        if (e.target.closest(".mx-ef-builder__ctrl")) return;
        e.preventDefault();
        isDragging = false;
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
      };
      const elementDrag = (e) => {
        e.preventDefault();
        isDragging = true;
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        let newTop = moveEl.offsetTop - pos2;
        let newLeft = moveEl.offsetLeft - pos1;
        const maxLeft = window.innerWidth - moveEl.offsetWidth;
        const maxTop = window.innerHeight - moveEl.offsetHeight;
        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop > maxTop) newTop = maxTop;
        moveEl.style.top = newTop + "px";
        moveEl.style.left = newLeft + "px";
        moveEl.style.bottom = "auto";
        moveEl.style.right = "auto";
      };
      const closeDragElement = () => {
        document.onmouseup = null;
        document.onmousemove = null;
        if (isDragging) {
          localStorage.setItem(POS_STORAGE_KEY, JSON.stringify({
            top: moveEl.style.top,
            left: moveEl.style.left
          }));
        } else if (isTrigger) {
          setBuilderOpen(true);
        }
      };
      handleEl.onmousedown = dragMouseDown;
    }
    function parseToken(tokenStr) {
      const t = normalizeWhitespace(tokenStr);
      if (!t) return null;
      const regexMatch = t.match(/^\/(.+)\/([gimsuy]*)$/);
      if (regexMatch) {
        try {
          const cleanFlags = regexMatch[2].replace(/[gy]/g, "");
          return new RegExp(regexMatch[1], cleanFlags);
        } catch (e) {
          return t;
        }
      }
      return t;
    }
    function escapeRegexText(text) {
      return text.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    }
    function unescapeRegexText(text) {
      return text.replace(/\\([.*+?^${}()|[\]\\\/])/g, "$1");
    }
    function parseTokenState(token) {
      let inner = token;
      let flags = "i";
      let isRegex = false;
      let isExact = false;
      const match = token.match(/^\/(.+)\/([a-z]*)$/i);
      if (match) {
        isRegex = true;
        inner = match[1];
        flags = match[2];
        if (inner.startsWith("^") && inner.endsWith("$")) {
          isExact = true;
          inner = inner.slice(1, -1);
        }
      }
      return { isRegex, isExact, inner, flags };
    }
    const STORAGE_KEY_ENABLED = "MX_EVENT_FILTER_ENABLED";
    const STORAGE_KEY_RULES = "MX_EVENT_FILTER_TEXT_PATTERNS";
    const STORAGE_KEY_RULES_DRAFT = "MX_EVENT_FILTER_TEXT_PATTERNS_DRAFT";
    const STORAGE_KEY_BUILDER_ENABLED = "MX_EVENT_FILTER_BUILDER_ENABLED";
    const DOMAIN_KEY = getDomainKey();
    const STORAGE_KEY_BUILDER_OPEN = `MX_EVENT_FILTER_BUILDER_OPEN__${DOMAIN_KEY}`;
    const POS_STORAGE_KEY = `MX_EVENT_FILTER_BUILDER_POS__${DOMAIN_KEY}`;
    const STORAGE_KEY_COLORS = "MX_EVENT_FILTER_COLORS";
    let builderEnabled = loadBuilderEnabled();
    let builderOpen = loadBuilderOpen();
    function loadBuilderOpen() {
      try {
        const v = localStorage.getItem(STORAGE_KEY_BUILDER_OPEN);
        if (v == null) return true;
        return v === "1";
      } catch {
        return true;
      }
    }
    function saveBuilderOpen(val) {
      try {
        localStorage.setItem(STORAGE_KEY_BUILDER_OPEN, val ? "1" : "0");
      } catch {
      }
    }
    function setBuilderOpen(val) {
      builderOpen = !!val;
      saveBuilderOpen(builderOpen);
      syncBuilderUI();
    }
    let hlColors = loadColors();
    function loadColors() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_COLORS);
        if (raw) return JSON.parse(raw);
      } catch {
      }
      return { text: "#dd6600", bg: "" };
    }
    function saveColors(colors) {
      try {
        localStorage.setItem(STORAGE_KEY_COLORS, JSON.stringify(colors));
      } catch {
      }
    }
    function applyColorsToDOM(colors = hlColors) {
      document.documentElement.style.setProperty("--mx-ef-hl-text", colors.text || "#dd6600");
      document.documentElement.style.setProperty("--mx-ef-hl-bg", colors.bg || "transparent");
    }
    let enabled = loadEnabled();
    function loadEnabled() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_ENABLED);
        if (raw == null) return false;
        return raw === "1";
      } catch {
        return false;
      }
    }
    function saveEnabled(val) {
      try {
        localStorage.setItem(STORAGE_KEY_ENABLED, val ? "1" : "0");
      } catch {
      }
    }
    let patternGroups = compileTextPatterns(loadRulesRaw());
    function loadRulesRaw() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_RULES);
        if (raw) return JSON.parse(raw);
      } catch {
      }
      return config_default9.textPattern;
    }
    function saveRulesRaw(rules) {
      try {
        localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules));
      } catch {
      }
    }
    const STYLE_ID2 = "mx-event-filter-style";
    const NOT_OK_CLASS = "mx-event-not-whitelist";
    function injectStyle2() {
      if (document.getElementById(STYLE_ID2)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID2;
      style.textContent = `
            :root {
                    --mx-ef-hl-text: #dd6600;
                    --mx-ef-hl-bg: transparent;
            }

            tr.${NOT_OK_CLASS}:not(.datarowselected):not([selected="true"]),
            tr.${NOT_OK_CLASS}:not(.datarowselected):not([selected="true"]) td,
            tr.${NOT_OK_CLASS}:not(.datarowselected):not([selected="true"]) span,
            tr.${NOT_OK_CLASS}:not(.datarowselected):not([selected="true"]) div {
                color: var(--mx-ef-hl-text) !important;
                background-color: var(--mx-ef-hl-bg) !important;
            }

            /* container */
            .mx-event-filter-wrap{
                display:inline-flex;
                align-items:center;
                gap:6px;
                margin-left:6px;
                padding:2px 6px;
                border:1px solid #888;
                border-radius:4px;
                order: 3;
            }
            .mx-event-filter-btn{
                display:inline-flex;
                align-items:center;
                padding:2px 8px;
                border:1px solid #888;
                border-radius:3px;
                cursor:pointer;
                font-size:12px;
                user-select:none;
                line-height:1.2;
            }
            .mx-event-filter-btn:hover{ filter:brightness(0.98); }

            /* modal */
            .mx-ef-modal{
                position:fixed;
                inset:0;
                background:rgba(0,0,0,.35);
                z-index:999999;
                display:flex;
                align-items:center;
                justify-content:center;
            }
            .mx-ef-panel{
                width:min(860px, 92vw);
                max-height:88vh;
                background:#fff;
                border-radius:10px;
                border:1px solid rgba(0,0,0,.2);
                box-shadow:0 10px 30px rgba(0,0,0,.25);
                display:flex;
                flex-direction:column;
                overflow:hidden;
            }
            .mx-ef-head{
                padding:10px 12px;
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                border-bottom:1px solid rgba(0,0,0,.12);
                font-size:13px;
                font-weight:600;
            }
            .mx-ef-body{ padding:10px 12px; display:flex; flex-direction:column; gap:8px; }
            .mx-ef-hint { 
                font-size: 12px; 
                opacity: .9; 
                line-height: 1.5;
                margin-bottom: 10px;
                padding: 10px;
                background: #f6f8fa;
                border-left: 3px solid #1f6feb;
                border-radius: 4px;
                max-height: 180px; 
                overflow-y: auto;
            }
            .mx-ef-hint::-webkit-scrollbar { width: 4px; }
            .mx-ef-hint::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
            .mx-ef-textarea{
                width:100%;
                height:35vh;
                min-height:240px;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size:12px;
                padding:10px;
                border:1px solid rgba(0,0,0,.25);
                border-radius:8px;
                outline:none;
                white-space:pre;
            }
            .mx-ef-foot{
                padding:10px 12px;
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                border-top:1px solid rgba(0,0,0,.12);
            }
            .mx-ef-actions{ display:flex; gap:8px; flex-wrap:wrap; }
            .mx-ef-mini{
                font-size:12px;
                padding:6px 10px;
                border:1px solid rgba(0,0,0,.25);
                border-radius:8px;
                cursor:pointer;
                background:#fff;
                user-select:none;
            }
            .mx-ef-mini:hover{ filter:brightness(0.98); }
            .mx-ef-danger{ border-color:#8b0000; color:#8b0000; }
            .mx-ef-ok{ border-color:#1f6feb; color:#1f6feb; }
            .mx-ef-msg{ font-size:12px; opacity:.85; }

            /* cell + / - */
            ${sel.eventTableCell}.mx-ef-cell-host {
                position: relative;
            }

            ${sel.eventTableCell}.mx-ef-cell-host .mx-ef-cell-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 14px;
                height: 14px;
                line-height: 14px;
                border-radius: 3px;
                border: 1px solid rgba(0,0,0,.25);
                font-size: 12px;
                cursor: pointer;
                user-select: none;
                background: #fff;
                color: #000;

                position: absolute;
                right: 6px;
                top: 50%;
                transform: translateY(-50%);

                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                transition: opacity .12s ease;
            }

            ${sel.eventTableCell}.mx-ef-cell-host:hover .mx-ef-cell-btn {
                opacity: .95;
                visibility: visible;
                pointer-events: auto;
            }
            
            ${sel.eventTableCell}.mx-ef-cell-host {
                padding-right: 24px !important;
            }

            ${sel.eventTableCell}.mx-ef-cell-selected {
                background: #fff4b8 !important; 
                color: #333333 !important;
            }

            /* rule builder panel */
            .mx-ef-builder {
                position: fixed;
                z-index: 999999;
                width: 400px;
                background: #fff;
                border: 1px solid rgba(0,0,0,.2);
                border-radius: 10px;
                box-shadow: 0 10px 30px rgba(0,0,0,.18);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-size: 12px;
                cursor: default;
            }

            .mx-ef-builder__head {
                cursor: move; 
                background: #f8f9fa;
                display: flex;
                align-items: center;
                padding: 8px 10px;
                border-bottom: 1px solid rgba(0,0,0,.12);
                user-select: none;
            }

            .mx-ef-builder-trigger {
                position: fixed;
                z-index: 999999;
                width: 32px;
                height: 32px;
                background: black;
                color: greenyellow;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                font-weight: bold;
                font-size: 16px;
                user-select: none;
                transition: transform 0.2s;
            }
            .mx-ef-builder-trigger:hover { transform: scale(1.1); }

            .mx-ef-builder__ctrl {
                cursor: pointer;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                font-size: 14px;
                font-weight: bold;
                color: #555;
                transition: all 0.2s ease;
            }
            .mx-ef-builder__ctrl:hover { 
                background: rgba(0,0,0,0.08); 
                color: #000;
            }
            .mx-ef-builder__ctrl.btn-close:hover {
                background: #e81123;
                color: #fff;
            }

            .mx-ef-builder__body {
                padding: 8px 10px;
                max-height: 320px;
                overflow: auto;
            }

            .mx-ef-builder__token {
                display: flex;
                align-items: flex-start;
                gap: 6px;
                padding: 6px 6px;
                border: 1px solid rgba(0,0,0,.12);
                border-radius: 8px;
                margin-bottom: 6px;
                background: #fff;
            }

            .mx-ef-builder__token code{
                white-space: pre-wrap;
                word-break: break-word;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 11px;
            }

            .mx-ef-builder__x {
                margin-left: auto;
                cursor: pointer;
                border: 1px solid rgba(0,0,0,.2);
                border-radius: 6px;
                padding: 0 6px;
                height: 18px;
                line-height: 18px;
                user-select: none;
                opacity: .85;
            }
            .mx-ef-builder__x:hover { opacity: 1; }

            .mx-ef-builder__foot {
                display: flex;
                gap: 8px;
                padding: 8px 10px;
                border-top: 1px solid rgba(0,0,0,.12);
            }

            .mx-ef-builder__btn {
                flex: 1;
                padding: 6px 10px;
                border: 1px solid rgba(0,0,0,.25);
                border-radius: 8px;
                background: #fff;
                cursor: pointer;
                user-select: none;
                text-align: center;
            }
            .mx-ef-builder__btn:hover { filter: brightness(.98); }
            .mx-ef-builder__btn--primary { border-color: #1f6feb; color: #1f6feb; }
            .mx-ef-builder__btn--danger { border-color: #8b0000; color: #8b0000; }
            .mx-ef-builder__btn[aria-disabled="true"] { opacity: .4; pointer-events: none; }

            /* --- CSS CHO TÍNH NĂNG DRAFT HIGHLIGHT --- */
            ${sel.eventTableCell}.mx-ef-cell-draft-match,
            ${sel.eventTableCell}.mx-ef-cell-draft-match > span,
            ${sel.eventTableCell}.mx-ef-cell-draft-match > div {
                background-color: #d1f7d1 !important;
                color: #004d00 !important;
            }

            .mx-ef-builder__input {
                flex: 1;
                border: none;
                background: transparent;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 11px;
                outline: none;
                padding: 2px 4px;
                width: 100%;
                
                white-space: pre-wrap;   
                word-break: break-all;   
                min-height: 16px;
                line-height: 1.4;
            }
            .mx-ef-builder__input:focus {
                background: #f0f4f8;
                border-radius: 4px;
            }
            /* Nút Toggle Regex [.*] */
            .mx-ef-builder__regex {
                cursor: pointer;
                border: 1px solid rgba(0,0,0,.2);
                border-radius: 4px;
                padding: 0 4px;
                margin-right: 6px;
                height: 18px;
                line-height: 16px;
                font-size: 11px;
                font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
                user-select: none;
                opacity: 0.6;
                transition: all 0.15s;
            }
            .mx-ef-builder__regex:hover { opacity: 1; }
            .mx-ef-builder__regex.is-active {
                background: #1f6feb;
                color: #fff;
                border-color: #1f6feb;
                opacity: 1;
            }

        `;
      document.head.appendChild(style);
    }
    function applyRowStyle(row, isMatch3) {
      if (!row) return;
      if (isMatch3) row.classList.remove(NOT_OK_CLASS);
      else row.classList.add(NOT_OK_CLASS);
    }
    function clearAllRowStyles() {
      const rows = document.querySelectorAll(S.eventTableRow);
      rows.forEach((row) => row.classList.remove(NOT_OK_CLASS));
    }
    function normalizeWhitespace(str) {
      return String(str || "").replace(/\s+/g, " ").trim();
    }
    function getCellTexts(row) {
      if (!row) return [];
      const cells = row.querySelectorAll(S.eventTableCellData);
      const arr = [];
      cells.forEach((cell) => {
        arr.push(getTokenFromTd(cell));
      });
      return arr;
    }
    function compileTextPatterns(textPattern) {
      const groups = Array.isArray(textPattern) ? textPattern : [];
      return groups.filter((g) => Array.isArray(g) && g.length > 0).map(
        (g) => g.map((token) => parseToken(token)).filter((t) => t !== null && t !== "")
      ).filter((g) => g.length > 0);
    }
    function validateRulesShape(rules) {
      if (!Array.isArray(rules))
        return {
          ok: false,
          error: "Rules phải là mảng (array) các group."
        };
      for (const g of rules) {
        if (!Array.isArray(g) || g.length === 0)
          return {
            ok: false,
            error: "Mỗi group phải là mảng có ít nhất 1 chuỗi."
          };
        for (const t of g) {
          if (typeof t !== "string")
            return {
              ok: false,
              error: "Mỗi token trong group phải là string."
            };
        }
      }
      return { ok: true };
    }
    function isWhitelisted(cellsText) {
      if (!patternGroups.length) return false;
      if (!cellsText.length) return false;
      return patternGroups.some((group) => {
        return group.every((token) => {
          return cellsText.some((cellText) => {
            if (token instanceof RegExp) {
              return token.test(cellText);
            }
            token.lastIndex = 0;
            return cellText.includes(token);
          });
        });
      });
    }
    function runScan() {
      if (!enabled) return;
      const rows = document.querySelectorAll(S.eventTableRow);
      rows.forEach((row) => {
        const cellsText = getCellTexts(row);
        const ok = isWhitelisted(cellsText);
        applyRowStyle(row, ok);
      });
      injectCellButtons();
    }
    function runDraftHighlight() {
      if (!builderEnabled) return;
      document.querySelectorAll(".mx-ef-cell-draft-match").forEach((td) => {
        td.classList.remove("mx-ef-cell-draft-match");
      });
      if (builderTokens.length === 0) return;
      const draftPatterns = builderTokens.map((t) => parseToken(t)).filter((t) => t !== null && t !== "");
      if (draftPatterns.length === 0) return;
      const cells = document.querySelectorAll("td.mx-ef-cell-host");
      cells.forEach((td) => {
        const cellText = getTokenFromTd(td);
        if (!cellText) return;
        const isMatch3 = draftPatterns.some((pattern) => {
          if (pattern instanceof RegExp) {
            pattern.lastIndex = 0;
            return pattern.test(cellText);
          }
          return cellText.includes(pattern);
        });
        if (isMatch3) {
          td.classList.add("mx-ef-cell-draft-match");
        }
      });
    }
    const BUILDER_DRAFT_KEY = `MX_EVENT_FILTER_BUILDER_DRAFT__${DOMAIN_KEY}`;
    let builderTokens = [];
    const builderCounts = /* @__PURE__ */ new Map();
    let builderPanel = null;
    function loadBuilderDraft() {
      try {
        const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.tokens)) {
          builderTokens = parsed.tokens.filter(
            (t) => typeof t === "string" && t.length
          );
          builderCounts.clear();
          if (parsed.counts && typeof parsed.counts === "object") {
            for (const [k, v] of Object.entries(parsed.counts)) {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0)
                builderCounts.set(k, n);
            }
          }
          for (const t of builderTokens) {
            if (!builderCounts.has(t)) builderCounts.set(t, 1);
          }
        }
      } catch {
      }
    }
    function saveBuilderDraft() {
      try {
        const countsObj = {};
        for (const [k, v] of builderCounts.entries()) countsObj[k] = v;
        localStorage.setItem(
          BUILDER_DRAFT_KEY,
          JSON.stringify({ tokens: builderTokens, counts: countsObj })
        );
      } catch {
      }
    }
    function clearBuilderDraft() {
      builderTokens = [];
      builderCounts.clear();
      try {
        localStorage.removeItem(BUILDER_DRAFT_KEY);
      } catch {
      }
      resetAllSelectedCellsInDOM();
      updateBuilderPanel();
      runDraftHighlight();
    }
    let triggerBtn = null;
    function injectBuilderPanel() {
      if (builderPanel) return;
      builderPanel = document.createElement("div");
      builderPanel.className = "mx-ef-builder";
      triggerBtn = document.createElement("div");
      triggerBtn.className = "mx-ef-builder-trigger";
      triggerBtn.innerHTML = "M";
      triggerBtn.title = "Mở Rule Builder";
      document.body.appendChild(triggerBtn);
      const head = document.createElement("div");
      head.className = "mx-ef-builder__head";
      head.innerHTML = `
            <span style="pointer-events:none; font-weight: 600;">Rule Builder (Draft)</span>
            <div style="margin-left:auto; display:flex; gap:2px;">
                <div class="mx-ef-builder__ctrl btn-min" title="Thu nhỏ">−</div>
                <div class="mx-ef-builder__ctrl btn-close" title="Tắt hoàn toàn">✕</div>
            </div>
        `;
      head.querySelector(".btn-min").onclick = () => setBuilderOpen(false);
      head.querySelector(".btn-close").onclick = () => setBuilderEnabled(false);
      const body = document.createElement("div");
      body.className = "mx-ef-builder__body";
      const foot = document.createElement("div");
      foot.className = "mx-ef-builder__foot";
      const btnClear = document.createElement("div");
      btnClear.className = "mx-ef-builder__btn mx-ef-builder__btn--danger";
      btnClear.textContent = "Clear";
      btnClear.addEventListener("click", () => {
        cleanupBuilderCellUI({ removeButtons: false });
        clearBuilderDraft();
      });
      const btnNewToken = document.createElement("div");
      btnNewToken.className = "mx-ef-builder__btn";
      btnNewToken.style.borderColor = "#2da44e";
      btnNewToken.style.color = "#2da44e";
      btnNewToken.textContent = "+ Token";
      btnNewToken.title = "Thêm một token trống để tự gõ";
      btnNewToken.addEventListener("click", () => {
        const placeholder = "nhap_rule_moi_" + Math.floor(Math.random() * 1e3);
        addToken(placeholder);
        setTimeout(() => {
          if (!builderPanel) return;
          const inputs = builderPanel.querySelectorAll(".mx-ef-builder__input");
          const lastInput = inputs[inputs.length - 1];
          if (lastInput) {
            lastInput.focus();
            const range = document.createRange();
            range.selectNodeContents(lastInput);
            const sel2 = window.getSelection();
            sel2.removeAllRanges();
            sel2.addRange(range);
          }
        }, 50);
      });
      const btnAdd = document.createElement("div");
      btnAdd.className = "mx-ef-builder__btn mx-ef-builder__btn--primary";
      btnAdd.textContent = "Save Rule";
      btnAdd.addEventListener("click", () => {
        addRuleFromBuilder();
        cleanupBuilderCellUI({ removeButtons: false });
      });
      foot.appendChild(btnClear);
      foot.appendChild(btnNewToken);
      foot.appendChild(btnAdd);
      builderPanel.appendChild(head);
      builderPanel.appendChild(body);
      builderPanel.appendChild(foot);
      document.body.appendChild(builderPanel);
      makeDraggable(triggerBtn, triggerBtn, true);
      makeDraggable(head, builderPanel, false);
      builderPanel.style.display = builderEnabled ? "" : "none";
      setBuilderOpen(builderOpen);
    }
    function syncBuilderUI() {
      if (!builderPanel || !triggerBtn) return;
      if (btnBuilder) {
        btnBuilder.textContent = builderEnabled ? "Builder: ON" : "Builder: OFF";
        btnBuilder.style.background = builderEnabled ? "#1f6feb" : "";
        btnBuilder.style.color = builderEnabled ? "#fff" : "";
      }
      if (builderEnabled) {
        if (builderOpen) {
          builderPanel.style.display = "flex";
          triggerBtn.style.display = "none";
          loadAndClampPosition(builderPanel);
        } else {
          builderPanel.style.display = "none";
          triggerBtn.style.display = "flex";
          loadAndClampPosition(triggerBtn);
        }
      } else {
        builderPanel.style.display = "none";
        triggerBtn.style.display = "none";
      }
    }
    function updateBuilderPanel() {
      if (!builderPanel) return;
      const meta = builderPanel.querySelector(".mx-ef-builder__meta");
      const body = builderPanel.querySelector(".mx-ef-builder__body");
      const btnAdd = builderPanel.querySelector(
        ".mx-ef-builder__btn--primary"
      );
      if (meta) meta.textContent = `${builderTokens.length} token(s)`;
      if (body) {
        body.innerHTML = "";
        if (builderTokens.length === 0) {
          const empty = document.createElement("div");
          empty.style.opacity = ".75";
          empty.textContent = "Click dấu [+] ở cell trên bảng, hoặc bấm nút [+ Token] bên dưới để tự gõ.";
          body.appendChild(empty);
        } else {
          builderTokens.forEach((token) => {
            const row = document.createElement("div");
            row.className = "mx-ef-builder__token";
            const input = document.createElement("div");
            input.className = "mx-ef-builder__input";
            input.contentEditable = "true";
            input.spellcheck = false;
            input.textContent = token;
            let currentToken = token;
            let state = parseTokenState(currentToken);
            const btnRegex = document.createElement("div");
            btnRegex.className = "mx-ef-builder__regex";
            btnRegex.textContent = ".*";
            btnRegex.title = "Regular Expression (Partial Match)";
            btnRegex.classList.toggle("is-active", state.isRegex);
            const btnExact = document.createElement("div");
            btnExact.className = "mx-ef-builder__regex";
            btnExact.textContent = "^$";
            btnExact.title = "Khớp chính xác toàn bộ ô (Exact Match)";
            btnExact.classList.toggle("is-active", state.isExact);
            const commitTokenChange = (newVal) => {
              input.textContent = newVal;
              const idx = builderTokens.indexOf(currentToken);
              if (idx !== -1) {
                builderTokens[idx] = newVal;
                const currentCount = builderCounts.get(currentToken) || 1;
                builderCounts.delete(currentToken);
                builderCounts.set(newVal, currentCount);
                currentToken = newVal;
              }
              let s = parseTokenState(newVal);
              btnRegex.classList.toggle("is-active", s.isRegex);
              btnExact.classList.toggle("is-active", s.isExact);
              saveBuilderDraft();
              resetAllSelectedCellsInDOM();
              injectCellButtons();
              runDraftHighlight();
            };
            btnRegex.addEventListener("click", () => {
              let s = parseTokenState(currentToken);
              if (s.isRegex) {
                commitTokenChange(unescapeRegexText(s.inner));
              } else {
                commitTokenChange(`/${escapeRegexText(currentToken)}/i`);
              }
            });
            btnExact.addEventListener("click", () => {
              let s = parseTokenState(currentToken);
              if (s.isExact) {
                commitTokenChange(`/${s.inner}/${s.flags}`);
              } else {
                if (s.isRegex) {
                  commitTokenChange(`/^${s.inner.trim()}$/${s.flags}`);
                } else {
                  commitTokenChange(`/^${escapeRegexText(currentToken.trim())}$/i`);
                }
              }
            });
            let debounceTimer;
            input.addEventListener("input", (e) => {
              const newVal = e.target.textContent;
              let s = parseTokenState(newVal);
              btnRegex.classList.toggle("is-active", s.isRegex);
              btnExact.classList.toggle("is-active", s.isExact);
              const idx = builderTokens.indexOf(currentToken);
              if (idx !== -1) {
                builderTokens[idx] = newVal;
                const currentCount = builderCounts.get(currentToken) || 1;
                builderCounts.delete(currentToken);
                builderCounts.set(newVal, currentCount);
                currentToken = newVal;
              }
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                saveBuilderDraft();
                resetAllSelectedCellsInDOM();
                injectCellButtons();
                runDraftHighlight();
              }, 300);
            });
            input.addEventListener("keydown", (e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                const text = input.textContent;
                const selection = window.getSelection();
                if (!selection.rangeCount) return;
                const range = selection.getRangeAt(0);
                const start = range.startOffset;
                const end = range.endOffset;
                const part1 = text.slice(0, start).trim();
                const part2 = text.slice(end).trim();
                if (part1 && part2) {
                  const idx = builderTokens.indexOf(currentToken);
                  if (idx !== -1) {
                    builderTokens.splice(idx, 1, part1, part2);
                    builderCounts.delete(currentToken);
                    builderCounts.set(part1, (builderCounts.get(part1) || 0) + 1);
                    builderCounts.set(part2, (builderCounts.get(part2) || 0) + 1);
                    saveBuilderDraft();
                    resetAllSelectedCellsInDOM();
                    injectCellButtons();
                    updateBuilderPanel();
                    runDraftHighlight();
                    setTimeout(() => {
                      const inputs = builderPanel.querySelectorAll(".mx-ef-builder__input");
                      if (inputs[idx + 1]) inputs[idx + 1].focus();
                    }, 10);
                  }
                } else {
                  input.blur();
                }
              }
            });
            const x = document.createElement("div");
            x.className = "mx-ef-builder__x";
            x.textContent = "x";
            x.title = "Remove token";
            x.addEventListener("click", () => {
              forceRemoveToken(currentToken);
            });
            const controls = document.createElement("div");
            controls.style.display = "flex";
            controls.style.alignItems = "center";
            controls.style.gap = "4px";
            controls.style.marginLeft = "8px";
            controls.style.flexShrink = "0";
            controls.appendChild(btnRegex);
            controls.appendChild(btnExact);
            controls.appendChild(x);
            row.appendChild(input);
            row.appendChild(controls);
            body.appendChild(row);
          });
        }
      }
      if (btnAdd) {
        btnAdd.setAttribute(
          "aria-disabled",
          builderTokens.length ? "false" : "true"
        );
      }
      saveBuilderDraft();
    }
    function addRuleFromBuilder() {
      if (!builderTokens.length) return;
      const rawRules = loadRulesRaw() || [];
      const nextRules = Array.isArray(rawRules) ? rawRules.slice() : [];
      nextRules.push(builderTokens.slice());
      saveRulesRaw(nextRules);
      patternGroups = compileTextPatterns(nextRules);
      try {
        const pretty = JSON.stringify(nextRules, null, 2);
        localStorage.setItem(STORAGE_KEY_RULES_DRAFT, pretty);
      } catch {
      }
      if (enabled) runScan();
      clearBuilderDraft();
    }
    function addToken(token) {
      if (!token) return;
      const current = builderCounts.get(token) || 0;
      builderCounts.set(token, current + 1);
      if (!builderTokens.includes(token)) builderTokens.push(token);
      updateBuilderPanel();
      runDraftHighlight();
    }
    function removeTokenOnce(token) {
      if (!token) return;
      const current = builderCounts.get(token) || 0;
      if (current <= 1) {
        builderCounts.delete(token);
        builderTokens = builderTokens.filter((t) => t !== token);
      } else {
        builderCounts.set(token, current - 1);
      }
      updateBuilderPanel();
      runDraftHighlight();
    }
    function forceRemoveToken(token) {
      builderCounts.delete(token);
      builderTokens = builderTokens.filter((t) => t !== token);
      resetCellsByTokenInDOM(token);
      updateBuilderPanel();
      runDraftHighlight();
    }
    function injectCellButtons() {
      if (!builderEnabled) return;
      const rows = document.querySelectorAll(S.eventTableRow);
      rows.forEach((row) => {
        const tds = row.querySelectorAll("td");
        tds.forEach((td) => {
          if (td.dataset.mxEfInited === "1") return;
          td.dataset.mxEfInited = "1";
          td.classList.add("mx-ef-cell-host");
          if (td.querySelector(".mx-ef-cell-btn")) return;
          const token = getTokenFromTd(td);
          if (!token) return;
          const btn = document.createElement("span");
          btn.className = "mx-ef-cell-btn";
          btn.textContent = "+";
          btn.title = "Add token to Rule Builder";
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const selected = td.dataset.mxEfSelected === "1";
            if (!selected) {
              addToken(token);
              setTdSelectedUI(td, true);
            } else {
              removeTokenOnce(token);
              setTdSelectedUI(td, false);
            }
          });
          td.appendChild(btn);
          const isNowSelected = builderTokens.includes(token);
          if (td.dataset.mxEfSelected !== (isNowSelected ? "1" : "0")) {
            setTdSelectedUI(td, isNowSelected);
          }
        });
      });
    }
    function resetCellsByTokenInDOM(token) {
      document.querySelectorAll("td.mx-ef-cell-host").forEach((td) => {
        const t = td.dataset.mxEfToken || getTokenFromTd(td);
        if (t === token) setTdSelectedUI(td, false);
      });
    }
    function resetAllSelectedCellsInDOM() {
      document.querySelectorAll("td.mx-ef-cell-selected").forEach((td) => {
        setTdSelectedUI(td, false);
      });
    }
    function cleanupBuilderCellUI({ removeButtons = false } = {}) {
      document.querySelectorAll("td.mx-ef-cell-selected").forEach((td) => {
        td.classList.remove("mx-ef-cell-selected");
        td.dataset.mxEfSelected = "0";
        const btn = td.querySelector(".mx-ef-cell-btn");
        if (btn) btn.textContent = "+";
      });
      if (removeButtons) {
        document.querySelectorAll("td.mx-ef-cell-host").forEach((td) => {
          td.classList.remove("mx-ef-cell-host");
          delete td.dataset.mxEfInited;
          td.querySelectorAll(".mx-ef-cell-btn").forEach(
            (b) => b.remove()
          );
        });
      }
    }
    let wrap, btnToggle, btnRules, btnBuilder;
    function findToolbarRoot() {
      const shade = document.querySelector(".shade");
      if (shade) {
        const tb = shade.querySelector(S.toolbarButtons);
        if (tb) return tb;
      }
      return document.querySelector(S.toolbarButtons);
    }
    function updateToggleButton() {
      if (!btnToggle) return;
      btnToggle.style.background = enabled ? "#8b0000" : "";
      btnToggle.style.color = enabled ? "#fff" : "";
      btnToggle.textContent = enabled ? "Event Filter: ON" : "Event Filter: OFF";
    }
    function toggleEnabled() {
      enabled = !enabled;
      saveEnabled(enabled);
      updateToggleButton();
      if (!enabled) clearAllRowStyles();
      else runScan();
    }
    function getCurrentRulesForEditor() {
      let raw;
      try {
        const ls = localStorage.getItem(STORAGE_KEY_RULES);
        raw = ls ? JSON.parse(ls) : config_default9.textPattern || [];
      } catch {
        raw = config_default9.textPattern || [];
      }
      return raw;
    }
    function exportRulesJSON() {
      const rules = getCurrentRulesForEditor();
      return JSON.stringify(rules, null, 2);
    }
    function downloadText(filename, text) {
      const blob = new Blob([text], {
        type: "application/json;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    }
    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
    function getTokenFromTd(td) {
      const cached = td?.dataset?.mxEfToken;
      if (cached) return cached;
      function extractText(node) {
        if (node.nodeType === 3) return node.nodeValue || "";
        if (node.nodeType === 1) {
          const tag = node.tagName.toLowerCase();
          if (tag === "script" || tag === "style") return "";
          if (node.classList && node.classList.contains("mx-ef-cell-btn")) return "";
          let text = "";
          for (const child of node.childNodes) {
            text += extractText(child);
          }
          return text;
        }
        return "";
      }
      const fullText = extractText(td);
      const token = normalizeWhitespace(fullText);
      td.dataset.mxEfToken = token;
      return token;
    }
    function setTdSelectedUI(td, selected) {
      if (!td) return;
      td.classList.toggle("mx-ef-cell-selected", !!selected);
      td.dataset.mxEfSelected = selected ? "1" : "0";
      const btn = td.querySelector(".mx-ef-cell-btn");
      if (btn) btn.textContent = selected ? "-" : "+";
    }
    function openRulesModal() {
      const INDENT = "  ";
      const draftKey = STORAGE_KEY_RULES_DRAFT || "MX_EVENT_FILTER_TEXT_PATTERNS_DRAFT";
      function lsAvailable() {
        try {
          const t = "__mx_ls_test__";
          localStorage.setItem(t, "1");
          localStorage.removeItem(t);
          return true;
        } catch {
          return false;
        }
      }
      function loadDraftMeta() {
        if (!lsAvailable()) return { has: false, text: "" };
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw === null) return { has: false, text: "" };
          return { has: true, text: raw };
        } catch {
          return { has: false, text: "" };
        }
      }
      function saveDraftText(text) {
        if (!lsAvailable()) return;
        try {
          localStorage.setItem(draftKey, String(text ?? ""));
        } catch {
        }
      }
      function clearDraftText() {
        if (!lsAvailable()) return;
        try {
          localStorage.removeItem(draftKey);
        } catch {
        }
      }
      const modal = document.createElement("div");
      modal.className = "mx-ef-modal";
      modal.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        if (e.target === modal) textarea.focus();
      });
      modal.addEventListener("click", (e) => e.stopPropagation());
      const panel = document.createElement("div");
      panel.className = "mx-ef-panel";
      panel.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        const t = e.target;
        if (t.closest("textarea, input, button, a, .mx-ef-mini")) return;
        textarea.focus();
      });
      panel.addEventListener("click", (e) => e.stopPropagation());
      modal.addEventListener("keydown", (e) => e.stopPropagation());
      modal.addEventListener("keyup", (e) => e.stopPropagation());
      modal.addEventListener("keypress", (e) => e.stopPropagation());
      const head = document.createElement("div");
      head.className = "mx-ef-head";
      head.innerHTML = `<div>Event Filter Rules (textPattern)</div>`;
      const closeBtn = document.createElement("div");
      closeBtn.className = "mx-ef-mini mx-ef-danger";
      closeBtn.textContent = "Close";
      head.appendChild(closeBtn);
      const body = document.createElement("div");
      body.className = "mx-ef-body";
      const hint = document.createElement("div");
      hint.className = "mx-ef-hint";
      hint.innerHTML = `
            <div style="margin-bottom: 8px;">
                <strong style="color: #1f6feb; font-size: 13px;">📝 CÚ PHÁP RULE (JSON Array)</strong><br>
                Cấu trúc: <code>[ [Group1], [Group2], ... ]</code><br>
                • <b>Mỗi Group (Array con):</b> Là điều kiện <b>VÀ (AND)</b>. Dòng phải khớp tất cả token trong group mới hiển thị.<br>
                • <b>Giữa các Group:</b> Là điều kiện <b>HOẶC (OR)</b>. Khớp bất kỳ group nào là hiển thị.
            </div>

            <div style="margin-bottom: 8px;">
                <strong style="color: #1f6feb; font-size: 13px;">🔍 LOẠI TOKEN HỖ TRỢ</strong><br>
                • <b>Chuỗi thường:</b> Viết text bình thường. VD: <code>"Login"</code><br>
                • <b>Regex:</b> Bọc trong dấu <code>/ /</code>. VD: <code>"/^192\\.168/i"</code> (Lưu ý: dùng 2 dấu gạch chéo ngược <code>\\\\</code> trong chuỗi JSON).
            </div>

            <div style="margin-bottom: 8px;">
                <strong style="color: #d12d33; font-size: 13px;">💡 VÍ DỤ THỰC TẾ</strong><br>
                • Lọc dòng có chữ "Error" <b>VÀ</b> từ IP "10.0.0.1":<br>
                <code>[ ["Error", "10.0.0.1"] ]</code><br>
                • Hiện dòng có "Fail" <b>HOẶC</b> dòng từ domain "admin":<br>
                <code>[ ["Fail"], ["admin"] ]</code><br>
                • Dùng Regex tìm lỗi 4xx hoặc 5xx:<br>
                <code>[ ["/[45][0-9]{2}/"] ]</code>
            </div>

            <div style="border-top: 1px solid #ddd; padding-top: 5px;">
                <strong style="color: #555;">⌨️ PHÍM TẮT EDITOR:</strong><br>
                • <b>Tab / S-Tab:</b> Thụt lề | <b>Enter:</b> Tự tạo block {} []<br>
                • <b>Ctrl + S:</b> Lưu & Áp dụng ngay | <b>Esc:</b> Đóng modal
            </div>
        `;
      const colorRow = document.createElement("div");
      colorRow.style.display = "flex";
      colorRow.style.gap = "16px";
      colorRow.style.alignItems = "center";
      colorRow.style.marginBottom = "8px";
      colorRow.style.fontSize = "12px";
      colorRow.style.padding = "6px 10px";
      colorRow.style.background = "#f0f4f8";
      colorRow.style.borderRadius = "4px";
      colorRow.style.border = "1px solid rgba(0,0,0,0.1)";
      colorRow.innerHTML = `
            <strong style="color: #333;">🎨 Màu Dòng Bị Lọc:</strong>
            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                <span>Chữ:</span>
                <input type="color" id="mx-color-text" value="${hlColors.text || "#dd6600"}" style="width:24px; height:24px; padding:0; border:none; cursor:pointer; background:transparent;">
            </label>
            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="mx-color-bg-enable" ${hlColors.bg ? "checked" : ""}>
                <span>Nền:</span>
                <input type="color" id="mx-color-bg" value="${hlColors.bg || "#fff4b8"}" style="width:24px; height:24px; padding:0; border:none; cursor:pointer; background:transparent;">
            </label>
            <span style="margin-left:auto; opacity:0.7; font-size:11px; font-style:italic;">(Đổi màu xem trước trực tiếp ở bảng)</span>
        `;
      const iText = colorRow.querySelector("#mx-color-text");
      const iBg = colorRow.querySelector("#mx-color-bg");
      const chkBg = colorRow.querySelector("#mx-color-bg-enable");
      const updatePreviewColor = () => {
        applyColorsToDOM({
          text: iText.value,
          bg: chkBg.checked ? iBg.value : ""
        });
      };
      iText.addEventListener("input", updatePreviewColor);
      iBg.addEventListener("input", updatePreviewColor);
      chkBg.addEventListener("change", updatePreviewColor);
      const textarea = document.createElement("textarea");
      textarea.className = "mx-ef-textarea";
      textarea.spellcheck = false;
      textarea.wrap = "off";
      const saved = exportRulesJSON();
      const draftMeta = loadDraftMeta();
      textarea.value = draftMeta.has ? draftMeta.text : saved;
      const msg = document.createElement("div");
      msg.className = "mx-ef-msg";
      msg.textContent = draftMeta.has ? "Đang mở draft (auto-save)." : "Đang mở rules đã lưu.";
      body.appendChild(hint);
      body.appendChild(colorRow);
      body.appendChild(textarea);
      body.appendChild(msg);
      const foot = document.createElement("div");
      foot.className = "mx-ef-foot";
      const left = document.createElement("div");
      left.className = "mx-ef-actions";
      const btnImportFile = document.createElement("div");
      btnImportFile.className = "mx-ef-mini";
      btnImportFile.textContent = "Import file .json";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "application/json,.json";
      fileInput.style.display = "none";
      btnImportFile.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        try {
          const text = await f.text();
          textarea.setRangeText(text, 0, textarea.value.length, "end");
          saveDraftText(textarea.value);
          msg.textContent = "Đã import từ file (đã lưu draft).";
        } catch {
          msg.textContent = "Không đọc được file import.";
        }
        fileInput.value = "";
      });
      const btnCopy = document.createElement("div");
      btnCopy.className = "mx-ef-mini";
      btnCopy.textContent = "Copy JSON";
      btnCopy.addEventListener("click", async () => {
        const ok = await copyToClipboard(textarea.value);
        msg.textContent = ok ? "Đã copy vào clipboard." : "Copy thất bại (trình duyệt chặn).";
      });
      const btnDiscardDraft = document.createElement("div");
      btnDiscardDraft.className = "mx-ef-mini mx-ef-danger";
      btnDiscardDraft.textContent = "Discard Draft";
      btnDiscardDraft.addEventListener("click", () => {
        clearDraftText();
        const back = exportRulesJSON();
        textarea.setRangeText(back, 0, textarea.value.length, "end");
        saveDraftText(textarea.value);
        msg.textContent = "Đã bỏ draft, quay về rules đã lưu.";
      });
      left.appendChild(btnImportFile);
      left.appendChild(fileInput);
      left.appendChild(btnCopy);
      left.appendChild(btnDiscardDraft);
      const right = document.createElement("div");
      right.className = "mx-ef-actions";
      const btnFormat = document.createElement("div");
      btnFormat.className = "mx-ef-mini";
      btnFormat.textContent = "Format JSON";
      btnFormat.addEventListener("click", () => {
        let parsed;
        try {
          parsed = JSON.parse(textarea.value);
        } catch {
          msg.textContent = "JSON đang lỗi cú pháp — chưa format được.";
          return;
        }
        const pretty = JSON.stringify(parsed, null, 2);
        textarea.setRangeText(pretty, 0, textarea.value.length, "select");
        saveDraftText(textarea.value);
        msg.textContent = "Đã format JSON (2 spaces).";
      });
      const btnDownload = document.createElement("div");
      btnDownload.className = "mx-ef-mini";
      btnDownload.textContent = "Download JSON";
      btnDownload.addEventListener("click", () => {
        downloadText("event_filter_rules.json", textarea.value);
        msg.textContent = "Đã download JSON.";
      });
      const btnSave = document.createElement("div");
      btnSave.className = "mx-ef-mini mx-ef-ok";
      btnSave.textContent = "Save & Apply";
      btnSave.addEventListener("click", () => {
        let parsed;
        try {
          parsed = JSON.parse(textarea.value);
        } catch {
          msg.textContent = "JSON lỗi cú pháp. Kiểm tra dấu phẩy/ngoặc.";
          return;
        }
        const v = validateRulesShape(parsed);
        if (!v.ok) {
          msg.textContent = `Rules không hợp lệ: ${v.error}`;
          return;
        }
        hlColors = { text: iText.value, bg: chkBg.checked ? iBg.value : "" };
        saveColors(hlColors);
        saveRulesRaw(parsed);
        patternGroups = compileTextPatterns(parsed);
        clearDraftText();
        msg.textContent = `Đã lưu rules (${patternGroups.length} group) & apply.`;
        if (enabled) runScan();
        else clearAllRowStyles();
      });
      right.appendChild(btnFormat);
      right.appendChild(btnDownload);
      right.appendChild(btnSave);
      foot.appendChild(left);
      foot.appendChild(right);
      panel.appendChild(head);
      panel.appendChild(body);
      panel.appendChild(foot);
      modal.appendChild(panel);
      let draftTimer = 0;
      function scheduleDraftSave() {
        saveDraftText(textarea.value);
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(() => {
          msg.textContent = "Draft đã lưu.";
        }, 250);
      }
      function flushDraftNow() {
        if (draftTimer) clearTimeout(draftTimer);
        saveDraftText(textarea.value);
      }
      textarea.addEventListener("input", scheduleDraftSave);
      function onVisibilityChange() {
        if (document.visibilityState !== "visible") flushDraftNow();
      }
      function onBeforeUnload() {
        flushDraftNow();
      }
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("beforeunload", onBeforeUnload);
      function getLineStart(value, pos) {
        return value.lastIndexOf("\n", pos - 1) + 1;
      }
      function getLineIndent(value, lineStart) {
        const m = value.slice(lineStart).match(/^[ \t]+/);
        return m ? m[0].replace(/\t/g, INDENT) : "";
      }
      function lastNonSpaceChar(s) {
        for (let i = s.length - 1; i >= 0; i--) {
          const c = s[i];
          if (c !== " " && c !== "	") return c;
        }
        return "";
      }
      function firstNonSpaceChar(s) {
        for (let i = 0; i < s.length; i++) {
          const c = s[i];
          if (c !== " " && c !== "	") return c;
        }
        return "";
      }
      function indentBlock(start, end) {
        const value = textarea.value;
        const selected = value.slice(start, end);
        const lines = selected.split("\n");
        const replaced = lines.map((ln) => INDENT + ln).join("\n");
        textarea.setRangeText(replaced, start, end, "select");
      }
      function unindentBlock(start, end) {
        const value = textarea.value;
        const selected = value.slice(start, end);
        const lines = selected.split("\n");
        const replaced = lines.map((ln) => {
          if (ln.startsWith(INDENT)) return ln.slice(INDENT.length);
          if (ln.startsWith("	")) return ln.slice(1);
          return ln;
        }).join("\n");
        textarea.setRangeText(replaced, start, end, "select");
      }
      const PAIRS = { "{": "}", "[": "]", "(": ")", '"': '"', "'": "'" };
      function wrapSelection(open, close2) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        const selected = value.slice(start, end);
        textarea.setRangeText(open + selected + close2, start, end, "end");
        if (selected.length === 0) {
          textarea.selectionStart = textarea.selectionEnd = start + open.length;
        }
      }
      function smartEnter() {
        const value = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const lineStart = getLineStart(value, start);
        const baseIndent = getLineIndent(value, lineStart);
        const beforeLine = value.slice(lineStart, start);
        const afterCursor = value.slice(start);
        const prevChar = lastNonSpaceChar(beforeLine);
        const nextChar = firstNonSpaceChar(afterCursor);
        if (prevChar === "{" || prevChar === "[") {
          const innerIndent = baseIndent + INDENT;
          const insertText = "\n" + innerIndent + "\n" + baseIndent;
          textarea.setRangeText(insertText, start, end, "end");
          const pos = textarea.selectionStart;
          const back = ("\n" + baseIndent).length;
          textarea.selectionStart = textarea.selectionEnd = pos - back;
          return;
        }
        if (nextChar === "}" || nextChar === "]") {
          const innerIndent = baseIndent + INDENT;
          const insertText = "\n" + innerIndent + "\n" + baseIndent;
          textarea.setRangeText(insertText, start, end, "end");
          const pos = textarea.selectionStart;
          const back = ("\n" + baseIndent).length;
          textarea.selectionStart = textarea.selectionEnd = pos - back;
          return;
        }
        textarea.setRangeText("\n" + baseIndent, start, end, "end");
      }
      function outdentIfLineIsWhitespace() {
        const value = textarea.value;
        const pos = textarea.selectionStart;
        const lineStart = getLineStart(value, pos);
        const before = value.slice(lineStart, pos);
        if (!/^[ \t]*$/.test(before)) return;
        if (before.endsWith(INDENT)) {
          textarea.setRangeText("", pos - INDENT.length, pos, "end");
          return;
        }
        if (before.endsWith("	")) {
          textarea.setRangeText("", pos - 1, pos, "end");
        }
      }
      textarea.addEventListener("keydown", (e) => {
        const isMod = e.ctrlKey || e.metaKey;
        if (isMod && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          e.stopPropagation();
          btnSave.click();
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const value = textarea.value;
          const selected = value.slice(start, end);
          if (selected.includes("\n")) {
            if (e.shiftKey) unindentBlock(start, end);
            else indentBlock(start, end);
          } else {
            if (e.shiftKey) {
              const lineStart = getLineStart(value, start);
              if (value.slice(lineStart, start).endsWith(INDENT)) {
                textarea.setRangeText("", start - INDENT.length, start, "end");
              }
            } else {
              textarea.setRangeText(INDENT, start, end, "end");
            }
          }
          scheduleDraftSave();
          return;
        }
        if (e.key === "Enter") {
          smartEnter();
          e.preventDefault();
          e.stopPropagation();
          scheduleDraftSave();
          return;
        }
        if (!isMod && !e.altKey && PAIRS[e.key]) {
          e.preventDefault();
          e.stopPropagation();
          wrapSelection(e.key, PAIRS[e.key]);
          scheduleDraftSave();
          return;
        }
        if (!isMod && !e.altKey && (e.key === "}" || e.key === "]")) {
          outdentIfLineIsWhitespace();
        }
        e.stopPropagation();
      });
      const keepFocus = (e) => {
        if (document.body.contains(modal) && !modal.contains(e.target)) {
          e.preventDefault();
          textarea.focus();
        }
      };
      document.addEventListener("focus", keepFocus, true);
      function close() {
        applyColorsToDOM(hlColors);
        flushDraftNow();
        modal.remove();
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("beforeunload", onBeforeUnload);
        document.removeEventListener("focus", keepFocus, true);
      }
      function onKey(e) {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }
      closeBtn.addEventListener("click", close);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) close();
      });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(modal);
      textarea.focus();
    }
    function injectToolbarUI() {
      const toolbar = findToolbarRoot();
      if (!toolbar) return;
      if (toolbar.querySelector(".mx-event-filter-wrap")) return;
      toolbar.style.display = "flex";
      wrap = document.createElement("div");
      wrap.className = "mx-event-filter-wrap";
      btnToggle = document.createElement("div");
      btnToggle.className = "mx-event-filter-btn";
      btnToggle.addEventListener("click", toggleEnabled);
      btnBuilder = document.createElement("div");
      btnBuilder.className = "mx-event-filter-btn";
      btnBuilder.textContent = "Builder";
      btnBuilder.addEventListener("click", () => {
        setBuilderEnabled(!builderEnabled);
        if (builderEnabled) {
          setBuilderOpen(true);
        }
      });
      btnRules = document.createElement("div");
      btnRules.className = "mx-event-filter-btn";
      btnRules.textContent = "Rules";
      btnRules.addEventListener("click", openRulesModal);
      wrap.appendChild(btnToggle);
      wrap.appendChild(btnBuilder);
      wrap.appendChild(btnRules);
      toolbar.appendChild(wrap);
      updateToggleButton();
      if (btnBuilder) {
        btnBuilder.textContent = builderEnabled ? "Builder: ON" : "Builder: OFF";
        btnBuilder.style.background = builderEnabled ? "#1f6feb" : "";
        btnBuilder.style.color = builderEnabled ? "#fff" : "";
      }
    }
    applyColorsToDOM();
    injectStyle2();
    injectToolbarUI();
    loadBuilderDraft();
    injectBuilderPanel();
    injectCellButtons();
    if (enabled) runScan();
    else clearAllRowStyles();
    (function observeRefresh() {
      const root = document.querySelector(S.table) || document.querySelector("#tableSection") || document.body;
      let raf = 0;
      const mo = new MutationObserver(() => {
        injectToolbarUI();
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (enabled) runScan();
          if (builderEnabled) {
            injectBuilderPanel();
            injectCellButtons();
            runDraftHighlight();
          }
        });
      });
      mo.observe(root, { childList: true, subtree: true });
    })();
  }

  // src/modules/soc/siem/quick_open_offenses/config.js
  var config_default10 = {
    /* ==========================
            MODULE META
    ========================== */
    name: "quick-open-offenses module",
    // module-id: cXVpY2stb3Blbi1vZmZlbnNlcyBtb2R1bGU=
    enabled: true,
    match: ["*://*.vnpt.vn/console/qradar/*"],
    exclude: [],
    runAt: "document-end",
    iframe: true,
    frames: ["PAGE_SEM"],
    priority: 10,
    selector: {
      toolbarButtons: "#toolbarButtons",
      table: "#tableSection table#defaultTable",
      thead: "#tableSection table#defaultTable thead",
      tbody: "#tableSection table#defaultTable tbody",
      rows: "#tableSection table#defaultTable tbody tr",
      cell_offenseId: 'td[propertyname="offenseId"]',
      cell_startTime: 'td[propertyname="startTime"]',
      cell_description: 'td[propertyname="offenseDescription"]',
      cell_lastEventFlow: 'td[propertyname="domain"]'
    },
    defaultRules: {
      noise: [],
      important: []
    }
  };

  // src/modules/soc/siem/quick_open_offenses/aql_mapping.js
  function aqlMappingModule(ctx) {
    if (!config_default10.enabled) return;
    const STORAGE_KEY2 = "MX_AQL_MAPPINGS";
    const DEFAULTS_KEY = "MX_AQL_GLOBAL_DEFAULTS";
    const S = config_default10.selector;
    const defaultGlobalFields = `DATEFORMAT(devicetime, 'MMM dd, yyyy, hh:mm:ss a') as "Device Time", sourceip as "Source IP", "destinationip" as "Destination IP", LOGSOURCENAME(logsourceid) as "Log Source", QIDNAME(qid) as "Event Name"`;
    function loadGlobalDefaults() {
      return localStorage.getItem(DEFAULTS_KEY) || defaultGlobalFields;
    }
    function saveGlobalDefaults(val) {
      localStorage.setItem(DEFAULTS_KEY, val);
    }
    const defaultMappings = [
      {
        id: "default_process_create",
        enabled: true,
        useDefaults: true,
        name: "Process Create (Windows)",
        description: "Trích xuất thông tin Command Line của tiến trình",
        matchTokens: ["/process create/i", "windows"],
        selectQuery: `"Action" AS 'Action', 
"ApplicationName" AS 'App Name', 
"Process CommandLine" AS 'Command Line'`
      }
    ];
    function loadMappings() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY2);
        if (raw) return JSON.parse(raw);
      } catch (e) {
      }
      return defaultMappings;
    }
    function saveMappings(mappings) {
      try {
        localStorage.setItem(STORAGE_KEY2, JSON.stringify(mappings));
      } catch (e) {
      }
    }
    let currentMappings = loadMappings();
    function normalizeWhitespace(str) {
      return String(str || "").replace(/\s+/g, " ").trim();
    }
    function parseToken(tokenStr) {
      const t = normalizeWhitespace(tokenStr);
      if (!t) return null;
      const regexMatch = t.match(/^\/(.+)\/([gimsuy]*)$/);
      if (regexMatch) {
        try {
          return new RegExp(regexMatch[1], regexMatch[2].replace(/[gy]/g, ""));
        } catch (e) {
          return t;
        }
      }
      return t;
    }
    function isRuleMatched(text, tokens) {
      if (!tokens || tokens.length === 0) return false;
      const parsedTokens = tokens.map(parseToken).filter((t) => t);
      return parsedTokens.some((token) => {
        if (token instanceof RegExp) {
          token.lastIndex = 0;
          return token.test(text);
        }
        return text.toLowerCase().includes(token.toLowerCase());
      });
    }
    function findMatchingRule(rowText) {
      if (!rowText) return null;
      const activeRules = currentMappings.filter((m) => m.enabled);
      for (const rule of activeRules) {
        if (isRuleMatched(rowText, rule.matchTokens)) return rule;
      }
      return null;
    }
    function buildCustomAqlUrl(offenseId, startTimeAbs, endTimeAbs, mappingRule) {
      const formatAqlTime = (ms) => {
        const d = new Date(ms);
        const pad = (n) => n.toString().padStart(2, "0");
        return `'${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}'`;
      };
      let selectPart = mappingRule.selectQuery.trim().replace(/;$/, "");
      if (selectPart.toUpperCase().startsWith("SELECT ")) selectPart = selectPart.substring(7).trim();
      if (mappingRule.useDefaults) {
        const globalFields = loadGlobalDefaults();
        if (globalFields) {
          selectPart = selectPart ? `${selectPart}, ${globalFields}` : globalFields;
        }
      }
      const fullAqlQuery = `SELECT ${selectPart} FROM events WHERE INOFFENSE(${offenseId}) START ${formatAqlTime(startTimeAbs)} STOP ${formatAqlTime(endTimeAbs)}`;
      const innerUrl = `do/ariel/arielSearch?appName=EventViewer&pageId=EventList&dispatch=performSearch&values['searchMode']=AQL&values['timeRangeType']=aqlTime&values['aql']=${encodeURIComponent(fullAqlQuery)}`;
      return `qradar/jsp/ArielSearchWrapper.jsp?url=${encodeURIComponent(innerUrl)}`;
    }
    ctx.aqlAPI = {
      getMappings: () => currentMappings,
      findMatch: findMatchingRule,
      generateUrl: (id, start, end, rule) => buildCustomAqlUrl(id, start, end, rule)
    };
    function injectStyles(doc) {
      if (doc.getElementById("mx-aql-style")) return;
      const style = doc.createElement("style");
      style.id = "mx-aql-style";
      style.textContent = `
            .mx-aql-modal { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:999999; display:flex; align-items:center; justify-content:center; font-family: sans-serif;}
            .mx-aql-panel { width: 950px; height: 680px; max-width: 95vw; background:#fff; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,.25); display:flex; flex-direction:column; overflow:hidden;}
            .mx-aql-head { padding:12px 15px; background:#1f2937; color:#fff; display:flex; justify-content:space-between; font-weight:bold; font-size:14px; user-select:none;}
            .mx-aql-close { cursor:pointer; padding: 0 5px; color:#9ca3af; } .mx-aql-close:hover { color:#fff; }
            .mx-aql-body { display:flex; flex:1; overflow:hidden; }
            
            .mx-aql-sidebar { width: 300px; border-right: 1px solid #e5e7eb; background: #f9fafb; display:flex; flex-direction:column; }
            .mx-aql-side-tools { padding: 10px; display: flex; gap: 8px; border-bottom: 1px solid #e5e7eb; }
            .mx-aql-add-btn { flex:1; padding:8px; background:#10b981; color:#fff; text-align:center; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px; }
            .mx-aql-set-btn { width: 34px; height: 34px; background:#e5e7eb; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; }
            .mx-aql-action-btn { flex:1; padding:6px; background:#fff; color:#374151; text-align:center; border-radius:4px; cursor:pointer; font-size:12px; border:1px solid #d1d5db; font-weight:bold; }
            
            .mx-aql-list { flex:1; overflow-y:auto; }
            .mx-aql-item { padding:10px; border-bottom:1px solid #e5e7eb; cursor:grab; display:flex; align-items:flex-start; gap:8px; background:#f9fafb; position:relative; }
            .mx-aql-item:hover { background:#f3f4f6; }
            .mx-aql-item.active { background:#e0f2fe; border-left: 3px solid #0284c7; }
            .mx-aql-item.dragging { opacity: 0.4; background: #d1d5db; border: 2px dashed #6b7280; }
            .mx-aql-item-info { flex:1; overflow:hidden; pointer-events: none; }
            .mx-aql-item-name { font-weight:bold; font-size:13px; color:#111827; }
            .mx-aql-item-desc { font-size:11px; color:#6b7280; }
            .mx-aql-toggle { cursor:pointer; font-size:16px; user-select:none; z-index:2; }
            .mx-aql-drag-handle { color: #ccc; font-size: 14px; padding-top: 2px; }

            .mx-aql-editor { flex:1; padding:15px; display:flex; flex-direction:column; gap:12px; overflow-y:auto; background:#fff;}
            .mx-aql-group { display:flex; flex-direction:column; gap:4px; }
            .mx-aql-row { display:flex; align-items:center; gap:10px; }
            .mx-aql-label { font-size:12px; font-weight:bold; color:#374151; }
            .mx-aql-input { padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:13px; outline:none; }
            
            .mx-aql-token-box { display:flex; flex-wrap:wrap; gap:6px; padding:6px; border:1px solid #d1d5db; border-radius:4px; background:#fff;}
            .mx-aql-token { background:#e5e7eb; color:#374151; padding:2px 8px; border-radius:12px; font-size:12px; display:flex; align-items:center; gap:4px; }
            .mx-aql-token-del { cursor:pointer; color:#ef4444; }
            .mx-aql-token-input { border:none; outline:none; flex:1; font-size:13px; background:transparent;}
            
            .mx-aql-ide { background: #1e1e1e; border-radius: 6px; padding: 12px; font-family: monospace; border: 1px solid #333; display: flex; flex-direction: column; gap: 4px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); }
            .mx-aql-ide-fixed { color: #858585; line-height: 1.6; font-size: 13px; }
            .mx-aql-ide-kw { color: #569cd6; font-weight: bold; }
            .mx-aql-ide-fn { color: #dcdcaa; }
            .mx-aql-ide-textarea { background: transparent; color: #ce9178; border: 1px dashed #444; border-radius: 4px; outline: none; width: 100%; min-height: 140px; resize: vertical; font-family: inherit; font-size: 13px; white-space: pre-wrap; line-height: 1.5; padding: 8px; box-sizing: border-box; }
            
            .mx-aql-foot { padding:12px 15px; border-top:1px solid #e5e7eb; background:#f9fafb; display:flex; justify-content:space-between; align-items:center;}
            .mx-aql-btn { padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold; border:none; }
            .mx-aql-btn-del { background:#fee2e2; color:#b91c1c; }
            .mx-aql-btn-save { background:#3b82f6; color:#fff; }
            .mx-aql-save-status { font-size:12px; color:#10b981; font-weight:bold; opacity:0; transition: opacity 0.3s; }
            .mx-aql-save-status.show { opacity:1; }
        `;
      if (doc.head) doc.head.appendChild(style);
    }
    function openAqlGUI(doc) {
      if (doc.querySelector(".mx-aql-modal")) return;
      injectStyles(doc);
      let editingId = null;
      let isSettingsMode = false;
      let draftTokens = [];
      let draggedItemIndex = null;
      const modal = doc.createElement("div");
      modal.className = "mx-aql-modal";
      modal.innerHTML = `
            <div class="mx-aql-panel">
                <div class="mx-aql-head">AQL Dynamic Mappings <span class="mx-aql-close" id="mx-aql-close">✕</span></div>
                <div class="mx-aql-body">
                    <div class="mx-aql-sidebar">
                        <div class="mx-aql-side-tools">
                            <div class="mx-aql-add-btn" id="mx-aql-add">+ New</div>
                            <div class="mx-aql-set-btn" id="mx-aql-global-set" title="Global Settings">⚙️</div>
                        </div>
                        <div class="mx-aql-side-tools" style="padding-top:0; border-bottom:1px solid #e5e7eb; border-top:none;">
                            <div class="mx-aql-action-btn" id="mx-aql-import" title="Import Mappings">📂 Import</div>
                            <div class="mx-aql-action-btn" id="mx-aql-export" title="Export Mappings">💾 Export</div>
                        </div>
                        <div class="mx-aql-list" id="mx-aql-list"></div>
                    </div>
                    <div class="mx-aql-editor" id="mx-aql-view"></div>
                </div>
                <div class="mx-aql-foot">
                    <button class="mx-aql-btn mx-aql-btn-del" id="mx-aql-del" style="display:none;">Delete</button>
                    <div style="flex:1; display:flex; justify-content:flex-end; align-items:center; gap:10px;">
                        <span class="mx-aql-save-status" id="mx-aql-save-status">Saved!</span>
                        <button class="mx-aql-btn mx-aql-btn-save" id="mx-aql-save" style="display:none;">Save</button>
                    </div>
                </div>
            </div>
        `;
      doc.body.appendChild(modal);
      const viewEl = modal.querySelector("#mx-aql-view");
      const listEl = modal.querySelector("#mx-aql-list");
      const btnSave = modal.querySelector("#mx-aql-save");
      const btnDel = modal.querySelector("#mx-aql-del");
      const saveStatus = modal.querySelector("#mx-aql-save-status");
      function showSaveStatus() {
        saveStatus.classList.add("show");
        setTimeout(() => saveStatus.classList.remove("show"), 1500);
      }
      function renderList() {
        listEl.innerHTML = "";
        currentMappings.forEach((m, index) => {
          const item = doc.createElement("div");
          item.className = `mx-aql-item ${editingId === m.id && !isSettingsMode ? "active" : ""}`;
          item.draggable = true;
          item.dataset.index = index;
          item.innerHTML = `
                    <div class="mx-aql-drag-handle">☰</div>
                    <div class="mx-aql-toggle">${m.enabled ? "🟢" : "🔴"}</div>
                    <div class="mx-aql-item-info">
                        <div class="mx-aql-item-name">${m.name || "Unnamed"}</div>
                        <div class="mx-aql-item-desc">${m.description || "No description"}</div>
                    </div>
                `;
          const toggle = item.querySelector(".mx-aql-toggle");
          toggle.onclick = (e) => {
            e.stopPropagation();
            m.enabled = !m.enabled;
            saveMappings(currentMappings);
            renderList();
          };
          item.onclick = (e) => {
            if (e.target === toggle) return;
            loadEditor(m);
          };
          item.addEventListener("dragstart", (e) => {
            draggedItemIndex = index;
            item.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
          });
          item.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          });
          item.addEventListener("drop", (e) => {
            e.preventDefault();
            const targetIndex = parseInt(item.dataset.index);
            if (draggedItemIndex !== null && draggedItemIndex !== targetIndex) {
              const movedItem = currentMappings.splice(draggedItemIndex, 1)[0];
              currentMappings.splice(targetIndex, 0, movedItem);
              saveMappings(currentMappings);
              renderList();
              showSaveStatus();
            }
          });
          item.addEventListener("dragend", () => {
            item.classList.remove("dragging");
            draggedItemIndex = null;
          });
          listEl.appendChild(item);
        });
      }
      function loadGlobalSettings() {
        isSettingsMode = true;
        editingId = null;
        btnDel.style.display = "none";
        btnSave.style.display = "none";
        renderList();
        viewEl.innerHTML = `
                <div class="mx-aql-group" style="flex:1;">
                    <label class="mx-aql-label" style="font-size:14px; margin-bottom:4px;">Global Default Fields</label>
                    <div class="mx-aql-hint" style="margin-bottom:8px;">Các trường này sẽ nối vào CUỐI câu truy vấn. Auto-save Enabled.</div>
                    <div class="mx-aql-ide" style="flex:1; height:100%;">
                        <textarea class="mx-aql-ide-textarea" id="mx-global-fields" spellcheck="false" style="min-height: 100%;">${loadGlobalDefaults()}</textarea>
                    </div>
                </div>
            `;
        const globalInput = viewEl.querySelector("#mx-global-fields");
        globalInput.addEventListener("input", (e) => {
          saveGlobalDefaults(e.target.value);
          showSaveStatus();
        });
      }
      function loadEditor(mapping = null) {
        isSettingsMode = false;
        btnSave.style.display = "block";
        if (mapping) {
          editingId = mapping.id;
          btnDel.style.display = "block";
          draftTokens = [...mapping.matchTokens || []];
        } else {
          editingId = `mx_aql_${Date.now()}`;
          btnDel.style.display = "none";
          mapping = { name: "", description: "", selectQuery: "", useDefaults: true };
          draftTokens = [];
        }
        renderList();
        viewEl.innerHTML = `
                <div class="mx-aql-group">
                    <div class="mx-aql-row">
                        <label class="mx-aql-label">Name</label>
                        <input type="text" class="mx-aql-input" id="mx-name" style="flex:1" value="${mapping.name}">
                        <label class="mx-aql-label"><input type="checkbox" id="mx-use-defaults" ${mapping.useDefaults ? "checked" : ""}> Include Default Fields</label>
                    </div>
                </div>
                <div class="mx-aql-group">
                    <label class="mx-aql-label">Description</label>
                    <input type="text" class="mx-aql-input" id="mx-desc" value="${mapping.description}">
                </div>
                <div class="mx-aql-group">
                    <label class="mx-aql-label">Match Tokens</label>
                    <div class="mx-aql-token-box" id="mx-token-box">
                        <input type="text" class="mx-aql-token-input" id="mx-token-in" placeholder="+ Add token...">
                    </div>
                </div>
                <div class="mx-aql-group" style="flex:1">
                    <label class="mx-aql-label">AQL Select Block</label>
                    <div class="mx-aql-ide">
                        <div class="mx-aql-ide-fixed"><span class="mx-aql-ide-kw">SELECT</span></div>
                        <textarea class="mx-aql-ide-textarea" id="mx-query" spellcheck="false">${mapping.selectQuery}</textarea>
                        <div class="mx-aql-ide-fixed" id="mx-preview-suffix">
                            ${mapping.useDefaults ? ', <span class="mx-aql-ide-fn">' + loadGlobalDefaults() + "</span>" : ""}
                            <br><span class="mx-aql-ide-kw">FROM</span> events ...
                        </div>
                    </div>
                </div>
            `;
        const tBox = viewEl.querySelector("#mx-token-box");
        const tIn = viewEl.querySelector("#mx-token-in");
        const updateTokens = () => {
          tBox.querySelectorAll(".mx-aql-token").forEach((n) => n.remove());
          draftTokens.forEach((t, i) => {
            const el = doc.createElement("div");
            el.className = "mx-aql-token";
            el.innerHTML = `<span>${t}</span><span class="mx-aql-token-del">✕</span>`;
            el.querySelector(".mx-aql-token-del").onclick = () => {
              draftTokens.splice(i, 1);
              updateTokens();
            };
            tBox.insertBefore(el, tIn);
          });
        };
        tIn.onkeydown = (e) => {
          if (e.key === "Enter") {
            draftTokens.push(tIn.value);
            tIn.value = "";
            updateTokens();
          }
        };
        updateTokens();
        viewEl.querySelector("#mx-use-defaults").onchange = (e) => {
          viewEl.querySelector("#mx-preview-suffix").innerHTML = e.target.checked ? `, <span class="mx-aql-ide-fn">${loadGlobalDefaults()}</span><br><span class="mx-aql-ide-kw">FROM</span> events...` : `<br><span class="mx-aql-ide-kw">FROM</span> events...`;
        };
      }
      modal.querySelector("#mx-aql-export").onclick = () => {
        const backupData = {
          type: "MX_AQL_MAPPINGS_BACKUP",
          globalDefaults: loadGlobalDefaults(),
          mappings: currentMappings
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement("a");
        a.href = url;
        a.download = `aql_mappings_backup_${(/* @__PURE__ */ new Date()).getTime()}.json`;
        a.click();
      };
      modal.querySelector("#mx-aql-import").onclick = () => {
        const input = doc.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const data = JSON.parse(ev.target.result);
            if (data.type === "MX_AQL_MAPPINGS_BACKUP") {
              if (confirm("Gộp dữ liệu import?")) {
                if (data.globalDefaults) saveGlobalDefaults(data.globalDefaults);
                data.mappings.forEach((impMap) => {
                  const idx = currentMappings.findIndex((m) => m.id === impMap.id);
                  if (idx > -1) currentMappings[idx] = impMap;
                  else currentMappings.push(impMap);
                });
                saveMappings(currentMappings);
                renderList();
                loadGlobalSettings();
              }
            }
          };
          reader.readAsText(e.target.files[0]);
        };
        input.click();
      };
      btnSave.onclick = () => {
        const map = {
          id: editingId,
          enabled: true,
          name: modal.querySelector("#mx-name").value,
          description: modal.querySelector("#mx-desc").value,
          useDefaults: modal.querySelector("#mx-use-defaults").checked,
          matchTokens: draftTokens,
          selectQuery: modal.querySelector("#mx-query").value
        };
        const idx = currentMappings.findIndex((m) => m.id === editingId);
        if (idx > -1) {
          map.enabled = currentMappings[idx].enabled;
          currentMappings[idx] = map;
        } else currentMappings.push(map);
        saveMappings(currentMappings);
        showSaveStatus();
        renderList();
      };
      btnDel.onclick = () => {
        if (!confirm("Delete?")) return;
        currentMappings = currentMappings.filter((m) => m.id !== editingId);
        saveMappings(currentMappings);
        renderList();
        viewEl.innerHTML = "";
      };
      modal.querySelector("#mx-aql-close").onclick = () => modal.remove();
      modal.querySelector("#mx-aql-add").onclick = () => loadEditor();
      modal.querySelector("#mx-aql-global-set").onclick = () => loadGlobalSettings();
      renderList();
      loadGlobalSettings();
    }
    function injectToolbarBtn(doc) {
      const tb = doc.querySelector(S.toolbarButtons);
      if (!tb || doc.getElementById("MX_AQL_GUI_BTN")) return;
      const btn = doc.createElement("div");
      btn.id = "MX_AQL_GUI_BTN";
      btn.className = "DA_COMPONENT DA_SPEEDBUTTON";
      btn.style = "display:inline-flex; align-items:center; cursor:pointer; margin-left:8px; padding:2px 8px; border:1px solid #888; border-radius:3px; font-weight:bold; order:4;";
      btn.innerHTML = `<span style="color:#4f46e5;">⚙️ AQL Maps</span>`;
      btn.onclick = (e) => {
        e.stopPropagation();
        openAqlGUI(doc);
      };
      tb.appendChild(btn);
    }
    setInterval(() => {
      if (ctx.siem?.scope)
        ctx.siem.scope(ctx.siem.getSelfFrameId(), { self: true, children: true }, (f) => {
          if (f.document) injectToolbarBtn(f.document);
        });
      else [document].forEach(injectToolbarBtn);
    }, 1500);
  }
  if (false) {
    window.__MAXX_DEV_ENTRY__ = aqlMappingModule;
  }

  // src/modules/soc/siem/quick_open_offenses/index.js
  function quickOpenOffensesModule(ctx) {
    aqlMappingModule(ctx);
    if (!config_default10.enabled) return;
    const DOMAIN_KEY = (location.hostname || "unknown").toLowerCase();
    const ST_MARKED_IDS = `MX_OF_MARKED_IDS_${DOMAIN_KEY}`;
    const STORAGE_MASKED_KEY = "MX_OFFENSE_MASKED_IDS";
    const S = config_default10.selector;
    let offensesToOpen = [];
    function getMaxMaskedId() {
      try {
        const raw = localStorage.getItem(STORAGE_MASKED_KEY);
        if (raw) {
          const idArray = JSON.parse(raw);
          const ids = idArray.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
          if (ids.length > 0) return Math.max(...ids);
        }
      } catch (e) {
      }
      return -1;
    }
    function getFilterData() {
      try {
        const raw = localStorage.getItem(ST_MARKED_IDS);
        if (raw) return JSON.parse(raw);
      } catch (e) {
      }
      return { noiseIds: [], importantIds: [] };
    }
    function getRowSearchText(tr) {
      const descCell = tr.querySelector(S.cell_description);
      const domainCell = tr.querySelector(S.cell_domain);
      const descText = descCell ? descCell.textContent || "" : "";
      const domainText = domainCell ? domainCell.textContent || "" : "";
      return `${domainText} ${descText}`.replace(/\s+/g, " ").trim();
    }
    function calculateEndTimeOptimized(startTimeAbs, rawEndTimeAbs) {
      const now = Date.now();
      const timeSinceLastEvent = now - rawEndTimeAbs;
      if (timeSinceLastEvent < 3e4) return now;
      const startDate = new Date(startTimeAbs);
      const nowDate = new Date(now);
      const isNotToday = startDate.toDateString() !== nowDate.toDateString();
      const duration = rawEndTimeAbs - startTimeAbs;
      if (isNotToday || duration > 864e5) {
        const endOfDay = new Date(startDate);
        endOfDay.setHours(23, 59, 59, 999);
        return endOfDay.getTime();
      }
      return rawEndTimeAbs + 6e4;
    }
    function buildArielUrl(offenseId, startTimeAbs, endTimeAbs) {
      const innerUrl = `do/ariel/arielSearch?appName=EventViewer&pageId=EventList&dispatch=performSearch&values['searchoffense']=on&newSearch=true&values['timeRangeType']=absolute&values['sortBy']=StartTimeKey&values['offenseId']=EQ ${offenseId}&values['startTimeAbs']=${startTimeAbs}&values['endTimeAbs']=${endTimeAbs}`;
      return `qradar/jsp/ArielSearchWrapper.jsp?url=${encodeURIComponent(innerUrl)}`;
    }
    function scanAndBuildList(doc) {
      const maxMaskedId = getMaxMaskedId();
      const filterData = getFilterData();
      const noiseIds = filterData.noiseIds || [];
      const importantIds = filterData.importantIds || [];
      let tempList = [];
      doc.querySelectorAll(S.rows).forEach((tr) => {
        const cellId = tr.querySelector(S.cell_offenseId);
        if (!cellId) return;
        const oId = parseInt(cellId.textContent.trim(), 10).toString();
        if (isNaN(oId)) return;
        if (maxMaskedId > -1 && oId <= maxMaskedId) return;
        if (noiseIds.includes(oId)) return;
        const startAttr = tr.getAttribute("starttimeabs");
        const endAttr = tr.getAttribute("endtimeabs");
        let startTimeAbs = startAttr ? parseInt(startAttr, 10) : Date.now() - 864e5;
        let rawEndTimeAbs = endAttr ? parseInt(endAttr, 10) : Date.now();
        const finalEndTimeAbs = calculateEndTimeOptimized(startTimeAbs, rawEndTimeAbs);
        const rowText = getRowSearchText(tr);
        tempList.push({
          id: oId,
          idNum: parseInt(oId, 10),
          startTime: startTimeAbs,
          endTime: finalEndTimeAbs,
          isImportant: importantIds.includes(oId),
          rowText
        });
      });
      tempList.sort((a, b) => a.idNum - b.idNum);
      offensesToOpen = tempList;
      updateButtonUI(doc);
    }
    function updateButtonUI(doc) {
      let btn = doc.getElementById("MX_QUICK_OPEN_BTN");
      const toolbar = doc.querySelector(S.toolbarButtons);
      if (!toolbar) return;
      if (!btn) {
        btn = doc.createElement("div");
        btn.id = "MX_QUICK_OPEN_BTN";
        btn.className = "DA_COMPONENT DA_SPEEDBUTTON";
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.cursor = "pointer";
        btn.style.marginLeft = "8px";
        btn.style.padding = "2px 8px";
        btn.style.border = "1px solid #888";
        btn.style.borderRadius = "3px";
        btn.style.fontWeight = "bold";
        btn.style.userSelect = "none";
        btn.style.order = "3";
        btn.onmouseover = () => btn.style.background = "rgba(0,0,0,0.08)";
        btn.onmouseout = () => btn.style.background = "";
        btn.onclick = (e) => {
          e.stopPropagation();
          if (offensesToOpen.length === 0) {
            alert("Hiện tại không có Offense nào cần mở!");
            return;
          }
          let itemsToOpen = offensesToOpen;
          let isTruncated = false;
          let maxIdToMask = -1;
          if (offensesToOpen.length > 10) {
            itemsToOpen = offensesToOpen.slice(0, 10);
            isTruncated = true;
            maxIdToMask = Math.max(...itemsToOpen.map((item) => item.idNum));
          }
          itemsToOpen.sort((a, b) => {
            if (a.isImportant && !b.isImportant) return -1;
            if (!a.isImportant && b.isImportant) return 1;
            return a.idNum - b.idNum;
          });
          itemsToOpen.forEach((item) => {
            let url;
            const matchedRule = ctx.aqlAPI ? ctx.aqlAPI.findMatch(item.rowText) : null;
            if (matchedRule) {
              url = ctx.aqlAPI.generateUrl(item.id, item.startTime, item.endTime, matchedRule);
            } else {
              url = buildArielUrl(item.id, item.startTime, item.endTime);
            }
            window.open(url, "_blank");
          });
          if (isTruncated) {
            const idToMaskStr = maxIdToMask.toString();
            try {
              const raw = localStorage.getItem(STORAGE_MASKED_KEY);
              let maskedSet = raw ? new Set(JSON.parse(raw)) : /* @__PURE__ */ new Set();
              maskedSet.add(idToMaskStr);
              localStorage.setItem(STORAGE_MASKED_KEY, JSON.stringify([...maskedSet]));
            } catch (err) {
              localStorage.setItem(STORAGE_MASKED_KEY, JSON.stringify([idToMaskStr]));
            }
            alert(`Đã mở 10 Offenses.
Offense ID: ${idToMaskStr} đã được Mask làm mốc chuyển trang.`);
          }
        };
        toolbar.appendChild(btn);
      } else if (btn.parentElement !== toolbar) {
        toolbar.appendChild(btn);
      }
      btn.innerHTML = `<span style="padding-left:2px;">Open Events (${offensesToOpen.length})</span>`;
      btn.style.color = offensesToOpen.length > 0 ? "#15803d" : "#555";
      btn.style.borderColor = offensesToOpen.length > 0 ? "#15803d" : "#888";
    }
    function getTargetDocs() {
      const docs = [];
      if (ctx.siem && ctx.siem.scope) {
        ctx.siem.scope(ctx.siem.getSelfFrameId(), { self: true, children: true }, (fCtx) => {
          if (fCtx.document) docs.push(fCtx.document);
        });
      } else {
        docs.push(document);
      }
      return docs;
    }
    setInterval(() => {
      getTargetDocs().forEach((doc) => {
        const root = doc.querySelector(S.table);
        if (!root) return;
        if (offensesToOpen) updateButtonUI(doc);
        if (doc._mxQOObservedRoot !== root) {
          doc._mxQOObservedRoot = root;
          if (doc._mxQOObserver) doc._mxQOObserver.disconnect();
          scanAndBuildList(doc);
          doc._mxQOObserver = new MutationObserver(() => {
            if (doc._mxQOTimer) clearTimeout(doc._mxQOTimer);
            doc._mxQOTimer = setTimeout(() => {
              scanAndBuildList(doc);
            }, 250);
          });
          doc._mxQOObserver.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"]
          });
          root.addEventListener("click", (e) => {
            if (!e.altKey) return;
            const tr = e.target.closest(S.rows);
            if (!tr) return;
            const cellId = tr.querySelector(S.cell_offenseId);
            if (!cellId) return;
            const oId = parseInt(cellId.textContent.trim(), 10).toString();
            if (isNaN(oId)) return;
            const startAttr = tr.getAttribute("starttimeabs");
            const endAttr = tr.getAttribute("endtimeabs");
            let startTimeAbs = startAttr ? parseInt(startAttr, 10) : Date.now() - 864e5;
            let rawEndTimeAbs = endAttr ? parseInt(endAttr, 10) : Date.now();
            const finalEndTimeAbs = calculateEndTimeOptimized(startTimeAbs, rawEndTimeAbs);
            const rowText = getRowSearchText(tr);
            let url;
            const matchedRule = ctx.aqlAPI ? ctx.aqlAPI.findMatch(rowText) : null;
            if (matchedRule) {
              url = ctx.aqlAPI.generateUrl(oId, startTimeAbs, finalEndTimeAbs, matchedRule);
            } else {
              url = buildArielUrl(oId, startTimeAbs, finalEndTimeAbs);
            }
            window.open(url, "_blank");
            e.preventDefault();
            e.stopPropagation();
          });
        }
      });
    }, 1e3);
  }
  if (false) {
    window.__MAXX_DEV_ENTRY__ = quickOpenOffensesModule;
  }

  // src/registry.js
  var registry_default = [
    {
      run: selectedSearch,
      config: config_default
    },
    {
      run: offenseFilterModule,
      config: config_default2
    },
    {
      run: logPrettier,
      config: config_default3
    },
    {
      run: runHexDecoderModule,
      config: config_default4
    },
    {
      run: noteShift,
      config: config_default5
    },
    {
      run: closeTicket,
      config: config_default6
    },
    {
      run: offenseMasker,
      config: config_default7
    },
    {
      run: clearQueueTicketOpened,
      config: config_default8
    },
    {
      run: eventFilterModule,
      config: config_default9
    },
    {
      run: quickOpenOffensesModule,
      config: config_default10
    }
  ];

  // src/helper/match.js
  function wildcardToRegExp(pattern) {
    return new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  }
  function isMatch2(url, patterns = []) {
    return patterns.some((p) => wildcardToRegExp(p).test(url));
  }

  // src/modules/soc/siem/helper/siem_frames.js
  var SIEM_FRAMES = [
    "PAGE_DASHBOARD",
    "PAGE_SEM",
    "PAGE_EVENTVIEWER",
    "PAGE_ASSETS",
    "PAGE_REPORTS",
    "PAGE_ADMIN",
    "PAGE_REFERENCEDATAMANAGEMENT_1107",
    "PAGE_XFORCE_TIAPP_1301",
    "PAGE_QUSECASEMANAGERAPP_1855",
    "PAGE_LOGSOURCESTAB_2561",
    "mainPage"
  ];
  function isTopWindow() {
    return window.self === window.top;
  }
  function getSelfFrameId() {
    return window.frameElement?.id || null;
  }
  function getTopDocument() {
    return window.top.document;
  }
  function getIframeEl(frameId) {
    try {
      return getTopDocument().getElementById(frameId);
    } catch {
      return null;
    }
  }
  function isIframeVisible(frameId) {
    const iframe = getIframeEl(frameId);
    if (!iframe) return false;
    const style = getComputedStyle(iframe);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return (iframe.offsetHeight || iframe.clientHeight || 0) > 0;
  }
  var visibilityListeners = /* @__PURE__ */ new Set();
  var lastVisibilityMap = /* @__PURE__ */ new Map();
  var observerStarted = false;
  function startFrameVisibilityObserver(interval = 300) {
    if (observerStarted) return;
    observerStarted = true;
    SIEM_FRAMES.forEach((id) => {
      lastVisibilityMap.set(id, isIframeVisible(id));
    });
    setInterval(() => {
      SIEM_FRAMES.forEach((id) => {
        const visible = isIframeVisible(id);
        const prev = lastVisibilityMap.get(id);
        if (visible !== prev) {
          lastVisibilityMap.set(id, visible);
          visibilityListeners.forEach((cb) => {
            try {
              cb(id, visible);
            } catch (e) {
              console.error("[siem_frames] listener error", e);
            }
          });
        }
      });
    }, interval);
  }
  function onFrameVisibleChange(cb) {
    startFrameVisibilityObserver();
    visibilityListeners.add(cb);
    return () => visibilityListeners.delete(cb);
  }
  function getVisibleFrames() {
    return SIEM_FRAMES.filter((id) => isIframeVisible(id));
  }
  function walkFrames(win, depth = 0, out = []) {
    let doc;
    try {
      doc = win.document;
    } catch {
      return out;
    }
    const frameEl = win.frameElement || null;
    out.push({
      window: win,
      document: doc,
      frameElement: frameEl,
      id: frameEl?.id || null,
      depth
    });
    for (let i = 0; i < win.frames.length; i++) {
      try {
        walkFrames(win.frames[i], depth + 1, out);
      } catch {
      }
    }
    return out;
  }
  function getRootWindow(rootId) {
    if (!rootId) return window.top;
    const iframe = getIframeEl(rootId);
    return iframe?.contentWindow || null;
  }
  function scope(rootId, options, handler) {
    if (typeof options === "function") {
      handler = options;
      options = {};
    }
    const opt = {
      self: true,
      children: true,
      deep: true,
      ...options
    };
    const rootWin = getRootWindow(rootId);
    if (!rootWin) return;
    const frames = walkFrames(rootWin);
    frames.forEach((ctx) => {
      const d = ctx.depth;
      if (d === 0 && !opt.self) return;
      if (d === 1 && !opt.children) return;
      if (d > 1 && !opt.deep) return;
      try {
        handler(ctx);
      } catch (e) {
        console.error("[siem_frames.scope] handler error", e);
      }
    });
  }
  function isSelfFrame(frameId) {
    return getSelfFrameId() === frameId;
  }

  // src/index.js
  function bootstrap() {
    const isIframe = window.self !== window.top;
    let url = location.href;
    try {
      if (isIframe) url = window.top.location.href;
    } catch (e) {
    }
    registry_default.filter(({ config }) => config.enabled).sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0)).forEach(({ run, config }) => {
      if (config.match && !isMatch2(url, config.match)) return;
      if (config.exclude && isMatch2(url, config.exclude)) return;
      if (Array.isArray(config.frames)) {
        let currentFrameId = "TOP_WINDOW";
        if (isIframe) {
          try {
            currentFrameId = getSelfFrameId() || window.name || "UNKNOWN_FRAME";
          } catch (e) {
            currentFrameId = window.name || "CROSS_ORIGIN_FRAME";
          }
        }
        if (!config.frames.includes(currentFrameId)) {
          return;
        }
      } else {
        if (config.iframe === false && isIframe) return;
      }
      try {
        run({
          url,
          isIframe,
          env: false ? "dev" : "tampermonkey",
          /* ===============================
             SIEM CONTEXT (STATELESS)
          ================================ */
          siem: {
            // iframe context
            getSelfFrameId,
            isSelfFrame,
            isTopWindow,
            // iframe visibility
            onFrameVisibleChange,
            getVisibleFrames,
            // traversal
            scope
          }
        });
      } catch (e) {
        console.error(`❌ Module ${config.name} error`, e);
      }
    });
  }
  if (false) {
    window.__MAXX_RUN_BOOTSTRAP__ = bootstrap;
  }
  bootstrap();
})();

