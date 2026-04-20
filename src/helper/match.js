export function wildcardToRegExp(pattern) {
	return new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
}

export function isMatch(url, patterns = []) {
	return patterns.some((p) => wildcardToRegExp(p).test(url));
}
