import { state } from './state.js';
import { getDom } from './dom.js';
import { renderGraph } from './graph/render.js';

const ALL_VALUE = 'all';

export function setupFilterControls() {
    const dom = getDom();
    if (!dom || !dom.areaFilter || !dom.lineFilter || !dom.mainGroupFilter) return;

    dom.areaFilter.addEventListener('change', (event) => {
        state.filters.area = event.target.value || ALL_VALUE;
        updateLineOptions();
        applyFiltersAndRender();
    });

    dom.lineFilter.addEventListener('change', (event) => {
        state.filters.line = event.target.value || ALL_VALUE;
        applyFiltersAndRender();
    });

    dom.mainGroupFilter.addEventListener('change', (event) => {
        state.filters.mainGroup = event.target.value || ALL_VALUE;
        applyFiltersAndRender();
    });
}

export function updateFilterOptions(project) {
    if (!project) return;
    const dom = getDom();
    if (!dom || !dom.areaFilter || !dom.lineFilter || !dom.mainGroupFilter) return;

    state.filters.area = ALL_VALUE;
    state.filters.line = ALL_VALUE;
    state.filters.mainGroup = ALL_VALUE;

    const areas = buildAreaOptions(project);
    const linesByArea = buildLineOptions(project);
    const mainGroups = buildMainGroupOptions(project);

    state.filterOptions = {
        areas,
        lines: linesByArea,
        mainGroups
    };

    populateSelect(dom.areaFilter, areas, state.filters.area);
    updateLineOptions();
    populateSelect(dom.mainGroupFilter, mainGroups, state.filters.mainGroup);
    refreshFilterControls();
}

export function applyFiltersAndRender() {
    if (!state.currentProject) return;
    const filtered = filterProject(state.currentProject, state.filters);
    state.filteredProject = filtered;
    renderGraph(filtered, state.currentView);
}

export function refreshFilterControls() {
    const dom = getDom();
    if (!dom || !dom.mainGroupFilter) return;
    dom.mainGroupFilter.disabled = state.currentView === 'topology';
}

function updateLineOptions() {
    const dom = getDom();
    if (!dom || !dom.lineFilter) return;
    const area = state.filters.area || ALL_VALUE;
    const lines = buildLineListForArea(area);
    if (!lines.find((opt) => opt.value === state.filters.line)) {
        state.filters.line = ALL_VALUE;
    }
    populateSelect(dom.lineFilter, lines, state.filters.line);
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
    const options = [{ value: ALL_VALUE, label: 'All Main Groups' }];
    const nodes = project.group_address_graph && project.group_address_graph.nodes
        ? project.group_address_graph.nodes
        : [];
    const map = new Map();
    nodes.forEach((node) => {
        if (node.kind !== 'groupaddress') return;
        const props = node.properties || {};
        const address = props.address || '';
        const main = mainGroupFromAddress(address);
        if (!main) return;
        if (map.has(main)) return;
        const name = props.main_name ? ` : ${props.main_name}` : '';
        map.set(main, { value: main, label: `Main ${main}${name}` });
    });
    const mapped = Array.from(map.values()).sort(sortNumericOptions);
    mapped.forEach((opt) => options.push(opt));
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
    const mainFilter = filters.mainGroup || ALL_VALUE;

    const filteredTopology = filterTopologyGraph(project.topology_graph, areaFilter, lineFilter);
    const filteredGroup = filterGroupGraph(project.group_address_graph, areaFilter, lineFilter, mainFilter);

    return {
        ...project,
        topology_graph: filteredTopology,
        group_address_graph: filteredGroup
    };
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

function filterGroupGraph(graph, areaFilter, lineFilter, mainFilter) {
    if (!graph || !graph.nodes) return graph;
    if (areaFilter === ALL_VALUE && !lineFilter && mainFilter === ALL_VALUE) return graph;

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
        if (mainFilter !== ALL_VALUE && mainGroupFromAddress(address) !== mainFilter) return;
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
        if (mainFilter !== ALL_VALUE && mainGroupFromAddress(address) !== mainFilter) return;
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

function mainGroupFromAddress(address) {
    const cleaned = String(address || '').trim();
    if (!cleaned) return '';
    const parts = cleaned.split(/[/.]/);
    return parts[0] ? String(parts[0]) : '';
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
