import fs from "fs";
import path from "path";
import esbuild from "esbuild";

/* ===============================
   CONSTANTS
================================ */
const MODULE_ROOT = "./src/modules";
const DIST_DIR = "./dist";

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
   UTILS
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

/* ===============================
   READ CONFIG
================================ */
const configContent = fs.readFileSync(configFile, "utf8");
const moduleName = extractModuleName(configContent);
const moduleId = encodeBase64(moduleName);

/* ===============================
   USERSCRIPT META (DEV)
================================ */
const meta = `// ==UserScript==
// @name         MAXX [DEV] ${moduleName}
// @namespace    maxx-dev
// @version      0.0.0-dev
// @description  Dev build for module: ${moduleName}
// @author       Maxx
// @run-at       document-end
// @match        *://*/*
// @grant        none
// @charset      utf-8
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
    if (typeof run !== "function") {
        console.error("[MAXX DEV] Không tìm thấy export default function từ module!");
        return;
    }

    const isIframe = window.self !== window.top;
    
    // 1. AN TOÀN URL: Bọc try/catch chống lỗi Cross-Origin
    let url = location.href;
    try {
        if (isIframe) url = window.top.location.href;
    } catch (e) {
        // Rơi vào đây nếu iframe là của tên miền khác (X-Force, v.v..)
    }

    // 2. AN TOÀN FRAME ID: Fallback sang window.name nếu không lấy được ID
    let currentFrameId = "TOP_WINDOW";
    if (isIframe) {
        try {
            currentFrameId = siem.getSelfFrameId() || window.name || "UNKNOWN_FRAME";
        } catch (e) {
            currentFrameId = window.name || "CROSS_ORIGIN_FRAME";
        }
    }

    // --- BẮT ĐẦU LOG ---
    console.log(\`[MAXX DEV] ⏳ Đang kiểm tra module [\${config.name || "Unknown"}] tại frame: [\${currentFrameId}]\`);

    if (config?.match && !isMatch(url, config.match)) {
        console.log(\`[MAXX DEV] ❌ Bỏ qua [\${currentFrameId}]: URL không khớp.\`);
        return;
    }
    
    if (config?.exclude && isMatch(url, config.exclude)) {
        console.log(\`[MAXX DEV] ❌ Bỏ qua [\${currentFrameId}]: URL bị exclude.\`);
        return;
    }

    // BÍT KẼ HỞ: Kiểm tra frame cho MỌI môi trường (kể cả Top Window)
    if (Array.isArray(config?.frames)) {
        if (!config.frames.includes(currentFrameId)) {
            console.log(\`[MAXX DEV] ❌ Bỏ qua [\${currentFrameId}]: Chỉ được phép chạy ở [\${config.frames.join(', ')}]\`);
            return;
        }
    } else {
        // Fallback cho các module cũ chưa có config.frames
        if (config?.iframe === false && isIframe) {
            console.log(\`[MAXX DEV] ❌ Bỏ qua [\${currentFrameId}]: Không cho phép chạy trong iframe.\`);
            return;
        }
    }

    console.log(\`[MAXX DEV] ✅ THỎA MÃN! Khởi chạy module [\${config.name || "Unknown"}] tại frame: [\${currentFrameId}]\`);

    try {
        run({
            url,
            isIframe,
            env: "dev",
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
        console.error(\`[MAXX DEV] 💥 Module [\${config.name}] CRASH trong quá trình chạy:\`, err);
    }
}

if (document.readyState !== "loading") {
    runDev();
} else {
    window.addEventListener("DOMContentLoaded", runDev, { once: true });
}
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
		define: {
			__MAXX_DEV__: "true",
		},
		loader: {
			".css": "text",
		},
	})
	.then((result) => {
		const code = result.outputFiles[0].text;
		const outFile = path.join(DIST_DIR, `maxx.module.${modulePath.replace(/[\\/]/g, "_")}.user.js`);

		fs.writeFileSync(outFile, `${meta}\n${code}\n`, "utf8");

		console.log("🎯 Build module DEV thành công");
		console.log("📦 Module:", modulePath);
		console.log("📄 Output:", outFile);
	})
	.catch((err) => {
		console.error("❌ Build module lỗi:", err);
		process.exit(1);
	});
