export default {
	name: "selected-search module",
	// module-id: c2VsZWN0ZWQtc2VhcmNoIG1vZHVsZQ==

	enabled: true,

	match: ["*://*/*"],
	iframe: true,

	ui: {
		offsetX: 8,
		offsetY: -10,
		zIndex: 999999,
	},

	engines: {
		vt: {
			label: "VT",
			class: "mx-vt",
			priority: 100,

			url: (q) => `https://www.virustotal.com/gui/search/${q}`,

			match: ["*://*.vnpt.vn/*"],

			condition: (text, { isHash, isIP, isDomain }) => {
				return isHash(text) || isIP(text) || isDomain(text);
			},
		},

		google: {
			label: "G",
			class: "mx-google",
			priority: 10,

			url: (q) => `https://www.google.com/search?q=${q}`,

			match: ["*://*/*"],

			condition: () => true,
		},

		// AlienVault OTX engine
		otx: {
			label: "OTX",
			class: "mx-otx",
			priority: 90,

			url: (q, { isIP, isDomain, isHash }) => {
				if (isIP(q)) {
					return `https://otx.alienvault.com/indicator/ip/${q}`;
				}
				if (isDomain(q)) {
					return `https://otx.alienvault.com/indicator/domain/${q}`;
				}
				if (isHash(q)) {
					return `https://otx.alienvault.com/indicator/file/${q}`;
				}
				return `https://otx.alienvault.com/browse/global/indicators`;
			},

			match: ["*://*/*"],

			condition: (t, { isIP, isDomain, isHash }) => isIP(t) || isDomain(t) || isHash(t),
		},

		// Hybrid Analysis engine
		ha: {
			label: "HA",
			class: "mx-ha",
			priority: 85,
			url: (q) => `https://www.hybrid-analysis.com/search?query=${q}`,
			match: ["*://*/*"],
			condition: (t, { isHash }) => isHash(t),
		},

		// MalwareBazaar engine
		mb: {
			label: "MB",
			class: "mx-mb",
			priority: 80,
			url: (q) => `https://bazaar.abuse.ch/browse.php?search=${q}`,
			match: ["*://*/*"],
			condition: (t, { isHash }) => isHash(t),
		},

		// Whois Lookup engine
		whois: {
			label: "WHO",
			class: "mx-whois",
			priority: 40,
			url: (q) => `https://www.viewdns.info/whois/?domain=${q}`,
			match: ["*://*/*"],
			condition: (t, { isDomain }) => isDomain(t),
		},
	},
};
