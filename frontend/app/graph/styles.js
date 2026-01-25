import { state } from '../state.js';
import { readTheme } from '../theme.js';
import { stateManager } from '../state_manager.js';

const highlightedElements = new Set();
const highlightedLinks = new Set();

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
    const summaryHighlight = highlighted && state.groupSummaryMode && isAggregate;
    const stroke = summaryHighlight ? (theme.accentStrong || theme.accent)
        : (highlighted ? theme.accent : (isDirected ? theme.accent : theme.muted));
    const strokeWidth = summaryHighlight ? 5.2 : (strongHighlight ? 4.2 : (highlighted ? 3 : (isAggregate ? 2.2 : 1.6)));
    const dash = summaryHighlight ? '' : (strongHighlight ? '' : (isAggregate ? '' : (isDirected ? '6 4' : '2 6')));
    link.attr('line/stroke', stroke);
    link.attr('line/strokeWidth', strokeWidth);
    link.attr('line/strokeDasharray', dash);
    link.attr('line/strokeLinecap', (strongHighlight || summaryHighlight) ? 'round' : 'butt');
    link.attr('line/targetMarker', isAggregate ? { type: 'none' } : { type: 'path', d: '' });
    link.attr('line/opacity', summaryHighlight ? 1 : (strongHighlight ? 1 : (highlighted ? 0.9 : 0.65)));
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
        const addressColor = theme.ink;
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
        element.attr('label/fill', theme.ink);
        return;
    }

    if (kind === 'composite-middle') {
        element.attr('body/fill', theme.lineFill);
        element.attr('body/stroke', selected ? theme.accent : theme.lineBorder);
        element.attr('body/strokeWidth', selected ? 2.2 : 1.6);
        element.attr('header/fill', theme.areaFill);
        element.attr('label/fill', theme.ink);
        return;
    }

    if (kind === 'composite-ga') {
        element.attr('body/fill', theme.objectFill);
        element.attr('body/stroke', selected ? theme.accent : theme.objectBorder);
        element.attr('body/strokeWidth', selected ? 2.2 : 1.4);
        element.attr('header/fill', theme.objectFillTx);
        element.attr('label/fill', theme.ink);
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
        element.attr('body/fill', theme.areaFill);
        element.attr('body/stroke', selected ? theme.accent : theme.areaBorder);
        element.attr('body/strokeWidth', selected ? 3 : 2.5);
        element.attr('header/fill', theme.lineFill);
        return;
    }

    if (kind === 'line') {
        element.attr('body/fill', theme.lineFill);
        element.attr('body/stroke', selected ? theme.accent : theme.lineBorder);
        element.attr('body/strokeWidth', selected ? 2.6 : 2);
        element.attr('header/fill', theme.areaFill);
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
    resetHighlights(theme);

    if (!selectedCellId) return;
    const selected = graph.getCell(selectedCellId);
    if (!selected) return;

    const idx = state.selectionIndex || {};
    const kind = selected.get('kind');
    const markElement = (element) => {
        if (!element) return;
        applyElementStyle(element, theme, true);
        highlightedElements.add(element);
    };
    const markLink = (link) => {
        if (!link) return;
        applyLinkStyle(link, theme, true);
        highlightedLinks.add(link);
    };

    if ((kind === 'groupobject' || kind === 'composite-object') && state.groupSummaryMode) {
        const ga = selected.get('groupAddress');
        const deviceIds = idx.devicesByGa ? idx.devicesByGa.get(ga) : null;
        if (deviceIds) {
            deviceIds.forEach((deviceId) => markElement(graph.getCell(deviceId)));
        }
        if (idx.aggregateLinks && deviceIds) {
            idx.aggregateLinks.forEach((link) => {
                const sourceId = link.get('source') && link.get('source').id;
                const targetId = link.get('target') && link.get('target').id;
                if (deviceIds.has(sourceId) && deviceIds.has(targetId)) {
                    markLink(link);
                }
            });
        }
        return;
    }

    if (kind === 'groupobject' || kind === 'composite-object') {
        const ga = selected.get('groupAddress');
        const objects = idx.groupObjectsByGa ? idx.groupObjectsByGa.get(ga) : null;
        if (objects) {
            objects.forEach((obj) => markElement(obj));
        } else {
            markElement(selected);
        }
        const deviceIds = idx.devicesByGa ? idx.devicesByGa.get(ga) : null;
        if (deviceIds) {
            deviceIds.forEach((deviceId) => markElement(graph.getCell(deviceId)));
        }
        const links = idx.linksByGa ? idx.linksByGa.get(ga) : null;
        if (links) {
            links.forEach((link) => markLink(link));
        }
        return;
    }

    if ((kind === 'device' || kind === 'composite-device') && state.groupSummaryMode) {
        markElement(selected);
        const adjacency = idx.aggregateAdjacency || new Map();
        const direct = adjacency.get(selected.id) || new Set();
        const visited = new Set([selected.id, ...direct]);
        direct.forEach((deviceId) => markElement(graph.getCell(deviceId)));
        const links = idx.aggregateLinks || new Set();
        links.forEach((link) => {
            const sourceId = link.get('source') && link.get('source').id;
            const targetId = link.get('target') && link.get('target').id;
            const isDirect = (sourceId === selected.id && visited.has(targetId)) ||
                (targetId === selected.id && visited.has(sourceId));
            if (isDirect) {
                markLink(link);
            }
        });
        return;
    }

    if ((kind === 'device' || kind === 'composite-device') && state.currentView === 'devices') {
        markElement(selected);
        const adjacency = idx.deviceAdjacency || new Map();
        const visited = walkAdjacency(selected.id, adjacency);
        visited.forEach((deviceId) => markElement(graph.getCell(deviceId)));
        const linkSet = new Set();
        visited.forEach((deviceId) => {
            const links = idx.linksByEndpoint ? idx.linksByEndpoint.get(deviceId) : null;
            if (links) {
                links.forEach((link) => linkSet.add(link));
            }
        });
        linkSet.forEach((link) => {
            const sourceId = link.get('source') && link.get('source').id;
            const targetId = link.get('target') && link.get('target').id;
            if (visited.has(sourceId) && visited.has(targetId)) {
                markLink(link);
            }
        });
        return;
    }

    if (kind === 'device' || kind === 'composite-device') {
        markElement(selected);
        const childIds = idx.childrenByDevice ? idx.childrenByDevice.get(selected.id) : null;
        if (childIds) {
            childIds.forEach((childId) => {
                const child = graph.getCell(childId);
                if (child) markElement(child);
                const links = idx.linksByEndpoint ? idx.linksByEndpoint.get(childId) : null;
                if (links) {
                    links.forEach((link) => markLink(link));
                }
            });
        }
        return;
    }

    if (kind === 'composite-main' || kind === 'composite-middle' || kind === 'composite-ga') {
        markElement(selected);
        return;
    }

    if (kind === 'building-space') {
        markElement(selected);
        const descendants = walkTree(selected.id, idx.childTree);
        descendants.forEach((childId) => markElement(graph.getCell(childId)));
        return;
    }

    if (kind === 'area' || kind === 'line' || kind === 'segment') {
        markElement(selected);
        const descendants = walkTree(selected.id, idx.childTree);
        descendants.forEach((childId) => markElement(graph.getCell(childId)));
        return;
    }

    markElement(selected);
}

function resetHighlights(theme) {
    highlightedElements.forEach((element) => applyElementStyle(element, theme, false));
    highlightedLinks.forEach((link) => applyLinkStyle(link, theme, false));
    highlightedElements.clear();
    highlightedLinks.clear();
}

function walkAdjacency(startId, adjacency) {
    const visited = new Set();
    if (!startId) return visited;
    visited.add(startId);
    const queue = [startId];
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
    return visited;
}

function walkTree(rootId, childMap) {
    const visited = new Set();
    if (!rootId || !childMap) return visited;
    const queue = [rootId];
    while (queue.length) {
        const id = queue.shift();
        const children = childMap.get(id);
        if (!children) continue;
        children.forEach((childId) => {
            if (!visited.has(childId)) {
                visited.add(childId);
                queue.push(childId);
            }
        });
    }
    return visited;
}

function addToMapSet(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
}

export function rebuildSelectionIndex() {
    const { graph } = state;
    highlightedElements.clear();
    highlightedLinks.clear();
    if (!graph) {
        stateManager.setState('selectionIndex', null);
        return;
    }
    const idx = {
        groupObjectsByGa: new Map(),
        devicesByGa: new Map(),
        linksByGa: new Map(),
        childrenByDevice: new Map(),
        linksByEndpoint: new Map(),
        deviceAdjacency: new Map(),
        aggregateAdjacency: new Map(),
        aggregateLinks: new Set(),
        childTree: new Map()
    };

    const elements = graph.getElements();
    elements.forEach((el) => {
        const kind = el.get('kind');
        if (kind === 'groupobject' || kind === 'composite-object') {
            const ga = el.get('groupAddress');
            if (ga) {
                addToMapSet(idx.groupObjectsByGa, ga, el);
            }
            const parentId = el.get('parent');
            if (parentId) {
                addToMapSet(idx.childrenByDevice, parentId, el.id);
                if (ga) {
                    addToMapSet(idx.devicesByGa, ga, parentId);
                }
            }
        }
        const parentId = el.get('parent');
        if (parentId) {
            addToMapSet(idx.childTree, parentId, el.id);
        }
    });

    const links = graph.getLinks();
    links.forEach((link) => {
        const sourceId = link.get('source') && link.get('source').id;
        const targetId = link.get('target') && link.get('target').id;
        if (sourceId) addToMapSet(idx.linksByEndpoint, sourceId, link);
        if (targetId) addToMapSet(idx.linksByEndpoint, targetId, link);
        if (sourceId && targetId) {
            addToMapSet(idx.deviceAdjacency, sourceId, targetId);
            addToMapSet(idx.deviceAdjacency, targetId, sourceId);
        }
        if (link.get('isAggregate')) {
            idx.aggregateLinks.add(link);
            if (sourceId && targetId) {
                addToMapSet(idx.aggregateAdjacency, sourceId, targetId);
                addToMapSet(idx.aggregateAdjacency, targetId, sourceId);
            }
            return;
        }
        const ga = link.get('groupAddress');
        if (ga) {
            addToMapSet(idx.linksByGa, ga, link);
        }
    });

    stateManager.setState('selectionIndex', idx);
}
