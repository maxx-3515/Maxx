import fs from "fs";
import path from "path";
import esbuild from "esbuild";

/* ===============================
   CONSTANTS
================================ */
const MODULE_ROOT = "./src/modules";
const DIST_DIR = "./dist";
const HOST_URL = "https://raw.githubusercontent.com/maxx-3515/Maxx/main/dist/";

/* ===============================
   CLI
================================ */
const modulePath = process.argv[2];

if (!modulePath) {
    console.error("❌ Usage: node tools/build_module.js <module-path>");
    process.exit(1);
}

/* ===============================
   PATH RESOLVE
================================ */
const moduleDir = path.join(MODULE_ROOT, modulePath);
const entryFile = path.join(moduleDir, "index.js");
const configFile = path.join(moduleDir, "config.js");

if (!fs.existsSync(entryFile) || !fs.existsSync(configFile)) {
    console.error("❌ Không tìm thấy module:", modulePath);
    process.exit(1);
}

/* ===============================
   UTILS & AUTO VERSIONING
================================ */
function encodeBase64(str) {
    return Buffer.from(str, "utf8").toString("base64");
}

function extractModuleName(content) {
    const match = content.match(/name\s*:\s*["'`](.+?)["'`]/);
    return match ? match[1].trim() : modulePath;
}

function posix(p) {
    let rel = path.relative(process.cwd(), p).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
}

// Hàm tự động sinh Version theo thời gian thực (Đảm bảo luôn tăng)
function generateAutoVersion() {
    const d = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    // Format: YYYY.MM.DD.HHMMSS (VD: 2026.4.20.143000)
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}.${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const buildVersion = generateAutoVersion(); // <--- GỌI HÀM LẤY VERSION TẠI ĐÂY

/* ===============================
   READ CONFIG & SETUP NAMES
================================ */
const configContent = fs.readFileSync(configFile, "utf8");
const moduleName = extractModuleName(configContent);
const moduleId = encodeBase64(moduleName);

const safePathName = modulePath.replace(/[\\/]/g, "_");
const outputFileName = `maxx.module.${safePathName}.user.js`;

const cleanHostUrl = HOST_URL.replace(/\/$/, "");
const scriptDownloadUrl = `${cleanHostUrl}/${outputFileName}`;

/* ===============================
   USERSCRIPT META (DEV)
================================ */
// Chèn biến ${buildVersion} vào mục @version
const meta = `// ==UserScript==
// @name         MAXX [DEV] ${moduleName}
// @namespace    maxx-dev
// @version      ${buildVersion} 
// @description  Dev build for module: ${moduleName}
// @author       Maxx
// @run-at       document-end
// @match        *://*/*
// @grant        none
// @charset      utf-8
// @updateURL    ${scriptDownloadUrl}
// @downloadURL  ${scriptDownloadUrl}
// ==/UserScript==

// module: ${moduleName} | ${moduleId}
`;

/* ===============================
   IMPORT PATHS
================================ */
const ENTRY_IMPORT = posix(entryFile);
const CONFIG_IMPORT = posix(configFile);
const MATCH_IMPORT = posix(path.join("src", "helper", "match.js"));
const SIEM_IMPORT = posix(path.join("src", "modules", "soc", "siem", "helper", "siem_frames.js"));

/* ===============================
   DEV HARNESS (STATELESS)
================================ */
const devHarness = `
import run from "${ENTRY_IMPORT}";
import config from "${CONFIG_IMPORT}";
import { isMatch } from "${MATCH_IMPORT}";
import * as siem from "${SIEM_IMPORT}";

function runDev() {
    if (typeof run !== "function") return;

    const isIframe = window.self !== window.top;
    
    let url = location.href;
    try { if (isIframe) url = window.top.location.href; } catch (e) {}

    let currentFrameId = "TOP_WINDOW";
    if (isIframe) {
        try { currentFrameId = siem.getSelfFrameId() || window.name || "UNKNOWN_FRAME"; } 
        catch (e) { currentFrameId = window.name || "CROSS_ORIGIN_FRAME"; }
    }

    if (config?.match && !isMatch(url, config.match)) return;
    if (config?.exclude && isMatch(url, config.exclude)) return;

    if (Array.isArray(config?.frames)) {
        if (!config.frames.includes(currentFrameId)) return;
    } else {
        if (config?.iframe === false && isIframe) return;
    }

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
    } catch (err) {
        console.error(\`[MAXX DEV] CRASH:\`, err);
    }
}

if (document.readyState !== "loading") runDev();
else window.addEventListener("DOMContentLoaded", runDev, { once: true });
`;

/* ===============================
   BUILD
================================ */
esbuild
    .build({
        stdin: {
            contents: devHarness,
            resolveDir: process.cwd(),
            sourcefile: "maxx-dev-harness.js",
            loader: "js",
        },
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        minify: false,
        keepNames: true,
        charset: "utf8",
        define: { __MAXX_DEV__: "true" },
        loader: { ".css": "text" },
    })
    .then((result) => {
        if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

        const code = result.outputFiles[0].text;
        const outFile = path.join(DIST_DIR, outputFileName);

        fs.writeFileSync(outFile, `${meta}\n${code}\n`, "utf8");

        console.log("🎯 Build module DEV thành công");
        console.log(`📦 Tên Userscript: MAXX [DEV] ${moduleName}`);
        console.log(`📌 Phiên bản: ${buildVersion}`); // <--- In ra console để theo dõi
        console.log(`📄 Output: ${outFile}`);
        console.log(`🔗 Cập nhật/Cài đặt tại: ${scriptDownloadUrl}`);
    })
    .catch((err) => {
        console.error("❌ Build module lỗi:", err);
        process.exit(1);
    });
