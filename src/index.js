import registry from "./registry.js";
import { isMatch } from "./helper/match.js";

import * as siem from "./modules/soc/siem/helper/siem_frames.js";

/* =========================================================
   BOOTSTRAP (STATELESS)
========================================================= */

function bootstrap() {
    const isIframe = window.self !== window.top;
    
    // AN TOÀN URL: Chống lỗi Cross-Origin nếu lọt vào iframe ngoại lai
    let url = location.href;
    try {
        if (isIframe) url = window.top.location.href;
    } catch (e) {
        // Fallback mặc định giữ url của chính iframe đó
    }

    registry
        .filter(({ config }) => config.enabled)
        .sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0))
        .forEach(({ run, config }) => {
            
            /* ===============================
                URL MATCH
            ================================ */
            if (config.match && !isMatch(url, config.match)) return;
            if (config.exclude && isMatch(url, config.exclude)) return;

            /* ===============================
                IFRAME / FRAME GATE (BỌC THÉP TẠI ĐÂY)
            ================================ */
            // LUẬT MỚI: Nếu module có quy định mảng các frame (VD: frames: ["PAGE_SEM"])
            if (Array.isArray(config.frames)) {
                let currentFrameId = "TOP_WINDOW";
                if (isIframe) {
                    try {
                        currentFrameId = siem.getSelfFrameId() || window.name || "UNKNOWN_FRAME";
                    } catch (e) {
                        currentFrameId = window.name || "CROSS_ORIGIN_FRAME";
                    }
                }
                
                // Chặn đứng nếu frame hiện tại (kể cả Top Window) không nằm trong mảng cho phép
                if (!config.frames.includes(currentFrameId)) {
                    return; 
                }
            } 
            // LUẬT CŨ (Backward Compatibility): Dành cho module chưa có thuộc tính `frames`
            else {
                if (config.iframe === false && isIframe) return;
            }

            /* ===============================
                EXECUTE MODULE
            ================================ */
            try {
                run({
                    url,
                    isIframe,
                    env: typeof __MAXX_DEV__ !== "undefined" ? "dev" : "tampermonkey",

                    /* ===============================
                       SIEM CONTEXT (STATELESS)
                    ================================ */
                    siem: {
                        // iframe context
                        getSelfFrameId: siem.getSelfFrameId,
                        isSelfFrame: siem.isSelfFrame,
                        isTopWindow: siem.isTopWindow,

                        // iframe visibility
                        onFrameVisibleChange: siem.onFrameVisibleChange,
                        getVisibleFrames: siem.getVisibleFrames,

                        // traversal
                        scope: siem.scope,
                    },
                });
            } catch (e) {
                console.error(`❌ Module ${config.name} error`, e);
            }
        });
}

/* =========================================================
   DEV ENTRY (ONLY HERE)
========================================================= */

if (typeof __MAXX_DEV__ !== "undefined") {
    window.__MAXX_RUN_BOOTSTRAP__ = bootstrap;
}

/* =========================================================
   PROD ENTRY
========================================================= */

bootstrap();