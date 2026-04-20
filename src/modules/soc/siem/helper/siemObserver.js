/**
 * SIEM Observer Helper
 * - wait iframe
 * - wait iframe document
 * - watch element lifecycle
 */

/* ================= iframe ================= */

export function waitForIframe(targets, callback) {
	// 🔑 CASE 1: script đang chạy bên trong iframe target
	const fe = window.frameElement;
	if (fe && (targets.includes(fe.id) || targets.includes(fe.name))) {
		callback(fe);
		return;
	}

	// 🔑 CASE 2: script đang chạy ở top window
	const match = (iframe) => targets.includes(iframe.id) || targets.includes(iframe.name);

	const scan = () => {
		const iframes = document.querySelectorAll("iframe");
		for (const iframe of iframes) {
			if (match(iframe)) {
				callback(iframe);
				return true;
			}
		}
		return false;
	};

	if (scan()) return;

	const obs = new MutationObserver(() => {
		if (scan()) obs.disconnect();
	});

	obs.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});
}

/* ================= iframe document ================= */

export function waitForIframeDocument(iframe, callback) {
	const attach = () => {
		try {
			const doc = iframe.contentDocument;
			if (doc && doc.body) {
				callback(doc);
				return true;
			}
		} catch {}
		return false;
	};

	if (attach()) return;

	iframe.addEventListener("load", () => {
		attach();
	});
}

/* ================= element ================= */

export function watchElement(doc, selector, onChange) {
	let lastText = null;

	const scan = () => {
		const el = doc.querySelector(selector);
		if (!el) return;

		const text = el.textContent || "";
		if (text === lastText) return;

		lastText = text;
		onChange(el, text);
	};

	scan();

	const obs = new MutationObserver(scan);
	obs.observe(doc.body, {
		childList: true,
		subtree: true,
		characterData: true,
	});

	return obs;
}
