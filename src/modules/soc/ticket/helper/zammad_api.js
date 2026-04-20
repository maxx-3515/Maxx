/**
 * Zammad API helper
 * fetch wrapper with same-origin + CSRF
 */

export async function zammadFetch(url, options = {}) {
    const fullUrl = url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();

    const headers = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(options.headers || {}),
    };

    const res = await fetch(fullUrl, {
        method: options.method || "GET",
        credentials: "same-origin",
        headers,
        body: options.body,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(
            `[ZammadFetch] ${res.status} ${res.statusText}\n${text}`
        );
    }

    return res.json();
}
