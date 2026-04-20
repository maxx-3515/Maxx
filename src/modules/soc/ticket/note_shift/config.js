export default {
	name: "test-module",
	// module-id: dGVzdC1tb2R1bGU=

	enabled: true,

	match: ["*://*.vnpt.vn/*ticket*"],

	exclude: [],

	runAt: "document-end",

	iframe: false,

	once: true,

	priority: 10,

	style: {
		btnNoteShift: {
			width: "180px",
			padding: "10px",
			backgroundColor: "#007bff",
			color: "#fff",
			border: "none",
			borderRadius: "4px",
			cursor: "pointer",
		},
		screenNoteShift: {
			position: "fixed",
			top: "0px",
			right: "0px",
			width: "1000px",
			height: "800px",
		},
	},

	api: {
		all_ticket: "/api/v1/ticket_overviews?view=all_ticket",
	},

	mapping: {
		STATE_LABEL: {
			mss: {
				new: "Mới",
				open: "Chưa xử lý",
				resolve: "Đã xử lý",
				inprocess: "Đang xử lý",
			},
			siem: {
				new: "Mới",
				open: "Chưa xử lý",
				inprocess: "Đang xử lý",
				"pending reminder": "Chờ xử lý",
				"pending close": "Chờ đóng",
				resolve: "Đã xử lý",
				closed: "Đã đóng",
				merged: "Gộp ticket",
			},
		},
		SPECIAL_ORG: {
			125: "VNPOST",
			132: "CIC",
			3: "ABBank",
		},
		CATEGORY_LABEL: {
			base: {
				"Scan Web": ["scan web", "lỗ hổng", "rà quét lỗ hổng", "scan port", "scan hệ thống website"],

				Bruteforce: ["bruteforce"],

				Command: ["command", "thực thi lệnh"],

				"Kata alert": ["kata"],

				"Change password": ["đổi mật khẩu"],

				Malware: ["mã độc", "malware"],

				"ngừng đẩy log": ["ngừng đẩy log"],

				"create file": ["tạo file", "create file"],

				"xác minh hành vi": ["xác minh hành vi"],
			},

			/**
			 * Target-specific overrides / extensions
			 * ưu tiên match trước base
			 */

			mss: {
				"lock acc": ["khóa tài khoản"],

				"create acc": ["tạo mới tài khoản", "create user"],
			},

			siem: {
				// hiện chưa có rule riêng cho siem
				// sau này thêm vào đây
			},
		},
	},
};
