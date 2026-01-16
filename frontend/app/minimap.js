import { state } from './state.js';
import { getDom } from './dom.js';
import { readTheme } from './theme.js';

export function setupMinimap() {
    const dom = getDom();
    if (!dom || !dom.minimap) return;
    dom.minimap.addEventListener('click', (event) => {
        if (!state.minimapState || !state.paper) return;
        const rect = dom.minimap.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const scale = state.minimapState.scale || 1;
        if (scale === 0) return;
        const worldX = (x - state.minimapState.offsetX) / scale;
        const worldY = (y - state.minimapState.offsetY) / scale;
        const s = state.paper.scale().sx || 1;
        const container = dom.paperContainer || dom.paper;
        const viewportWidth = container ? container.clientWidth : dom.paper.clientWidth;
        const viewportHeight = container ? container.clientHeight : dom.paper.clientHeight;
        const tx = -(worldX * s - viewportWidth / 2);
        const ty = -(worldY * s - viewportHeight / 2);
        state.paper.translate(tx, ty);
        scheduleMinimap();
    });
}

export function setMinimapEnabled(enabled, reason) {
    state.minimapDisabled = !enabled;
    const dom = getDom();
    if (!dom || !dom.minimap) return;
    const label = dom.minimapWrap ? dom.minimapWrap.querySelector('.minimap-label') : null;
    if (!enabled) {
        if (label) {
            label.textContent = reason ? `Minimap (${reason})` : 'Minimap (disabled)';
        }
        dom.minimap.style.display = 'none';
        state.minimapState = null;
        return;
    }
    if (label) {
        label.textContent = 'Minimap';
    }
    dom.minimap.style.display = 'block';
}

export function scheduleMinimap() {
    if (state.minimapDisabled) return;
    if (state.isLargeGraph) {
        if (state.minimapTimeout) return;
        state.minimapTimeout = setTimeout(() => {
            state.minimapTimeout = null;
            updateMinimap();
        }, 180);
        return;
    }
    if (state.minimapFrame) return;
    state.minimapFrame = requestAnimationFrame(() => {
        state.minimapFrame = null;
        updateMinimap();
    });
}

export function updateMinimap() {
    const dom = getDom();
    if (!dom || !dom.minimap || !state.graph || !state.paper) return;
    if (state.minimapDisabled) return;
    const ctx = dom.minimap.getContext('2d');
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    const width = dom.minimap.clientWidth;
    const height = dom.minimap.clientHeight;
    dom.minimap.width = Math.max(1, Math.round(width * ratio));
    dom.minimap.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const elements = state.graph.getElements();
    if (!elements.length) return;

    const bounds = computeGraphBounds(elements);
    if (!bounds) return;

    const padding = 6;
    const scale = Math.min(
        (width - padding * 2) / bounds.width,
        (height - padding * 2) / bounds.height
    );
    const offsetX = padding - bounds.x * scale;
    const offsetY = padding - bounds.y * scale;
    state.minimapState = { bounds, scale, offsetX, offsetY };

    elements.forEach(cell => {
        const kind = cell.get('kind');
        if (kind === 'groupobject' || kind === 'composite-object') return;
        const bbox = cell.getBBox();
        const x = bbox.x * scale + offsetX;
        const y = bbox.y * scale + offsetY;
        const w = Math.max(2, bbox.width * scale);
        const h = Math.max(2, bbox.height * scale);
        ctx.fillStyle = minimapColor(kind);
        ctx.fillRect(x, y, w, h);
    });

    const container = dom.paperContainer || dom.paper;
    const scalePaper = state.paper.scale().sx || 1;
    const t = state.paper.translate();
    const view = {
        x: -t.tx / scalePaper,
        y: -t.ty / scalePaper,
        width: (container ? container.clientWidth : dom.paper.clientWidth) / scalePaper,
        height: (container ? container.clientHeight : dom.paper.clientHeight) / scalePaper
    };
    const vx = view.x * scale + offsetX;
    const vy = view.y * scale + offsetY;
    const vw = view.width * scale;
    const vh = view.height * scale;
    ctx.strokeStyle = readTheme().accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);
}

function computeGraphBounds(elements) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    elements.forEach(cell => {
        if (cell.isLink && cell.isLink()) return;
        const kind = cell.get('kind');
        if (kind === 'groupobject' || kind === 'composite-object') return;
        const bbox = cell.getBBox();
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    });
    if (!isFinite(minX) || !isFinite(minY)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function minimapColor(kind) {
    if (kind === 'area') return '#0f172a';
    if (kind === 'line') return '#0f766e';
    if (kind === 'device') return '#b7791f';
    return '#94a3b8';
}
