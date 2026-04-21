import config from "./config.js";

/* =========================================================
   1. KHỞI TẠO BIẾN & CÀI ĐẶT MÁY XÚC (XHR & FETCH INTERCEPTOR)
========================================================= */
window.MY_AUTO_SEC = "";
window.MY_AUTO_CSRF = "";

// Hàm đọc Cookie (Dùng để lấy QRadarCSRF vì nó thường không bị khóa HttpOnly)
function getQRadarCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return "";
}

(function () {
    // 1. Bắt XHR (Cho các API cũ của QRadar)
    const originalXHR = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
        const h = header.toLowerCase();
        if (h === "sec" || h === "sec_token") window.MY_AUTO_SEC = value;
        if (h === "qradarcsrf") window.MY_AUTO_CSRF = value;
        originalXHR.apply(this, arguments);
    };

    // 2. Bắt Fetch (Cho các API mới của QRadar)
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const options = args[1] || {};
        if (options.headers) {
            const hdrs = new Headers(options.headers);
            if (hdrs.has("SEC")) window.MY_AUTO_SEC = hdrs.get("SEC");
            if (hdrs.has("sec")) window.MY_AUTO_SEC = hdrs.get("sec");
            if (hdrs.has("QRadarCSRF")) window.MY_AUTO_CSRF = hdrs.get("QRadarCSRF");
        }
        return originalFetch.apply(this, args);
    };
})();

/* =========================================================
   MODULE: AQL DYNAMIC MAPPING
========================================================= */
export default function aqlMappingModule(ctx) {
    if (!config.enabled) return;

    const STORAGE_KEY = "MX_AQL_MAPPINGS";
    const DEFAULTS_KEY = "MX_AQL_GLOBAL_DEFAULTS";
    const S = config.selector;

    // --- DATA MANAGEMENT ---
    const defaultGlobalOptions = {
        select: `DATEFORMAT(devicetime, 'MMM dd, yyyy, hh:mm:ss a') as "Device Time", sourceip as "Source IP", "destinationip" as "Destination IP", LOGSOURCENAME(logsourceid) as "Log Source", QIDNAME(qid) as "Event Name"`,
        where: "",
    };

    function loadGlobalDefaults() {
        const raw = localStorage.getItem(DEFAULTS_KEY);
        if (!raw) return defaultGlobalOptions;
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === "string") return { select: parsed, where: "" };
            return { ...defaultGlobalOptions, ...parsed };
        } catch (e) {
            return { select: raw, where: "" };
        }
    }

    function saveGlobalDefaults(obj) {
        localStorage.setItem(DEFAULTS_KEY, JSON.stringify(obj));
    }

    const defaultMappings = [
        {
            id: "default_process_create",
            enabled: true,
            useDefaults: true,
            name: "Process Create (Windows)",
            description: "Trích xuất thông tin Command Line của tiến trình",
            matchTokens: ["/process create/i", "windows"],
            selectQuery: `"Action" AS 'Action', \n"ApplicationName" AS 'App Name', \n"Process CommandLine" AS 'Command Line'`,
            whereQuery: "",
            enableGroupBy: false,
            groupByQuery: "",
            enableOrderBy: false,
            orderByQuery: "",
        },
    ];

    function loadMappings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return defaultMappings;
    }

    function saveMappings(mappings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
        } catch (e) {}
    }

    let currentMappings = loadMappings();

    // --- CORE LOGIC ---
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

    function isRuleMatched(text, tokens) {
        if (!tokens || tokens.length === 0) return false;
        const parsedTokens = tokens.map(parseToken).filter((t) => t);
        // HOẶC: Chỉ cần khớp 1 token là lấy
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

        let globalWhere = "";

        if (mappingRule.useDefaults) {
            const gOpts = loadGlobalDefaults();
            if (gOpts.select) selectPart = selectPart ? `${selectPart}, ${gOpts.select}` : gOpts.select;
            if (gOpts.where) globalWhere = gOpts.where;
        }

        let fullAqlQuery = `SELECT ${selectPart} FROM events WHERE INOFFENSE(${offenseId})`;

        // Nối Global WHERE (Nếu có)
        if (globalWhere.trim()) {
            fullAqlQuery += ` AND (${globalWhere.trim()})`;
        }

        // Nối Custom WHERE (Nếu có)
        if (mappingRule.whereQuery && mappingRule.whereQuery.trim()) {
            fullAqlQuery += ` AND (${mappingRule.whereQuery.trim()})`;
        }

        if (mappingRule.enableGroupBy && mappingRule.groupByQuery && mappingRule.groupByQuery.trim()) {
            fullAqlQuery += ` GROUP BY ${mappingRule.groupByQuery.trim()}`;
        }

        if (mappingRule.enableOrderBy && mappingRule.orderByQuery && mappingRule.orderByQuery.trim()) {
            fullAqlQuery += ` ORDER BY ${mappingRule.orderByQuery.trim()}`;
        }

        fullAqlQuery += ` START ${formatAqlTime(startTimeAbs)} STOP ${formatAqlTime(endTimeAbs)}`;

        const innerUrl = `do/ariel/arielSearch?appName=EventViewer&pageId=EventList&dispatch=performSearch&values['searchMode']=AQL&values['timeRangeType']=aqlTime&values['aql']=${encodeURIComponent(fullAqlQuery)}`;

        return `qradar/jsp/ArielSearchWrapper.jsp?url=${encodeURIComponent(innerUrl)}`;
    }

    ctx.aqlAPI = {
        getMappings: () => currentMappings,
        findMatch: findMatchingRule,
        generateUrl: (id, start, end, rule) => buildCustomAqlUrl(id, start, end, rule),
    };

    // --- GUI LOGIC ---
    function injectStyles(doc) {
        if (doc.getElementById("mx-aql-style")) return;
        const style = doc.createElement("style");
        style.id = "mx-aql-style";
        style.textContent = `
            .mx-aql-modal { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:999999; display:flex; align-items:center; justify-content:center; font-family: sans-serif;}
            .mx-aql-panel { width: 1050px; height: 80vh; max-height: 800px; max-width: 95vw; background:#fff; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,.25); display:flex; flex-direction:column; overflow:hidden;}
            .mx-aql-head { padding:12px 15px; background:#1f2937; color:#fff; display:flex; justify-content:space-between; font-weight:bold; font-size:14px; user-select:none;}
            .mx-aql-close { cursor:pointer; padding: 0 5px; color:#9ca3af; } .mx-aql-close:hover { color:#fff; }
            .mx-aql-body { display:flex; flex:1; overflow:hidden; }
            
            .mx-aql-sidebar { width: 300px; border-right: 1px solid #e5e7eb; background: #f9fafb; display:flex; flex-direction:column; }
            .mx-aql-side-tools { padding: 10px; display: flex; gap: 8px; border-bottom: 1px solid #e5e7eb; }
            .mx-aql-grid-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px; border-bottom: 1px solid #e5e7eb; }
            .mx-aql-add-btn { flex:1; padding:8px; background:#10b981; color:#fff; text-align:center; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px; }
            .mx-aql-set-btn { width: 34px; height: 34px; background:#e5e7eb; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; }
            .mx-aql-action-btn { padding:6px; background:#fff; color:#374151; text-align:center; border-radius:4px; cursor:pointer; font-size:12px; border:1px solid #d1d5db; font-weight:bold; }
            .mx-aql-action-btn:hover { background:#f3f4f6; }
            
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
            .mx-aql-ide-textarea { background: transparent; color: #ce9178; border: 1px dashed #444; border-radius: 4px; outline: none; width: 100%; resize: vertical; font-family: inherit; font-size: 13px; white-space: pre-wrap; line-height: 1.5; padding: 8px; box-sizing: border-box; }
            
            .mx-aql-foot { padding:12px 15px; border-top:1px solid #e5e7eb; background:#f9fafb; display:flex; justify-content:space-between; align-items:center;}
            .mx-aql-btn { padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold; border:none; }
            .mx-aql-btn-del { background:#fee2e2; color:#b91c1c; }
            .mx-aql-btn-save { background:#3b82f6; color:#fff; }
            .mx-aql-btn-check { background:#8b5cf6; color:#fff; display:flex; align-items:center; gap:4px; }
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
                        <div class="mx-aql-grid-tools">
                            <div class="mx-aql-action-btn" id="mx-aql-import" title="Import File">📂 Import File</div>
                            <div class="mx-aql-action-btn" id="mx-aql-paste" title="Paste JSON">📥 Paste JSON</div>
                            <div class="mx-aql-action-btn" id="mx-aql-export" title="Export File">💾 Export File</div>
                            <div class="mx-aql-action-btn" id="mx-aql-copy" title="Copy JSON">📋 Copy JSON</div>
                        </div>
                        <div class="mx-aql-list" id="mx-aql-list"></div>
                    </div>
                    <div class="mx-aql-editor" id="mx-aql-view"></div>
                </div>
                <div class="mx-aql-foot">
                    <button class="mx-aql-btn mx-aql-btn-del" id="mx-aql-del" style="display:none;">Delete</button>
                    <div style="flex:1; display:flex; justify-content:flex-end; align-items:center; gap:10px;">
                        <span class="mx-aql-save-status" id="mx-aql-save-status">Saved!</span>
                        <button class="mx-aql-btn mx-aql-btn-save" id="mx-aql-save" style="display:none;">Save Configuration</button>
                    </div>
                </div>
            </div>
        `;
        doc.body.appendChild(modal);

        ["keydown", "keyup", "keypress"].forEach((eventType) => {
            modal.addEventListener(
                eventType,
                (e) => {
                    // Ngừng lan truyền sự kiện ra bên ngoài Modal
                    e.stopPropagation();
                },
                true,
            ); // Tham số 'true' (Capture phase) giúp bắt sự kiện sớm nhất có thể, chặn đứng QRadar 100%
        });

        const viewEl = modal.querySelector("#mx-aql-view");
        const listEl = modal.querySelector("#mx-aql-list");
        const btnSave = modal.querySelector("#mx-aql-save");
        const btnDel = modal.querySelector("#mx-aql-del");
        const saveStatus = modal.querySelector("#mx-aql-save-status");

        function showSaveStatus() {
            saveStatus.classList.add("show");
            setTimeout(() => saveStatus.classList.remove("show"), 1500);
        }

        // --- RENDER LIST + DRAG & DROP LOGIC ---
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

        // --- GLOBAL SETTINGS LOGIC ---
        function loadGlobalSettings() {
            isSettingsMode = true;
            editingId = null;
            btnDel.style.display = "none";
            btnSave.style.display = "none";
            renderList();

            const gOpts = loadGlobalDefaults();

            viewEl.innerHTML = `
                <div class="mx-aql-group" style="flex:1;">
                    <label class="mx-aql-label" style="font-size:14px; margin-bottom:4px;">Global Default SELECT Fields</label>
                    <div class="mx-aql-hint" style="margin-bottom:8px; font-size:12px; color:#6b7280;">Các trường này sẽ nối vào CUỐI khối SELECT (Auto-save).</div>
                    <div class="mx-aql-ide" style="height:150px; flex:none;">
                        <textarea class="mx-aql-ide-textarea" id="mx-global-select" spellcheck="false" style="min-height: 100%; border:none;">${gOpts.select}</textarea>
                    </div>
                </div>
                <div class="mx-aql-group" style="flex:1; margin-top:15px;">
                    <label class="mx-aql-label" style="font-size:14px; margin-bottom:4px;">Global Default WHERE Condition</label>
                    <div class="mx-aql-hint" style="margin-bottom:8px; font-size:12px; color:#6b7280;">Sẽ nối thêm vào query bằng toán tử AND (Auto-save). VD: NOT INCIDR('10.0.0.0/8', sourceip)</div>
                    <div class="mx-aql-ide" style="height:150px; flex:none;">
                        <textarea class="mx-aql-ide-textarea" id="mx-global-where" spellcheck="false" style="min-height: 100%; border:none;">${gOpts.where}</textarea>
                    </div>
                </div>
            `;

            const selInput = viewEl.querySelector("#mx-global-select");
            const whInput = viewEl.querySelector("#mx-global-where");

            const saveGlobal = () => {
                saveGlobalDefaults({
                    select: selInput.value,
                    where: whInput.value,
                });
                showSaveStatus();
            };

            selInput.addEventListener("input", saveGlobal);
            whInput.addEventListener("input", saveGlobal);
        }

        // --- HÀM KIỂM TRA SYNTAX TỰ ĐỘNG ---
        async function runSyntaxCheck(doc) {
            const resEl = doc.querySelector("#mx-syntax-result");

            let csrfToken = window.MY_AUTO_CSRF || getQRadarCookie("QRadarCSRF");
            if (!csrfToken) {
                let hiddenInput = document.querySelector('input[name="QRadarCSRF"]');
                if (hiddenInput) csrfToken = hiddenInput.value;
            }

            if (!csrfToken) {
                resEl.textContent =
                    "⏳ Đang tìm Token... Hãy thử tắt bảng này đi, thao tác nhẹ trên giao diện QRadar rồi thử lại!";
                resEl.style.color = "#f59e0b";
                return;
            }

            resEl.textContent = "⏳ Đang kiểm tra...";
            resEl.style.color = "#3b82f6";

            let sel = doc.querySelector("#mx-query").value.trim().replace(/;$/, "");
            if (sel.toUpperCase().startsWith("SELECT ")) sel = sel.substring(7).trim();
            const useDef = doc.querySelector("#mx-use-defaults").checked;

            const gOpts = useDef ? loadGlobalDefaults() : { select: "", where: "" };

            if (useDef && gOpts.select) {
                sel = sel ? `${sel}, ${gOpts.select}` : gOpts.select;
            }

            const customWh = doc.querySelector("#mx-where").value.trim();
            const enGrp = doc.querySelector("#mx-en-group").checked;
            const grp = doc.querySelector("#mx-group").value.trim();
            const enOrd = doc.querySelector("#mx-en-order").checked;
            const ord = doc.querySelector("#mx-order").value.trim();

            let testQuery = `SELECT ${sel} FROM events`;

            let whereClauses = [];
            if (useDef && gOpts.where.trim()) whereClauses.push(`(${gOpts.where.trim()})`);
            if (customWh) whereClauses.push(`(${customWh})`);

            if (whereClauses.length > 0) {
                testQuery += ` WHERE ${whereClauses.join(" AND ")}`;
            }

            if (enGrp && grp) testQuery += ` GROUP BY ${grp}`;
            if (enOrd && ord) testQuery += ` ORDER BY ${ord}`;

            testQuery += ` START '2025-01-01 00:00:00' STOP '2025-01-01 00:05:00'`;

            try {
                const reqHeaders = {
                    QRadarCSRF: csrfToken,
                    "Content-Type": "application/x-www-form-urlencoded",
                };

                if (window.MY_AUTO_SEC) {
                    reqHeaders["SEC"] = window.MY_AUTO_SEC;
                }

                const res = await fetch("/api/ariel/searches?validate_only=true", {
                    method: "POST",
                    headers: reqHeaders,
                    credentials: "same-origin",
                    body: new URLSearchParams({ query_expression: testQuery }),
                });

                if (res.ok) {
                    resEl.textContent = "✅ Syntax Hợp lệ!";
                    resEl.style.color = "#10b981";
                } else {
                    const detail = await res.json();
                    resEl.textContent = `❌ Lỗi: ${detail.message}`;
                    resEl.style.color = "#ef4444";
                }
            } catch (e) {
                resEl.textContent = "❌ Lỗi kết nối API";
                resEl.style.color = "#ef4444";
            }
        }

        // --- EDITOR LOGIC ---
        function loadEditor(mapping = null) {
            isSettingsMode = false;
            btnSave.style.display = "block";

            if (mapping) {
                editingId = mapping.id;
                btnDel.style.display = "block";
                draftTokens = [...(mapping.matchTokens || [])];
            } else {
                editingId = `mx_aql_${Date.now()}`;
                btnDel.style.display = "none";
                mapping = {
                    name: "",
                    description: "",
                    selectQuery: "",
                    useDefaults: true,
                    whereQuery: "",
                    enableGroupBy: false,
                    groupByQuery: "",
                    enableOrderBy: false,
                    orderByQuery: "",
                };
                draftTokens = [];
            }
            renderList();

            const gOpts = loadGlobalDefaults();

            viewEl.innerHTML = `
                <div class="mx-aql-group">
                    <div class="mx-aql-row">
                        <label class="mx-aql-label">Name</label>
                        <input type="text" class="mx-aql-input" id="mx-name" style="flex:1" value="${mapping.name}">
                        <button class="mx-aql-btn mx-aql-btn-check" id="mx-btn-check" title="Kiểm tra trực tiếp API QRadar">🔍 Check Syntax</button>
                    </div>
                </div>
                <div class="mx-aql-group">
                    <label class="mx-aql-label" style="display:flex; justify-content:space-between">
                        Description
                        <span id="mx-syntax-result" style="font-size:12px; font-weight:normal;"></span>
                    </label>
                    <input type="text" class="mx-aql-input" id="mx-desc" value="${mapping.description}">
                </div>
                <div class="mx-aql-group">
                    <label class="mx-aql-label">Match Tokens (Ít nhất 1 token khớp)</label>
                    <div class="mx-aql-token-box" id="mx-token-box">
                        <input type="text" class="mx-aql-token-input" id="mx-token-in" placeholder="+ Thêm token...">
                    </div>
                </div>
                <div class="mx-aql-group">
                    <label class="mx-aql-label" style="display:flex; justify-content:space-between">
                        SELECT Block
                        <label class="mx-aql-label" style="margin:0;"><input type="checkbox" id="mx-use-defaults" ${mapping.useDefaults ? "checked" : ""}> + Default Fields</label>
                    </label>
                    <div class="mx-aql-ide">
                        <div class="mx-aql-ide-fixed"><span class="mx-aql-ide-kw">SELECT</span></div>
                        <textarea class="mx-aql-ide-textarea" id="mx-query" spellcheck="false" style="min-height: 80px;">${mapping.selectQuery}</textarea>
                        <div class="mx-aql-ide-fixed" id="mx-preview-select-suffix">
                            ${mapping.useDefaults && gOpts.select ? ', <span class="mx-aql-ide-fn">' + gOpts.select + "</span>" : ""}
                            <br><span class="mx-aql-ide-kw">FROM</span> events
                        </div>
                    </div>
                </div>
                <div class="mx-aql-group">
                    <label class="mx-aql-label">WHERE Condition (Optional)</label>
                    <div class="mx-aql-ide">
                        <div class="mx-aql-ide-fixed"><span class="mx-aql-ide-kw">WHERE</span> INOFFENSE(&lt;offense_id&gt;)</div>
                        <div class="mx-aql-ide-fixed" id="mx-preview-where-prefix">
                            ${mapping.useDefaults && gOpts.where ? '<span class="mx-aql-ide-kw">AND</span> <span class="mx-aql-ide-fn">(' + gOpts.where + ")</span>" : ""}
                        </div>
                        <div class="mx-aql-ide-fixed"><span class="mx-aql-ide-kw">AND</span> (</div>
                        <textarea class="mx-aql-ide-textarea" id="mx-where" spellcheck="false" style="min-height: 40px;" placeholder="VD: LOGSOURCENAME(logsourceid) ILIKE '%Windows%'\nBỏ trống nếu không cần thêm điều kiện.">${mapping.whereQuery || ""}</textarea>
                        <div class="mx-aql-ide-fixed">)</div>
                    </div>
                </div>
                <div class="mx-aql-group">
                    <div class="mx-aql-row">
                        <label class="mx-aql-label"><input type="checkbox" id="mx-en-group" ${mapping.enableGroupBy ? "checked" : ""}> Enable GROUP BY</label>
                        <label class="mx-aql-label" style="margin-left: 20px;"><input type="checkbox" id="mx-en-order" ${mapping.enableOrderBy ? "checked" : ""}> Enable ORDER BY</label>
                    </div>
                </div>
                <div class="mx-aql-group" id="mx-group-container" style="display: ${mapping.enableGroupBy ? "flex" : "none"};">
                    <div class="mx-aql-ide">
                        <div class="mx-aql-ide-fixed"><span class="mx-aql-ide-kw">GROUP BY</span></div>
                        <textarea class="mx-aql-ide-textarea" id="mx-group" spellcheck="false" style="min-height: 40px;" placeholder="Lưu ý: Bắt buộc dùng các trường đã SELECT. VD: 'Event Name'">${mapping.groupByQuery || ""}</textarea>
                    </div>
                </div>
                <div class="mx-aql-group" id="mx-order-container" style="display: ${mapping.enableOrderBy ? "flex" : "none"};">
                    <div class="mx-aql-ide">
                        <div class="mx-aql-ide-fixed"><span class="mx-aql-ide-kw">ORDER BY</span></div>
                        <textarea class="mx-aql-ide-textarea" id="mx-order" spellcheck="false" style="min-height: 40px;" placeholder="VD: 'Device Time' DESC">${mapping.orderByQuery || ""}</textarea>
                    </div>
                </div>
            `;

            // --- Logic xử lý Token ---
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

            // --- Logic hiển thị Preview khi bật/tắt Use Defaults ---
            viewEl.querySelector("#mx-use-defaults").onchange = (e) => {
                const currentOpts = loadGlobalDefaults();
                const isChecked = e.target.checked;

                viewEl.querySelector("#mx-preview-select-suffix").innerHTML =
                    isChecked && currentOpts.select
                        ? `, <span class="mx-aql-ide-fn">${currentOpts.select}</span><br><span class="mx-aql-ide-kw">FROM</span> events`
                        : `<br><span class="mx-aql-ide-kw">FROM</span> events`;

                viewEl.querySelector("#mx-preview-where-prefix").innerHTML =
                    isChecked && currentOpts.where
                        ? `<span class="mx-aql-ide-kw">AND</span> <span class="mx-aql-ide-fn">(${currentOpts.where})</span>`
                        : ``;
            };

            viewEl.querySelector("#mx-en-group").onchange = (e) => {
                viewEl.querySelector("#mx-group-container").style.display = e.target.checked ? "flex" : "none";
            };
            viewEl.querySelector("#mx-en-order").onchange = (e) => {
                viewEl.querySelector("#mx-order-container").style.display = e.target.checked ? "flex" : "none";
            };

            viewEl.querySelector("#mx-btn-check").onclick = () => {
                runSyntaxCheck(doc);
            };
        }

        // --- EXPORT / IMPORT LOGIC ---
        const getBackupData = () => {
            return {
                type: "MX_AQL_MAPPINGS_BACKUP",
                globalDefaults: loadGlobalDefaults(),
                mappings: currentMappings,
            };
        };

        const processImportedData = (data) => {
            if (data && data.type === "MX_AQL_MAPPINGS_BACKUP") {
                if (confirm("Xác nhận gộp dữ liệu Import vào cấu hình hiện tại?")) {
                    if (data.globalDefaults) saveGlobalDefaults(data.globalDefaults);
                    if (data.mappings && Array.isArray(data.mappings)) {
                        data.mappings.forEach((impMap) => {
                            const idx = currentMappings.findIndex((m) => m.id === impMap.id);
                            if (idx > -1) currentMappings[idx] = impMap;
                            else currentMappings.push(impMap);
                        });
                    }
                    saveMappings(currentMappings);
                    renderList();
                    loadGlobalSettings();
                    alert("✅ Import thành công!");
                }
            } else {
                alert("❌ Dữ liệu không hợp lệ hoặc không đúng định dạng MX_AQL_MAPPINGS_BACKUP.");
            }
        };

        // 1. Export File
        modal.querySelector("#mx-aql-export").onclick = () => {
            const backupData = getBackupData();
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = doc.createElement("a");
            a.href = url;
            a.download = `aql_mappings_backup_${new Date().getTime()}.json`;
            a.click();
        };

        // 2. Copy JSON
        modal.querySelector("#mx-aql-copy").onclick = async () => {
            const jsonString = JSON.stringify(getBackupData(), null, 2);
            try {
                await navigator.clipboard.writeText(jsonString);
                alert("✅ Đã copy toàn bộ cấu hình JSON vào Clipboard!");
            } catch (err) {
                const textArea = doc.createElement("textarea");
                textArea.value = jsonString;
                doc.body.appendChild(textArea);
                textArea.select();
                try {
                    doc.execCommand("copy");
                    alert("✅ Đã copy toàn bộ cấu hình JSON vào Clipboard!");
                } catch (ex) {
                    alert("❌ Trình duyệt chặn quyền Copy. Vui lòng dùng tính năng Export File.");
                }
                doc.body.removeChild(textArea);
            }
        };

        // 3. Import File
        modal.querySelector("#mx-aql-import").onclick = () => {
            const input = doc.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = (e) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        processImportedData(data);
                    } catch (err) {
                        alert("❌ Lỗi: Không thể đọc file JSON.");
                    }
                };
                reader.readAsText(e.target.files[0]);
            };
            input.click();
        };

        // 4. Paste Import
        modal.querySelector("#mx-aql-paste").onclick = async () => {
            let jsonString = "";
            try {
                jsonString = await navigator.clipboard.readText();
            } catch (err) {
                // Fallback nếu trình duyệt chặn tự động đọc Clipboard
                jsonString = prompt(
                    "Trình duyệt chặn đọc Clipboard tự động.\n\nVui lòng DÁN (Ctrl+V) mã JSON của bạn vào ô dưới đây:",
                );
            }

            if (!jsonString) return;

            try {
                const data = JSON.parse(jsonString);
                processImportedData(data);
            } catch (e) {
                alert("❌ Lỗi: Nội dung bạn dán không phải là định dạng JSON hợp lệ.");
            }
        };

        btnSave.onclick = () => {
            const map = {
                id: editingId,
                enabled: true,
                name: modal.querySelector("#mx-name").value,
                description: modal.querySelector("#mx-desc").value,
                useDefaults: modal.querySelector("#mx-use-defaults").checked,
                matchTokens: draftTokens,
                selectQuery: modal.querySelector("#mx-query").value,
                whereQuery: modal.querySelector("#mx-where").value,
                enableGroupBy: modal.querySelector("#mx-en-group").checked,
                groupByQuery: modal.querySelector("#mx-group").value,
                enableOrderBy: modal.querySelector("#mx-en-order").checked,
                orderByQuery: modal.querySelector("#mx-order").value,
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
            if (!confirm("Xác nhận xóa Mapping này?")) return;
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
        btn.style =
            "display:inline-flex; align-items:center; cursor:pointer; margin-left:8px; padding:2px 8px; border:1px solid #888; border-radius:3px; font-weight:bold; order:4;";
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

if (typeof __MAXX_DEV__ !== "undefined") {
    window.__MAXX_DEV_ENTRY__ = aqlMappingModule;
}
