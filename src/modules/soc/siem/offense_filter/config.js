export default {
    /* ==========================
            MODULE META
    ========================== */
    name: "offense-filter module",
	// module-id: b2ZmZW5zZS1maWx0ZXIgbW9kdWxl
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
        cell_domain: "td[propertyname=\"domain\"]",
        cell_description: "td[propertyname=\"offenseDescription\"]",
        cell_offenseId: "td[propertyname=\"offenseId\"]"
    },
    
    defaultRules: {
        noise: [],
        important: []
    }
};