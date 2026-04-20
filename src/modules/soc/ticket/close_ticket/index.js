import { default as config } from "./config.js";

/* =========================
   Internal State
========================= */
let domObserver = null;
let currentTicketId = null;
const STORAGE_KEY = "maxx_auto_next_enabled";

/* =========================
   Utils: Auto Next State
========================= */
const isAutoNextEnabled = () => localStorage.getItem(STORAGE_KEY) === "true";

function getTicketId() {
    const el = document.querySelector(".ticket-number");
    return el ? el.textContent.trim() : null;
}

/* =========================
   Inject CSS (Giữ nguyên style cũ + thêm style toggle)
========================= */
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

/* =========================
   Inject UI Components
========================= */
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
    // 1. Inject Auto Next Toggle (Quan sát div#app)
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

    // 2. Inject Close Button (Giữ nguyên logic cũ)
    const tabsContainer = document.querySelector(".tabsSidebar-tabs");
    if (!tabsContainer) return;

    let closeBtn = tabsContainer.querySelector(".tabsSidebar-action");
    if (!closeBtn) {
        closeBtn = document.createElement("div");
        closeBtn.className = "tabsSidebar-tab tabsSidebar-action";
        closeBtn.title = "Close ticket";
        closeBtn.innerHTML = `<span class="close-icon">×</span>`;

        closeBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (closeBtn.classList.contains("disabled")) return;
            onCloseButtonClick();
        });
        tabsContainer.appendChild(closeBtn);
    }

    // Update trạng thái button
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

/* =========================
   Business Logic (Giữ nguyên + Thêm Auto Next)
========================= */
function onCloseButtonClick() {
    if (isTicketClosed() || !isAllowedGroup()) return;

    const closeBtn = document.querySelector(".tabsSidebar-action");
    if (closeBtn) {
        closeBtn.classList.add("disabled");
        closeBtn.title = "Ticket đang được đóng...";
    }

    const stateControl = document.querySelector('.form-control[name="state_id"]');
    if (!stateControl) return;

    stateControl.value = config.options.state.closed;
    stateControl.dispatchEvent(new Event("change", { bubbles: true }));

    const updateButton = document.querySelector(".js-submitDropdown > button.js-submit");
    if (!updateButton) return;

    updateButton.click();

    // Tính năng Auto Next mới
    if (isAutoNextEnabled()) {
        setTimeout(() => {
            const nextBtn = document.querySelector("div.ticketZoom div.pagination a.btn--split--first");
            if (nextBtn) {
                console.log("[close-ticket] Auto-moving to next ticket...");
                nextBtn.click();
            }
        }, 1000);
    }
}

/* =========================
   Helpers (Giữ nguyên)
========================= */
function isTicketClosed() {
    const stateControl = document.querySelector('.form-control[name="state_id"]');
    return stateControl ? String(stateControl.value) === String(config.options.state.closed) : false;
}

function isAllowedGroup() {
    const groupInput = document.querySelector('.form-group[data-attribute-name="group_id"] input.searchableSelect-shadow');
    if (!groupInput) return false;
    return String(groupInput.value) === String(config.options.organization.TT_ATTT);
}

function resetCloseButton() {
    const oldBtn = document.querySelector(".tabsSidebar-action");
    if (oldBtn) oldBtn.remove();
}

/* =========================
   Mutation Observer (Quan sát div#app)
========================= */
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

/* =========================
   Entry
========================= */
export default function closeTicket(ctx) {
    if (!config.enabled) return;

    injectStyleCSS();
    currentTicketId = getTicketId();
    injectUI();
    observeDOM();
}

/* ===============================
   DEV ENTRY
================================ */
if (typeof __MAXX_DEV__ !== "undefined") {
    window.__MAXX_DEV_ENTRY__ = closeTicket;
}