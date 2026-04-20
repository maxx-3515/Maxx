export default {
	name: "test-module",
	// module-id: dGVzdC1tb2R1bGU=

	enabled: true, // 🔥 bật / tắt nhanh

	match: ["*://*.google.com/*", "*://localhost/*"],

	exclude: ["*://mail.google.com/*"],

	runAt: "document-end",
	// document-start | document-end | idle

	iframe: false,
	// false = chỉ chạy top window

	once: true,
	// true = chỉ chạy 1 lần / page

	priority: 10,
	// số lớn chạy trước (dùng khi tool phụ thuộc nhau)
};
