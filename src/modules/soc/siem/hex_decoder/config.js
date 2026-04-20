export default {
	name: "hex-decoder module",
	// module-id: aGV4LWRlY29kZXIgbW9kdWxl

	enabled: true,

	match: ["*://*.vnpt.vn/console/qradar/*"],

	exclude: [],

	runAt: "document-end",

	iframe: true,

	once: true,

	priority: 10,

	selector: {
		iframeId: ["PAGE_EVENTVIEWER", "mainPage"],
		toolbarClass: ["shade"],
		eventViewerLogContainerClass: [".utf.text-wrap"],
		eventTableCells: ["#tableSection .grid.dashboard-grid tbody tr td"],
	},
};
