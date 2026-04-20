import config from "./config.js";

/* =========================================================
   MODULE: AQL DYNAMIC MAPPING (DRAG & DROP + AUTO-SAVE + IMPORT/EXPORT)
========================================================= */

export default function aqlMappingModule(ctx) {
    if (!config.enabled) return;

    const STORAGE_KEY = "MX_AQL_MAPPINGS";
    const DEFAULTS_KEY = "MX_AQL_GLOBAL_DEFAULTS";
    const S = config.selector;

    // --- DATA MANAGEMENT ---
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
            selectQuery: `"Action" AS 'Action', \n"ApplicationName" AS 'App Name', \n"Process CommandLine" AS 'Command Line'`,
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
        generateUrl: (id, start, end, rule) => buildCustomAqlUrl(id, start, end, rule),
    };

    // --- GUI LOGIC ---
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

                // Sự kiện Click Bật/Tắt
                const toggle = item.querySelector(".mx-aql-toggle");
                toggle.onclick = (e) => {
                    e.stopPropagation();
                    m.enabled = !m.enabled;
                    saveMappings(currentMappings);
                    renderList();
                };

                // Sự kiện Click chọn Editor
                item.onclick = (e) => {
                    if (e.target === toggle) return;
                    loadEditor(m);
                };

                // --- DRAG & DROP EVENTS ---
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
                        // Reorder mảng
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
                draftTokens = [...(mapping.matchTokens || [])];
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
                viewEl.querySelector("#mx-preview-suffix").innerHTML = e.target.checked
                    ? `, <span class="mx-aql-ide-fn">${loadGlobalDefaults()}</span><br><span class="mx-aql-ide-kw">FROM</span> events...`
                    : `<br><span class="mx-aql-ide-kw">FROM</span> events...`;
            };
        }

        // Export/Import Logic
        modal.querySelector("#mx-aql-export").onclick = () => {
            const backupData = {
                type: "MX_AQL_MAPPINGS_BACKUP",
                globalDefaults: loadGlobalDefaults(),
                mappings: currentMappings,
            };
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = doc.createElement("a");
            a.href = url;
            a.download = `aql_mappings_backup_${new Date().getTime()}.json`;
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
                selectQuery: modal.querySelector("#mx-query").value,
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
