// ==UserScript==
// @name         MAXX [MULTI-DEV]
// @namespace    maxx-dev
// @version      0.0.1
// @description  Build: offense_filter, offense_masker, quick_open_offenses
// @run-at       document-end
// @match        *://*/*
// @grant        none
// ==/UserScript==
(() => {
  // src/helper/match.js
  function wildcardToRegExp(pattern) {
    return new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  }
  function isMatch(url, patterns = []) {
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

  // src/modules/soc/siem/offense_filter/config.js
  var config_default = {
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
    const sel = config_default.selector || {};
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
      return config_default.defaultRules || { noise: [], important: [] };
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
    function injectStyle(doc) {
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
        injectStyle(doc);
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
  if (true) {
    window.__MAXX_DEV_ENTRY__ = offenseFilterModule;
  }

  // src/modules/soc/siem/offense_masker/config.js
  var config_default2 = {
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
    if (!config_default2.enabled) return;
    const STORAGE_KEY = "MX_OFFENSE_MASKED_IDS";
    const CLEAR_BTN_ID = "MAXX_CLEAR_ALL_MASKS";
    const STYLE_ID = "mx-offense-masker-style";
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
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : /* @__PURE__ */ new Set();
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    function saveMaskedIds() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...maskedIds]));
      } catch {
      }
    }
    function injectStyles(doc) {
      if (!doc?.head || doc.getElementById(STYLE_ID)) return;
      const style = doc.createElement("style");
      style.id = STYLE_ID;
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
  if (true) {
    window.__MAXX_DEV_ENTRY__ = offenseMasker;
  }

  // src/modules/soc/siem/quick_open_offenses/config.js
  var config_default3 = {
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
      cell_lastEventFlow: 'td[propertyname="lastEvent"]'
    },
    defaultRules: {
      noise: [],
      important: []
    }
  };

  // src/modules/soc/siem/quick_open_offenses/aql_mapping.js
  function aqlMappingModule(ctx) {
    if (!config_default3.enabled) return;
    const STORAGE_KEY = "MX_AQL_MAPPINGS";
    const DEFAULTS_KEY = "MX_AQL_GLOBAL_DEFAULTS";
    const S = config_default3.selector;
    const defaultGlobalFields = `select DATEFORMAT(devicetime, 'MMM dd, yyyy, hh:mm:ss a') as "Device Time", sourceip as "Source IP", "dest_ip" as "Destination IP", LOGSOURCENAME(logsourceid) as "Log Source", QIDNAME(qid) as "Event Name"`;
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
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {
      }
      return defaultMappings;
    }
    function saveMappings(mappings) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
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
      return parsedTokens.every((token) => {
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
  if (true) {
    window.__MAXX_DEV_ENTRY__ = aqlMappingModule;
  }

  // src/modules/soc/siem/quick_open_offenses/index.js
  function quickOpenOffensesModule(ctx) {
    aqlMappingModule(ctx);
    if (!config_default3.enabled) return;
    const DOMAIN_KEY = (location.hostname || "unknown").toLowerCase();
    const ST_MARKED_IDS = `MX_OF_MARKED_IDS_${DOMAIN_KEY}`;
    const STORAGE_MASKED_KEY = "MX_OFFENSE_MASKED_IDS";
    const S = config_default3.selector;
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
      const tds = tr.querySelectorAll("td");
      if (!tds || tds.length === 0) return "";
      return Array.from(tds).map((td) => td.textContent || "").join(" ").replace(/\s+/g, " ");
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
  if (true) {
    window.__MAXX_DEV_ENTRY__ = quickOpenOffensesModule;
  }

  // maxx-multi-build.js
  function runAllDev() {
    (function() {
      const config = config_default;
      const run = offenseFilterModule;
      if (typeof run !== "function") return;
      const isIframe = window.self !== window.top;
      let url = location.href;
      try {
        if (isIframe) url = window.top.location.href;
      } catch (e) {
      }
      let currentFrameId = "TOP_WINDOW";
      if (isIframe) {
        try {
          currentFrameId = getSelfFrameId() || window.name || "UNKNOWN";
        } catch (e) {
          currentFrameId = window.name || "CROSS_ORIGIN";
        }
      }
      if (config?.enabled === false) return;
      if (config?.iframe === false && isIframe) return;
      if (config?.match && !isMatch(url, config.match)) return;
      if (config?.exclude && isMatch(url, config.exclude)) return;
      if (Array.isArray(config?.frames) && config.frames.length > 0) {
        if (!config.frames.includes(currentFrameId)) return;
      }
      console.log(`[MAXX MULTI] ✅ Khởi chạy: [${config.name || "soc/siem/offense_filter"}] tại [${currentFrameId}]`);
      try {
        run({
          url,
          isIframe,
          env: "dev",
          siem: {
            getSelfFrameId,
            isSelfFrame,
            isTopWindow,
            onFrameVisibleChange,
            getVisibleFrames,
            scope
          }
        });
      } catch (e) {
        console.error(`[MAXX] Module soc/siem/offense_filter error:`, e);
      }
    })();
    (function() {
      const config = config_default2;
      const run = offenseMasker;
      if (typeof run !== "function") return;
      const isIframe = window.self !== window.top;
      let url = location.href;
      try {
        if (isIframe) url = window.top.location.href;
      } catch (e) {
      }
      let currentFrameId = "TOP_WINDOW";
      if (isIframe) {
        try {
          currentFrameId = getSelfFrameId() || window.name || "UNKNOWN";
        } catch (e) {
          currentFrameId = window.name || "CROSS_ORIGIN";
        }
      }
      if (config?.enabled === false) return;
      if (config?.iframe === false && isIframe) return;
      if (config?.match && !isMatch(url, config.match)) return;
      if (config?.exclude && isMatch(url, config.exclude)) return;
      if (Array.isArray(config?.frames) && config.frames.length > 0) {
        if (!config.frames.includes(currentFrameId)) return;
      }
      console.log(`[MAXX MULTI] ✅ Khởi chạy: [${config.name || "soc/siem/offense_masker"}] tại [${currentFrameId}]`);
      try {
        run({
          url,
          isIframe,
          env: "dev",
          siem: {
            getSelfFrameId,
            isSelfFrame,
            isTopWindow,
            onFrameVisibleChange,
            getVisibleFrames,
            scope
          }
        });
      } catch (e) {
        console.error(`[MAXX] Module soc/siem/offense_masker error:`, e);
      }
    })();
    (function() {
      const config = config_default3;
      const run = quickOpenOffensesModule;
      if (typeof run !== "function") return;
      const isIframe = window.self !== window.top;
      let url = location.href;
      try {
        if (isIframe) url = window.top.location.href;
      } catch (e) {
      }
      let currentFrameId = "TOP_WINDOW";
      if (isIframe) {
        try {
          currentFrameId = getSelfFrameId() || window.name || "UNKNOWN";
        } catch (e) {
          currentFrameId = window.name || "CROSS_ORIGIN";
        }
      }
      if (config?.enabled === false) return;
      if (config?.iframe === false && isIframe) return;
      if (config?.match && !isMatch(url, config.match)) return;
      if (config?.exclude && isMatch(url, config.exclude)) return;
      if (Array.isArray(config?.frames) && config.frames.length > 0) {
        if (!config.frames.includes(currentFrameId)) return;
      }
      console.log(`[MAXX MULTI] ✅ Khởi chạy: [${config.name || "soc/siem/quick_open_offenses"}] tại [${currentFrameId}]`);
      try {
        run({
          url,
          isIframe,
          env: "dev",
          siem: {
            getSelfFrameId,
            isSelfFrame,
            isTopWindow,
            onFrameVisibleChange,
            getVisibleFrames,
            scope
          }
        });
      } catch (e) {
        console.error(`[MAXX] Module soc/siem/quick_open_offenses error:`, e);
      }
    })();
  }
  runAllDev();
})();
