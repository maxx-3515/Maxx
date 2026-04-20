/**
 * =========================================================
 * SIEM FRAMES HELPER – STATELESS VERSION
 * =========================================================
 *
 * Triết lý:
 * - Không lưu global state (no activeFrame)
 * - Không dùng storage (no cross-tab)
 * - Mỗi tab tự quan sát DOM của chính nó
 * - Iframe được hiển thị = điều kiện active duy nhất
 *
 * Cung cấp:
 * - Detect iframe visible / hidden
 * - Event khi iframe đổi trạng thái
 * - API xác định iframe hiện tại
 * - Scope traversal an toàn trong tab
 */

/* =========================================================
   CONSTANTS
========================================================= */

const SIEM_FRAMES = [
	"PAGE_DASHBOARD",
	"PAGE_SEM",
	"PAGE_EVENTVIEWER",
	"PAGE_ASSETS",
	"PAGE_REPORTS",
	"PAGE_ADMIN",
	"PAGE_REFERENCEDATAMANAGEMENT_1107",
	"PAGE_XFORCE_TIAPP_1301",
	"PAGE_QUSECASEMANAGERAPP_1855",
	"PAGE_LOGSOURCESTAB_2561",
	"mainPage",
];

/* =========================================================
   BASIC UTIL
========================================================= */

/** true nếu đang ở top window */
function isTopWindow() {
	return window.self === window.top;
}

/** id iframe hiện tại (nếu đang ở iframe) */
function getSelfFrameId() {
	return window.frameElement?.id || null;
}

/** document top (assume same-origin SIEM) */
function getTopDocument() {
	return window.top.document;
}

/** lấy iframe element theo id trong TOP */
function getIframeEl(frameId) {
	try {
		return getTopDocument().getElementById(frameId);
	} catch {
		return null;
	}
}

/** iframe được xem là visible? */
function isIframeVisible(frameId) {
	const iframe = getIframeEl(frameId);
	if (!iframe) return false;

	const style = getComputedStyle(iframe);
	if (style.display === "none" || style.visibility === "hidden") {
		return false;
	}

	return (iframe.offsetHeight || iframe.clientHeight || 0) > 0;
}

/* =========================================================
   FRAME VISIBILITY OBSERVER (CORE)
========================================================= */

let visibilityListeners = new Set();
let lastVisibilityMap = new Map();
let observerStarted = false;

/**
 * Start observing iframe visibility in THIS TAB
 * - dùng polling nhẹ + DOM truth
 */
function startFrameVisibilityObserver(interval = 300) {
	if (observerStarted) return;
	observerStarted = true;

	// init state
	SIEM_FRAMES.forEach((id) => {
		lastVisibilityMap.set(id, isIframeVisible(id));
	});

	setInterval(() => {
		SIEM_FRAMES.forEach((id) => {
			const visible = isIframeVisible(id);
			const prev = lastVisibilityMap.get(id);

			if (visible !== prev) {
				lastVisibilityMap.set(id, visible);

				visibilityListeners.forEach((cb) => {
					try {
						cb(id, visible);
					} catch (e) {
						console.error("[siem_frames] listener error", e);
					}
				});
			}
		});
	}, interval);
}

/**
 * Lắng nghe khi iframe visible / hidden
 *
 * callback(frameId: string, visible: boolean)
 */
function onFrameVisibleChange(cb) {
	startFrameVisibilityObserver();
	visibilityListeners.add(cb);

	return () => visibilityListeners.delete(cb);
}

/**
 * Danh sách iframe đang visible (tab hiện tại)
 */
function getVisibleFrames() {
	return SIEM_FRAMES.filter((id) => isIframeVisible(id));
}

/* =========================================================
   FRAME TREE & SCOPE
========================================================= */

/**
 * Traverse frame tree bắt đầu từ root window
 */
function walkFrames(win, depth = 0, out = []) {
	let doc;
	try {
		doc = win.document;
	} catch {
		return out;
	}

	const frameEl = win.frameElement || null;

	out.push({
		window: win,
		document: doc,
		frameElement: frameEl,
		id: frameEl?.id || null,
		depth,
	});

	for (let i = 0; i < win.frames.length; i++) {
		try {
			walkFrames(win.frames[i], depth + 1, out);
		} catch {}
	}

	return out;
}

/**
 * Lấy contentWindow của iframe rootId (trong tab hiện tại)
 */
function getRootWindow(rootId) {
	if (!rootId) return window.top;

	const iframe = getIframeEl(rootId);
	return iframe?.contentWindow || null;
}

/**
 * scope(rootFrameId, options, handler)
 *
 * options:
 *  - self: chạy trong chính iframe root
 *  - children: frame con trực tiếp
 *  - deep: đệ quy sâu
 *
 * MẶC ĐỊNH:
 *  { self: true, children: true, deep: true }
 */
function scope(rootId, options, handler) {
	if (typeof options === "function") {
		handler = options;
		options = {};
	}

	const opt = {
		self: true,
		children: true,
		deep: true,
		...options,
	};

	const rootWin = getRootWindow(rootId);
	if (!rootWin) return;

	const frames = walkFrames(rootWin);

	frames.forEach((ctx) => {
		const d = ctx.depth;

		if (d === 0 && !opt.self) return;
		if (d === 1 && !opt.children) return;
		if (d > 1 && !opt.deep) return;

		try {
			handler(ctx);
		} catch (e) {
			console.error("[siem_frames.scope] handler error", e);
		}
	});
}

/* =========================================================
   HELPER SHORTCUTS
========================================================= */

/** iframe hiện tại có đúng frameId không */
function isSelfFrame(frameId) {
	return getSelfFrameId() === frameId;
}

/* =========================================================
   EXPORT
========================================================= */

export {
	// context
	isTopWindow,
	getSelfFrameId,
	isSelfFrame,

	// visibility
	onFrameVisibleChange,
	getVisibleFrames,

	// scope
	scope,
};
