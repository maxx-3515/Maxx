/**
 * domapi helper – capture Pagecontrol safely
 * SIEM-safe: capture every time Pagecontrol is called
 */
export function hookDomapi(win, onTabSet) {
	if (!win || !win.domapi) return false;

	try {
		const domapi = win.domapi;

		/* ===== 1️⃣ BẮT PAGECONTROL ĐÃ TỒN TẠI ===== */
		for (const k in win) {
			const v = win[k];
			if (
				v &&
				typeof v === "object" &&
				typeof v.addPage === "function" &&
				typeof v.assignElement === "function" &&
				typeof v.setIndex === "function"
			) {
				onTabSet(v);
				return true;
			}
		}

		/* ===== 2️⃣ HOOK CHO PAGECONTROL TẠO SAU ===== */
		if (!domapi.__mx_hooked) {
			domapi.__mx_hooked = true;
			const orig = domapi.Pagecontrol;

			domapi.Pagecontrol = function (...args) {
				const pc = orig.apply(this, args);
				try {
					onTabSet(pc);
				} catch {}
				return pc;
			};
		}

		return true;
	} catch (e) {
		console.warn("[log-prettier] hookDomapi failed", e);
		return false;
	}
}
