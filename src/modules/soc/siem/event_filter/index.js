import { default as config } from "./config.js";
import { createLogger } from "../../../../helper/logger.js";

export default function eventFilterModule(ctx) {
    const logger = createLogger("siem:event_filter", { active: true });
    const sel = config.selector || {};

    /* =========================================================
     SELECTOR PICK (support string | array)
  ======================================================== */
    function pick(v, fallback = "") {
        if (Array.isArray(v)) return v[0] || fallback;
        return v || fallback;
    }

    const S = {
        toolbarButtons: pick(sel.toolbarButtons, "#toolbarButtons"),
        table: pick(sel.table, "#tableSection"),
        eventTableRow: pick(sel.eventTableRow, "#tableSection tbody tr"),
        eventTableCellData: pick(sel.eventTableCellData, "td"),
    };

    /* =========================================================
        HELPER
    ======================================================== */

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
        } catch {}
    }
    function setBuilderEnabled(val) {
        builderEnabled = !!val;
        saveBuilderEnabled(builderEnabled);
        if (!builderEnabled) {
            cleanupBuilderCellUI({ removeButtons: true });
            document.querySelectorAll(".mx-ef-cell-draft-match").forEach(td => td.classList.remove("mx-ef-cell-draft-match"));
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
            el.style.bottom = 'auto';
            el.style.right = 'auto';
            el.style.top = savedPos.top;
            el.style.left = savedPos.left;
            
            // Giới hạn không cho lọt ra ngoài màn hình khi vừa mở lên
            requestAnimationFrame(() => {
                if (el.style.display === "none") return;
                let currentTop = el.offsetTop;
                let currentLeft = el.offsetLeft;
                
                const maxLeft = window.innerWidth - el.offsetWidth;
                const maxTop = window.innerHeight - el.offsetHeight;
                
                let changed = false;
                if (currentLeft < 0) { currentLeft = 0; changed = true; }
                if (currentTop < 0) { currentTop = 0; changed = true; }
                if (currentLeft > maxLeft && maxLeft > 0) { currentLeft = maxLeft; changed = true; }
                if (currentTop > maxTop && maxTop > 0) { currentTop = maxTop; changed = true; }
                
                if (changed) {
                    el.style.top = currentTop + "px";
                    el.style.left = currentLeft + "px";
                }
            });
        } else {
            // Mặc định nằm góc dưới phải
            el.style.bottom = "20px";
            el.style.right = "20px";
            el.style.top = 'auto';
            el.style.left = 'auto';
        }
    }

    function makeDraggable(handleEl, moveEl, isTrigger = false) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        let isDragging = false;

        const dragMouseDown = (e) => {
            if (e.target.closest('.mx-ef-builder__ctrl')) return;
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
            moveEl.style.bottom = 'auto';
            moveEl.style.right = 'auto';
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


    /* =========================================================
        TOKEN PARSER (Xác định String hay RegExp)
    ======================================================== */
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
    
    /* =========================================================
        REGEX ESCAPE HELPERS
    ======================================================== */
    function escapeRegexText(text) {
        return text.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
    }

    function unescapeRegexText(text) {
        return text.replace(/\\([.*+?^${}()|[\]\\\/])/g, '$1');
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
            if (inner.startsWith('^') && inner.endsWith('$')) {
                isExact = true;
                inner = inner.slice(1, -1);
            }
        }
        return { isRegex, isExact, inner, flags };
    }

    /* =========================================================
        STORAGE KEYS
    ======================================================== */
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
        } catch {}
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
        } catch {}
        return { text: "#dd6600", bg: "" }; 
    }

    function saveColors(colors) {
        try {
            localStorage.setItem(STORAGE_KEY_COLORS, JSON.stringify(colors));
        } catch {}
    }

    function applyColorsToDOM(colors = hlColors) {
        document.documentElement.style.setProperty('--mx-ef-hl-text', colors.text || '#dd6600');
        document.documentElement.style.setProperty('--mx-ef-hl-bg', colors.bg || 'transparent');
    }

    /* =========================================================
        MODULE TOGGLE STATE (persist)
    ======================================================== */
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
        } catch {}
    }

    /* =========================================================
        RULES STATE (persist)
    ======================================================== */
    let patternGroups = compileTextPatterns(loadRulesRaw());

    function loadRulesRaw() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_RULES);
            if (raw) return JSON.parse(raw);
        } catch {}
        return config.textPattern;
    }

    function saveRulesRaw(rules) {
        try {
            localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules));
        } catch {}
    }

    /* =========================================================
        STYLE
    ======================================================== */
    const STYLE_ID = "mx-event-filter-style";
    const NOT_OK_CLASS = "mx-event-not-whitelist";

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
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

    function applyRowStyle(row, isMatch) {
        if (!row) return;
        if (isMatch) row.classList.remove(NOT_OK_CLASS);
        else row.classList.add(NOT_OK_CLASS);
    }

    function clearAllRowStyles() {
        const rows = document.querySelectorAll(S.eventTableRow);
        rows.forEach((row) => row.classList.remove(NOT_OK_CLASS));
    }

    /* =========================================================
        TEXT NORMALIZE (case-sensitive + ignore extra whitespace)
    ======================================================== */
    function normalizeWhitespace(str) {
        return String(str || "")
            .replace(/\s+/g, " ")
            .trim();
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

    /* =========================================================
        PATTERN COMPILE + VALIDATE
    ======================================================== */
    function compileTextPatterns(textPattern) {
        const groups = Array.isArray(textPattern) ? textPattern : [];
        return groups
            .filter((g) => Array.isArray(g) && g.length > 0)
            .map((g) =>
                g
                    .map((token) => parseToken(token))
                    .filter((t) => t !== null && t !== "") 
            )
            .filter((g) => g.length > 0);
    }

    function validateRulesShape(rules) {
        if (!Array.isArray(rules))
            return {
                ok: false,
                error: "Rules phải là mảng (array) các group.",
            };
        for (const g of rules) {
            if (!Array.isArray(g) || g.length === 0)
                return {
                    ok: false,
                    error: "Mỗi group phải là mảng có ít nhất 1 chuỗi.",
                };
            for (const t of g) {
                if (typeof t !== "string")
                    return {
                        ok: false,
                        error: "Mỗi token trong group phải là string.",
                    };
            }
        }
        return { ok: true };
    }

    /* =========================================================
        CORE MATCH LOGIC
    ======================================================== */
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

        const draftPatterns = builderTokens
            .map((t) => parseToken(t))
            .filter((t) => t !== null && t !== "");

        if (draftPatterns.length === 0) return;

        const cells = document.querySelectorAll("td.mx-ef-cell-host");
        cells.forEach((td) => {
            const cellText = getTokenFromTd(td);
            if (!cellText) return;

            const isMatch = draftPatterns.some((pattern) => {
                if (pattern instanceof RegExp) {
                    pattern.lastIndex = 0; 
                    return pattern.test(cellText);
                }
                return cellText.includes(pattern);
            });

            if (isMatch) {
                td.classList.add("mx-ef-cell-draft-match");
            }
        });
    }

    // =============================
    // BUILDER STATE
    // =============================
    const BUILDER_DRAFT_KEY = `MX_EVENT_FILTER_BUILDER_DRAFT__${DOMAIN_KEY}`;
    let builderTokens = []; 
    const builderCounts = new Map(); 
    let builderPanel = null;

    function loadBuilderDraft() {
        try {
            const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.tokens)) {
                builderTokens = parsed.tokens.filter(
                    (t) => typeof t === "string" && t.length,
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
        } catch {}
    }

    function saveBuilderDraft() {
        try {
            const countsObj = {};
            for (const [k, v] of builderCounts.entries()) countsObj[k] = v;
            localStorage.setItem(
                BUILDER_DRAFT_KEY,
                JSON.stringify({ tokens: builderTokens, counts: countsObj }),
            );
        } catch {}
    }

    function clearBuilderDraft() {
        builderTokens = [];
        builderCounts.clear();
        try {
            localStorage.removeItem(BUILDER_DRAFT_KEY);
        } catch {}
        resetAllSelectedCellsInDOM();
        updateBuilderPanel();
        runDraftHighlight();
    }

    // =============================
    // BUILDER PANEL UI
    // =============================
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

        head.querySelector('.btn-min').onclick = () => setBuilderOpen(false);
        head.querySelector('.btn-close').onclick = () => setBuilderEnabled(false);

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
            const placeholder = "nhap_rule_moi_" + Math.floor(Math.random() * 1000);
            addToken(placeholder);

            setTimeout(() => {
                if (!builderPanel) return;
                const inputs = builderPanel.querySelectorAll(".mx-ef-builder__input");
                const lastInput = inputs[inputs.length - 1]; 
                
                if (lastInput) {
                    lastInput.focus();
                    
                    const range = document.createRange();
                    range.selectNodeContents(lastInput);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
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
        
        // Cập nhật trạng thái nút Builder ở Toolbar
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
            ".mx-ef-builder__btn--primary",
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

                    // --- BẮT ĐẦU: CÁC NÚT TOGGLE REGEX (BẢN CHUẨN HÓA) ---
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
                    // --- KẾT THÚC: CÁC NÚT TOGGLE REGEX ---

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
                builderTokens.length ? "false" : "true",
            );
        }

        saveBuilderDraft();
    }

    // =============================
    // BUILDER <-> RULES SAVE
    // =============================
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
        } catch {}

        if (enabled) runScan();

        clearBuilderDraft();
    }

    // =============================
    // token operations with count
    // =============================
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

                td.querySelectorAll(".mx-ef-cell-btn").forEach((b) =>
                    b.remove(),
                );
            });
        }
    }

    /* =========================================================
        TOOLBAR UI (wrap + toggle + rules + builder)
    ======================================================== */
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
        btnToggle.textContent = enabled
            ? "Event Filter: ON"
            : "Event Filter: OFF";
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
            raw = ls ? JSON.parse(ls) : config.textPattern || [];
        } catch {
            raw = config.textPattern || [];
        }
        return raw;
    }

    function exportRulesJSON() {
        const rules = getCurrentRulesForEditor();
        return JSON.stringify(rules, null, 2);
    }

    function downloadText(filename, text) {
        const blob = new Blob([text], {
            type: "application/json;charset=utf-8",
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
        const INDENT = "  "; // 2 spaces
        const draftKey =
            STORAGE_KEY_RULES_DRAFT || "MX_EVENT_FILTER_TEXT_PATTERNS_DRAFT";

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
            } catch {}
        }

        function clearDraftText() {
            if (!lsAvailable()) return;
            try {
                localStorage.removeItem(draftKey);
            } catch {}
        }

        /* =========================
			Modal UI
		========================= */
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
                <input type="color" id="mx-color-text" value="${hlColors.text || '#dd6600'}" style="width:24px; height:24px; padding:0; border:none; cursor:pointer; background:transparent;">
            </label>
            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="mx-color-bg-enable" ${hlColors.bg ? 'checked' : ''}>
                <span>Nền:</span>
                <input type="color" id="mx-color-bg" value="${hlColors.bg || '#fff4b8'}" style="width:24px; height:24px; padding:0; border:none; cursor:pointer; background:transparent;">
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
        msg.textContent = draftMeta.has
            ? "Đang mở draft (auto-save)."
            : "Đang mở rules đã lưu.";

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
            msg.textContent = ok
                ? "Đã copy vào clipboard."
                : "Copy thất bại (trình duyệt chặn).";
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

        /* =========================================================
			Editor keys
		========================================================= */
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
                if (c !== " " && c !== "\t") return c;
            }
            return "";
        }
        function firstNonSpaceChar(s) {
            for (let i = 0; i < s.length; i++) {
                const c = s[i];
                if (c !== " " && c !== "\t") return c;
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
            const replaced = lines
                .map((ln) => {
                    if (ln.startsWith(INDENT)) return ln.slice(INDENT.length);
                    if (ln.startsWith("\t")) return ln.slice(1);
                    return ln;
                })
                .join("\n");
            textarea.setRangeText(replaced, start, end, "select");
        }

        const PAIRS = { "{": "}", "[": "]", "(": ")", '"': '"', "'": "'" };

        function wrapSelection(open, close) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;
            const selected = value.slice(start, end);

            textarea.setRangeText(open + selected + close, start, end, "end");

            if (selected.length === 0) {
                textarea.selectionStart = textarea.selectionEnd =
                    start + open.length;
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
            if (before.endsWith("\t")) {
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
        
        // Sync Builder Button Color if Builder is ON
        if (btnBuilder) {
            btnBuilder.textContent = builderEnabled ? "Builder: ON" : "Builder: OFF";
            btnBuilder.style.background = builderEnabled ? "#1f6feb" : "";
            btnBuilder.style.color = builderEnabled ? "#fff" : "";
        }
    }

    /* =========================================================
        BOOT
    ======================================================== */
    applyColorsToDOM();
    injectStyle();
    injectToolbarUI();
    loadBuilderDraft();
    injectBuilderPanel();
    injectCellButtons();

    if (enabled) runScan();
    else clearAllRowStyles();

    /* =========================================================
        OBSERVE DOM CHANGE
    ======================================================== */
    (function observeRefresh() {
        const root =
            document.querySelector(S.table) ||
            document.querySelector("#tableSection") ||
            document.body;

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