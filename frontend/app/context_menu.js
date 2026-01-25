let menuEl = null;
let cleanupBound = false;

function ensureMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.className = 'context-menu hidden';
    menuEl.setAttribute('role', 'menu');
    document.body.appendChild(menuEl);
    return menuEl;
}

function closeContextMenu() {
    if (!menuEl) return;
    menuEl.classList.add('hidden');
    menuEl.innerHTML = '';
}

function bindCleanupHandlers() {
    if (cleanupBound) return;
    cleanupBound = true;
    document.addEventListener('click', (event) => {
        if (!menuEl || menuEl.classList.contains('hidden')) return;
        if (!event || !event.target) return;
        if (menuEl.contains(event.target)) return;
        closeContextMenu();
    });
    document.addEventListener('contextmenu', (event) => {
        if (!menuEl || menuEl.classList.contains('hidden')) return;
        if (event && event.target && menuEl.contains(event.target)) return;
        if (event && event.defaultPrevented) return;
        closeContextMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (!event || event.key !== 'Escape') return;
        closeContextMenu();
    });
    window.addEventListener('resize', () => closeContextMenu());
    window.addEventListener('scroll', () => closeContextMenu(), true);
}

function positionMenu(x, y) {
    if (!menuEl) return;
    const padding = 8;
    const rect = menuEl.getBoundingClientRect();
    const width = rect.width || 220;
    const height = rect.height || 120;
    const maxX = window.innerWidth - width - padding;
    const maxY = window.innerHeight - height - padding;
    const left = Math.max(padding, Math.min(x, maxX));
    const top = Math.max(padding, Math.min(y, maxY));
    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
}

export function initContextMenu() {
    ensureMenu();
    bindCleanupHandlers();
}

export function openContextMenu(items, position) {
    if (!items || !items.length) return;
    ensureMenu();
    bindCleanupHandlers();
    menuEl.innerHTML = '';

    items.forEach((item) => {
        if (!item) return;
        if (item.type === 'separator') {
            const hr = document.createElement('div');
            hr.className = 'context-menu-separator';
            menuEl.appendChild(hr);
            return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'context-menu-item';
        button.textContent = item.label || '';
        if (item.disabled) {
            button.disabled = true;
        }
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeContextMenu();
            if (item.action) {
                item.action();
            }
        });
        menuEl.appendChild(button);
    });

    menuEl.classList.remove('hidden');
    const point = position || { x: 0, y: 0 };
    positionMenu(point.x, point.y);
}

export async function copyTextToClipboard(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (error) {
        // Fall back to execCommand below.
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    } catch (error) {
        return false;
    }
}

export function openWebSearch(query) {
    if (!query) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener');
}
