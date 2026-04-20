export default {
    name: "offense-masker module",
    // module-id: b2ZmZW5zZS1tYXNrZXIgbW9kdWxl

    enabled: true,

    match: ["*://*.vnpt.vn/console/qradar/*"],

    exclude: [],

    runAt: "document-end",

    iframe: true,
    frames: ["PAGE_SEM"],

    once: true,

    priority: 10,
};
