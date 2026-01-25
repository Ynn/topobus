import { state } from './state.js';
import { getDom } from './dom.js';
import { renderGraph } from './graph/render.js';
import { startGraphLoading, stopGraphLoading } from './graph/loading.js';
import { syncPaperToContent, updateZoomLOD } from './interactions.js';
import { scheduleMinimap } from './minimap.js';
import { shouldShowLoading } from './config/performance.js';
import { stateManager } from './state_manager.js';

const ALL_VALUE = 'all';

export function setupFilterControls() {
    const dom = getDom();
    // Safety check - if filter elements don't exist in new layout yet, skip
    if (!dom || !dom.areaFilter || !dom.lineFilter || !dom.mainGroupFilter) return;

    dom.areaFilter.addEventListener('change', (event) => {
        updateFilters({ area: event.target.value || ALL_VALUE });
        updateLineOptions();
        applyFiltersAndRender();
    });

    dom.lineFilter.addEventListener('change', (event) => {
        updateFilters({ line: event.target.value || ALL_VALUE });
        applyFiltersAndRender();
    });

    dom.mainGroupFilter.addEventListener('change', (event) => {
        updateFilters({ mainGroup: event.target.value || ALL_VALUE });
        applyFiltersAndRender();
    });
}

export function updateFilterOptions(project) {
    if (!project) return;
    const dom = getDom();
    // Safety check
    if (!dom || !dom.areaFilter || !dom.lineFilter || !dom.mainGroupFilter) {
        // If elements are missing (new layout), we just accept it.
        // We might want to inject them into the toolbar dynamically or re-add them to index.html later.
        return;
    }

    updateFilters({
        area: ALL_VALUE,
        line: ALL_VALUE,
        mainGroup: ALL_VALUE,
        groupAddress: ALL_VALUE,
        buildingSpace: ALL_VALUE,
        deviceManufacturer: ALL_VALUE
    });

    const areas = buildAreaOptions(project);
    const linesByArea = buildLineOptions(project);
    const mainGroups = buildMainGroupOptions(project);

    stateManager.setState('filterOptions', {
        areas,
        lines: linesByArea,
        mainGroups
    });

    populateSelect(dom.areaFilter, areas, state.filters.area);
    updateLineOptions();
    populateSelect(dom.mainGroupFilter, mainGroups, state.filters.mainGroup);
    refreshFilterControls();
}

export function applyFiltersAndRender(options = {}) {
    if (!state.currentProject) return;
    const force = options.force === true;
    const dom = getDom();
    const graphVisible = dom && dom.graphView && dom.graphView.style.display !== 'none';
    if (!graphVisible) return;
    const filtered = filterProject(state.currentProject, state.filters);
    stateManager.setState('filteredProject', filtered);
    const viewType = resolveGraphViewType(state.currentView);
    const renderKey = buildGraphRenderKey(viewType);
    if (!force && state.graph && state.lastGraphKey === renderKey && state.lastGraphViewType === viewType) {
        syncPaperToContent({ resetView: false });
        updateZoomLOD();
        scheduleMinimap();
        return;
    }
    stateManager.setState('graphResetView', true);

    const nodeCount = estimateGraphNodeCount(filtered, viewType);
    const edgeCount = estimateGraphEdgeCount(filtered, viewType);
    const isWideGroup = viewType === 'group' && state.filters.groupAddress === ALL_VALUE;
    const showLoading = Boolean(
        dom && dom.loading && shouldShowLoading(nodeCount, edgeCount, viewType, { isWideGroup })
    );
    if (showLoading) {
        startGraphLoading('Rendering graph...');
    } else {
        stopGraphLoading();
    }

    requestAnimationFrame(() => {
        try {
            renderGraph(filtered, viewType);
            stateManager.setStatePatch({
                lastGraphKey: renderKey,
                lastGraphViewType: viewType
            });
        } finally {
            if (showLoading) {
                stopGraphLoading();
            }
        }
    });
}

export function refreshFilterControls() {
    const dom = getDom();
    if (!dom || !dom.mainGroupFilter) return;
    const graphView = resolveGraphViewType(state.currentView);
    dom.mainGroupFilter.disabled = graphView === 'topology' || graphView === 'building';
}

function updateLineOptions() {
    const dom = getDom();
    if (!dom || !dom.lineFilter) return;
    const area = state.filters.area || ALL_VALUE;
    const lines = buildLineListForArea(area);
    if (!lines.find((opt) => opt.value === state.filters.line)) {
        updateFilters({ line: ALL_VALUE });
    }
    populateSelect(dom.lineFilter, lines, state.filters.line);
}

function updateFilters(patch) {
    const next = { ...state.filters, ...patch };
    stateManager.setState('filters', next);
}

function populateSelect(select, options, selected) {
    select.innerHTML = '';
    options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
    });
    select.value = selected;
}

function buildAreaOptions(project) {
    const options = [{ value: ALL_VALUE, label: 'All Areas' }];
    const nodes = project.topology_graph && project.topology_graph.nodes
        ? project.topology_graph.nodes
        : [];
    const areas = nodes.filter((node) => node.kind === 'area');
    const mapped = areas.map((node) => {
        const props = node.properties || {};
        const area = props.area || props.address || 'unknown';
        const name = props.name ? ` : ${props.name}` : '';
        const label = area === 'unknown' ? 'Area Unknown' : `Area ${area}${name}`;
        return { value: String(area), label };
    });
    mapped.sort(sortNumericOptions);
    mapped.forEach((opt) => options.push(opt));
    return options;
}

function buildLineOptions(project) {
    const nodes = project.topology_graph && project.topology_graph.nodes
        ? project.topology_graph.nodes
        : [];
    const lines = nodes.filter((node) => node.kind === 'line');
    const byArea = new Map();
    lines.forEach((node) => {
        const props = node.properties || {};
        const area = props.area || 'unknown';
        const line = props.line || 'unknown';
        const name = props.name ? ` : ${props.name}` : '';
        let label = `Line ${area}.${line}${name}`;
        if (line === 'unknown') {
            label = area === 'unknown' ? 'Line Unknown' : `Line ${area}.?${name}`;
        }
        const value = `${area}.${line}`;
        if (!byArea.has(area)) {
            byArea.set(area, []);
        }
        byArea.get(area).push({ value, label });
    });
    for (const [area, list] of byArea.entries()) {
        list.sort(sortNumericLineOptions);
        byArea.set(area, list);
    }
    return byArea;
}

function buildMainGroupOptions(project) {
    const options = [{ value: ALL_VALUE, label: 'All Groups' }];
    const nodes = project.group_address_graph && project.group_address_graph.nodes
        ? project.group_address_graph.nodes
        : [];
    const mainMap = new Map();
    const middleMap = new Map();
    nodes.forEach((node) => {
        if (node.kind !== 'groupaddress') return;
        const props = node.properties || {};
        const address = props.address || '';
        const parts = parseGroupAddressParts(address);
        if (!parts.main) return;

        if (!mainMap.has(parts.main)) {
            const name = props.main_name ? ` : ${props.main_name}` : '';
            mainMap.set(parts.main, { value: `main:${parts.main}`, label: `Main ${parts.main}${name}` });
        }

        if (parts.middle && !middleMap.has(parts.middleKey)) {
            const middleName = props.middle_name ? ` : ${props.middle_name}` : '';
            const label = `${parts.middleKey}${middleName}`;
            middleMap.set(parts.middleKey, { value: `mid:${parts.middleKey}`, label });
        }
    });
    const mappedMain = Array.from(mainMap.values()).sort(sortNumericGroupOptions);
    const mappedMiddle = Array.from(middleMap.values()).sort(sortNumericGroupOptions);
    mappedMain.forEach((opt) => options.push(opt));
    mappedMiddle.forEach((opt) => options.push(opt));
    return options;
}

function buildLineListForArea(area) {
    const options = [{ value: ALL_VALUE, label: 'All Lines' }];
    const linesByArea = state.filterOptions.lines || new Map();
    if (area === ALL_VALUE) {
        const all = [];
        for (const list of linesByArea.values()) {
            all.push(...list);
        }
        all.sort(sortNumericLineOptions);
        all.forEach((opt) => options.push(opt));
        return options;
    }
    const list = linesByArea.get(area) || [];
    list.forEach((opt) => options.push(opt));
    return options;
}

function filterProject(project, filters) {
    const areaFilter = filters.area || ALL_VALUE;
    const lineFilter = parseLineFilter(filters.line);
    const mainFilter = parseGroupFilter(filters.mainGroup);
    const gaFilter = parseGroupAddressFilter(filters.groupAddress);
    const buildingFilter = String(filters.buildingSpace || ALL_VALUE);

    const filteredTopology = filterTopologyGraph(project.topology_graph, areaFilter, lineFilter);
    const filteredGroup = filterGroupGraph(project.group_address_graph, areaFilter, lineFilter, mainFilter, gaFilter);
    const filteredDevices = filterDevices(project.devices, areaFilter, lineFilter, filters.deviceManufacturer);
    const filteredLocations = filterLocations(project.locations, filteredDevices, areaFilter, lineFilter, buildingFilter);

    return {
        ...project,
        topology_graph: filteredTopology,
        group_address_graph: filteredGroup,
        devices: filteredDevices,
        locations: filteredLocations
    };
}

function filterDevices(devices, areaFilter, lineFilter, manufacturerFilter) {
    if (!Array.isArray(devices)) return [];
    const needsAreaLine = !(areaFilter === ALL_VALUE && !lineFilter);
    const needsManufacturer = manufacturerFilter && manufacturerFilter !== ALL_VALUE;
    if (!needsAreaLine && !needsManufacturer) return devices;
    return devices.filter((device) => {
        if (needsAreaLine && !matchesDeviceAreaLine(device, areaFilter, lineFilter)) return false;
        if (needsManufacturer && !matchesDeviceManufacturer(device, manufacturerFilter)) return false;
        return true;
    });
}

function matchesDeviceAreaLine(device, areaFilter, lineFilter) {
    const address = String(device && device.individual_address ? device.individual_address : '');
    const parts = address.split('.');
    const area = normalizeDevicePart(parts[0]);
    const line = normalizeDevicePart(parts[1]);
    if (lineFilter) {
        return area === lineFilter.area && line === lineFilter.line;
    }
    if (areaFilter === ALL_VALUE) return true;
    return area === areaFilter;
}

function matchesDeviceManufacturer(device, manufacturerFilter) {
    const manufacturer = String(device && device.manufacturer ? device.manufacturer : '');
    if (!manufacturerFilter || manufacturerFilter === ALL_VALUE) return true;
    return manufacturer === manufacturerFilter;
}

function normalizeDevicePart(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return 'unknown';
    if (trimmed.match(/^\d+$/)) return trimmed;
    return trimmed;
}

function filterLocations(locations, devices, areaFilter, lineFilter, buildingFilter) {
    if (!Array.isArray(locations)) return [];
    if (buildingFilter && buildingFilter !== ALL_VALUE) {
        const subtree = findBuildingSubtree(locations, buildingFilter);
        if (!subtree) return [];
        locations = [subtree];
    }
    if (areaFilter === ALL_VALUE && !lineFilter) return locations;
    const allowed = new Set(
        Array.isArray(devices) ? devices.map((device) => device.individual_address).filter(Boolean) : []
    );
    const walk = (spaces) => spaces
        .map((space) => {
            const children = walk(Array.isArray(space.children) ? space.children : []);
            const deviceRefs = Array.isArray(space.devices)
                ? space.devices.filter((dev) => dev && dev.address && allowed.has(dev.address))
                : [];
            if (children.length === 0 && deviceRefs.length === 0) return null;
            return {
                ...space,
                children,
                devices: deviceRefs
            };
        })
        .filter(Boolean);
    return walk(locations);
}

function filterTopologyGraph(graph, areaFilter, lineFilter) {
    if (!graph || !graph.nodes) return graph;
    if (areaFilter === ALL_VALUE && !lineFilter) return graph;
    const allowed = new Set();

    graph.nodes.forEach((node) => {
        const props = node.properties || {};
        const area = String(props.area || 'unknown');
        const line = String(props.line || 'unknown');
        if (node.kind === 'area') {
            if (lineFilter) {
                if (area === lineFilter.area) {
                    allowed.add(node.id);
                }
                return;
            }
            if (areaFilter === ALL_VALUE || area === areaFilter) {
                allowed.add(node.id);
            }
            return;
        }
        if (node.kind === 'line') {
            if (lineFilter) {
                if (area === lineFilter.area && line === lineFilter.line) {
                    allowed.add(node.id);
                }
                return;
            }
            if (areaFilter === ALL_VALUE || area === areaFilter) {
                allowed.add(node.id);
            }
            return;
        }
        if (node.kind === 'device') {
            if (lineFilter) {
                if (area === lineFilter.area && line === lineFilter.line) {
                    allowed.add(node.id);
                }
                return;
            }
            if (areaFilter === ALL_VALUE || area === areaFilter) {
                allowed.add(node.id);
            }
        }
    });

    const nodes = graph.nodes.filter((node) => allowed.has(node.id));
    const edges = (graph.edges || []).filter((edge) =>
        allowed.has(edge.source) && allowed.has(edge.target)
    );
    return { ...graph, nodes, edges };
}

function filterGroupGraph(graph, areaFilter, lineFilter, mainFilter, gaFilter) {
    if (!graph || !graph.nodes) return graph;
    if (areaFilter === ALL_VALUE && !lineFilter && mainFilter.type === 'all' && gaFilter.type === 'all') return graph;

    const deviceNodes = graph.nodes.filter((node) => node.kind === 'device');
    const objectNodes = graph.nodes.filter((node) => node.kind === 'groupobject');
    const gaNodes = graph.nodes.filter((node) => node.kind === 'groupaddress');

    const deviceAllowed = new Set();
    deviceNodes.forEach((node) => {
        if (matchesAreaLine(node, areaFilter, lineFilter)) {
            deviceAllowed.add(node.id);
        }
    });

    const allowedObjects = new Set();
    const allowedDevices = new Set();
    const allowedGroupAddresses = new Set();

    objectNodes.forEach((node) => {
        const parent = node.parent_id;
        if (!parent || !deviceAllowed.has(parent)) return;
        const address = node.properties && node.properties.group_address ? node.properties.group_address : '';
        if (!matchesGroupFilter(address, mainFilter)) return;
        if (!matchesGroupAddressFilter(address, gaFilter)) return;
        allowedObjects.add(node.id);
        allowedDevices.add(parent);
        if (address) {
            allowedGroupAddresses.add(address);
        }
    });

    const allowedGaIds = new Set();
    gaNodes.forEach((node) => {
        const address = node.properties && node.properties.address ? node.properties.address : '';
        if (!address) return;
        if (!allowedGroupAddresses.has(address)) return;
        if (!matchesGroupFilter(address, mainFilter)) return;
        if (!matchesGroupAddressFilter(address, gaFilter)) return;
        allowedGaIds.add(node.id);
    });

    const allowedNodes = new Set([...allowedDevices, ...allowedObjects, ...allowedGaIds]);
    const nodes = graph.nodes.filter((node) => allowedNodes.has(node.id));
    const edges = (graph.edges || []).filter((edge) =>
        allowedNodes.has(edge.source) && allowedNodes.has(edge.target)
    );

    return { ...graph, nodes, edges };
}

function parseLineFilter(value) {
    if (!value || value === ALL_VALUE) return null;
    const parts = String(value).split('.');
    if (parts.length < 2) return null;
    return { area: parts[0], line: parts[1] };
}

function matchesAreaLine(node, areaFilter, lineFilter) {
    const props = node.properties || {};
    const area = String(props.area || 'unknown');
    const line = String(props.line || 'unknown');
    if (lineFilter) {
        return area === lineFilter.area && line === lineFilter.line;
    }
    if (areaFilter === ALL_VALUE) return true;
    return area === areaFilter;
}

function parseGroupAddressParts(address) {
    const cleaned = String(address || '').trim();
    if (!cleaned) return { main: '', middle: '', middleKey: '' };
    const parts = cleaned.split(/[/.]/).filter(Boolean);
    const main = parts[0] ? String(parts[0]) : '';
    const middle = parts[1] ? String(parts[1]) : '';
    const middleKey = main && middle ? `${main}/${middle}` : '';
    return { main, middle, middleKey };
}

function parseGroupFilter(value) {
    const cleaned = String(value || '').trim();
    if (!cleaned || cleaned === ALL_VALUE) return { type: 'all' };
    if (cleaned.startsWith('main:')) {
        return { type: 'main', main: cleaned.slice(5) };
    }
    if (cleaned.startsWith('mid:')) {
        const rest = cleaned.slice(4);
        const parts = rest.split('/');
        return { type: 'middle', main: parts[0] || '', middle: parts[1] || '' };
    }
    return { type: 'main', main: cleaned };
}

function matchesGroupFilter(address, filter) {
    if (!filter || filter.type === 'all') return true;
    const parts = parseGroupAddressParts(address);
    if (filter.type === 'main') {
        return parts.main === filter.main;
    }
    if (filter.type === 'middle') {
        return parts.main === filter.main && parts.middle === filter.middle;
    }
    return true;
}

function parseGroupAddressFilter(value) {
    const cleaned = String(value || '').trim();
    if (!cleaned || cleaned === ALL_VALUE) return { type: 'all' };
    return { type: 'address', address: cleaned };
}

function matchesGroupAddressFilter(address, filter) {
    if (!filter || filter.type === 'all') return true;
    return String(address || '') === filter.address;
}

function sortNumericOptions(a, b) {
    const aVal = parseInt(a.value, 10);
    const bVal = parseInt(b.value, 10);
    if (Number.isNaN(aVal) && Number.isNaN(bVal)) return a.label.localeCompare(b.label);
    if (Number.isNaN(aVal)) return 1;
    if (Number.isNaN(bVal)) return -1;
    return aVal - bVal;
}

function sortNumericLineOptions(a, b) {
    const [aArea, aLine] = String(a.value).split('.');
    const [bArea, bLine] = String(b.value).split('.');
    const aAreaNum = parseInt(aArea, 10);
    const bAreaNum = parseInt(bArea, 10);
    if (!Number.isNaN(aAreaNum) && !Number.isNaN(bAreaNum) && aAreaNum !== bAreaNum) {
        return aAreaNum - bAreaNum;
    }
    const aLineNum = parseInt(aLine, 10);
    const bLineNum = parseInt(bLine, 10);
    if (!Number.isNaN(aLineNum) && !Number.isNaN(bLineNum) && aLineNum !== bLineNum) {
        return aLineNum - bLineNum;
    }
    return a.label.localeCompare(b.label);
}

function sortNumericGroupOptions(a, b) {
    const aValue = String(a.value || '');
    const bValue = String(b.value || '');
    const aKey = aValue.includes(':') ? aValue.split(':')[1] : aValue;
    const bKey = bValue.includes(':') ? bValue.split(':')[1] : bValue;
    const [aMain, aMiddle] = aKey.split('/');
    const [bMain, bMiddle] = bKey.split('/');
    const aMainNum = parseInt(aMain, 10);
    const bMainNum = parseInt(bMain, 10);
    if (!Number.isNaN(aMainNum) && !Number.isNaN(bMainNum) && aMainNum !== bMainNum) {
        return aMainNum - bMainNum;
    }
    const aMidNum = parseInt(aMiddle, 10);
    const bMidNum = parseInt(bMiddle, 10);
    if (!Number.isNaN(aMidNum) && !Number.isNaN(bMidNum) && aMidNum !== bMidNum) {
        return aMidNum - bMidNum;
    }
    return a.label.localeCompare(b.label);
}

function resolveGraphViewType(viewType) {
    if (viewType === 'devices') return 'device';
    if (viewType === 'buildings') return 'building';
    if (viewType === 'group') {
        return state.viewPreferences.groupGraph === 'hierarchy' ? 'composite' : 'group';
    }
    return viewType;
}

function estimateGraphNodeCount(project, viewType) {
    if (!project) return 0;
    if (viewType === 'device') {
        return Array.isArray(project.devices) ? project.devices.length : 0;
    }
    if (viewType === 'building') {
        const locations = Array.isArray(project.locations) ? project.locations : [];
        let spaces = 0;
        const walk = (nodes) => {
            nodes.forEach((node) => {
                spaces += 1;
                walk(Array.isArray(node.children) ? node.children : []);
            });
        };
        walk(locations);
        const devices = Array.isArray(project.devices) ? project.devices.length : 0;
        return spaces + devices;
    }
    const graph = viewType === 'topology'
        ? project.topology_graph
        : project.group_address_graph;
    return graph && Array.isArray(graph.nodes) ? graph.nodes.length : 0;
}

function estimateGraphEdgeCount(project, viewType) {
    if (!project) return 0;
    if (viewType === 'building') return 0;
    const graph = viewType === 'topology'
        ? project.topology_graph
        : project.group_address_graph;
    return graph && Array.isArray(graph.edges) ? graph.edges.length : 0;
}

function buildGraphRenderKey(viewType) {
    const filters = state.filters || {};
    const elkKey = state.elkPreset || 'custom';
    const elkSettingsKey = state.elkSettings ? JSON.stringify(state.elkSettings) : '';
    const stressKey = state.uiSettings && state.uiSettings.stress
        ? JSON.stringify(state.uiSettings.stress)
        : '';
    return [
        viewType,
        state.viewPreferences.groupGraph || 'flat',
        state.viewPreferences.density || 'comfortable',
        state.themeName || 'latte',
        elkKey,
        elkSettingsKey,
        stressKey,
        filters.area || 'all',
        filters.line || 'all',
        filters.mainGroup || 'all',
        filters.groupAddress || 'all',
        filters.buildingSpace || 'all',
        filters.deviceManufacturer || 'all'
    ].join('|');
}

function findBuildingSubtree(spaces, targetId) {
    for (const space of spaces) {
        if (space && String(space.id || '') === targetId) return space;
        const children = Array.isArray(space.children) ? space.children : [];
        const found = findBuildingSubtree(children, targetId);
        if (found) return found;
    }
    return null;
}
