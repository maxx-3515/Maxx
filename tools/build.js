import fs from "fs";
import path from "path";
import esbuild from "esbuild";

/* ===============================
   CONSTANTS
================================ */
const META_FILE = "./dist/meta.js";
const OUTPUT_FILE = "./dist/maxx.user.js";
const ENTRY_FILE = "./src/index.js";
const MODULE_DIR = "./src/modules";

/* ===============================
   CLI OPTIONS
================================ */
const args = process.argv.slice(2);

// mặc định: KHÔNG tăng version
const SHOULD_BUMP_VERSION = args.includes("--bump") && !args.includes("--no-bump");

/* ===============================
   UTILS
================================ */
function encodeBase64(str) {
	return Buffer.from(str, "utf8").toString("base64");
}

function walk(dir, files = []) {
	for (const f of fs.readdirSync(dir)) {
		const p = path.join(dir, f);
		if (fs.statSync(p).isDirectory()) {
			walk(p, files);
		} else if (f === "config.js") {
			files.push(p);
		}
	}
	return files;
}

function extractModuleName(content) {
	const match = content.match(/name\s*:\s*["'`](.+?)["'`]\s*,?/);
	return match ? match[1].trim() : null;
}

/**
 * Patch base64 marker ngay dưới dòng `name:`
 */
function patchConfigWithBase64(configPath) {
	const content = fs.readFileSync(configPath, "utf8");
	const name = extractModuleName(content);
	if (!name) return;

	const b64 = encodeBase64(name);
	if (content.includes(b64)) return;

	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*name\s*:\s*["'`]/.test(lines[i])) {
			lines.splice(i + 1, 0, `\t// module-id: ${b64}`);
			break;
		}
	}

	fs.writeFileSync(configPath, lines.join("\n"), "utf8");
	console.log(`🧩 Patch module-id → ${configPath}`);
}

/* ===============================
   1) READ META
================================ */
let meta = fs.readFileSync(META_FILE, "utf8");

/* ===============================
   2) VERSION HANDLING (OPTIONAL)
================================ */
if (SHOULD_BUMP_VERSION) {
	const versionRegex = /@version\s+(\d+)\.(\d+)/;
	const match = meta.match(versionRegex);

	if (!match) {
		console.error("❌ Không tìm thấy @version trong metadata!");
		process.exit(1);
	}

	const major = Number(match[1]);
	const minor = Number(match[2]) + 1;
	const newVersion = `${major}.${minor}`;

	meta = meta.replace(versionRegex, `@version      ${newVersion}`);
	fs.writeFileSync(META_FILE, meta, "utf8");

	console.log(`🔼 Version bumped → ${newVersion}`);
} else {
	console.log("ℹ️  Skip version bump");
}

/* ===============================
   3) PATCH CONFIG + COLLECT META
================================ */
const moduleConfigs = walk(MODULE_DIR);
const moduleMetaLines = [];

for (const cfg of moduleConfigs) {
	const content = fs.readFileSync(cfg, "utf8");
	const name = extractModuleName(content);
	if (!name) continue;

	const b64 = encodeBase64(name);
	patchConfigWithBase64(cfg);
	moduleMetaLines.push(`// module: ${name} | ${b64}`);
}

/* ===============================
   4) BUILD WITH ESBUILD
================================ */
esbuild
	.build({
		entryPoints: [ENTRY_FILE],
		bundle: true,
		write: false,
		format: "iife",
		platform: "browser",
		charset: "utf8",
		minify: false,
		define: {
			__MAXX_DEV__: "undefined",
		},
		loader: {
			".css": "text",
		},
	})
	.then((result) => {
		const output = result.outputFiles[0].text;

		const metaLines = meta.split("\n");
		const endIndex = metaLines.findIndex((l) => l.includes("==/UserScript=="));

		if (endIndex !== -1) {
			const existing = metaLines.join("\n");
			const toInsert = moduleMetaLines.filter((line) => !existing.includes(line.split("|")[1].trim()));

			if (toInsert.length) {
				metaLines.splice(endIndex + 1, 0, "", ...toInsert);
			}
		}

		const finalOutput = `${metaLines.join("\n")}\n\n${output}\n`;
		fs.writeFileSync(OUTPUT_FILE, finalOutput, "utf8");

		console.log("🎉 Build PROD thành công → dist/maxx.user.js");
	})
	.catch((err) => {
		console.error("❌ Build lỗi:", err);
		process.exit(1);
	});
