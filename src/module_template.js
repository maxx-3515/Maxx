/**
 * =========================================================
 * MAXX – STANDARD MODULE TEMPLATE
 * =========================================================
 * File: create-module.js
 *
 * Mục đích:
 * - Template chuẩn để phát triển module mới trong dự án MAXX
 * - Tuân thủ kiến trúc STATELESS
 * - An toàn iframe / tab
 * - Dễ copy & chỉnh sửa
 *
 * Cách dùng:
 * 1. Copy file này thành: src/modules/<scope>/<name>/index.js
 * 2. Tạo config.js tương ứng (xem phần CONFIG TEMPLATE bên dưới)
 * 3. Import & đăng ký vào registry.js
 */

/* =========================================================
   CONFIG TEMPLATE (tham khảo)
========================================================= */

/**
// src/modules/<scope>/<name>/config.js

export default {
  name: "example-module",
  // module-id: <base64>

  enabled: true,

  match: [],
  exclude: [],

  runAt: "document-end",

  iframe: true,      // true = cho phép chạy trong iframe
  once: false,       // true = chỉ init 1 lần (module tự quản)

  priority: 10,
};
*/

/* =========================================================
   MODULE IMPLEMENTATION TEMPLATE
========================================================= */

export default function runExampleModule(ctx) {
	/* =====================================================
	   1. BASIC GUARD
	===================================================== */

	// bật / tắt module từ config
	// if (!config.enabled) return;

	/* =====================================================
	   2. FRAME FILTER (OPTIONAL)
	===================================================== */

	// Nếu module CHỈ chạy trong 1 iframe cụ thể
	// const TARGET_FRAME = "PAGE_SEM";
	// if (!ctx.siem.isSelfFrame(TARGET_FRAME)) return;

	/* =====================================================
	   3. MODULE STATE (LOCAL ONLY)
	===================================================== */

	let initialized = false;
	let destroyed = false;

	/* =====================================================
	   4. CORE LOGIC
	===================================================== */

	function init() {
		if (initialized) return;
		initialized = true;

		// inject UI / observer / logic chính
		// ví dụ: injectButton(), observeTable(), ...
	}

	function onReEnter() {
		// iframe được hiển thị lại sau khi bị ẩn
		// dùng khi UI switch nhưng iframe không reload
	}

	function onLeave() {
		// iframe bị ẩn
		// cleanup observer nếu cần
	}

	function destroy() {
		if (destroyed) return;
		destroyed = true;

		// cleanup toàn bộ observer / event
	}

	/* =====================================================
	   5. VISIBILITY-DRIVEN ACTIVATION (RECOMMENDED)
	===================================================== */

	ctx.siem.onFrameVisibleChange((frameId, visible) => {
		// Nếu module không phụ thuộc iframe cụ thể → bỏ điều kiện frameId

		// Ví dụ module chỉ áp dụng cho 1 iframe
		// if (frameId !== TARGET_FRAME) return;

		if (visible) {
			if (!initialized) init();
			else onReEnter();
		} else {
			onLeave();
		}
	});

	/* =====================================================
	   6. OPTIONAL: TOP → IFRAME OPERATION VIA SCOPE
	===================================================== */

	// Dùng khi module chạy ở TOP nhưng cần thao tác DOM iframe
	// ctx.siem.scope("PAGE_SEM", { self: true }, ({ document }) => {
	//   // thao tác document iframe
	// });

	/* =====================================================
	   7. SAFETY CLEANUP
	===================================================== */

	window.addEventListener("beforeunload", destroy);
}

/* =========================================================
   DEV ENTRY (OPTIONAL)
========================================================= */

// Dùng khi build module đơn lẻ để test
// if (typeof __MAXX_DEV__ !== "undefined") {
// 	window.__MAXX_DEV_ENTRY__ = runExampleModule;
// }
