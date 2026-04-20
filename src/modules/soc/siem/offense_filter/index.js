import config from "./config.js";

/* =========================================================
   MODULE: OFFENSE FILTER
========================================================= */

export default function offenseFilterModule(ctx) {
    const sel = config.selector || {};
    const DOMAIN_KEY = (location.hostname || "unknown").toLowerCase();
    const { siem } = ctx;

    const S = {
        toolbarButtons: sel.toolbarButtons || "#toolbarButtons",
        rows: sel.rows,
        cellsTarget: `${sel.cell_domain}, ${sel.cell_description}`,
        cell_id: sel.cell_offenseId || "td:nth-child(2)",
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
        } catch {}
    }

    let rawRules = loadRules();
    let noiseGroups = compileRules(rawRules.noise);
    let importantGroups = compileRules(rawRules.important);

    function loadRules() {
        try {
            const raw = localStorage.getItem(ST_RULES);
            if (raw) return JSON.parse(raw);
        } catch {}
        return config.defaultRules || { noise: [], important: [] };
    }
    function saveRules(r) {
        try {
            localStorage.setItem(ST_RULES, JSON.stringify(r));
        } catch {}
    }

    // --- CƠ CHẾ LƯU TRỮ TÁCH BIỆT (MANUAL vs DYNAMIC) ---
    let markedIds = loadMarkedIds();

    function loadMarkedIds() {
        try {
            const raw = localStorage.getItem(ST_MARKED_IDS);
            if (raw) {
                const p = JSON.parse(raw);
                // Khôi phục mảng Manual từ mảng cũ nếu user đang xài bản trước
                let mNoise = p.manualNoise !== undefined ? p.manualNoise : p.noiseIds || [];
                let mImp = p.manualImportant !== undefined ? p.manualImportant : p.importantIds || [];
                return {
                    manualNoise: mNoise,
                    manualImportant: mImp,
                    dynamicNoise: p.dynamicNoise || [],
                    dynamicImportant: p.dynamicImportant || [],
                    noiseIds: p.noiseIds || [],
                    importantIds: p.importantIds || [],
                };
            }
        } catch {}
        return {
            manualNoise: [],
            manualImportant: [],
            dynamicNoise: [],
            dynamicImportant: [],
            noiseIds: [],
            importantIds: [],
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

            // Gộp Manual và Dynamic để xuất ra mảng kết quả cho Quick Open đọc
            markedIds.noiseIds = [...new Set([...markedIds.manualNoise, ...markedIds.dynamicNoise])];
            markedIds.importantIds = [...new Set([...markedIds.manualImportant, ...markedIds.dynamicImportant])];

            localStorage.setItem(ST_MARKED_IDS, JSON.stringify(markedIds));
        } catch {}
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
        },
    };

    let hlColors = loadColors();
    function loadColors() {
        try {
            const raw = localStorage.getItem(ST_COLORS);
            if (raw) return JSON.parse(raw);
        } catch {}
        return {
            noise: { text: "", bg: "", opacity: "0.4" },
            important: { text: "#b91c1c", bg: "#fef2f2", opacity: "1" },
        };
    }

    function normalizeWhitespace(str) {
        return String(str || "")
            .replace(/\s+/g, " ")
            .trim();
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
        return groups
            .filter((g) => Array.isArray(g) && g.length > 0)
            .map((g) => g.map(parseToken).filter((t) => t))
            .filter((g) => g.length > 0);
    }

    function isMatched(text, groups) {
        if (!groups.length) return false;
        return groups.some((group) =>
            group.every((token) => {
                if (token instanceof RegExp) {
                    token.lastIndex = 0;
                    return token.test(text);
                }
                return text.includes(token);
            }),
        );
    }

    function getRowSearchText(tr) {
        const tds = tr.querySelectorAll("td");
        if (!tds || tds.length === 0) return "";
        return Array.from(tds)
            .map((td) => td.textContent || "")
            .join(" ")
            .replace(/\s+/g, " ");
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

        // REFRESH LẠI DYNAMIC TRƯỚC MỖI LẦN QUÉT
        markedIds.dynamicNoise = [];
        markedIds.dynamicImportant = [];

        doc.querySelectorAll(S.rows).forEach((tr) => {
            const text = getRowSearchText(tr);
            const oId = getRowOffenseId(tr);

            tr.classList.remove("mx-of-noise", "mx-of-important");

            // ƯU TIÊN 1: Kiểm tra theo ID chính xác bằng tay
            if (oId && markedIds.manualImportant.includes(oId)) {
                tr.classList.add("mx-of-important");
            } else if (oId && markedIds.manualNoise.includes(oId)) {
                tr.classList.add("mx-of-noise");
            }
            // ƯU TIÊN 2: Kiểm tra theo bộ lọc Text Regex -> Đưa vào DYNAMIC
            else if (isMatched(text, importantGroups)) {
                tr.classList.add("mx-of-important");
                if (oId) markedIds.dynamicImportant.push(oId);
            } else if (isMatched(text, noiseGroups)) {
                tr.classList.add("mx-of-noise");
                if (oId) markedIds.dynamicNoise.push(oId);
            }
        });

        // LƯU LẠI - Hàm saveMarkedIds sẽ tự gộp Manual + Dynamic vào mảng kết quả để các module khác nhận được update
        saveMarkedIds();
        injectCellButtons(doc);
    }

    function clearScan(doc) {
        doc.querySelectorAll(S.rows).forEach((tr) => tr.classList.remove("mx-of-noise", "mx-of-important"));
    }

    // Builder, Drag, Modals... (Được giữ nguyên)
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
                let top = el.offsetTop,
                    left = el.offsetLeft;
                const win = doc.defaultView || window;
                const maxL = win.innerWidth - el.offsetWidth,
                    maxT = win.innerHeight - el.offsetHeight;
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
        let p1 = 0,
            p2 = 0,
            p3 = 0,
            p4 = 0,
            dragging = false;
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
            doc.onmousemove = (e) => {
                e.preventDefault();
                dragging = true;
                p1 = p3 - e.clientX;
                p2 = p4 - e.clientY;
                p3 = e.clientX;
                p4 = e.clientY;
                let t = moveEl.offsetTop - p2,
                    l = moveEl.offsetLeft - p1;
                const ml = win.innerWidth - moveEl.offsetWidth,
                    mt = win.innerHeight - moveEl.offsetHeight;
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
        } catch {}
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
        } catch {}

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
        cUI.style =
            "display:flex; gap:20px; background:#f8f9fa; padding:10px; border-radius:6px; font-size:12px; border:1px solid #ddd;";
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
                    opacity: cUI.querySelector("#of-c-n-o").value,
                },
                important: { text: cUI.querySelector("#of-c-i-t").value, bg: cUI.querySelector("#of-c-i-b").value },
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
                } catch {}
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

                    // Dùng Debounce 250ms thay cho rAF
                    if (doc._mxOfTimer) clearTimeout(doc._mxOfTimer);
                    doc._mxOfTimer = setTimeout(() => {
                        runScan(doc);
                    }, 250);
                });

                doc._mxOfObserver.observe(root, { childList: true, subtree: true });
            }
        });
    }, 1000);
}

if (typeof __MAXX_DEV__ !== "undefined") {
    window.__MAXX_DEV_ENTRY__ = offenseFilterModule;
}
