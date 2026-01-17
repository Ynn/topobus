import { state } from '../state.js';
import { getDom } from '../dom.js';
import { getLayoutSettings, readTheme } from '../theme.js';
import { syncPaperToContent } from '../interactions.js';
import {
    compareGroupAddressNodes,
    compareIndividualAddress,
    compareLabelNumber,
    fitTextToWidth,
    formatDeviceName,
    getNodeProp,
    measureTextWidth
} from '../utils.js';

let cachedElk = null;

export function layoutGroupView(nodes, elementsById) {
    const elk = getElkInstance();
    const shouldUseElk = Boolean(elk);
    const deviceNodes = nodes
        .filter(n => n.kind === 'device')
        .sort((a, b) => compareIndividualAddress(a, b));
    const childrenByParent = new Map();

    nodes.forEach(node => {
        if (node.parent_id) {
            if (!childrenByParent.has(node.parent_id)) {
                childrenByParent.set(node.parent_id, []);
            }
            childrenByParent.get(node.parent_id).push(node);
        }
    });
    childrenByParent.forEach((children) => {
        children.sort((a, b) => compareGroupAddressNodes(a, b));
    });

    const dom = getDom();
    const width = (dom && dom.paper ? dom.paper.clientWidth : 0) || 1200;
    const settings = getLayoutSettings();
    const sideGap = Math.max(24, Math.round(settings.columnGap * 0.5));

    const layouts = deviceNodes.map(node => {
        const children = childrenByParent.get(node.id) || [];
        const rows = children.length;
        const deviceWidth = computeGroupDeviceWidth(node, children, settings);
        const height = settings.headerHeight + settings.padding +
            rows * settings.rowHeight + Math.max(0, rows - 1) * settings.rowGap;
        return { node, children, width: deviceWidth, height };
    });

    const maxDeviceWidth = layouts.reduce((max, item) => Math.max(max, item.width), settings.deviceMinWidth);
    const columns = Math.max(1, Math.floor(width / (maxDeviceWidth + settings.columnGap)));
    const columnHeights = new Array(columns).fill(settings.topGap);

    layouts.forEach(layout => {
        let col = 0;
        let minHeight = columnHeights[0];
        columnHeights.forEach((value, index) => {
            if (value < minHeight) {
                minHeight = value;
                col = index;
            }
        });
        const x = sideGap + col * (maxDeviceWidth + settings.columnGap);
        const y = minHeight;
        layout.x = x;
        layout.y = y;
        columnHeights[col] += layout.height + settings.columnGap;
    });

    applyGroupLayouts(layouts, elementsById, settings);

    if (shouldUseElk && deviceNodes.length > 1) {
        scheduleElkGroupLayout(layouts, nodes, deviceNodes, elementsById, settings);
    }
}

function applyGroupLayouts(layouts, elementsById, settings) {
    layouts.forEach(layout => {
        const deviceEl = elementsById.get(layout.node.id);
        if (!deviceEl) return;
        deviceEl.resize(layout.width, layout.height);
        deviceEl.position(layout.x, layout.y);
        updateDeviceText(deviceEl, layout.width, settings);

        let yCursor = layout.y + settings.headerHeight;
        layout.children.forEach((child) => {
            const childEl = elementsById.get(child.id);
            if (!childEl) return;
            const childWidth = layout.width - settings.padding * 2;
            childEl.resize(childWidth, settings.rowHeight);
            childEl.position(layout.x + settings.padding, yCursor);
            updateGroupObjectText(childEl, childWidth, settings);
            yCursor += settings.rowHeight + settings.rowGap;
        });

        layout.children.forEach(child => {
            const childEl = elementsById.get(child.id);
            if (childEl) {
                deviceEl.embed(childEl);
                childEl.set('expectedParent', deviceEl.id);
            }
        });
    });

    alignGroupLinks();
}

function getElkInstance() {
    if (cachedElk) return cachedElk;
    if (typeof window === 'undefined') return null;
    if (!window.ELK) return null;
    cachedElk = new window.ELK();
    return cachedElk;
}

function scheduleElkGroupLayout(layouts, nodes, deviceNodes, elementsById, settings) {
    const elk = getElkInstance();
    if (!elk) return;
    const graphData = state.currentGraphData;
    if (!graphData || !graphData.edges || !graphData.edges.length) return;

    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const deviceById = new Map(deviceNodes.map(node => [node.id, node]));
    const edges = buildDeviceEdges(graphData.edges, nodeById, deviceById);
    if (!edges.length) return;

    const token = (state.elkLayoutToken || 0) + 1;
    state.elkLayoutToken = token;

    const elkGraph = {
        id: 'knx-group-layout',
        layoutOptions: buildElkOptions(settings),
        children: layouts.map(layout => ({
            id: layout.node.id,
            width: layout.width,
            height: layout.height
        })),
        edges: edges.map((edge, index) => ({
            id: `elk-edge-${index}`,
            sources: [edge.source],
            targets: [edge.target]
        }))
    };

    elk.layout(elkGraph).then((result) => {
        if (!result || !result.children) return;
        if (state.elkLayoutToken !== token) return;
        if (state.currentView !== 'group') return;

        const positions = new Map(result.children.map(child => [child.id, child]));
        let minX = Infinity;
        let minY = Infinity;
        positions.forEach((child) => {
            minX = Math.min(minX, child.x || 0);
            minY = Math.min(minY, child.y || 0);
        });

        const offsetX = 40 - (isFinite(minX) ? minX : 0);
        const offsetY = 40 - (isFinite(minY) ? minY : 0);

        layouts.forEach(layout => {
            const pos = positions.get(layout.node.id);
            if (!pos) return;
            layout.x = Math.round((pos.x || 0) + offsetX);
            layout.y = Math.round((pos.y || 0) + offsetY);
        });

        if (state.graph && state.graph.startBatch) {
            state.graph.startBatch('elk-layout');
        }
        applyGroupLayouts(layouts, elementsById, settings);
        if (state.graph && state.graph.stopBatch) {
            state.graph.stopBatch('elk-layout');
        }
        syncPaperToContent({ resetView: false, normalizeOnScroll: false });
    }).catch((error) => {
        console.warn('ELK layout failed', error);
    });
}

function buildDeviceEdges(edges, nodeById, deviceById) {
    const edgeSet = new Set();
    edges.forEach((edge) => {
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        if (!sourceNode || !targetNode) return;
        const sourceDevice = resolveDeviceId(sourceNode);
        const targetDevice = resolveDeviceId(targetNode);
        if (!sourceDevice || !targetDevice || sourceDevice === targetDevice) return;

        const aNode = deviceById.get(sourceDevice);
        const bNode = deviceById.get(targetDevice);
        if (!aNode || !bNode) return;
        const order = compareIndividualAddress(aNode, bNode);
        const from = order <= 0 ? sourceDevice : targetDevice;
        const to = order <= 0 ? targetDevice : sourceDevice;
        edgeSet.add(`${from}->${to}`);
    });

    return Array.from(edgeSet).map((key) => {
        const parts = key.split('->');
        return { source: parts[0], target: parts[1] };
    });
}

function resolveDeviceId(node) {
    if (!node) return '';
    if (node.kind === 'device') return node.id;
    return node.parent_id || '';
}

function buildElkOptions(settings) {
    const nodeGap = Math.max(40, Math.round(settings.columnGap * 0.5));
    const layerGap = Math.max(80, Math.round(settings.columnGap));
    return {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.crossingMinimization.greedySwitch.activationThreshold': '0',
        'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.separateConnectedComponents': 'true',
        'elk.layered.compaction.connectedComponents': 'true',
        'elk.spacing.nodeNode': String(nodeGap),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGap)
    };
}

export function alignGroupLinks(cell) {
    const { graph } = state;
    if (!graph) return;
    let links = null;
    if (cell) {
        const linkSet = new Set(graph.getConnectedLinks(cell));
        if (cell.getEmbeddedCells) {
            cell.getEmbeddedCells().forEach((child) => {
                graph.getConnectedLinks(child).forEach((link) => linkSet.add(link));
            });
        }
        links = Array.from(linkSet);
    } else {
        links = graph.getLinks();
    }
    links.forEach(link => {
        const sourceId = link.get('source') && link.get('source').id;
        const targetId = link.get('target') && link.get('target').id;
        if (!sourceId || !targetId) return;
        const sourceCell = graph.getCell(sourceId);
        const targetCell = graph.getCell(targetId);
        if (!sourceCell || !targetCell) return;
        const sourceBox = sourceCell.getBBox();
        const targetBox = targetCell.getBBox();
        const sourceCenterX = sourceBox.x + sourceBox.width / 2;
        const targetCenterX = targetBox.x + targetBox.width / 2;
        if (targetCenterX >= sourceCenterX) {
            link.source({ id: sourceId, anchor: { name: 'right' } });
            link.target({ id: targetId, anchor: { name: 'left' } });
        } else {
            link.source({ id: sourceId, anchor: { name: 'left' } });
            link.target({ id: targetId, anchor: { name: 'right' } });
        }
    });
}

export function layoutTopologyView(nodes, elementsById) {
    const areaNodes = nodes
        .filter(n => n.kind === 'area')
        .sort((a, b) => compareLabelNumber(a.label, b.label));
    const lineNodes = nodes
        .filter(n => n.kind === 'line')
        .sort((a, b) => compareLabelNumber(a.label, b.label));
    const deviceNodes = nodes
        .filter(n => n.kind === 'device')
        .sort((a, b) => compareIndividualAddress(a, b));

    if (!areaNodes.length || !lineNodes.length) {
        layoutLooseDevices(deviceNodes, elementsById);
        return;
    }

    const linesByArea = new Map();
    lineNodes.forEach(line => {
        const parent = line.parent_id || 'root';
        if (!linesByArea.has(parent)) {
            linesByArea.set(parent, []);
        }
        linesByArea.get(parent).push(line);
    });

    linesByArea.forEach(lines => {
        lines.sort((a, b) => compareLabelNumber(a.label, b.label));
    });

    const devicesByLine = new Map();
    deviceNodes.forEach(device => {
        const parent = device.parent_id || 'root';
        if (!devicesByLine.has(parent)) {
            devicesByLine.set(parent, []);
        }
        devicesByLine.get(parent).push(device);
    });

    devicesByLine.forEach(list => {
        list.sort((a, b) => compareIndividualAddress(a, b));
    });

    const settings = getLayoutSettings();
    const maxDeviceWidth = computeTopologyDeviceWidth(deviceNodes, settings);
    const deviceSize = {
        width: maxDeviceWidth,
        height: settings.topologyDeviceHeight
    };
    const linePadding = settings.linePadding;
    const lineHeader = settings.lineHeader;
    const lineGap = settings.lineGap;
    const areaPadding = settings.areaPadding;
    const areaHeader = settings.areaHeader;
    const areaGap = settings.areaGap;
    const lineInnerGap = settings.lineInnerGap;

    const lineLayouts = new Map();
    lineNodes.forEach(line => {
        const devices = devicesByLine.get(line.id) || [];
        const cols = Math.max(1, Math.min(3, devices.length || 1));
        const rows = Math.ceil(devices.length / cols);
        const width = Math.max(
            Math.round(220 * settings.scale),
            linePadding * 2 + cols * deviceSize.width + (cols - 1) * lineInnerGap
        );
        const height = lineHeader + linePadding + rows * deviceSize.height + Math.max(0, rows - 1) * lineInnerGap;
        lineLayouts.set(line.id, { line, devices, width, height });
    });

    const areaLayouts = [];
    areaNodes.forEach(area => {
        const lines = linesByArea.get(area.id) || [];
        let width = 260;
        let height = areaHeader + areaPadding;
        lines.forEach(line => {
            const layout = lineLayouts.get(line.id);
            if (layout) {
                width = Math.max(width, layout.width + areaPadding * 2);
                height += layout.height + lineGap;
            }
        });
        areaLayouts.push({ area, lines, width, height });
    });

    const dom = getDom();
    const available = (dom && dom.paper ? dom.paper.clientWidth : 0) || 1200;
    const columns = Math.max(1, Math.floor(available / Math.max(480, Math.round(520 * settings.scale))));
    const columnHeights = new Array(columns).fill(settings.topGap);

    areaLayouts.forEach(layout => {
        let col = 0;
        let minHeight = columnHeights[0];
        columnHeights.forEach((value, index) => {
            if (value < minHeight) {
                minHeight = value;
                col = index;
            }
        });
        const x = 40 + col * (layout.width + areaGap);
        const y = minHeight;
        layout.x = x;
        layout.y = y;
        columnHeights[col] += layout.height + areaGap;
    });

    areaLayouts.forEach(layout => {
        const areaEl = elementsById.get(layout.area.id);
        if (!areaEl) return;
        areaEl.resize(layout.width, layout.height);
        areaEl.position(layout.x, layout.y);
        updateContainerLabel(areaEl, layout.width, settings, 'area');

        let yCursor = layout.y + areaHeader;
        layout.lines.forEach(line => {
            const lineLayout = lineLayouts.get(line.id);
            const lineEl = elementsById.get(line.id);
            if (!lineLayout || !lineEl) return;
            const x = layout.x + areaPadding;
            lineEl.resize(lineLayout.width, lineLayout.height);
            lineEl.position(x, yCursor);
            updateContainerLabel(lineEl, lineLayout.width, settings, 'line');
            yCursor += lineLayout.height + lineGap;

            const devices = lineLayout.devices;
            const cols = Math.max(1, Math.min(3, devices.length || 1));
            devices.forEach((device, index) => {
                const deviceEl = elementsById.get(device.id);
                if (!deviceEl) return;
                const row = Math.floor(index / cols);
                const col = index % cols;
                const dx = x + linePadding + col * (deviceSize.width + lineInnerGap);
                const dy = lineEl.position().y + lineHeader + row * (deviceSize.height + lineInnerGap);
                deviceEl.resize(deviceSize.width, deviceSize.height);
                deviceEl.position(dx, dy);
                updateDeviceText(deviceEl, deviceSize.width, settings);
                lineEl.embed(deviceEl);
                deviceEl.set('expectedParent', lineEl.id);
            });

            areaEl.embed(lineEl);
            lineEl.set('expectedParent', areaEl.id);
        });
    });
}

export function computeGroupDeviceWidth(node, children, settings) {
    const theme = readTheme();
    const address = getNodeProp(node, 'address', '');
    const name = formatDeviceName(node) || getNodeProp(node, 'name', node.label || '');
    const addressFont = `700 ${settings.headerFont.address}px ${theme.fontSans}`;
    const nameFont = `600 ${settings.headerFont.name}px ${theme.fontSans}`;

    let width = Math.max(
        measureTextWidth(address, addressFont),
        measureTextWidth(name, nameFont)
    ) + settings.padding * 2;

    const rowNameFont = `600 ${settings.rowFont.name}px ${theme.fontSans}`;
    const rowAddressFont = `700 ${settings.rowFont.address}px ${theme.fontMono}`;

    children.forEach((child) => {
        const objName = child.label || getNodeProp(child, 'object_name', '');
        const groupAddress = getNodeProp(child, 'group_address', '');
        const rowWidth = settings.padding * 2 +
            measureTextWidth(objName, rowNameFont) +
            settings.innerGap +
            measureTextWidth(groupAddress, rowAddressFont);
        width = Math.max(width, rowWidth);
    });

    return Math.max(width, settings.deviceMinWidth);
}

export function computeTopologyDeviceWidth(nodes, settings) {
    const theme = readTheme();
    const addressFont = `700 ${settings.headerFont.address}px ${theme.fontSans}`;
    const nameFont = `600 ${settings.headerFont.name}px ${theme.fontSans}`;
    const pad = settings.padding;
    const cushion = Math.max(6, Math.round(pad * 0.5));

    return nodes.reduce((max, node) => {
        const address = getNodeProp(node, 'address', '');
        const name = formatDeviceName(node) || getNodeProp(node, 'name', node.label || '');
        const width = Math.max(
            measureTextWidth(address, addressFont),
            measureTextWidth(name, nameFont)
        ) + pad * 2 + cushion;
        return Math.max(max, width);
    }, settings.topologyDeviceWidth);
}

export function updateDeviceText(deviceEl, width, settings) {
    const theme = readTheme();
    const address = deviceEl.get('fullAddress') || '';
    const name = deviceEl.get('fullName') || '';
    const maxWidth = Math.max(40, width - settings.padding * 2);
    const headerHeight = Math.max(40, settings.headerHeight);
    const maskHeight = Math.max(8, Math.round(headerHeight * 0.22));

    deviceEl.attr('address/fontSize', settings.headerFont.address);
    deviceEl.attr('name/fontSize', settings.headerFont.name);
    deviceEl.attr('header/height', headerHeight);
    deviceEl.attr('headerMask/height', maskHeight);
    deviceEl.attr('headerMask/y', Math.max(0, headerHeight - maskHeight));
    deviceEl.attr('address/refY', Math.round(headerHeight * 0.38));
    deviceEl.attr('name/refY', Math.round(headerHeight * 0.72));

    const addressFont = `700 ${settings.headerFont.address}px ${theme.fontSans}`;
    const nameFont = `600 ${settings.headerFont.name}px ${theme.fontSans}`;
    deviceEl.attr('address/text', fitTextToWidth(address, maxWidth, addressFont));
    deviceEl.attr('name/text', fitTextToWidth(name, maxWidth, nameFont));
}

export function updateGroupObjectText(objectEl, width, settings) {
    const theme = readTheme();
    const name = objectEl.get('fullName') || '';
    const address = objectEl.get('groupAddress') || '';
    const leftPad = Math.max(8, Math.round(settings.padding * 0.7));
    const rightPad = leftPad;

    objectEl.attr('name/fontSize', settings.rowFont.name);
    objectEl.attr('address/fontSize', settings.rowFont.address);
    objectEl.attr('name/refX', leftPad);
    objectEl.attr('address/refX2', -rightPad);

    const nameFont = `600 ${settings.rowFont.name}px ${theme.fontSans}`;
    const addressFont = `700 ${settings.rowFont.address}px ${theme.fontMono}`;
    const addressWidth = measureTextWidth(address, addressFont);
    const maxNameWidth = Math.max(20, width - leftPad - rightPad - settings.innerGap - addressWidth);
    const fittedName = fitTextToWidth(name, maxNameWidth, nameFont);

    objectEl.attr('name/text', fittedName);
    objectEl.attr('address/text', address);
}

export function updateContainerLabel(element, width, settings, kind) {
    const theme = readTheme();
    const baseSize = kind === 'area' ? 13 : 12;
    const fontSize = Math.max(10, Math.round(baseSize * settings.scale));
    const fullLabel = element.get('fullLabel') || element.attr('label/text') || '';
    const maxWidth = Math.max(80, width - settings.padding * 2);

    element.attr('label/fontSize', fontSize);
    const font = `700 ${fontSize}px ${theme.fontSans}`;
    element.attr('label/text', fitTextToWidth(fullLabel, maxWidth, font));

    const headerHeight = kind === 'area' ? settings.areaHeader : settings.lineHeader;
    element.attr('header/height', headerHeight);
    element.attr('label/refY', Math.round(headerHeight * 0.55));
}

export function layoutLooseDevices(deviceNodes, elementsById) {
    const dom = getDom();
    const width = (dom && dom.paper ? dom.paper.clientWidth : 0) || 1200;
    const settings = getLayoutSettings();
    const maxDeviceWidth = computeTopologyDeviceWidth(deviceNodes, settings);
    const deviceSize = {
        width: Math.max(160, Math.round(maxDeviceWidth)),
        height: Math.max(54, Math.round(settings.topologyDeviceHeight * 1.05))
    };
    const gap = Math.max(20, Math.round(24 * settings.scale));
    const columns = Math.max(1, Math.floor(width / (deviceSize.width + gap)));
    deviceNodes.forEach((device, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = 40 + col * (deviceSize.width + gap);
        const y = 40 + row * (deviceSize.height + gap);
        const deviceEl = elementsById.get(device.id);
        if (!deviceEl) return;
        deviceEl.resize(deviceSize.width, deviceSize.height);
        deviceEl.position(x, y);
        updateDeviceText(deviceEl, deviceSize.width, settings);
    });
}

export function resizeParentNode(cell) {
    const { graph } = state;
    if (!cell || !graph) return;
    const parentId = cell.get('parent');
    if (!parentId) return;

    const parent = graph.getCell(parentId);
    if (!parent) return;

    const kind = parent.get('kind');
    const isTopology = kind === 'area' || kind === 'line';
    const isComposite = kind && kind.startsWith('composite-');

    if (!isTopology && !isComposite) return;

    const children = parent.getEmbeddedCells();
    if (children.length === 0) return;

    const settings = getLayoutSettings();
    let padding = 20;
    let headerHeight = 30;

    if (isTopology) {
        padding = kind === 'area' ? (settings ? settings.areaPadding : 24) : (settings ? settings.linePadding : 16);
        headerHeight = kind === 'area' ? (settings ? settings.areaHeader : 34) : (settings ? settings.lineHeader : 32);
    } else {
        padding = 15;
        headerHeight = 35;
        const customPadding = parent.get('containerPadding');
        const customHeader = parent.get('containerHeader');
        if (Number.isFinite(customPadding)) padding = customPadding;
        if (Number.isFinite(customHeader)) headerHeight = customHeader;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    children.forEach(child => {
        const bbox = child.getBBox();
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    });

    if (!isFinite(minX) || !isFinite(minY)) return;

    const newX = minX - padding;
    const newY = minY - headerHeight;
    let newWidth = (maxX - minX) + padding * 2;
    const newHeight = (maxY - minY) + headerHeight + padding;
    const minWidth = minContainerLabelWidth(parent, padding);
    if (minWidth && newWidth < minWidth) {
        newWidth = minWidth;
    }

    const currentBBox = parent.getBBox();

    if (Math.abs(currentBBox.x - newX) > 1 ||
        Math.abs(currentBBox.y - newY) > 1 ||
        Math.abs(currentBBox.width - newWidth) > 1 ||
        Math.abs(currentBBox.height - newHeight) > 1) {

        const dx = newX - currentBBox.x;
        const dy = newY - currentBBox.y;

        const opts = { skipParentResize: true };
        parent.resize(newWidth, newHeight, opts);
        parent.position(newX, newY, opts);

        const moveOpts = { ...opts, deep: true };
        const translateWithDescendants = (cell, tx, ty) => {
            let descendants = [];
            if (cell.getEmbeddedCells) {
                descendants = cell.getEmbeddedCells({ deep: true }) || [];
            }
            let before = null;
            if (descendants.length > 0) {
                const first = descendants[0];
                if (first && first.position) {
                    const pos = first.position();
                    before = { x: pos.x, y: pos.y };
                }
            }
            cell.translate(tx, ty, moveOpts);
            if (before && descendants.length > 0) {
                const after = descendants[0].position();
                const movedDeep = Math.abs(after.x - (before.x + tx)) < 0.1 &&
                    Math.abs(after.y - (before.y + ty)) < 0.1;
                if (!movedDeep) {
                    descendants.forEach(desc => {
                        desc.translate(tx, ty, opts);
                    });
                }
            }
        };
        children.forEach(child => {
            translateWithDescendants(child, -dx, -dy);
        });

        resizeParentNode(parent);
    }
}

export function normalizeContainerLayout() {
    const { graph } = state;
    if (!graph) return;
    const elements = graph.getElements();
    if (!elements.length) return;

    const byId = new Map(elements.map(el => [el.id, el]));
    restoreExpectedEmbedding(elements, byId);
    const containers = elements.filter(isContainerElement);
    if (!containers.length) return;

    const entries = containers.map(cell => ({
        cell,
        depth: containerDepth(cell, byId)
    }));
    entries.sort((a, b) => b.depth - a.depth);

    entries.forEach(({ cell }) => {
        resizeContainerToChildren(cell);
    });
}

function isContainerElement(cell) {
    const kind = cell.get('kind');
    return kind === 'area' ||
        kind === 'line' ||
        kind === 'composite-main' ||
        kind === 'composite-middle' ||
        kind === 'composite-ga' ||
        kind === 'composite-device' ||
        kind === 'building-space';
}

function containerDepth(cell, byId) {
    let depth = 0;
    let parentId = cell.get('parent') || cell.get('expectedParent');
    while (parentId) {
        const parent = byId.get(parentId);
        if (!parent) break;
        depth += 1;
        parentId = parent.get('parent') || parent.get('expectedParent');
    }
    return depth;
}

function resizeContainerToChildren(parent) {
    const { graph } = state;
    if (!parent || !graph) return;

    const children = parent.getEmbeddedCells ? parent.getEmbeddedCells() : [];
    if (!children || children.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    children.forEach(child => {
        const bbox = child.getBBox();
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    });

    if (!isFinite(minX) || !isFinite(minY)) return;

    const { padding, headerHeight } = containerMetrics(parent);
    const newX = minX - padding;
    const newY = minY - headerHeight;
    let newWidth = (maxX - minX) + padding * 2;
    const newHeight = (maxY - minY) + headerHeight + padding;
    const minWidth = minContainerLabelWidth(parent, padding);
    if (minWidth && newWidth < minWidth) {
        newWidth = minWidth;
    }

    const currentBBox = parent.getBBox();
    if (Math.abs(currentBBox.x - newX) < 0.5 &&
        Math.abs(currentBBox.y - newY) < 0.5 &&
        Math.abs(currentBBox.width - newWidth) < 0.5 &&
        Math.abs(currentBBox.height - newHeight) < 0.5) {
        return;
    }

    const dx = newX - currentBBox.x;
    const dy = newY - currentBBox.y;
    const opts = { skipParentResize: true };

    let sampleBefore = null;
    const sampleChild = children[0];
    if (sampleChild && sampleChild.position) {
        const pos = sampleChild.position();
        sampleBefore = { x: pos.x, y: pos.y };
    }

    parent.resize(newWidth, newHeight, opts);
    parent.position(newX, newY, opts);

    if (sampleBefore && sampleChild && sampleChild.position) {
        const after = sampleChild.position();
        const movedWithParent = Math.abs(after.x - (sampleBefore.x + dx)) < 0.1 &&
            Math.abs(after.y - (sampleBefore.y + dy)) < 0.1;
        if (movedWithParent) {
            children.forEach(child => {
                translateSubtree(child, -dx, -dy, opts);
            });
        }
    }
}

function containerMetrics(parent) {
    const kind = parent.get('kind');
    const settings = getLayoutSettings();

    if (kind === 'area') {
        return {
            padding: settings ? settings.areaPadding : 24,
            headerHeight: settings ? settings.areaHeader : 34
        };
    }

    if (kind === 'line') {
        return {
            padding: settings ? settings.linePadding : 16,
            headerHeight: settings ? settings.lineHeader : 32
        };
    }

    let padding = 12;
    let headerHeight = 30;
    const customPadding = parent.get('containerPadding');
    const customHeader = parent.get('containerHeader');
    if (Number.isFinite(customPadding)) padding = customPadding;
    if (Number.isFinite(customHeader)) headerHeight = customHeader;
    return { padding, headerHeight };
}

function minContainerLabelWidth(parent, padding) {
    if (!parent || !parent.attr) return 0;
    const kind = parent.get('kind');
    if (!kind || (!kind.startsWith('composite-') && kind !== 'building-space')) {
        return 0;
    }
    const labelText = parent.attr('label/text') ||
        parent.get('fullName') ||
        parent.get('fullLabel') ||
        '';
    if (!labelText) return 0;
    const fontSize = Number(parent.attr('label/fontSize')) || 12;
    const fontWeight = parent.attr('label/fontWeight') || '700';
    const fontFamily = parent.attr('label/fontFamily') || readTheme().fontSans;
    const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const textWidth = measureTextWidth(labelText, font);
    const refX = Number(parent.attr('label/refX'));
    const leftPad = Number.isFinite(refX) ? refX : Math.max(10, Math.round(padding * 0.8));
    const rightPad = leftPad;
    const cushion = Math.max(6, Math.round(fontSize * 0.6));
    return textWidth + leftPad + rightPad + cushion;
}

function translateSubtree(cell, dx, dy, opts) {
    if (!cell || !cell.translate) return;
    const descendants = cell.getEmbeddedCells ? (cell.getEmbeddedCells({ deep: true }) || []) : [];
    let sampleBefore = null;
    if (descendants.length > 0) {
        const pos = descendants[0].position();
        sampleBefore = { x: pos.x, y: pos.y };
    }

    cell.translate(dx, dy, { ...opts, deep: true });

    if (!sampleBefore || descendants.length === 0) return;
    const after = descendants[0].position();
    const movedDeep = Math.abs(after.x - (sampleBefore.x + dx)) < 0.1 &&
        Math.abs(after.y - (sampleBefore.y + dy)) < 0.1;
    if (!movedDeep) {
        descendants.forEach(desc => {
            const pos = desc.position();
            desc.position(pos.x + dx, pos.y + dy, opts);
        });
    }
}

function restoreExpectedEmbedding(elements, byId) {
    elements.forEach(cell => {
        const expectedParent = cell.get('expectedParent');
        if (!expectedParent) return;
        if (cell.get('parent') === expectedParent) return;
        const parent = byId.get(expectedParent);
        if (!parent) return;
        parent.embed(cell);
    });
}
