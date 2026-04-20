/* =========================================================
   MAXX LOGGER HELPER
   ========================================================= */

export function createLogger(moduleName = "unknown", options = {}) {
	const PREFIX = `[MAXX][${moduleName}]`;

	function isActive() {
		// Ưu tiên explicit flag
		if (typeof options.active === "boolean") {
			return options.active;
		}

		// fallback DEV mode
		if (typeof __MAXX_DEV__ !== "undefined") {
			return true;
		}

		return false;
	}

	function base(style, label, ...args) {
		if (!isActive()) return;

		console.log(`%c${PREFIX} %c${label}`, "color:#9e9e9e;font-weight:bold", style, ...args);
	}

	return {
		log(...args) {
			base("color:#2196f3;font-weight:bold", "LOG", ...args);
		},
		warn(...args) {
			base("color:#ff9800;font-weight:bold", "WARN", ...args);
		},
		error(...args) {
			base("color:#f44336;font-weight:bold", "ERROR", ...args);
		},
	};
}
