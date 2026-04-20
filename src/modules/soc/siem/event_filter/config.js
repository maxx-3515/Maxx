export default {
    name: "event-filter module",
    // module-id: ZXZlbnQtZmlsdGVyIG1vZHVsZQ==

    enabled: true,

    match: ["*://*.vnpt.vn/console/qradar/*"],
    exclude: [],

    runAt: "document-end",

    iframe: true,
    frames: ["PAGE_EVENTVIEWER", "mainPage"],
    once: true,
    priority: 10,

    /* =========================
     RULE SYSTEM
	========================= */

    ruleSchema: "event-filter@1.0",

    // localStorage key (runtime rules)
    ruleStorageKey: "MX_EVENT_FILTER_RULES_V1",

    // preset rule file (seed only)
    rulePreset: "./rules.preset.json",

    /* =========================
     SELECTORS
	========================= */

    selector: {
        toolbarButtons: ["#toolbarButtons"],
        table: "#tableSection .grid.dashboard-grid",
        eventTableRow: "#tableSection .grid.dashboard-grid tbody tr",
        eventTableCellData: "#tableSection .grid.dashboard-grid tbody tr td > span > span",
        eventTableCell: "#tableSection .grid.dashboard-grid tbody tr td",
    },
    textPattern: [],
};