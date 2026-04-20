import fs from "fs";
import path from "path";
import esbuild from "esbuild";

/* ===============================
   CONSTANTS
================================ */
const MODULE_ROOT = "./src/modules";
const DIST_DIR = "./dist";
const MATCH_IMPORT = "./src/helper/match.js";
const SIEM_IMPORT = "./src/modules/soc/siem/helper/siem_frames.js";

const HOST_URL = "https://raw.githubusercontent.com/maxx-3515/Maxx/main/dist/";

/* ===============================
   CLI: Hỗ trợ cả dấu cách hoặc dấu phẩy
================================ */
const args = process.argv.slice(2);
let targetModules = [];

if (args.length === 0 || args[0] === "all") {
    console.log("🔍 Scanning all modules...");
    targetModules = ["soc/ticket/close_ticket", "soc/siem/hex_decoder"];
} else {
    targetModules = args
        .join(",")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/* ===============================
   UTILS
================================ */
const posix = (p) => {
    let rel = path.relative(process.cwd(), p).replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
};

/* ===============================
   GENERATE MULTI-HARNESS
================================ */
let harnessImports = `
import { isMatch } from "${posix(MATCH_IMPORT)}";
import * as siem from "${posix(SIEM_IMPORT)}";
`;

let moduleExecutionLogic = "";
let combinedNames = [];

targetModules.forEach((modPath, index) => {
    const entryFile = path.join(MODULE_ROOT, modPath, "index.js");
    const configFile = path.join(MODULE_ROOT, modPath, "config.js");

    if (!fs.existsSync(entryFile)) {
        console.warn(`⚠️  Bỏ qua: Không tìm thấy entry cho ${modPath}`);
        return;
    }

    const entryAlias = `module_entry_${index}`;
    const configAlias = `module_config_${index}`;

    harnessImports += `
import ${entryAlias} from "${posix(entryFile)}";
import ${configAlias} from "${posix(configFile)}";
`;

    moduleExecutionLogic += `
    // --- Execution for: ${modPath} ---
    (function() {
        const config = ${configAlias};
        const run = ${entryAlias};
        if (typeof run !== "function") return;

        const isIframe = window.self !== window.top;
        
        let url = location.href;
        try { if (isIframe) url = window.top.location.href; } catch(e) {}

        let currentFrameId = "TOP_WINDOW";
        if (isIframe) {
            try { currentFrameId = siem.getSelfFrameId() || window.name || "UNKNOWN"; } 
            catch(e) { currentFrameId = window.name || "CROSS_ORIGIN"; }
        }

        if (config?.enabled === false) return;
        
        if (config?.iframe === false && isIframe) return;
        
        if (config?.match && !isMatch(url, config.match)) return;
        if (config?.exclude && isMatch(url, config.exclude)) return;
        
        if (Array.isArray(config?.frames) && config.frames.length > 0) {
            if (!config.frames.includes(currentFrameId)) return;
        }

        console.log(\`[MAXX MULTI] ✅ Khởi chạy: [\${config.name || "${modPath}"}] tại [\${currentFrameId}]\`);
        
        try {
            run({
                url, isIframe, env: "dev",
                siem: {
                    getSelfFrameId: siem.getSelfFrameId,
                    isSelfFrame: siem.isSelfFrame,
                    isTopWindow: siem.isTopWindow,
                    onFrameVisibleChange: siem.onFrameVisibleChange,
                    getVisibleFrames: siem.getVisibleFrames,
                    scope: siem.scope,
                },
            });
        } catch (e) {
            console.error(\`[MAXX] Module ${modPath} error:\`, e);
        }
    })();
    `;

    // Lấy tên thư mục cuối cùng làm tên module ngắn gọn
    combinedNames.push(modPath.split("/").pop());
});

const finalHarness = `${harnessImports}\nfunction runAllDev() {\n${moduleExecutionLogic}\n}\nrunAllDev();`;

/* ===============================
   BUILD PROCESS
================================ */

// 1. Tạo tên file động từ các module (Ví dụ: maxx.close_ticket_hex_decoder.user.js)
const safeCombinedName = combinedNames.length > 0 ? combinedNames.join("_") : "bundle";
const outputFileName = `maxx.${safeCombinedName}.user.js`;

// 2. Tạo URL download/update dựa trên HOST_URL
const scriptDownloadUrl = `${HOST_URL}/${outputFileName}`;

// 3. Khởi tạo Metadata động
const meta = `// ==UserScript==
// @name         MAXX [${combinedNames.join(" + ")}]
// @namespace    maxx-dev
// @version      0.0.1
// @description  Build bao gồm: ${combinedNames.join(", ")}
// @run-at       document-end
// @match        *://*/*
// @grant        none
// @updateURL    ${scriptDownloadUrl}
// @downloadURL  ${scriptDownloadUrl}
// ==/UserScript==
`;

esbuild
    .build({
        stdin: {
            contents: finalHarness,
            resolveDir: process.cwd(),
            sourcefile: "maxx-multi-build.js",
            loader: "js",
        },
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        charset: "utf8",
        define: { __MAXX_DEV__: "true" },
        loader: { ".css": "text" },
    })
    .then((result) => {
        if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

        // Sử dụng tên file động đã tạo ở trên
        const outFile = path.join(DIST_DIR, outputFileName);
        fs.writeFileSync(outFile, meta + result.outputFiles[0].text);

        console.log(`\n🎯 Build SUCCESS! Gộp ${combinedNames.length} modules.`);
        console.log(`📦 Tên Userscript: MAXX [${combinedNames.join(" + ")}]`);
        console.log(`📄 Output: ${outFile}`);
        console.log(`🔗 Cập nhật tại: ${scriptDownloadUrl}`);
    })
    .catch((err) => {
        console.error("❌ Build failed:", err);
        process.exit(1);
    });
