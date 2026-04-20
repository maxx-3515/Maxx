import config from "./config.js";

/* ==========================
   URL MATCH HELPER
========================== */
function isMatch(url, patterns = []) {
	if (!patterns || patterns.length === 0) return true;

	return patterns.some((p) => {
		const regex = new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
		return regex.test(url);
	});
}

/* ==========================
   TEXT TYPE DETECT
========================== */
function isIP(text) {
	return /^(\d{1,3}\.){3}\d{1,3}$/.test(text);
}

function isDomain(text) {
	return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text);
}

function isHash(text) {
	return /^[a-f0-9]{32}$/i.test(text) || /^[a-f0-9]{40}$/i.test(text) || /^[a-f0-9]{64}$/i.test(text);
}

/* ==========================
   MODULE
========================== */
export default function selectedSearch(ctx) {
	if (!config.enabled) return;

	const { engines, ui } = config;
	const url = ctx?.url || location.href;

	/* ==========================
	   STATE & CACHE
	========================== */
	let box = null;
	let initialized = false;
	let selectedText = "";
	let lastEngineKey = "";
	let scheduled = false;

	// cache engine theo text (rất hiệu quả)
	const engineCache = new Map();

	/* ==========================
	   LAZY INIT UI
	========================== */
	function ensureUI() {
		if (initialized) return;
		initialized = true;

		// style (inject once)
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

		// box
		box = document.createElement("div");
		box.className = "mx-search-box";
		document.body.appendChild(box);
	}

	/* ==========================
	   ENGINE FILTER (SMART + CACHE)
	========================== */
	function getActiveEngines(text) {
		if (engineCache.has(text)) {
			return engineCache.get(text);
		}

		const result = Object.values(engines)
			.filter((engine) => {
				// URL scope
				if (engine.match && !isMatch(url, engine.match)) return false;
				if (engine.exclude && isMatch(url, engine.exclude)) return false;

				// text condition
				if (typeof engine.condition === "function") {
					if (
						!engine.condition(text, {
							isIP,
							isDomain,
							isHash,
						})
					) {
						return false;
					}
				}
				return true;
			})
			.sort((a, b) => (b.priority || 0) - (a.priority || 0));

		engineCache.set(text, result);
		return result;
	}

	/* ==========================
	   RENDER BUTTONS (NO DOM CHURN)
	========================== */
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

	/* ==========================
	   SHOW / HIDE
	========================== */
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

	/* ==========================
	   SELECTION HANDLER (DEBOUNCED)
	========================== */
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

	/* ==========================
	   EVENTS
	========================== */
	document.addEventListener("mouseup", scheduleSelectionCheck);
	document.addEventListener("selectionchange", scheduleSelectionCheck);

	document.addEventListener("mousedown", (e) => {
		if (box && !box.contains(e.target)) hide();
	});
}
