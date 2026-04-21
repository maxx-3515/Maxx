export default {
    /* ==========================
            MODULE META
    ========================== */
    name: "quick-open-offenses module",
    // module-id: cXVpY2stb3Blbi1vZmZlbnNlcyBtb2R1bGU=
    enabled: true,
    match: ["*://*.vnpt.vn/console/qradar/*"],
    exclude: [],
    runAt: "document-end",

    iframe: true,
    frames: ["PAGE_SEM"],

    priority: 10,

    selector: {
        toolbarButtons: "#toolbarButtons",
        table: "#tableSection table#defaultTable",
        thead: "#tableSection table#defaultTable thead",
        tbody: "#tableSection table#defaultTable tbody",
        rows: "#tableSection table#defaultTable tbody tr",
        cell_offenseId: 'td[propertyname="offenseId"]',
        cell_startTime: 'td[propertyname="startTime"]',
        cell_description: 'td[propertyname="offenseDescription"]',
        cell_lastEventFlow: 'td[propertyname="domain"]',
    },

    defaultRules: {
        noise: [],
        important: [],
    },
};
