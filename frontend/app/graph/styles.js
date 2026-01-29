import { state } from '../state.js';
import { readTheme, getLayoutSettings } from '../theme.js';
import { updateGroupObjectText } from './layout.js';
import { stateManager } from '../state_manager.js';

const highlightedElements = new Set();
const highlightedLinks = new Set();
const dimmedElements = new Set();
const highlightedFrames = new Set();

export function zForElement(kind, viewType) {
    if (viewType === 'group' || viewType === 'device') {
        if (kind === 'groupobject') return 10;
        if (kind === 'groupobject-frame') return 6;
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
    if (link.get('linkScope') === 'group-device-ga') {
        const radius = highlighted ? 4 : 3;
        link.attr('line/sourceMarker', { type: 'circle', r: radius });
        link.attr('line/targetMarker', { type: 'circle', r: radius });
    } else {
        link.attr('line/sourceMarker', { type: 'none' });
        link.attr('line/targetMarker', isAggregate ? { type: 'none' } : { type: 'path', d: '' });
    }
    link.attr('line/opacity', summaryHighlight ? 1 : (strongHighlight ? 1 : (highlighted ? 0.9 : 0.65)));
    link.attr('line/visibility', visible ? 'visible' : 'hidden');

    const labelText = link.get('labelText') || link.get('groupAddress') || '';
    const showLabel = Boolean(labelText) && highlighted && state.currentView === 'group';
    if (showLabel) {
        const idx = Number(link.get('pairIndex') || 0);
        const count = Number(link.get('pairCount') || 1);
        const center = (count - 1) / 2;
        const labelOffset = (idx - center) * 10;
        const existing = link.labels();
        if (!existing || !existing.length || existing[0]?.attrs?.text?.text !== labelText) {
            link.labels([{
                position: 0.5,
                attrs: {
                    text: {
                        text: labelText,
                        fontSize: 10,
                        fontFamily: theme.fontMono,
                        fill: theme.ink,
                        dy: -8 + labelOffset
                    },
                    rect: {
                        fill: '#ffffff',
                        stroke: theme.accent,
                        strokeWidth: 0.5,
                        rx: 3,
                        ry: 3
                    }
                }
            }]);
        }
    } else if (link.labels().length) {
        link.labels([]);
    }
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
        const props = element.get('nodeProps') || {};
        const category = props.semantic_category != null ? String(props.semantic_category) : '';
        const peerCount = Number(element.get('gaPeerCount') || 0);
        const fill = category === 'no_communication'
            ? theme.objectFillNoC
            : (category === 'sending_and_transmit'
                ? theme.objectFillST
                : (category === 'sending_only'
                    ? theme.objectFillS
                    : (category === 'other'
                        ? theme.objectFillOther
                        : (() => {
                            // Backward compatible fallback (older exports)
                            const isTx = Boolean(element.get('isTransmitter'));
                            const flags = props.flags != null ? String(props.flags) : '';
                            const hasC = !flags ? true : flags.includes('C');
                            const hasT = flags.includes('T');
                            return !hasC
                                ? theme.objectFillNoC
                                : (isTx && hasT
                                    ? theme.objectFillST
                                    : (isTx
                                        ? theme.objectFillS
                                        : theme.objectFillOther));
                        })())));
        const finalFill = peerCount <= 1 ? (theme.objectFillIsolated || theme.objectFillNoC) : fill;
        const addressColor = selected ? (theme.accentStrong || theme.accent) : theme.ink;
        const nameColor = selected ? (theme.accentStrong || theme.accent) : theme.ink;
        element.attr('body/fill', finalFill);
        element.attr('body/stroke', selected ? theme.accent : theme.objectBorder);
        element.attr('body/strokeWidth', selected ? 2.4 : 1.5);
        element.attr('address/fill', addressColor);
        element.attr('name/fill', nameColor);
        element.attr('name/fontWeight', selected ? 700 : 600);
        element.attr('address/fontWeight', selected ? 800 : 700);
        element.attr('body/opacity', 1);
        element.attr('name/opacity', 1);
        element.attr('address/opacity', 1);
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
    const highlightRefs = new Set();
    const markElement = (element, options = {}) => {
        if (!element) return;
        applyElementStyle(element, theme, true);
        highlightedElements.add(element);
        const kind = element.get('kind');
        if (kind === 'groupobject' || kind === 'composite-object') {
            const props = element.get('nodeProps') || {};
            const ref = props.com_object_ref_id ? String(props.com_object_ref_id) : '';
            if (ref) highlightRefs.add(ref);
            if (!options.suppressTitle && element.get('hideTitle')) {
                element.set('forceTitle', true);
                const size = element.size ? element.size() : null;
                const width = size ? size.width : 0;
                updateGroupObjectText(element, width, getLayoutSettings());
            }
        }
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

    if (selected.isLink && selected.isLink() && state.groupSummaryMode) {
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
        highlightGroupAddress(ga, selected, idx, graph, theme, markElement, markLink);
        highlightFramesByRefs(graph, theme, highlightRefs);
        return;
    }

    if (selected.isLink && selected.isLink()) {
        const ga = selected.get('groupAddress');
        if (ga) {
            highlightGroupAddress(ga, selected, idx, graph, theme, markElement, markLink);
            highlightFramesByRefs(graph, theme, highlightRefs);
            return;
        }
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
            const gaSet = new Set();
            childIds.forEach((childId) => {
                const child = graph.getCell(childId);
                if (!child) return;
                const peerCount = Number(child.get('gaPeerCount') || 0);
                if (peerCount > 1) {
                    markElement(child, { suppressTitle: true });
                    const ga = child.get('groupAddress');
                    if (ga) gaSet.add(ga);
                } else {
                    applyDimStyle(child, theme);
                }
                const links = idx.linksByEndpoint ? idx.linksByEndpoint.get(childId) : null;
                if (links) {
                    links.forEach((link) => markLink(link));
                }
            });
            if (state.currentView === 'group' && gaSet.size) {
                gaSet.forEach((ga) => {
                    const links = idx.linksByGa ? idx.linksByGa.get(ga) : null;
                    if (links) {
                        links.forEach((link) => markLink(link));
                    }
                });
            }
        }
        highlightFramesByRefs(graph, theme, highlightRefs);
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
    highlightFramesByRefs(graph, theme, highlightRefs);
}

function resetHighlights(theme) {
    highlightedElements.forEach((element) => applyElementStyle(element, theme, false));
    highlightedLinks.forEach((link) => applyLinkStyle(link, theme, false));
    highlightedElements.clear();
    highlightedLinks.clear();
    dimmedElements.forEach((element) => applyElementStyle(element, theme, false));
    dimmedElements.clear();
    highlightedFrames.forEach((frame) => {
        frame.attr('body/stroke', theme.muted);
        frame.attr('body/strokeWidth', 1.2);
        frame.attr('body/fill', 'rgba(15, 23, 42, 0.12)');
    });
    highlightedFrames.clear();

    // Clear forced titles after selection is reset.
    if (state.graph) {
        state.graph.getElements().forEach((el) => {
            const kind = el.get('kind');
            if (kind !== 'groupobject' && kind !== 'composite-object') return;
            if (el.get('forceTitle')) {
                el.set('forceTitle', false);
                const size = el.size ? el.size() : null;
                const width = size ? size.width : 0;
                updateGroupObjectText(el, width, getLayoutSettings());
            }
        });
    }
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

function applyDimStyle(element, theme) {
    if (!element) return;
    const kind = element.get('kind');
    if (kind !== 'groupobject' && kind !== 'composite-object') return;
    element.attr('body/opacity', 0.22);
    element.attr('name/opacity', 0.35);
    element.attr('address/opacity', 0.35);
    element.attr('name/fill', theme.muted);
    element.attr('address/fill', theme.muted);
    element.attr('body/stroke', theme.border);
    element.attr('body/strokeWidth', 1.2);
    dimmedElements.add(element);
}

function highlightGroupAddress(ga, selected, idx, graph, theme, markElement, markLink) {
    if (!ga) {
        markElement(selected);
        return;
    }
    const selectedProps = selected && selected.get ? (selected.get('nodeProps') || {}) : {};
    const selectedRef = selectedProps.com_object_ref_id ? String(selectedProps.com_object_ref_id) : '';
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

    if (state.currentView === 'group' && !state.groupSummaryMode && idx.allGroupObjects) {
        idx.allGroupObjects.forEach((obj) => {
            if (!obj) return;
            const objGa = obj.get('groupAddress');
            if (objGa === ga) return;
            applyDimStyle(obj, theme);
        });
    }
}

function highlightFramesByRefs(graph, theme, refs) {
    if (!graph || !refs || !refs.size) return;
    graph.getElements().forEach((el) => {
        if (el.get('kind') !== 'groupobject-frame') return;
        const props = el.get('nodeProps') || {};
        const ref = props.com_object_ref_id ? String(props.com_object_ref_id) : '';
        if (ref && refs.has(ref)) {
            el.attr('body/stroke', theme.accent);
            el.attr('body/strokeWidth', 2.2);
            el.attr('body/fill', 'rgba(15, 23, 42, 0.2)');
            highlightedFrames.add(el);
        }
    });
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
        childTree: new Map(),
        allGroupObjects: new Set()
    };

    const elements = graph.getElements();
    elements.forEach((el) => {
        const kind = el.get('kind');
        if (kind === 'groupobject' || kind === 'composite-object') {
            idx.allGroupObjects.add(el);
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

    if (idx.allGroupObjects.size) {
        idx.allGroupObjects.forEach((obj) => {
            const ga = obj.get('groupAddress');
            const devices = ga ? idx.devicesByGa.get(ga) : null;
            const count = devices ? devices.size : 0;
            obj.set('gaPeerCount', count);
        });
    }

    stateManager.setState('selectionIndex', idx);
}
