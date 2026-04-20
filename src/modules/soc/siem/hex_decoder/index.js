// src/modules/soc/siem/hex_decoder/index.js

import config from "./config";

export default function runHexDecoderModule(ctx) {
    const sel = config.selector;

    function isAllowedIframe() {
        if (!sel.iframeId || !sel.iframeId.length) return false;
        const frame = window.frameElement;
        if (!frame || !frame.id) return false;
        return sel.iframeId.includes(frame.id);
    }

    if (!isAllowedIframe()) return;

    let enabled = false;
    // Map này bây giờ sẽ lưu trữ TextNode thay vì Element
    const ORIGINAL_TEXT = new Map(); 

    // --- Utils giữ nguyên hoặc tinh chỉnh nhẹ ---
    function isLikelyHex(str) {
        if (!str) return false;
        const s = str.trim();
        if (s.length < 12 || s.length % 2 !== 0) return false;
        if (!/^[0-9a-fA-F]+$/.test(s)) return false;
        if (/^[0-9]+$/.test(s)) return false;
        if (!/[a-fA-F]/.test(s)) return false;
        return true;
    }

    function isReadableText(str) {
        if (!str) return false;
        let printable = 0;
        for (const ch of str) {
            const c = ch.charCodeAt(0);
            if ((c >= 32 && c <= 126) || c === 10 || c === 13 || c === 9) {
                printable++;
            }
        }
        return printable / str.length > 0.7;
    }

    function hexToTextSmart(hex) {
        try {
            const bytes = hex.match(/.{1,2}/g).map((b) => parseInt(b, 16));
            let nullCount = 0;
            for (let i = 1; i < bytes.length; i += 2) {
                if (bytes[i] === 0x00) nullCount++;
            }
            if (nullCount / (bytes.length / 2) > 0.3) {
                const stripped = bytes.filter(b => b !== 0x00);
                return new TextDecoder("utf-8").decode(new Uint8Array(stripped));
            }
            return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
        } catch { return null; }
    }

    // Hàm mới: Duyệt tìm TextNode và xử lý
    function processNode(node) {
        const parentTag = node.parentElement?.tagName.toLowerCase();
        if (parentTag === 'script' || parentTag === 'style') return;

        const raw = node.nodeValue;
        if (!raw) return;

        // Tìm tất cả các cụm ký tự giống hex
        const hexChunks = raw.match(/[0-9a-fA-F]{12,}/g);
        if (!hexChunks) return;

        let replaced = raw;
        let changed = false;

        for (let hex of hexChunks) {
            // TỐI ƯU: Nếu độ dài lẻ, cắt bỏ ký tự cuối để hy vọng có được chuỗi hex hợp lệ
            if (hex.length % 2 !== 0) {
                hex = hex.substring(0, hex.length - 1);
            }

            if (!isLikelyHex(hex)) continue;

            let decoded = hexToTextSmart(hex);
            if (!decoded) continue;
            
            decoded = decoded.replace(/\u0000+/g, " ");
            if (decoded.includes("\uFFFD") || !isReadableText(decoded)) continue;

            // Thay thế chuỗi hex gốc (hoặc phần chẵn của nó) bằng văn bản đã decode
            replaced = replaced.replace(hex, decoded);
            changed = true;
        }

        if (changed) {
            ORIGINAL_TEXT.set(node, raw);
            node.nodeValue = replaced;
            if (node.parentElement) {
                node.parentElement.style.color = "#b00000";
                node.parentElement.style.fontWeight = "500";
            }
        }
    }

    function getTargets() {
        const elements = [];
        sel.eventViewerLogContainerClass?.forEach(s => {
            document.querySelectorAll(s).forEach(el => elements.push(el));
        });
        sel.eventTableCells?.forEach(s => {
            document.querySelectorAll(s).forEach(td => {
                td.querySelectorAll("span").forEach(sp => elements.push(sp));
            });
        });
        return elements;
    }

    function enableDecode() {
        getTargets().forEach((el) => {
            // Duyệt qua tất cả các con của element để tìm TextNode
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                if (!ORIGINAL_TEXT.has(node)) {
                    processNode(node);
                }
            }
        });
    }

    function disableDecode() {
        ORIGINAL_TEXT.forEach((original, node) => {
            node.nodeValue = original;
            if (node.parentElement) {
                node.parentElement.style.color = "";
                node.parentElement.style.fontWeight = "";
            }
        });
        ORIGINAL_TEXT.clear();
    }

    function toggle() {
        enabled = !enabled;
        enabled ? enableDecode() : disableDecode();
        updateButton();
    }

    // --- Phần Inject Button giữ nguyên ---
    let btn;
    function updateButton() {
        if (!btn) return;
        btn.style.background = enabled ? "#8b0000" : "";
        btn.style.color = enabled ? "#fff" : "";
    }

    function injectButton() {
        const shade = document.querySelector(".shade");
        if (!shade) return;
        const toolbar = shade.querySelector("#toolbarButtons");
        if (!toolbar || toolbar.querySelector(".mx-hex-decode-btn")) return;

        btn = document.createElement("div");
        btn.className = "mx-hex-decode-btn";
        btn.textContent = "Hex Decode";
        toolbar.style.display = "flex";
        btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            margin-left: 6px;
            border: 1px solid #888;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            user-select: none;
            order: 2;
        `;
        btn.addEventListener("click", toggle);
        toolbar.appendChild(btn);
    }

    injectButton();
}

if (typeof __MAXX_DEV__ !== "undefined") {
    window.__MAXX_DEV_ENTRY__ = runHexDecoderModule;
}