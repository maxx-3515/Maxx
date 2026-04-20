import config from "./config.js";

/* =========================================================
   MODULE: OFFENSE MASKER
========================================================= */

export default function offenseMasker(ctx) {
    if (!config.enabled) return;

    const STORAGE_KEY = "MX_OFFENSE_MASKED_IDS";
    const CLEAR_BTN_ID = "MAXX_CLEAR_ALL_MASKS";
    const STYLE_ID = "mx-offense-masker-style";

    let maskedIds = loadMaskedIds();

    /* =========================================================
       SELECTORS
    ========================================================= */
    const offenseCellSelector = 'td[propertyname="offenseId"]';
    const tableRootSelector = "#tableSection";
    const toolbarButtonsSelector = "div.toolbar div#toolbarButtons";

    /* =========================================================
       HÀM LẤY DANH SÁCH TÀI LIỆU (FRAME CHUNG)
    ========================================================= */
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

    /* =========================================================
       PERSIST
    ========================================================= */
    function loadMaskedIds() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch {
            return new Set();
        }
    }

    function saveMaskedIds() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...maskedIds]));
        } catch {}
    }

    /* =========================================================
       STYLE
    ========================================================= */
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

    /* =========================================================
       UTIL
    ========================================================= */
    function ensureOffenseId(cell) {
        if (!cell) return "";
        if (cell.dataset.offenseId) return cell.dataset.offenseId;

        const id = Array.from(cell.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join("")
            .trim();

        if (id) cell.dataset.offenseId = id;
        return id;
    }

    /* =========================================================
       TOOLBAR (CLEAR ALL)
    ========================================================= */
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
            tableRoot.querySelectorAll(".mx-offense-mask-icon").forEach((icon) => (icon.textContent = "➕"));
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

    /* =========================================================
       MASK LOGIC
    ========================================================= */
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

        // Tải lại state từ localStorage đề phòng có tab khác thay đổi
        maskedIds = loadMaskedIds();

        tableRoot.querySelectorAll(offenseCellSelector).forEach((cell) => injectMasker(doc, cell));

        updateClearButtonState(doc);
    }

    /* =========================================================
       LIFECYCLE & MUTATION OBSERVER (ĐỒNG BỘ 3 MODULE)
    ========================================================= */
    setInterval(() => {
        getTargetDocs().forEach(doc => {
            const root = doc.querySelector(tableRootSelector);
            if (!root) return;
            
            // Xử lý UI tĩnh
            injectStyles(doc);
            injectClearAllButton(doc);

            // Kiểm tra xem bảng có bị QRadar tải lại/thay mới không
            if (doc._mxMaskerObservedRoot !== root) {
                doc._mxMaskerObservedRoot = root;

                // Xóa Observer cũ nếu có
                if (doc._mxMaskerObserver) {
                    doc._mxMaskerObserver.disconnect();
                }

                // Chạy quét lần đầu cho bảng mới
                scanTable(doc);

                // Khởi tạo Observer mới
                doc._mxMaskerObserver = new MutationObserver(() => {
                    injectClearAllButton(doc);
                    
                    // Sử dụng Debounce 250ms giống hệt module khác để tránh lag UI
                    if (doc._mxMaskerTimer) clearTimeout(doc._mxMaskerTimer);
                    doc._mxMaskerTimer = setTimeout(() => {
                        scanTable(doc);
                    }, 250);
                });
                
                doc._mxMaskerObserver.observe(root, { childList: true, subtree: true });
            }
        });
    }, 1000);
}

/* ===============================
    DEV ENTRY
================================ */
if (typeof __MAXX_DEV__ !== "undefined") {
    window.__MAXX_DEV_ENTRY__ = offenseMasker;
}