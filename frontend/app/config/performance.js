export const PERFORMANCE_THRESHOLDS = Object.freeze({
    GRAPH_SIZE: {
        // Large graphs degrade interaction and minimap rendering.
        LARGE: 1200,
        LOADING_THRESHOLD_NODES: 300,
        LOADING_THRESHOLD_EDGES: 600
    },
    VIEW_SPECIFIC: {
        GROUP: {
            LOADING_THRESHOLD: 80
        },
        COMPOSITE: {
            LOADING_THRESHOLD: 120
        }
    },
    ELK_LAYOUT: {
        MAX_DEVICES: 1200,
        MAX_EDGES: 4000
    },
    DEVICE_GRAPH: {
        MIN_EDGES: 1500,
        MAX_EDGES: 15000,
        EDGES_PER_DEVICE: 4,
        MAX_PAIRS: 5000,
        MAX_GROUP_ADDRESSES_PER_EDGE: 6
    }
});

export function isLargeGraph(nodeCount) {
    return Number(nodeCount || 0) > PERFORMANCE_THRESHOLDS.GRAPH_SIZE.LARGE;
}

export function shouldShowLoading(nodeCount, edgeCount, viewType, options = {}) {
    const nodes = Number(nodeCount || 0);
    const edges = Number(edgeCount || 0);
    if (nodes > PERFORMANCE_THRESHOLDS.GRAPH_SIZE.LOADING_THRESHOLD_NODES) return true;
    if (edges > PERFORMANCE_THRESHOLDS.GRAPH_SIZE.LOADING_THRESHOLD_EDGES) return true;
    const isWideGroup = options.isWideGroup === true;
    if (viewType === 'group' && isWideGroup && nodes > PERFORMANCE_THRESHOLDS.VIEW_SPECIFIC.GROUP.LOADING_THRESHOLD) {
        return true;
    }
    if (viewType === 'composite' && nodes > PERFORMANCE_THRESHOLDS.VIEW_SPECIFIC.COMPOSITE.LOADING_THRESHOLD) {
        return true;
    }
    return false;
}
