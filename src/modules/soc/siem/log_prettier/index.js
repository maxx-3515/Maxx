import config from "./config";

const ICON_CLASS = "mx-log-format-icon";
const ICON_DATA = "data-mx-raw";
const STYLE_ID = "mx-log-prettier-style";

/* =========================
   STYLE
========================= */
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

/* =========================
   FORMAT RESOLVER
========================= */
function resolveFormat(raw) {
	for (const rule of config.formats || []) {
		try {
			if (rule.match(raw)) return rule.format(raw);
		} catch (e) {
			console.warn("[log-prettier]", rule.name, e);
		}
	}
	return null;
}

/* =========================
   ICON
========================= */
function createIcon(doc) {
	const icon = doc.createElement("span");
	icon.className = ICON_CLASS;

	const img = doc.createElement("img");
	img.src = "https://cdn-icons-png.flaticon.com/512/1828/1828911.png"; // reload icon
	img.alt = "format log";

	icon.appendChild(img);
	return icon;
}

/* =========================
   ATTACH
========================= */
function attach(pre) {
	if (!pre || pre.dataset.mxBound === "1") return;
	pre.dataset.mxBound = "1";

	const doc = pre.ownerDocument;

	// wrap pre nếu chưa có
	let wrap = pre.parentElement;
	if (!wrap.classList.contains("mx-log-wrap")) {
		wrap = doc.createElement("div");
		wrap.className = "mx-log-wrap";
		pre.parentNode.insertBefore(wrap, pre);
		wrap.appendChild(pre);
	}

	// tránh duplicate icon
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

/* =========================
   FIND PRE
========================= */
function findPre(doc) {
	const { container, pre } = config.selector;

	if (container) {
		const wrap = doc.querySelector(container);
		if (wrap) {
			const p = wrap.querySelector(pre || "pre");
			if (p) return p;
		}
	}

	return doc.querySelector("#GUID_6 pre, pre.utf, pre");
}

/* =========================
   OBSERVER
========================= */
function observe(doc) {
	const scan = () => {
		const pre = findPre(doc);
		if (pre) attach(pre);
	};

	scan();

	new MutationObserver(scan).observe(doc.body, {
		childList: true,
		subtree: true,
	});
}

/* =========================
   ENTRY
========================= */
export default function logPrettier() {
	try {
		const doc = document;
		if (!doc.body) return;

		injectStyle(doc);
		observe(doc);
	} catch {}
}
