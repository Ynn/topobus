import { state } from '../state.js';
import { getDom } from '../dom.js';
import { readTheme } from '../theme.js';
import { formatDeviceName } from '../utils.js';
import { layoutGroupView, layoutTopologyView, alignGroupLinks, normalizeContainerLayout } from './layout.js';
import { renderCompositeGraph } from './composite.js';
import { renderBuildingGraph } from './building.js';
import { updateLinkStyles, zForElement } from './styles.js';
import { bindInteractions, fitContent, syncPaperToContent } from '../interactions.js';
import { clearSelection } from '../selection.js';
import { scheduleMinimap, setMinimapEnabled } from '../minimap.js';

const LARGE_GRAPH_THRESHOLD = 1200;

export function renderGraph(projectData, viewType) {
    const isBuilding = viewType === 'building';
    const graphData = isBuilding
        ? null
        : (viewType === 'topology'
            ? projectData.topology_graph
            : projectData.group_address_graph);
    state.currentGraphData = graphData;
    state.currentNodeIndex = graphData && graphData.nodes
        ? new Map(graphData.nodes.map(node => [node.id, node]))
        : null;
    const nodeCount = isBuilding
        ? countBuildingNodes(projectData)
        : (graphData && graphData.nodes
            ? (viewType === 'group'
                ? graphData.nodes.filter(n => n.kind !== 'groupaddress').length
                : graphData.nodes.length)
            : 0);
    state.isLargeGraph = nodeCount > LARGE_GRAPH_THRESHOLD;
    setMinimapEnabled(true);

    const dom = getDom();
    if (state.paper) {
        if (state.paper.undelegateEvents) {
            state.paper.undelegateEvents();
        }
        if (state.paper.stopListening) {
            state.paper.stopListening();
        }
        state.paper = null;
    }
    if (dom && dom.paper) {
        dom.paper.innerHTML = '';
    }

    const GraphModel = joint.dia.SearchGraph || joint.dia.Graph;
    const sortingMode = (joint.dia.Paper.sorting && joint.dia.Paper.sorting.APPROX) || joint.dia.Paper.sorting.EXACT;

    state.graph = new GraphModel({}, {
        cellNamespace: joint.shapes,
        search: joint.dia.SearchGraph ? { type: 'quadtree' } : undefined
    });

    state.paper = new joint.dia.Paper({
        el: dom.paper,
        model: state.graph,
        width: '100%',
        height: '100%',
        gridSize: 10,
        drawGrid: false,
        async: true,
        background: { color: 'transparent' },
        cellViewNamespace: joint.shapes,
        sorting: sortingMode,
        validateUnembedding: () => false,
        interactive: state.interactiveFunc = (cellView) => {
            const kind = cellView.model.get('kind');
            if (viewType === 'group') {
                if (kind === 'groupobject') {
                    return { elementMove: false, linkMove: false, labelMove: false };
                }
                if (kind === 'device') {
                    return { elementMove: true, linkMove: false, labelMove: false };
                }
                return { elementMove: false, linkMove: false, labelMove: false };
            }
            if (viewType === 'topology') {
                if (kind === 'area' || kind === 'line') {
                    return { elementMove: isHeaderDragTarget(cellView), linkMove: false, labelMove: false };
                }
                const movable = kind === 'device';
                return { elementMove: movable, linkMove: false, labelMove: false };
            }
            if (viewType === 'composite') {
                const movable = kind && kind.startsWith('composite-') && kind !== 'composite-object';
                if (movable) {
                    return { elementMove: isHeaderDragTarget(cellView), linkMove: false, labelMove: false };
                }
                return { elementMove: false, linkMove: false, labelMove: false };
            }
            if (viewType === 'building') {
                if (kind === 'building-space') {
                    return { elementMove: isHeaderDragTarget(cellView), linkMove: false, labelMove: false };
                }
                const movable = kind === 'device';
                return { elementMove: movable, linkMove: false, labelMove: false };
            }
            return { elementMove: true, linkMove: false, labelMove: false };
        }
    });

    bindInteractions();
    if (state.paper.freeze) {
        state.paper.freeze();
    }
    if (state.graph.startBatch) {
        state.graph.startBatch('render');
    }
    state.graph.on('change:position', (cell, pos, opt) => {
        if (opt && opt.skipParentResize) return;
        if (state.currentView === 'group') {
            scheduleLinkAlign(cell);
        }
        scheduleMinimap();
    });
    state.graph.on('change:size', () => scheduleMinimap());
    state.graph.on('add', () => scheduleMinimap());
    state.paper.on('element:pointerup', () => {
        if (state.currentView === 'group') {
            alignGroupLinks();
            return;
        }
        if (state.currentView === 'topology' || state.currentView === 'composite' || state.currentView === 'building') {
            normalizeContainerLayout();
        }
    });

    if (viewType === 'composite') {
        renderCompositeGraph(projectData, state.graph);
        if (state.graph.stopBatch) {
            state.graph.stopBatch('render');
        }
        if (state.paper.unfreeze) {
            state.paper.unfreeze();
        }
        updateLinkStyles();
        clearSelection();
        syncPaperToContent({
            resetView: state.isLargeGraph
        });
        if (!state.isLargeGraph) {
            fitContent();
        }
        scheduleMinimap();
        return;
    }
    if (viewType === 'building') {
        renderBuildingGraph(projectData, state.graph);
        if (state.graph.stopBatch) {
            state.graph.stopBatch('render');
        }
        if (state.paper.unfreeze) {
            state.paper.unfreeze();
        }
        clearSelection();
        syncPaperToContent({
            resetView: state.isLargeGraph
        });
        if (!state.isLargeGraph) {
            fitContent();
        }
        scheduleMinimap();
        return;
    }

    const nodesToRender = viewType === 'group'
        ? filterGroupViewNodes(graphData.nodes)
        : graphData.nodes;

    const elements = [];
    const elementsById = new Map();

    nodesToRender.forEach(node => {
        const element = createNodeElement(node);
        elements.push(element);
        elementsById.set(node.id, element);
    });

    const links = graphData.edges.map(edge => createLinkElement(edge));
    elements.forEach(element => element.set('z', zForElement(element.get('kind'), viewType)));
    links.forEach(link => link.set('z', -1));

    if (state.graph.resetCells) {
        state.graph.resetCells(links.concat(elements));
    } else {
        state.graph.addCells(links.concat(elements));
    }

    if (viewType === 'group') {
        layoutGroupView(nodesToRender, elementsById);
    } else {
        layoutTopologyView(nodesToRender, elementsById);
    }

    if (state.graph.stopBatch) {
        state.graph.stopBatch('render');
    }
    if (state.paper.unfreeze) {
        state.paper.unfreeze();
    }
    updateLinkStyles();
    clearSelection();

    syncPaperToContent({
        resetView: state.isLargeGraph
    });
    if (!state.isLargeGraph) {
        fitContent();
    }
    scheduleMinimap();
}

function filterGroupViewNodes(nodes) {
    const deviceIds = new Set();
    nodes.forEach((node) => {
        if (node.kind === 'groupobject' && node.parent_id) {
            deviceIds.add(node.parent_id);
        }
    });
    return nodes.filter((node) => {
        if (node.kind === 'groupaddress') return false;
        if (node.kind === 'device') return deviceIds.has(node.id);
        return true;
    });
}

function countBuildingNodes(projectData) {
    const spaces = projectData && Array.isArray(projectData.locations)
        ? projectData.locations
        : [];
    let count = 0;
    const walk = (list) => {
        list.forEach((space) => {
            count += 1;
            if (Array.isArray(space.devices)) {
                count += space.devices.length;
            }
            if (Array.isArray(space.children)) {
                walk(space.children);
            }
        });
    };
    walk(spaces);
    return count;
}

function isHeaderDragTarget(cellView) {
    const target = state.dragIntentTarget;
    if (!target || !cellView || !cellView.el) return false;
    if (!cellView.el.contains(target)) return false;
    const handle = target.closest ? target.closest('[joint-selector]') : target;
    const selector = handle ? handle.getAttribute('joint-selector') : null;
    if (!selector) return false;
    return selector === 'header' ||
        selector === 'label' ||
        selector === 'name' ||
        selector === 'address';
}

function scheduleLinkAlign(cell) {
    state.pendingLinkAlign = cell;
    if (state.linkAlignFrame) return;
    state.linkAlignFrame = requestAnimationFrame(() => {
        state.linkAlignFrame = null;
        const target = state.pendingLinkAlign;
        state.pendingLinkAlign = null;
        if (target) {
            alignGroupLinks(target);
        } else {
            alignGroupLinks();
        }
    });
}

export function createNodeElement(node) {
    if (node.kind === 'device') {
        const address = node.properties && node.properties.address ? node.properties.address : '';
        const rawName = node.properties && node.properties.name ? node.properties.name : node.label;
        const displayName = formatDeviceName(node);
        const element = new joint.shapes.knx.Device({
            id: node.id,
            kind: node.kind,
            attrs: {
                address: { text: address },
                name: { text: displayName }
            }
        });
        element.set('fullAddress', address);
        element.set('fullName', displayName || rawName);
        element.set('nodeProps', node.properties || {});
        return element;
    }

    if (node.kind === 'groupobject') {
        const address = node.properties && node.properties.group_address ? node.properties.group_address : '';
        const theme = readTheme();
        const isTx = node.properties && node.properties.is_transmitter === 'true';
        const isRx = node.properties && node.properties.is_receiver === 'true';
        const fill = isTx ? theme.objectFillTx : theme.objectFill;
        const addressColor = isTx ? theme.accent : (isRx ? theme.ink : theme.muted);
        const element = new joint.shapes.knx.GroupObject({
            id: node.id,
            kind: node.kind,
            attrs: {
                body: { fill },
                name: { text: node.label },
                address: { text: address, fill: addressColor }
            }
        });
        element.set('fullName', node.label);
        element.set('groupAddress', address);
        element.set('isTransmitter', isTx);
        element.set('isReceiver', isRx);
        element.set('nodeProps', node.properties || {});
        return element;
    }

    if (node.kind === 'area') {
        const element = new joint.shapes.knx.Area({
            id: node.id,
            kind: node.kind,
            attrs: {
                label: { text: node.label }
            }
        });
        element.set('fullLabel', node.label);
        element.set('nodeProps', node.properties || {});
        return element;
    }

    if (node.kind === 'line') {
        const element = new joint.shapes.knx.Line({
            id: node.id,
            kind: node.kind,
            attrs: {
                label: { text: node.label }
            }
        });
        element.set('fullLabel', node.label);
        element.set('nodeProps', node.properties || {});
        return element;
    }

    return new joint.shapes.standard.Rectangle({
        id: node.id,
        kind: node.kind,
        size: { width: 180, height: 60 },
        attrs: {
            body: {
                fill: '#ffffff',
                stroke: '#1f2937',
                strokeWidth: 1.5,
                rx: 6,
                ry: 6
            },
            label: {
                text: node.label,
                fill: '#1f2937',
                fontSize: 12,
                fontFamily: readTheme().fontSans
            }
        }
    });
}

export function createLinkElement(edge) {
    const theme = readTheme();
    const direction = edge.properties && edge.properties.direction ? edge.properties.direction : 'directed';
    const groupAddress = edge.properties && edge.properties.group_address ? edge.properties.group_address : '';
    const link = new joint.shapes.standard.Link({
        source: { id: edge.source },
        target: { id: edge.target },
        router: { name: 'normal' },
        connector: { name: 'normal' },
        attrs: {
            line: {
                stroke: theme.accent,
                strokeWidth: 2,
                strokeDasharray: '6 4',
                opacity: 0.8
            }
        }
    });

    link.set('linkDirection', direction);
    link.set('groupAddress', groupAddress);

    if (edge.label) {
        link.labels([{
            attrs: {
                text: {
                    text: edge.label,
                    fontSize: 10,
                    fontFamily: theme.fontMono,
                    fill: theme.ink
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

    return link;
}
