const NAV_EVENT = 'topobus:navigate';
let subscriberCount = 0;

export function requestNavigation(detail) {
    if (!detail || !detail.type) return;
    document.dispatchEvent(new CustomEvent(NAV_EVENT, { detail }));
    if (subscriberCount === 0 && typeof globalThis !== 'undefined' && typeof globalThis.topobusNavigate === 'function') {
        globalThis.topobusNavigate(detail);
    }
}

export function onNavigate(handler) {
    if (!handler) return () => {};
    const listener = (event) => {
        if (!event || !event.detail) return;
        handler(event.detail);
    };
    document.addEventListener(NAV_EVENT, listener);
    subscriberCount += 1;
    return () => {
        document.removeEventListener(NAV_EVENT, listener);
        subscriberCount = Math.max(0, subscriberCount - 1);
    };
}

export function initNavigationLinks() {
    if (typeof document === 'undefined') return;
    if (document.documentElement && document.documentElement.dataset.navBound === 'true') return;
    document.addEventListener('click', (event) => {
        const base = event.target instanceof Element ? event.target : event.target && event.target.parentElement ? event.target.parentElement : null;
        if (!base) return;
        const target = base.closest('[data-nav-kind][data-nav-value]');
        if (!target) return;
        const kind = target.dataset.navKind || '';
        const value = target.dataset.navValue || '';
        if (!kind || !value) return;
        if (kind === 'group-object') {
            const number = target.dataset.navNumber || '';
            const deviceAddress = target.dataset.navDevice || '';
            const groupAddress = target.dataset.navGroup || value;
            requestNavigation({
                type: 'group-object',
                number,
                deviceAddress,
                groupAddress
            });
            return;
        }
        requestNavigation({ type: kind, address: value });
    });
    if (document.documentElement) {
        document.documentElement.dataset.navBound = 'true';
    }
}
