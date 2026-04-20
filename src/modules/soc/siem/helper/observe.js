// src/helper/observe.js

const OBSERVER_MAP = new WeakMap();

/**
 * observeElement
 * - 1 target DOM chỉ có 1 MutationObserver
 * - Tự disconnect observer cũ nếu observe lại target khác
 * - Trả về observer để module chủ động quản lý
 */
export function observeElement(target, callback, options = {}) {
	if (!target) return null;

	// nếu target đã có observer → reuse
	const existing = OBSERVER_MAP.get(target);
	if (existing) return existing;

	const observer = new MutationObserver((mutations) => {
		callback(mutations);
	});

	observer.observe(target, {
		childList: true,
		subtree: true,
		...options,
	});

	OBSERVER_MAP.set(target, observer);

	return observer;
}

/**
 * Optional helper: clear observer của 1 target
 */
export function disconnectObserver(target) {
	const obs = OBSERVER_MAP.get(target);
	if (obs) {
		obs.disconnect();
		OBSERVER_MAP.delete(target);
	}
}
