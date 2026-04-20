export default {
	name: "log-prettier module",
	// module-id: bG9nLXByZXR0aWVyIG1vZHVsZQ==

	enabled: true,

	match: ["*://*.vnpt.vn/console/qradar/*"],
	exclude: [],

	runAt: "document-end",

	iframe: true,
	once: false,
	priority: 10,

	selector: {
		container: "div.binaryWidget",
		pre: "pre.utf",
	},

	/**
	 * =========================
	 * FORMAT RULES
	 * =========================
	 * - match(raw): boolean
	 * - format(raw): string
	 */
	formats: [
		{
			name: "sysmon-operational",

			match(raw) {
				return raw.includes("Microsoft-Windows-Sysmon/Operational");
			},

			format(raw) {
				return (
					raw
						/* =========================
                                    HEADER
                        ========================= */
						.replace(/^<\d+>.*?\s(?=\w+=)/, (m) => m + "\n\n")

						/* =========================
                                NORMALIZE
                        ========================= */
						.replace(/[\r\n\t]+/g, " ")

						/* =========================
                                KEY=VALUE
                        ========================= */
						.replace(/\s+(?=\w+=)/g, "\n")

						/* =========================
                                MESSAGE BLOCK
                        ========================= */
						.replace(
							/Message=([\s\S]*?)(?=\n[A-Z][a-zA-Z]+=?|$)/,
							(_, msg) =>
								"Message:\n" +
								msg
									.replace(/\s+(?=[A-Z][a-zA-Z]+:)/g, "\n  ")
									.replace(/:\s+/g, ": ")
									.replace(/\s+(?=Parent)/g, "\n  ")
						)

						/* =========================
                                COMMAND LINE
                        ========================= */
						.replace(/(CommandLine:)\s*(.+)/g, (_, k, v) => `${k}\n    ${v}`)
						.replace(/(ParentCommandLine:)\s*(.+)/g, (_, k, v) => `${k}\n    ${v}`)

						/* =========================
                                    HASHES
                        ========================= */
						.replace(
							/Hashes:\s*([^\n]+)/,
							(_, hashes) =>
								"Hashes:\n" +
								hashes
									.split(",")
									.map((h) => "  " + h.trim())
									.join("\n")
						)

						/* =========================
                            GROUP PARENT PROCESS
                        ========================= */
						.replace(/(ParentProcessGuid:[^\n]+)/, (m) => (m.includes("Parent Process:") ? m : "\nParent Process:\n  " + m))
						.replace(/(ParentProcessId:[^\n]+)/, "  $1")
						.replace(/(ParentImage:[^\n]+)/, "  $1")
						/* =========================
                                VISUAL HINTS
                        ========================= */
						.replace(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, "[IP:$&]")
						.replace(/(CommandLine:\n\s+)(.+)/g, (_, k, v) => `${k}▶ ${v}`)
						.replace(/([A-Z]:\\[^\s\n]+)/g, "📁 $1")
				);
			},
		},
	],
};
