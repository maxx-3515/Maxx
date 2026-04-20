export default {
	name: "clear-queue-ticket-opened module",
	// module-id: Y2xlYXItcXVldWUtdGlja2V0LW9wZW5lZCBtb2R1bGU=

	enabled: true,

	match: ["*://*.vnpt.vn/*ticket*"],

	exclude: [],

	runAt: "document-end",

	iframe: false,

	once: true,

	priority: 10,

	SELECTOR: {
		MENU: "div#navigation div.menu",
		TASKS_NAV: "div.tasks-navigation",
		CLOSE_TASK_BTN: ".nav-tab div.nav-tab-close",
		TASK_ITEM: ".nav-tab",
	},
};
