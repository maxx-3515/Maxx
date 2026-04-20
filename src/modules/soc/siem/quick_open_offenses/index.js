import config from "./config.js";
import aqlMappingModule from "./aql_mapping.js";

/* =========================================================
   MODULE: QUICK OPEN OFFENSES (TÍCH HỢP AQL MAPPING)
========================================================= */

export default function quickOpenOffensesModule(ctx) {
    // 1. Chạy module AQL Mapping để khởi tạo API
    aqlMappingModule(ctx);

    if (!config.enabled) return;

    const DOMAIN_KEY = (location.hostname || "unknown").toLowerCase();
    const ST_MARKED_IDS = `MX_OF_MARKED_IDS_${DOMAIN_KEY}`;
    const STORAGE_MASKED_KEY = "MX_OFFENSE_MASKED_IDS";
    const S = config.selector;

    let offensesToOpen = [];

    function getMaxMaskedId() {
        try {
            const raw = localStorage.getItem(STORAGE_MASKED_KEY);
            if (raw) {
                const idArray = JSON.parse(raw);
                const ids = idArray.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
                if (ids.length > 0) return Math.max(...ids);
            }
        } catch (e) {}
        return -1;
    }

    function getFilterData() {
        try {
            const raw = localStorage.getItem(ST_MARKED_IDS);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return { noiseIds: [], importantIds: [] };
    }

    // Lấy text của cả dòng
    function getRowSearchText(tr) {
        const tds = tr.querySelectorAll("td");
        if (!tds || tds.length === 0) return "";
        return Array.from(tds)
            .map((td) => td.textContent || "")
            .join(" ")
            .replace(/\s+/g, " ");
    }

    // Tính EndTime siêu nhanh
    function calculateEndTimeOptimized(startTimeAbs, rawEndTimeAbs) {
        const now = Date.now();
        const timeSinceLastEvent = now - rawEndTimeAbs;

        if (timeSinceLastEvent < 30000) return now;

        const startDate = new Date(startTimeAbs);
        const nowDate = new Date(now);
        const isNotToday = startDate.toDateString() !== nowDate.toDateString();
        const duration = rawEndTimeAbs - startTimeAbs;

        if (isNotToday || duration > 86400000) {
            const endOfDay = new Date(startDate);
            endOfDay.setHours(23, 59, 59, 999);
            return endOfDay.getTime();
        }

        return rawEndTimeAbs + 60000;
    }

    // URL Fallback truyền thống
    function buildArielUrl(offenseId, startTimeAbs, endTimeAbs) {
        const innerUrl = `do/ariel/arielSearch?appName=EventViewer&pageId=EventList&dispatch=performSearch&values['searchoffense']=on&newSearch=true&values['timeRangeType']=absolute&values['sortBy']=StartTimeKey&values['offenseId']=EQ ${offenseId}&values['startTimeAbs']=${startTimeAbs}&values['endTimeAbs']=${endTimeAbs}`;
        return `qradar/jsp/ArielSearchWrapper.jsp?url=${encodeURIComponent(innerUrl)}`;
    }

    function scanAndBuildList(doc) {
        const maxMaskedId = getMaxMaskedId();
        const filterData = getFilterData();
        const noiseIds = filterData.noiseIds || [];
        const importantIds = filterData.importantIds || [];

        let tempList = [];

        doc.querySelectorAll(S.rows).forEach((tr) => {
            const cellId = tr.querySelector(S.cell_offenseId);
            if (!cellId) return;

            const oId = parseInt(cellId.textContent.trim(), 10).toString();
            if (isNaN(oId)) return;

            if (maxMaskedId > -1 && oId <= maxMaskedId) return;
            if (noiseIds.includes(oId)) return;

            const startAttr = tr.getAttribute("starttimeabs");
            const endAttr = tr.getAttribute("endtimeabs");

            let startTimeAbs = startAttr ? parseInt(startAttr, 10) : Date.now() - 86400000;
            let rawEndTimeAbs = endAttr ? parseInt(endAttr, 10) : Date.now();

            const finalEndTimeAbs = calculateEndTimeOptimized(startTimeAbs, rawEndTimeAbs);
            const rowText = getRowSearchText(tr);

            tempList.push({
                id: oId,
                idNum: parseInt(oId, 10),
                startTime: startTimeAbs,
                endTime: finalEndTimeAbs,
                isImportant: importantIds.includes(oId),
                rowText: rowText,
            });
        });

        tempList.sort((a, b) => a.idNum - b.idNum);

        offensesToOpen = tempList;
        updateButtonUI(doc);
    }

    function updateButtonUI(doc) {
        let btn = doc.getElementById("MX_QUICK_OPEN_BTN");
        const toolbar = doc.querySelector(S.toolbarButtons);

        if (!toolbar) return;

        if (!btn) {
            btn = doc.createElement("div");
            btn.id = "MX_QUICK_OPEN_BTN";
            btn.className = "DA_COMPONENT DA_SPEEDBUTTON";
            btn.style.display = "inline-flex";
            btn.style.alignItems = "center";
            btn.style.cursor = "pointer";
            btn.style.marginLeft = "8px";
            btn.style.padding = "2px 8px";
            btn.style.border = "1px solid #888";
            btn.style.borderRadius = "3px";
            btn.style.fontWeight = "bold";
            btn.style.userSelect = "none";
            btn.style.order = "3";

            btn.onmouseover = () => (btn.style.background = "rgba(0,0,0,0.08)");
            btn.onmouseout = () => (btn.style.background = "");

            btn.onclick = (e) => {
                e.stopPropagation();
                if (offensesToOpen.length === 0) {
                    alert("Hiện tại không có Offense nào cần mở!");
                    return;
                }

                let itemsToOpen = offensesToOpen;
                let isTruncated = false;
                let maxIdToMask = -1;

                if (offensesToOpen.length > 10) {
                    itemsToOpen = offensesToOpen.slice(0, 10);
                    isTruncated = true;
                    maxIdToMask = Math.max(...itemsToOpen.map((item) => item.idNum));
                }

                itemsToOpen.sort((a, b) => {
                    if (a.isImportant && !b.isImportant) return -1;
                    if (!a.isImportant && b.isImportant) return 1;
                    return a.idNum - b.idNum;
                });

                itemsToOpen.forEach((item) => {
                    let url;
                    const matchedRule = ctx.aqlAPI ? ctx.aqlAPI.findMatch(item.rowText) : null;

                    if (matchedRule) {
                        // SỬA LỖI Ở ĐÂY: Truyền toàn bộ matchedRule thay vì matchedRule.selectQuery
                        url = ctx.aqlAPI.generateUrl(item.id, item.startTime, item.endTime, matchedRule);
                    } else {
                        url = buildArielUrl(item.id, item.startTime, item.endTime);
                    }

                    window.open(url, "_blank");
                });

                if (isTruncated) {
                    const idToMaskStr = maxIdToMask.toString();
                    try {
                        const raw = localStorage.getItem(STORAGE_MASKED_KEY);
                        let maskedSet = raw ? new Set(JSON.parse(raw)) : new Set();
                        maskedSet.add(idToMaskStr);
                        localStorage.setItem(STORAGE_MASKED_KEY, JSON.stringify([...maskedSet]));
                    } catch (err) {
                        localStorage.setItem(STORAGE_MASKED_KEY, JSON.stringify([idToMaskStr]));
                    }
                    alert(`Đã mở 10 Offenses.\nOffense ID: ${idToMaskStr} đã được Mask làm mốc chuyển trang.`);
                }
            };

            toolbar.appendChild(btn);
        } else if (btn.parentElement !== toolbar) {
            toolbar.appendChild(btn);
        }

        btn.innerHTML = `<span style="padding-left:2px;">Open Events (${offensesToOpen.length})</span>`;
        btn.style.color = offensesToOpen.length > 0 ? "#15803d" : "#555";
        btn.style.borderColor = offensesToOpen.length > 0 ? "#15803d" : "#888";
    }

    function getTargetDocs() {
        const docs = [];
        if (ctx.siem && ctx.siem.scope) {
            ctx.siem.scope(ctx.siem.getSelfFrameId(), { self: true, children: true }, (fCtx) => {
                if (fCtx.document) docs.push(fCtx.document);
            });
        } else {
            docs.push(document);
        }
        return docs;
    }

    setInterval(() => {
        getTargetDocs().forEach((doc) => {
            const root = doc.querySelector(S.table);
            if (!root) return;

            if (offensesToOpen) updateButtonUI(doc);

            if (doc._mxQOObservedRoot !== root) {
                doc._mxQOObservedRoot = root;

                if (doc._mxQOObserver) doc._mxQOObserver.disconnect();

                scanAndBuildList(doc);

                doc._mxQOObserver = new MutationObserver(() => {
                    if (doc._mxQOTimer) clearTimeout(doc._mxQOTimer);
                    doc._mxQOTimer = setTimeout(() => {
                        scanAndBuildList(doc);
                    }, 250);
                });

                doc._mxQOObserver.observe(root, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["class"],
                });

                // Tính năng mở nhanh bằng Alt + Click
                root.addEventListener("click", (e) => {
                    if (!e.altKey) return;

                    const tr = e.target.closest(S.rows);
                    if (!tr) return;

                    const cellId = tr.querySelector(S.cell_offenseId);
                    if (!cellId) return;

                    const oId = parseInt(cellId.textContent.trim(), 10).toString();
                    if (isNaN(oId)) return;

                    const startAttr = tr.getAttribute("starttimeabs");
                    const endAttr = tr.getAttribute("endtimeabs");

                    let startTimeAbs = startAttr ? parseInt(startAttr, 10) : Date.now() - 86400000;
                    let rawEndTimeAbs = endAttr ? parseInt(endAttr, 10) : Date.now();

                    const finalEndTimeAbs = calculateEndTimeOptimized(startTimeAbs, rawEndTimeAbs);
                    const rowText = getRowSearchText(tr);

                    let url;
                    const matchedRule = ctx.aqlAPI ? ctx.aqlAPI.findMatch(rowText) : null;

                    if (matchedRule) {
                        // SỬA LỖI Ở ĐÂY: Truyền toàn bộ matchedRule
                        url = ctx.aqlAPI.generateUrl(oId, startTimeAbs, finalEndTimeAbs, matchedRule);
                    } else {
                        url = buildArielUrl(oId, startTimeAbs, finalEndTimeAbs);
                    }

                    window.open(url, "_blank");

                    e.preventDefault();
                    e.stopPropagation();
                });
            }
        });
    }, 1000);
}

if (typeof __MAXX_DEV__ !== "undefined") {
    window.__MAXX_DEV_ENTRY__ = quickOpenOffensesModule;
}
