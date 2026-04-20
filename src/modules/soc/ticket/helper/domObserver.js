/**
 * observeWhenVisible
 * @param {string} selector - CSS selector
 * @param {(el: HTMLElement) => void} callback
 * @param {Object} options
 */
export function observeWhenVisible(
    selector,
    callback,
    {
        root = document.body,
        debounce = 150,
        once = false,
        attributes = ["style", "class"],
    } = {}
) {
    let lastEl = null;
    let lastVisible = false;
    let timer = null;
    let stopped = false;

    function isVisible(el) {
        if (!el) return false;
        const style = getComputedStyle(el);
        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            el.offsetParent !== null
        );
    }

    function trigger(el) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (stopped) return;
            callback(el);
            if (once) observer.disconnect();
        }, debounce);
    }

    const observer = new MutationObserver(() => {
        if (stopped) return;

        const el = root.querySelector(selector);
        if (!el) {
            lastEl = null;
            lastVisible = false;
            return;
        }

        const visible = isVisible(el);

        // element mới (re-render)
        if (el !== lastEl) {
            lastEl = el;
            lastVisible = visible;
            if (visible) trigger(el);
            return;
        }

        // hidden → visible
        if (!lastVisible && visible) {
            lastVisible = true;
            trigger(el);
            return;
        }

        // đang visible và có mutation
        if (visible) {
            trigger(el);
        }
    });

    observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: attributes,
        characterData: true,
    });

    return {
        stop() {
            stopped = true;
            observer.disconnect();
            clearTimeout(timer);
        },
    };
}
