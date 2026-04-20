import { default as config } from "./config.js";

export default function clearQueueTicketOpened(ctx) {
	if (!config.enabled) return;

	const BTN_ID = "MAXX_CLEAR_TASKS_OPENED";
	let observer = null;

	/* ===============================
	   STYLE
	================================ */

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

	/* ===============================
	   DEBUG HELPERS
	================================ */

	/* ===============================
	   CORE ACTION
	================================ */

	function clearTasksOpened() {
		const closeBtns = document.querySelectorAll(config.SELECTOR.CLOSE_TASK_BTN);

		if (closeBtns.length == 0) {
			return;
		}

		for (let i = 0; i < closeBtns.length; i++) {
			closeBtns[i].click();
		}
	}

	/* ===============================
	   INJECT BUTTON
	================================ */

	function injectCloseAllButton(menu) {
		if (!menu) return;
		if (menu.querySelector(`#${BTN_ID}`)) return;

		const btn = document.createElement("a");
		btn.id = BTN_ID;
		btn.className = "menu-item maxx-clear-tasks-opened";

		// icon
		const icon = document.createElement("span");
		icon.className = "maxx-icon-broom";
		icon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M15 16h4v2h-4zm0-8h7v2h-7zm0 4h6v2h-6zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3zM14 5h-3l-1-1H6L5 5H2v2h12z"/></svg>
        `;

		// text
		const text = document.createElement("span");
		text.className = "maxx-btn-text";
		text.textContent = "Clear Tasks Opened";

		btn.appendChild(icon);
		btn.appendChild(text);

		btn.addEventListener("click", clearTasksOpened);

		menu.appendChild(btn);
		injectStyles();
	}

	/* ===============================
	   OBSERVER
	================================ */

	function observeMenu() {
		if (observer) return;

		const run = () => {
			const menu = document.querySelector(config.SELECTOR.MENU);
			if (menu) {
				injectCloseAllButton(menu);
			}
		};

		run();

		observer = new MutationObserver(run);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	/* ===============================
	   INIT
	================================ */

	observeMenu();
}

/* ========================================================
   DEV ENTRY
========================================================= */
if (typeof __MAXX_DEV__ !== "undefined") {
	window.__MAXX_DEV_ENTRY__ = clearQueueTicketOpened;
}
