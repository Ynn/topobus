import { state } from '../state.js';
import { readTheme } from '../theme.js';

export function zForElement(kind, viewType) {
    if (viewType === 'group' || viewType === 'device') {
        if (kind === 'groupobject') return 10;
        if (kind === 'device') return 1;
        return 5;
    }
    if (kind === 'area') return 1;
    if (kind === 'line') return 2;
    if (kind === 'segment') return 2.5;
    return 3;
}

export function updateLinkStyles() {
    const { graph } = state;
    if (!graph) return;
    const theme = readTheme();
    graph.getLinks().forEach((link) => {
        applyLinkStyle(link, theme, false);
    });
}

export function applyLinkStyle(link, theme, highlighted) {
    const direction = link.get('linkDirection') || 'directed';
    const isAggregate = Boolean(link.get('isAggregate'));
    const preference = state.viewPreferences.linkStyle || 'auto';
    let isDirected = direction === 'directed';
    let visible = preference !== 'hidden';

    if (preference === 'neutral') {
        isDirected = false;
    } else if (preference === 'directed') {
        isDirected = true;
    }

    const strongHighlight = highlighted && state.currentView === 'group';
    const stroke = highlighted ? theme.accent : (isDirected ? theme.accent : theme.muted);
    const strokeWidth = strongHighlight ? 4.2 : (highlighted ? 3 : (isAggregate ? 2.2 : 1.6));
    const dash = strongHighlight ? '' : (isAggregate ? '' : (isDirected ? '6 4' : '2 6'));
    link.attr('line/stroke', stroke);
    link.attr('line/strokeWidth', strokeWidth);
    link.attr('line/strokeDasharray', dash);
    link.attr('line/strokeLinecap', strongHighlight ? 'round' : 'butt');
    link.attr('line/targetMarker', isAggregate ? { type: 'none' } : { type: 'path', d: '' });
    link.attr('line/opacity', strongHighlight ? 1 : (highlighted ? 0.9 : 0.65));
    link.attr('line/visibility', visible ? 'visible' : 'hidden');
}

export function applyElementStyle(element, theme, selected) {
    const kind = element.get('kind');
    if (kind === 'device' || kind === 'composite-device') {
        const props = element.get('nodeProps') || {};
        const isCoupler = String(props.is_coupler || '').toLowerCase() === 'true';
        const border = selected ? theme.accent : (isCoupler ? theme.couplerBorder : theme.deviceBorder);
        const fill = isCoupler ? theme.couplerFill : theme.deviceFill;
        const header = isCoupler ? theme.couplerHeader : theme.deviceHeader;
        element.attr('body/stroke', border);
        element.attr('body/strokeWidth', selected ? 3 : 2);
        element.attr('body/fill', fill);
        element.attr('header/fill', header);
        element.attr('headerMask/fill', header);
        return;
    }

    if (kind === 'groupobject' || kind === 'composite-object') {
        const isTx = element.get('isTransmitter');
        const isRx = element.get('isReceiver');
        const fill = isTx ? theme.objectFillTx : theme.objectFill;
        const addressColor = isTx ? theme.accent : (isRx ? theme.ink : theme.muted);
        element.attr('body/fill', fill);
        element.attr('body/stroke', selected ? theme.accent : theme.objectBorder);
        element.attr('body/strokeWidth', selected ? 2 : 1.5);
        element.attr('address/fill', addressColor);
        return;
    }

    if (kind === 'composite-main') {
        element.attr('body/fill', theme.areaFill);
        element.attr('body/stroke', selected ? theme.accent : theme.areaBorder);
        element.attr('body/strokeWidth', selected ? 2.6 : 2);
        element.attr('header/fill', theme.lineFill);
        return;
    }

    if (kind === 'composite-middle') {
        element.attr('body/fill', theme.lineFill);
        element.attr('body/stroke', selected ? theme.accent : theme.lineBorder);
        element.attr('body/strokeWidth', selected ? 2.2 : 1.6);
        element.attr('header/fill', theme.areaFill);
        return;
    }

    if (kind === 'composite-ga') {
        element.attr('body/fill', theme.objectFill);
        element.attr('body/stroke', selected ? theme.accent : theme.objectBorder);
        element.attr('body/strokeWidth', selected ? 2.2 : 1.4);
        element.attr('header/fill', theme.objectFillTx);
        return;
    }

    if (kind === 'building-space') {
        element.attr('body/fill', theme.areaFill);
        element.attr('body/stroke', selected ? theme.accent : theme.areaBorder);
        element.attr('body/strokeWidth', selected ? 2.4 : 1.6);
        element.attr('header/fill', theme.lineFill);
        return;
    }

    if (kind === 'area') {
        element.attr('body/stroke', selected ? theme.accent : theme.areaBorder);
        element.attr('body/strokeWidth', selected ? 3 : 2.5);
        return;
    }

    if (kind === 'line') {
        element.attr('body/stroke', selected ? theme.accent : theme.lineBorder);
        element.attr('body/strokeWidth', selected ? 2.6 : 2);
        return;
    }

    if (kind === 'segment') {
        element.attr('body/stroke', selected ? theme.accent : theme.lineBorder);
        element.attr('body/strokeWidth', selected ? 2.2 : 1.6);
        element.attr('body/fill', theme.lineFill);
        element.attr('header/fill', theme.areaFill);
        return;
    }
}

export function applySelectionStyles() {
    const { graph, selectedCellId } = state;
    if (!graph) return;
    const theme = readTheme();
    const elements = graph.getElements();
    const links = graph.getLinks();

    elements.forEach((element) => applyElementStyle(element, theme, false));
    links.forEach((link) => applyLinkStyle(link, theme, false));

    if (!selectedCellId) return;
    const selected = graph.getCell(selectedCellId);
    if (!selected) return;

    const kind = selected.get('kind');
    if ((kind === 'groupobject' || kind === 'composite-object') && state.groupSummaryMode) {
        const ga = selected.get('groupAddress');
        if (!ga) return;
        const deviceIds = new Set();
        elements.forEach((element) => {
            const eKind = element.get('kind');
            if ((eKind === 'groupobject' || eKind === 'composite-object') && element.get('groupAddress') === ga) {
                const parentId = element.get('parent');
                if (parentId) deviceIds.add(parentId);
            }
        });
        deviceIds.forEach((deviceId) => {
            const device = graph.getCell(deviceId);
            if (device) applyElementStyle(device, theme, true);
        });
        links.forEach((link) => {
            if (!link.get('isAggregate')) return;
            const sourceId = link.get('source') && link.get('source').id;
            const targetId = link.get('target') && link.get('target').id;
            if (deviceIds.has(sourceId) && deviceIds.has(targetId)) {
                applyLinkStyle(link, theme, true);
            }
        });
        return;
    }

    if (kind === 'groupobject' || kind === 'composite-object') {
        const ga = selected.get('groupAddress');
        const parentIds = new Set();
        elements.forEach((element) => {
            const eKind = element.get('kind');
            if ((eKind === 'groupobject' || eKind === 'composite-object') && element.get('groupAddress') === ga) {
                applyElementStyle(element, theme, true);
                const parentId = element.get('parent');
                if (parentId) parentIds.add(parentId);
            }
        });
        parentIds.forEach((parentId) => {
            const device = graph.getCell(parentId);
            if (device) applyElementStyle(device, theme, true);
        });
        links.forEach((link) => {
            if (link.get('groupAddress') === ga) {
                applyLinkStyle(link, theme, true);
            }
        });
        return;
    }

    if ((kind === 'device' || kind === 'composite-device') && state.groupSummaryMode) {
        applyElementStyle(selected, theme, true);
        const aggregateLinks = links.filter((link) => link.get('isAggregate'));
        if (!aggregateLinks.length) return;
        const adjacency = new Map();
        aggregateLinks.forEach((link) => {
            const sourceId = link.get('source') && link.get('source').id;
            const targetId = link.get('target') && link.get('target').id;
            if (!sourceId || !targetId) return;
            if (!adjacency.has(sourceId)) adjacency.set(sourceId, new Set());
            if (!adjacency.has(targetId)) adjacency.set(targetId, new Set());
            adjacency.get(sourceId).add(targetId);
            adjacency.get(targetId).add(sourceId);
        });
        const visited = new Set([selected.id]);
        const queue = [selected.id];
        while (queue.length) {
            const id = queue.shift();
            const neighbors = adjacency.get(id);
            if (!neighbors) continue;
            neighbors.forEach((next) => {
                if (!visited.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            });
        }
        visited.forEach((deviceId) => {
            const device = graph.getCell(deviceId);
            if (device) applyElementStyle(device, theme, true);
        });
        aggregateLinks.forEach((link) => {
            const sourceId = link.get('source') && link.get('source').id;
            const targetId = link.get('target') && link.get('target').id;
            if (visited.has(sourceId) && visited.has(targetId)) {
                applyLinkStyle(link, theme, true);
            }
        });
        return;
    }

    if ((kind === 'device' || kind === 'composite-device') && state.currentView === 'devices') {
        applyElementStyle(selected, theme, true);
        const adjacency = new Map();
        links.forEach((link) => {
            const sourceId = link.get('source') && link.get('source').id;
            const targetId = link.get('target') && link.get('target').id;
            if (!sourceId || !targetId) return;
            if (!adjacency.has(sourceId)) adjacency.set(sourceId, new Set());
            if (!adjacency.has(targetId)) adjacency.set(targetId, new Set());
            adjacency.get(sourceId).add(targetId);
            adjacency.get(targetId).add(sourceId);
        });
        const visited = new Set([selected.id]);
        const queue = [selected.id];
        while (queue.length) {
            const id = queue.shift();
            const neighbors = adjacency.get(id);
            if (!neighbors) continue;
            neighbors.forEach((next) => {
                if (!visited.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            });
        }
        visited.forEach((deviceId) => {
            const device = graph.getCell(deviceId);
            if (device) applyElementStyle(device, theme, true);
        });
        links.forEach((link) => {
            const sourceId = link.get('source') && link.get('source').id;
            const targetId = link.get('target') && link.get('target').id;
            if (visited.has(sourceId) && visited.has(targetId)) {
                applyLinkStyle(link, theme, true);
            }
        });
        return;
    }

    if (kind === 'device' || kind === 'composite-device') {
        applyElementStyle(selected, theme, true);
        const childIds = new Set();
        elements.forEach((element) => {
            if (element.get('parent') === selected.id) {
                childIds.add(element.id);
                applyElementStyle(element, theme, true);
            }
        });
        links.forEach((link) => {
            const sourceId = link.get('source') && link.get('source').id;
            const targetId = link.get('target') && link.get('target').id;
            if (childIds.has(sourceId) || childIds.has(targetId)) {
                applyLinkStyle(link, theme, true);
            }
        });
        return;
    }

    if (kind === 'composite-main' || kind === 'composite-middle' || kind === 'composite-ga') {
        applyElementStyle(selected, theme, true);
        return;
    }

    if (kind === 'building-space') {
        applyElementStyle(selected, theme, true);
        const seen = new Set([selected.id]);
        let updated = true;
        while (updated) {
            updated = false;
            elements.forEach((element) => {
                const parentId = element.get('parent');
                if (parentId && seen.has(parentId) && !seen.has(element.id)) {
                    seen.add(element.id);
                    applyElementStyle(element, theme, true);
                    updated = true;
                }
            });
        }
        return;
    }

    if (kind === 'area') {
        applyElementStyle(selected, theme, true);
        elements.forEach((element) => {
            if (element.get('parent') === selected.id) {
                applyElementStyle(element, theme, true);
                elements.forEach((child) => {
                    if (child.get('parent') === element.id) {
                        applyElementStyle(child, theme, true);
                    }
                });
            }
        });
        return;
    }

    if (kind === 'line') {
        applyElementStyle(selected, theme, true);
        elements.forEach((element) => {
            if (element.get('parent') === selected.id) {
                applyElementStyle(element, theme, true);
            }
        });
        return;
    }

    if (kind === 'segment') {
        applyElementStyle(selected, theme, true);
        elements.forEach((element) => {
            if (element.get('parent') === selected.id) {
                applyElementStyle(element, theme, true);
            }
        });
        return;
    }

    applyElementStyle(selected, theme, true);
}
