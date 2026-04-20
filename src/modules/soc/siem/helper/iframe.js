// src/helper/iframe.js

export function isActiveIframe(expectedId) {
	const iframe = window.frameElement;
	if (!iframe) return false;

	if (expectedId) {
		return iframe.id === expectedId;
	}

	return true;
}
