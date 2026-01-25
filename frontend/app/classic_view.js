import { getDom } from './dom.js';
import { state } from './state.js';
import { applyFiltersAndRender } from './filters.js';
import { formatDeviceName } from './utils.js';
import { selectCell, highlightCell, registerSelectionListener } from './selection.js';
import { focusCell, fitContent, exportSvg } from './interactions.js';
import { setSelectionFromTable, setSelectionFromTree } from './selection_store.js';
import { ICON } from './ui/icons.js';
import { formatDptLabel, resolveDptSize } from './formatters/device.js';
import { stateManager } from './state_manager.js';
import { initContextMenu, openContextMenu, copyTextToClipboard, openWebSearch } from './context_menu.js';
import { onNavigate, requestNavigation } from './navigation.js';

// View metadata and table layouts.
const viewConstants = {
    group: {
        title: 'Group Addresses',
        sidebarIcon: ICON.group
    },
    topology: {
        title: 'Topology',
        sidebarIcon: ICON.topology
    },
    devices: {
        title: 'Devices',
        sidebarIcon: ICON.device
    },
    buildings: {
        title: 'Buildings',
        sidebarIcon: ICON.building
    }
};

const tableLayouts = {
    groupAddresses: ['', '', 'Address', 'Name', 'Description', 'Data Type', 'Length', 'Associations'],
    groupObjects: ['', '', 'Number', 'Object', 'Device Address', 'Device', 'Function', 'Description', 'Channel', 'Security', 'Building Function', 'Building Part', 'Data Type', 'Size', 'C', 'R', 'W', 'T', 'U'],
    topologyAreas: ['', '', 'Area', 'Name', 'Description'],
    topologyLines: ['', '', 'Line', 'Name', 'Description', 'Medium'],
    topologySegments: ['', '', 'Segment', 'Name', 'Medium', 'Domain'],
    topologyDevices: ['', '', 'Address', 'Name', 'Description', 'Application Program', 'Manufacturer', 'Product'],
    topologyObjects: ['', '', 'Number', 'Object', 'Function', 'Group Addresses', 'Description', 'Channel', 'Security', 'Building Function', 'Building Part', 'Data Type', 'Size', 'C', 'R', 'W', 'T', 'U'],
    buildingDevices: ['', '', 'Address', 'Name', 'Description', 'Location', 'Application Program', 'Manufacturer']
};

let treeNodeIndex = new Map();
let treeIdCounter = 0;
let selectedTreeItem = null;
let selectedTableRow = null;
let tableSourceData = [];
let tableSearchQuery = '';
let tableSortState = { index: null, direction: 'asc' };
let searchTimer = null;
let tableRowIndex = new Map();
let tableRowByGraphId = new Map();
let selectionLinked = false;
const TREE_INDENT_BASE = 14;
const TREE_INDENT_STEP = 20;
let buildingLookupCache = null;
let buildingLookupProject = null;
let tableColumnLabels = [];
let tableColumnKeys = [];
let tableColumnSignature = '';
let tableColumnWidths = new Map();
let lastTableColumns = [];
let tableSortedRows = [];
let tableRowPositions = new Map();
let tableRowHeight = 28;
let tableVirtualMode = false;
let tableScrollBound = false;
let tableRenderFrame = null;
const TABLE_VIRTUAL_THRESHOLD = 500;
const TABLE_OVERSCAN = 12;
let tableVisibleStart = 0;
let tableVisibleEnd = 0;

function nextTreeId() {
    treeIdCounter += 1;
    return `node-${treeIdCounter}`;
}

export function initClassicView() {
    const dom = getDom();
    if (!dom) return;

    // View Tabs (Top)
    dom.viewTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (tab && tab.dataset.viewType) {
            switchViewType(tab.dataset.viewType);
        } else if (tab && tab.id === 'btn-open-project') {
            dom.fileInput.click();
        }
    });

    // Content Tabs (Table vs Graph)
    dom.centerTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.content-tab');
        if (tab && tab.dataset.tab) {
            switchContentTab(tab.dataset.tab);
        }
    });

    if (dom.graphMode) {
        dom.graphMode.addEventListener('click', (e) => {
            const btn = e.target.closest('.graph-mode-btn');
            if (!btn || !btn.dataset.mode) return;
            setGroupGraphMode(btn.dataset.mode);
        });
    }

    // Sidebar Toggles
    if (dom.toggleSidebarBtn) dom.toggleSidebarBtn.addEventListener('click', () => toggleSidebar());
    if (dom.sidebarReopenBtn) dom.sidebarReopenBtn.addEventListener('click', () => toggleSidebar());

    // Properties Sidebar Toggles
    if (dom.togglePropsBtn) dom.togglePropsBtn.addEventListener('click', () => toggleProperties());
    if (dom.propsReopenBtn) dom.propsReopenBtn.addEventListener('click', () => toggleProperties());

    setupSearchControls();
    setupToolbarControls();
    bindDelegatedEvents();
    setupSelectionLinking();

    initializeResizers();
    initializeTableSorting();
    initContextMenu();
    registerNavigationHandlers();
}

export function updateClassicView() {
    const dom = getDom();
    if (!state.currentProject) return;

    // Update Title
    if (dom.projectTitle) dom.projectTitle.textContent = state.currentProject.project_name || 'Project Loaded';

    // Refresh current view
    switchViewType(state.currentView || 'group', true);
}

function bindDelegatedEvents() {
    const dom = getDom();
    if (!dom) return;

    if (dom.sidebarTree && dom.sidebarTree.dataset.bound !== 'true') {
        dom.sidebarTree.addEventListener('click', (e) => {
            const base = e.target instanceof Element ? e.target : e.target && e.target.parentElement ? e.target.parentElement : null;
            const item = base ? base.closest('.tree-item') : null;
            if (!item || !dom.sidebarTree.contains(item)) return;
            handleTreeItemClick(e, item);
        });
        dom.sidebarTree.addEventListener('contextmenu', (e) => {
            const base = e.target instanceof Element ? e.target : e.target && e.target.parentElement ? e.target.parentElement : null;
            const item = base ? base.closest('.tree-item') : null;
            if (!item || !dom.sidebarTree.contains(item)) return;
            handleTreeContextMenu(e, item);
        });
        dom.sidebarTree.dataset.bound = 'true';
    }

    if (dom.tableBody && dom.tableBody.dataset.bound !== 'true') {
        dom.tableBody.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (!row || !dom.tableBody.contains(row)) return;
            handleTableRowClick(row, e);
        });
        dom.tableBody.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('tr');
            if (!row || !dom.tableBody.contains(row)) return;
            handleTableContextMenu(e, row);
        });
        dom.tableBody.dataset.bound = 'true';
    }
}

function setupSelectionLinking() {
    if (selectionLinked) return;
    selectionLinked = true;
    registerSelectionListener((cell) => {
        syncTableSelectionFromGraph(cell);
    });

    document.addEventListener('fullscreenchange', () => {
        const enabled = Boolean(document.fullscreenElement);
        document.body.classList.toggle('graph-fullscreen', enabled);
        updateFullscreenButton(enabled);
    });
}

function switchViewType(viewType, force = false) {
    if (state.currentView === viewType && !force) return;
    stateManager.setState('currentView', viewType);

    const dom = getDom();

    // Update Top Tabs
    Array.from(dom.viewTabs.children).forEach(child => {
        if (child.dataset.viewType === viewType) {
            child.classList.add('active');
        } else {
            child.classList.remove('active');
        }
    });

    // Determine Logic based on viewType
    const config = viewConstants[viewType] || viewConstants['group'];

    // 1. Build Data & Tree for this view
    const { treeData, tableData, tableColumns } = buildViewData(viewType);

    // 2. Render Sidebar Tree
    renderSidebarTree(config, treeData);
    selectedTreeItem = null;

    // 3. Render Table Header
    renderTableHeader(tableColumns);

    // 4. Render Table Body (Initial load showing all)
    renderTableBody(tableData);

    // Store current table data for sorting/filtering
    stateManager.setState('currentTableData', tableData);

    // 5. Update Breadcrumbs (if we had them)
    // 6. Reset selection
    stateManager.setState('selectedId', null);
    setSelectionFromTree(null);
    setSelectionFromTable(null); // Clear properties

    updateGraphModeVisibility();

    if (dom.graphView && dom.graphView.style.display !== 'none') {
        applyFiltersAndRender();
    }
}

function switchContentTab(tabName) {
    const dom = getDom();
    if (tabName === 'table' && document.body.classList.contains('graph-fullscreen')) {
        document.body.classList.remove('graph-fullscreen');
        updateFullscreenButton(false);
    }

    // Update tabs UI
    Array.from(dom.centerTabs.children).forEach(child => {
        if (child.dataset.tab === tabName) child.classList.add('active');
        else child.classList.remove('active');
    });

    if (tabName === 'table') {
        dom.tableView.style.display = 'block';
        dom.graphView.style.display = 'none';
        dom.emptyTableState.style.display = 'none'; // logic to show/hide empty state needed?
    } else if (tabName === 'graph') {
        dom.tableView.style.display = 'none';
        dom.graphView.style.display = 'block';

        // Trigger graph rendering if needed
        setTimeout(() => {
            applyFiltersAndRender();
        }, 50);
    }

    updateGraphModeVisibility();
}

function setGroupGraphMode(mode) {
    const dom = getDom();
    if (mode !== 'flat' && mode !== 'hierarchy') return;
    state.viewPreferences.groupGraph = mode;
    if (dom.graphMode) {
        dom.graphMode.querySelectorAll('.graph-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
    }
    if (dom.graphView && dom.graphView.style.display !== 'none' && state.currentView === 'group') {
        applyFiltersAndRender();
    }
}

function updateGraphModeVisibility() {
    const dom = getDom();
    if (!dom || !dom.graphMode) return;
    const show = state.currentView === 'group' && dom.graphView && dom.graphView.style.display !== 'none';
    dom.graphMode.style.display = show ? 'inline-flex' : 'none';
    if (show) {
        const mode = state.viewPreferences.groupGraph || 'flat';
        dom.graphMode.querySelectorAll('.graph-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
    }
}

function setupSearchControls() {
    const dom = getDom();
    if (!dom || !dom.searchInput) return;

    const triggerSearch = (value) => {
        const query = String(value || '').trim();
        tableSearchQuery = query.toLowerCase();

        const graphVisible = dom.graphView && dom.graphView.style.display !== 'none';
        if (graphVisible && state.graph) {
            if (!query) return;
            const match = findGraphMatch(query);
            if (match) {
                selectCell(match);
                focusCell(match);
            }
            return;
        }

        renderTableBody(tableSourceData);
    };

    dom.searchInput.addEventListener('input', (e) => {
        const value = e.target.value;
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            triggerSearch(value);
        }, 150);
    });

    dom.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (searchTimer) clearTimeout(searchTimer);
            triggerSearch(e.target.value);
        }
        if (e.key === 'Escape') {
            dom.searchInput.value = '';
            triggerSearch('');
        }
    });

    if (dom.searchClear) {
        dom.searchClear.addEventListener('click', () => {
            dom.searchInput.value = '';
            triggerSearch('');
        });
    }
}

function setupToolbarControls() {
    const dom = getDom();
    if (!dom) return;

    const expandBtn = document.getElementById('btn-expand-all');
    const collapseBtn = document.getElementById('btn-collapse-all');
    const fitBtn = document.getElementById('btn-fit-view');
    const relayoutBtn = document.getElementById('btn-relayout');
    const fullscreenBtn = document.getElementById('btn-graph-fullscreen');
    const exportSvgBtn = document.getElementById('btn-export-svg');
    const exportCsvBtn = document.getElementById('btn-export-csv');

    if (expandBtn) {
        expandBtn.addEventListener('click', () => expandTree(true));
    }
    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => collapseTree(true));
    }
    if (fitBtn) {
        fitBtn.addEventListener('click', () => {
            const dom = getDom();
            const graphVisible = dom && dom.graphView && dom.graphView.style.display !== 'none';
            if (!graphVisible) {
                switchContentTab('graph');
                setTimeout(() => fitContent(), 120);
                return;
            }
            fitContent();
        });
    }
    if (relayoutBtn) {
        relayoutBtn.addEventListener('click', () => {
            if (!state.currentProject) return;
            const dom = getDom();
            const graphVisible = dom && dom.graphView && dom.graphView.style.display !== 'none';
            if (!graphVisible) {
                switchContentTab('graph');
                setTimeout(() => applyFiltersAndRender({ force: true }), 120);
                return;
            }
            applyFiltersAndRender({ force: true });
        });
    }
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => toggleGraphFullscreen());
    }
    if (exportSvgBtn) {
        exportSvgBtn.addEventListener('click', () => exportSvg());
    }
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => exportTableCsv());
    }
}

function findGraphMatch(query) {
    const elements = state.graph ? state.graph.getElements() : [];
    const lowered = query.toLowerCase();
    return elements.find((el) => {
        const name = String(el.get('fullName') || el.get('fullLabel') || el.get('label') || '').toLowerCase();
        const address = String(el.get('fullAddress') || el.get('groupAddress') || '').toLowerCase();
        return name.includes(lowered) || address.includes(lowered);
    });
}

// ----------------------------------------------------------------------
// DATA BUILDERS
// ----------------------------------------------------------------------

function buildViewData(viewType) {
    if (!state.currentProject) return { treeData: [], tableData: [], tableColumns: [] };

    switch (viewType) {
        case 'group':
            return buildGroupViewData();
        case 'topology':
            return buildTopologyViewData();
        case 'devices':
            return buildDevicesViewData();
        case 'buildings':
            return buildBuildingsViewData(); // We might not have full building data, but let's try
        default:
            return { treeData: [], tableData: [], tableColumns: [] };
    }
}

function buildGroupAddressFallbacks(project) {
    const map = new Map();
    const devices = Array.isArray(project.devices) ? project.devices : [];
    devices.forEach((device) => {
        const links = Array.isArray(device.group_links) ? device.group_links : [];
        links.forEach((link) => {
            if (!link || !link.group_address) return;
            const address = link.group_address;
            let entry = map.get(address);
            if (!entry) {
                entry = { datapoint_type: '', object_size: '' };
                map.set(address, entry);
            }
            if (!entry.datapoint_type && link.datapoint_type) {
                entry.datapoint_type = link.datapoint_type;
            }
            if (!entry.object_size && link.object_size) {
                entry.object_size = link.object_size;
            }
            if (!entry.object_size && link.datapoint_type) {
                entry.object_size = resolveDptSize(link.datapoint_type);
            }
        });
    });
    return map;
}

function buildGroupViewData() {
    // Flatten group addresses
    const gas = state.currentProject.group_addresses || [];
    const fallbackMap = buildGroupAddressFallbacks(state.currentProject);
    const tableData = gas.map(ga => ({
        id: ga.id || ga.address,
        icon: ICON.link,
        kind: 'group-address',
        graphId: buildGroupAddressGraphId(ga.address),
        data: {
            address: ga.address,
            name: ga.name,
            desc: ga.description || '',
            type: formatDptLabel(ga.datapoint_type || (fallbackMap.get(ga.address) || {}).datapoint_type),
            len: resolveDptSize(ga.datapoint_type) || (fallbackMap.get(ga.address) || {}).object_size || '',
            assoc: (ga.linked_devices || []).length
        },
        raw: ga
    }));

    // Build Tree (Main Groups -> Middle Groups -> Group Addresses)
    const treeRoot = { label: 'Group Addresses', icon: ICON.group, kind: 'group-root', children: [], expanded: true };
    const mainGroups = new Map();

    gas.forEach(ga => {
        const parts = splitGroupAddress(ga.address);
        if (!parts.main) return;
        const mainKey = parts.main;
        if (!mainGroups.has(mainKey)) {
            const label = ga.main_group_name ? `Main ${mainKey} : ${ga.main_group_name}` : `Main ${mainKey}`;
            mainGroups.set(mainKey, {
                label,
                icon: ICON.folder,
                kind: 'group-main',
                value: `main:${mainKey}`,
                children: new Map(),
                expanded: false
            });
        }
        const mainNode = mainGroups.get(mainKey);
        if (parts.middle) {
            const middleKey = parts.middle;
            if (!mainNode.children.has(middleKey)) {
                const middleLabel = ga.middle_group_name
                    ? `${mainKey}/${middleKey} : ${ga.middle_group_name}`
                    : `${mainKey}/${middleKey}`;
                mainNode.children.set(middleKey, {
                    label: middleLabel,
                    icon: ICON.folderOpen,
                    kind: 'group-middle',
                    value: `mid:${mainKey}/${middleKey}`,
                    children: [],
                    expanded: false
                });
            }
            const middleNode = mainNode.children.get(middleKey);
            middleNode.children.push({
                label: ga.name ? `${ga.address} - ${ga.name}` : ga.address,
                icon: ICON.link,
                kind: 'group-address',
                value: ga.address,
                address: ga.address,
                expanded: false,
                children: []
            });
        } else {
            mainNode.children.set(`ga-${ga.address}`, {
                label: ga.name ? `${ga.address} - ${ga.name}` : ga.address,
                icon: ICON.link,
                kind: 'group-address',
                value: ga.address,
                address: ga.address,
                expanded: false,
                children: []
            });
        }
    });

    // Convert Maps to Arrays
    mainGroups.forEach(mg => {
        const middleGroups = [];
        mg.children.forEach(mid => middleGroups.push(mid));
        middleGroups.forEach(mid => {
            if (mid.kind === 'group-middle' && Array.isArray(mid.children)) {
                mid.children.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
            }
        });
        middleGroups.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
        mg.children = middleGroups;
        treeRoot.children.push(mg);
    });
    treeRoot.children.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

    return { treeData: [treeRoot], tableData, tableColumns: tableLayouts.groupAddresses };
}

function buildTopologyViewData() {
    const project = state.currentProject;
    const index = buildTopologyIndex(project);
    stateManager.setState('topologyIndex', index);

    const tableData = buildTopologyAreaRows(index);
    const treeRoot = { label: 'Topology', icon: ICON.topology, kind: 'topology-root', children: [], expanded: true };

    index.areas.forEach((areaInfo) => {
        const areaKey = areaInfo.address;
        const areaLabel = areaInfo.name ? `Area ${areaKey} : ${areaInfo.name}` : `Area ${areaKey}`;
        const areaNode = {
            label: areaLabel,
            icon: ICON.area,
            kind: 'area',
            area: areaKey,
            expanded: false,
            children: []
        };

        const lineMap = index.linesByArea.get(areaKey) || new Map();
        const lineNodes = Array.from(lineMap.values());
        lineNodes.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
        lineNodes.forEach((lineInfo) => {
            const lineNode = {
                label: lineInfo.label,
                icon: ICON.line,
                kind: 'line',
                area: areaKey,
                line: lineInfo.line,
                expanded: false,
                children: []
            };

        const segmentMap = index.segmentsByLine.get(lineInfo.key) || new Map();
        const segmentNodes = Array.from(segmentMap.values());
        segmentNodes.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
        if (segmentNodes.length <= 1) {
            const onlySegment = segmentNodes[0];
            const devices = onlySegment ? (index.devicesBySegment.get(onlySegment.key) || []) : [];
            devices.forEach((device) => {
                lineNode.children.push({
                    label: formatTopologyDeviceLabel(device),
                    icon: ICON.device,
                    kind: 'device',
                    area: areaKey,
                    line: lineInfo.line,
                    segment: onlySegment ? onlySegment.key : '',
                    deviceAddress: device.individual_address,
                    deviceId: device.instance_id || device.individual_address,
                    expanded: false,
                    children: []
                });
            });
        } else {
            segmentNodes.forEach((segmentInfo) => {
                const segmentNode = {
                    label: segmentInfo.label,
                icon: ICON.object,
                kind: 'segment',
                    area: areaKey,
                    line: lineInfo.line,
                    segment: segmentInfo.key,
                    expanded: false,
                    children: []
                };

                const devices = index.devicesBySegment.get(segmentInfo.key) || [];
                devices.forEach((device) => {
                    segmentNode.children.push({
                        label: formatTopologyDeviceLabel(device),
                    icon: ICON.device,
                    kind: 'device',
                        area: areaKey,
                        line: lineInfo.line,
                        segment: segmentInfo.key,
                        deviceAddress: device.individual_address,
                        deviceId: device.instance_id || device.individual_address,
                        expanded: false,
                        children: []
                    });
                });
                lineNode.children.push(segmentNode);
            });
        }
        areaNode.children.push(lineNode);
    });

        treeRoot.children.push(areaNode);
    });

    treeRoot.children.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

    return { treeData: [treeRoot], tableData, tableColumns: tableLayouts.topologyAreas };
}

function buildDevicesViewData() {
    const devices = state.currentProject.devices || [];
    const tableData = buildTopologyDeviceRows(devices);

    const treeRoot = { label: 'Devices', icon: ICON.device, kind: 'device-root', expanded: true, children: [] };
    const byManufacturer = new Map();

    devices.forEach((device) => {
        const key = device.manufacturer || 'Unknown Manufacturer';
        if (!byManufacturer.has(key)) {
            byManufacturer.set(key, {
                label: key,
                icon: ICON.tag,
                kind: 'device-manufacturer',
                value: key,
                expanded: false,
                lazyChildren: []
            });
        }
        const node = byManufacturer.get(key);
        node.lazyChildren.push({
            label: formatTopologyDeviceLabel(device),
            icon: ICON.device,
            kind: 'device',
            deviceAddress: device.individual_address,
            deviceId: device.instance_id || device.individual_address,
            expanded: false,
            children: []
        });
    });

    const manufacturers = Array.from(byManufacturer.values());
    manufacturers.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    manufacturers.forEach((node) => {
        if (node.lazyChildren && node.lazyChildren.length) {
            node.lazyChildren.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
        }
    });
    treeRoot.children = manufacturers;

    return { treeData: [treeRoot], tableData, tableColumns: tableLayouts.topologyDevices };
}

function buildBuildingsViewData() {
    const project = state.currentProject;
    const locations = Array.isArray(project.locations) ? project.locations : [];
    const deviceIndex = state.deviceIndex || new Map();
    const treeRoot = { label: 'Buildings', icon: ICON.building, kind: 'building-root', expanded: true, children: [] };
    const tableData = [];

    const walk = (space, pathLabels, pathIds, parentNode) => {
        if (!space) return;
        const label = buildBuildingLabel(space);
        const node = {
            label,
            icon: buildingIcon(space.space_type),
            kind: 'building-space',
            spaceId: space.id || '',
            expanded: false,
            children: []
        };
        parentNode.children.push(node);

        const nextLabels = label ? pathLabels.concat([label]) : pathLabels;
        const nextIds = space.id ? pathIds.concat([space.id]) : pathIds;

        const devices = Array.isArray(space.devices) ? space.devices : [];
        devices.forEach((deviceRef, idx) => {
            const device = resolveDeviceFromRef(deviceRef, deviceIndex);
            tableData.push(buildBuildingDeviceRow(device, deviceRef, idx, nextLabels, nextIds));
        });

        const children = Array.isArray(space.children) ? space.children : [];
        children.forEach((child) => walk(child, nextLabels, nextIds, node));
        node.children.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }));
    };

    locations.forEach((space) => walk(space, [], [], treeRoot));
    treeRoot.children.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }));

    return { treeData: [treeRoot], tableData, tableColumns: tableLayouts.buildingDevices };
}

function buildTopologyIndex(project) {
    const devices = Array.isArray(project.devices) ? project.devices : [];
    const areas = new Map();
    const linesByArea = new Map();
    const segmentsByLine = new Map();
    const devicesBySegment = new Map();

    const areaInfo = new Map();
    (project.areas || []).forEach((area) => {
        if (!area || !area.address) return;
        const key = String(area.address);
        areaInfo.set(key, area);
        if (!areas.has(key)) {
            areas.set(key, {
                address: key,
                name: area.name || '',
                description: area.description || ''
            });
        }
    });
    const lineInfo = new Map();
    (project.lines || []).forEach((line) => {
        if (!line || line.area == null || line.line == null) return;
        const key = `${line.area}.${line.line}`;
        lineInfo.set(key, line);
        if (!linesByArea.has(String(line.area))) {
            linesByArea.set(String(line.area), new Map());
        }
        const lineMap = linesByArea.get(String(line.area));
        if (!lineMap.has(String(line.line))) {
            const label = line.name
                ? `Line ${line.area}.${line.line} : ${line.name}`
                : `Line ${line.area}.${line.line}`;
            lineMap.set(String(line.line), {
                key,
                area: String(line.area),
                line: String(line.line),
                name: line.name || '',
                description: line.description || '',
                medium: line.medium_type || '',
                label
            });
        }
    });

    devices.forEach((device) => {
        const address = String(device.individual_address || '');
        const [areaKey, lineKey] = address.split('.');
        if (!areaKey || !lineKey) return;

        if (!areas.has(areaKey)) {
            const area = areaInfo.get(areaKey);
            areas.set(areaKey, {
                address: areaKey,
                name: area && area.name ? area.name : '',
                description: area && area.description ? area.description : ''
            });
        }

        if (!linesByArea.has(areaKey)) {
            linesByArea.set(areaKey, new Map());
        }
        const lineMap = linesByArea.get(areaKey);
        if (!lineMap.has(lineKey)) {
            const lineData = lineInfo.get(`${areaKey}.${lineKey}`);
            const label = lineData && lineData.name
                ? `Line ${areaKey}.${lineKey} : ${lineData.name}`
                : `Line ${areaKey}.${lineKey}`;
            lineMap.set(lineKey, {
                key: `${areaKey}.${lineKey}`,
                area: areaKey,
                line: lineKey,
                name: lineData && lineData.name ? lineData.name : '',
                description: lineData && lineData.description ? lineData.description : '',
                medium: lineData && lineData.medium_type ? lineData.medium_type : '',
                label
            });
        }

        const segmentKey = resolveSegmentKey(device);
        const lineCompositeKey = `${areaKey}.${lineKey}`;
        const segmentCompositeKey = `${lineCompositeKey}|${segmentKey}`;
        if (!segmentsByLine.has(lineCompositeKey)) {
            segmentsByLine.set(lineCompositeKey, new Map());
        }
        const segmentMap = segmentsByLine.get(lineCompositeKey);
        if (!segmentMap.has(segmentCompositeKey)) {
            segmentMap.set(segmentCompositeKey, buildSegmentInfo(device, segmentKey, lineCompositeKey));
        }

        if (!devicesBySegment.has(segmentCompositeKey)) {
            devicesBySegment.set(segmentCompositeKey, []);
        }
        devicesBySegment.get(segmentCompositeKey).push(device);
    });

    areas.forEach((area) => {
        if (!linesByArea.has(area.address)) {
            linesByArea.set(area.address, new Map());
        }
    });

    return {
        areas,
        linesByArea,
        segmentsByLine,
        devicesBySegment
    };
}

function buildTopologyAreaRows(index) {
    const rows = [];
    index.areas.forEach((area) => {
        rows.push({
            id: `area-${area.address}`,
            icon: ICON.area,
            kind: 'area',
            graphId: buildAreaGraphId(area.address),
            data: {
                area: area.address,
                name: area.name || '',
                desc: area.description || ''
            },
            raw: area
        });
    });
    rows.sort((a, b) => String(a.data.area).localeCompare(String(b.data.area), undefined, { numeric: true }));
    return rows;
}

function buildTopologyLineRows(index, areaKey) {
    const rows = [];
    const lines = index.linesByArea.get(areaKey) || new Map();
    lines.forEach((line) => {
        rows.push({
            id: `line-${line.key}`,
            icon: ICON.line,
            kind: 'line',
            graphId: buildLineGraphId(line.key),
            data: {
                line: line.key,
                name: line.name || '',
                desc: line.description || '',
                medium: line.medium || ''
            },
            raw: line
        });
    });
    rows.sort((a, b) => String(a.data.line).localeCompare(String(b.data.line), undefined, { numeric: true }));
    return rows;
}

function buildTopologySegmentRows(index, lineKey) {
    const rows = [];
    const segments = index.segmentsByLine.get(lineKey) || new Map();
    segments.forEach((segment) => {
        rows.push({
            id: `segment-${segment.key}`,
            icon: ICON.object,
            kind: 'segment',
            data: {
                segment: segment.label,
                name: segment.name || '',
                medium: segment.medium || '',
                domain: segment.domain || ''
            },
            raw: segment
        });
    });
    rows.sort((a, b) => String(a.data.segment).localeCompare(String(b.data.segment), undefined, { numeric: true }));
    return rows;
}

function buildTopologyDeviceRows(devices) {
    const rows = (devices || []).map((dev) => ({
        id: dev.instance_id || dev.individual_address,
        icon: ICON.device,
        kind: 'device',
        graphId: buildDeviceGraphId(dev.individual_address),
        data: {
            address: dev.individual_address,
            name: dev.name,
            desc: dev.description || '',
            app: dev.app_program_name || '',
            man: dev.manufacturer || '',
            prod: dev.product || ''
        },
        raw: dev
    }));
    rows.sort((a, b) => String(a.data.address).localeCompare(String(b.data.address), undefined, { numeric: true }));
    return rows;
}

function buildTopologyDeviceRowsForLine(index, lineKey) {
    const collected = new Map();
    index.devicesBySegment.forEach((list, key) => {
        if (!key.startsWith(`${lineKey}|`)) return;
        list.forEach((device) => {
            const address = device.individual_address || device.instance_id || String(collected.size);
            if (!collected.has(address)) {
                collected.set(address, device);
            }
        });
    });
    return buildTopologyDeviceRows(Array.from(collected.values()));
}

function buildTopologyGroupObjectRows(device) {
    if (!device || !Array.isArray(device.group_links)) return [];
    const buildingInfo = resolveBuildingInfo(device.individual_address);
    const grouped = new Map();
    device.group_links.forEach((link, idx) => {
        const numberKey = link.number != null ? String(link.number) : '';
        const nameKey = link.object_name || '';
        const channelKey = link.channel || '';
        const key = `${numberKey}|${nameKey}|${channelKey}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                number: numberKey,
                object: link.object_name || '',
                func: link.object_function_text || '',
                desc: link.description || link.object_text || '',
                channel: link.channel || '',
                security: link.security || '',
                buildingFunction: link.building_function || buildingInfo.buildingFunction || '',
                buildingPart: link.building_part || buildingInfo.buildingPart || '',
                type: link.datapoint_type || '',
                size: link.object_size || '',
                flags: link.flags || null,
                links: [link],
                index: idx
            });
        } else {
            const entry = grouped.get(key);
            entry.links.push(link);
            if (!entry.type && link.datapoint_type) entry.type = link.datapoint_type;
            if (!entry.size && link.object_size) entry.size = link.object_size;
        }
    });

    const rows = Array.from(grouped.values()).map((entry) => {
        const addresses = [];
        entry.links.forEach((link) => {
            if (!link.group_address) return;
            if (!addresses.includes(link.group_address)) {
                addresses.push(link.group_address);
            }
        });
        const addressesLabel = addresses.join(', ');
        const size = entry.size || resolveDptSize(entry.type);
        const buildingInfo = resolveBuildingInfo(device.individual_address);
        return {
            id: `${device.instance_id || device.individual_address}-${entry.number || entry.index}`,
            icon: ICON.object,
            kind: 'group-object',
            meta: {
                buildingSpaceId: buildingInfo.buildingSpaceId || ''
            },
            data: {
                number: entry.number || '',
                object: entry.object || '',
                func: entry.func || '',
                group: addressesLabel,
                desc: entry.desc || '',
                channel: entry.channel || '',
                security: entry.security || '',
                buildingFunction: entry.buildingFunction || buildingInfo.buildingFunction || '',
                buildingPart: entry.buildingPart || buildingInfo.buildingPart || '',
                type: formatDptLabel(entry.type),
                size,
                ...buildFlagColumns(entry.flags)
            },
            raw: { links: entry.links, link: entry.links[0], device }
        };
    });
    rows.sort((a, b) => String(a.data.number || '').localeCompare(String(b.data.number || ''), undefined, { numeric: true }));
    return rows;
}

function resolveSegmentKey(device) {
    const number = device.segment_number != null ? String(device.segment_number) : '';
    const id = device.segment_id != null ? String(device.segment_id) : '';
    if (number) return number;
    if (id) return id;
    return '0';
}

function buildSegmentInfo(device, segmentKey, lineKey) {
    const number = device.segment_number != null ? String(device.segment_number) : '';
    const id = device.segment_id != null ? String(device.segment_id) : '';
    const label = number ? `Segment ${number}` : (id ? `Segment ${id}` : 'Segment 0');
    return {
        key: `${lineKey}|${segmentKey}`,
        label,
        name: id && number ? id : '',
        medium: device.segment_medium_type || '',
        domain: device.segment_domain_address || ''
    };
}

function formatTopologyDeviceLabel(device) {
    if (!device) return 'Device';
    if (device.name && device.individual_address) {
        return `${device.individual_address} - ${device.name}`;
    }
    return device.individual_address || device.name || 'Device';
}

function buildBuildingLabel(space) {
    if (!space) return '';
    const type = space.space_type || 'Space';
    if (space.name) return `${type} - ${space.name}`;
    if (space.number) return `${type} ${space.number}`;
    return type;
}

function buildingIcon(spaceType) {
    const key = String(spaceType || '').toLowerCase();
    if (key.includes('building')) return ICON.building;
    if (key.includes('floor')) return ICON.buildingFloor;
    if (key.includes('room')) return ICON.buildingRoom;
    if (key.includes('corridor')) return ICON.buildingCorridor;
    if (key.includes('stair')) return ICON.buildingStair;
    if (key.includes('function')) return ICON.buildingFunction;
    return ICON.buildingSite;
}

function resolveDeviceFromRef(deviceRef, deviceIndex) {
    if (!deviceRef) return null;
    const address = deviceRef.address || '';
    if (address && deviceIndex && deviceIndex.has(address)) {
        return deviceIndex.get(address);
    }
    return null;
}

function buildBuildingDeviceRow(device, deviceRef, idx, pathLabels, pathIds) {
    const address = device ? device.individual_address : (deviceRef && deviceRef.address ? deviceRef.address : '');
    const name = device ? device.name : (deviceRef && deviceRef.name ? deviceRef.name : '');
    const location = pathLabels.join(' / ');
    return {
        id: `${address || 'device'}-${idx}`,
        icon: ICON.device,
        kind: 'device',
        graphId: buildDeviceGraphId(address),
        meta: {
            spacePath: pathIds
        },
        data: {
            address: address || '',
            name: name || '',
            desc: device && device.description ? device.description : '',
            location: location || '',
            app: device && device.app_program_name ? device.app_program_name : '',
            man: device && device.manufacturer ? device.manufacturer : ''
        },
        raw: device || deviceRef
    };
}

function getBuildingLookup() {
    if (buildingLookupProject === state.currentProject && buildingLookupCache) {
        return buildingLookupCache;
    }
    const lookup = new Map();
    const project = state.currentProject;
    if (!project || !Array.isArray(project.locations)) {
        buildingLookupCache = lookup;
        buildingLookupProject = project;
        return lookup;
    }

    const walk = (spaces, path) => {
        spaces.forEach((space) => {
            if (!space) return;
            const label = buildBuildingLabel(space);
            const nextPath = label ? path.concat([{ label, type: space.space_type }]) : path;
            const part = nextPath.map(item => item.label).join(' / ');
            const func = space.space_type || '';

            const devices = Array.isArray(space.devices) ? space.devices : [];
            devices.forEach((deviceRef) => {
                if (deviceRef && deviceRef.address) {
                    lookup.set(deviceRef.address, {
                        buildingPart: part,
                        buildingFunction: func,
                        buildingSpaceId: space.id || ''
                    });
                }
            });

            const children = Array.isArray(space.children) ? space.children : [];
            if (children.length) {
                walk(children, nextPath);
            }
        });
    };

    walk(project.locations, []);
    buildingLookupCache = lookup;
    buildingLookupProject = project;
    return lookup;
}

function resolveBuildingInfo(address) {
    if (!address) return { buildingPart: '', buildingFunction: '', buildingSpaceId: '' };
    const lookup = getBuildingLookup();
    return lookup.get(address) || { buildingPart: '', buildingFunction: '', buildingSpaceId: '' };
}

function splitGroupAddress(address) {
    const parts = String(address || '').split(/[/.]/).filter(Boolean);
    return {
        main: parts[0] || '',
        middle: parts[1] || '',
        sub: parts[2] || ''
    };
}

function buildFlagColumns(flags) {
    const enabled = new Set();
    if (!flags) {
        return { C: '', R: '', W: '', T: '', U: '' };
    }
    if (typeof flags === 'string') {
        flags.toUpperCase().replace(/[^CRWTU]/g, '').split('').forEach((flag) => {
            if (flag) enabled.add(flag);
        });
    } else {
        if (flags.communication) enabled.add('C');
        if (flags.read) enabled.add('R');
        if (flags.write) enabled.add('W');
        if (flags.transmit) enabled.add('T');
        if (flags.update) enabled.add('U');
    }
    const mark = (flag) => (enabled.has(flag) ? 'x' : '');
    return {
        C: mark('C'),
        R: mark('R'),
        W: mark('W'),
        T: mark('T'),
        U: mark('U')
    };
}

function resolveGraphIdFromRow(item) {
    const kind = item.kind || '';
    const data = item.data || {};
    if (kind === 'group-address') {
        return buildGroupAddressGraphId(data.address);
    }
    if (kind === 'device') {
        return buildDeviceGraphId(data.address);
    }
    if (kind === 'line') {
        return buildLineGraphId(data.line);
    }
    if (kind === 'area') {
        return buildAreaGraphId(data.area);
    }
    return '';
}

function buildGroupAddressGraphId(address) {
    const clean = String(address || '').replace(/[/.]/g, '_');
    return clean ? `ga_${clean}` : '';
}

function buildDeviceGraphId(address) {
    const clean = String(address || '').replace(/[/.]/g, '_');
    return clean ? `device_${clean}` : '';
}

function buildLineGraphId(lineKey) {
    const clean = String(lineKey || '').split('.');
    if (clean.length < 2) return '';
    return `line_${clean[0]}_${clean[1]}`;
}

function buildAreaGraphId(areaKey) {
    const clean = String(areaKey || '').trim();
    return clean ? `area_${clean}` : '';
}


// ----------------------------------------------------------------------
// RENDERERS
// ----------------------------------------------------------------------

function renderSidebarTree(config, treeData) {
    const dom = getDom();
    if (!dom.sidebarTitle) return;
    if (dom.sidebarTitleText) {
        dom.sidebarTitleText.textContent = `${config.sidebarIcon} ${config.title}`;
    }

    treeNodeIndex = new Map();
    treeIdCounter = 0;
    dom.sidebarTree.innerHTML = renderTreeNodes(treeData);
}

function renderTreeNodes(nodes, depth = 0) {
    return nodes.map(node => {
        const nodeId = nextTreeId();
        const hasChildren = Boolean(
            (node.children && node.children.length > 0) ||
            (node.lazyChildren && node.lazyChildren.length > 0)
        );
        const expanded = hasChildren && (depth < 2 || node.expanded === true);
        const paddingLeft = TREE_INDENT_BASE + depth * TREE_INDENT_STEP;
        treeNodeIndex.set(nodeId, node);
        return `
        <div class="tree-item" style="padding-left: ${paddingLeft}px;"
             data-node-id="${nodeId}" 
             data-has-children="${hasChildren}" 
             data-expanded="${expanded}"
             data-label="${node.label}"
             data-kind="${node.kind || ''}"
             data-value="${node.value || ''}"
             data-area="${node.area || ''}"
             data-line="${node.line || ''}"
             data-segment="${node.segment || ''}"
             data-space-id="${node.spaceId || ''}"
             data-device-address="${node.deviceAddress || ''}"
             data-device-id="${node.deviceId || ''}"
             data-depth="${depth}">
            <span class="expand-icon" style="${hasChildren ? 'cursor: pointer;' : 'opacity: 0;'}">${hasChildren ? (expanded ? ICON.chevronDown : ICON.chevronRight) : ''}</span>
            <span class="icon">${node.icon || ICON.file}</span>
            <span>${node.label}</span>
        </div>
        <div id="children-${nodeId}" style="${hasChildren && expanded ? '' : 'display: none;'}">
            ${hasChildren && expanded ? renderTreeNodes(node.children || node.lazyChildren || [], depth + 1) : ''}
        </div>
    `;
    }).join('');
}

function applyTreeSelection(item, options = {}) {
    if (!item) return;
    if (selectedTreeItem && selectedTreeItem !== item) {
        selectedTreeItem.classList.remove('selected');
    }
    item.classList.add('selected');
    selectedTreeItem = item;

    const selection = buildTreeSelection(item);
    setSelectionFromTree(selection);
    updateGraphFiltersFromSelection(selection);
    filterTableByTreeSelection(selection);

    const dom = getDom();
    if (dom.graphView.style.display !== 'none') {
        applyFiltersAndRender();
    }
    if (options.scrollIntoView) {
        item.scrollIntoView({ block: 'nearest' });
    }
}

function handleTreeItemClick(e, item) {
    e.stopPropagation();
    const hasChildren = item.dataset.hasChildren === 'true';
    const isExpanded = item.dataset.expanded === 'true';
    const nodeId = item.dataset.nodeId;

    applyTreeSelection(item);

    // Expansion logic
    const wantsToggle = Boolean(e.target.closest('.expand-icon')) || e.detail >= 2;
    if (hasChildren && wantsToggle) {
        // Toggle expansion
        item.dataset.expanded = !isExpanded;
        const expandIcon = item.querySelector('.expand-icon');
        const childrenContainer = document.getElementById(`children-${nodeId}`);

        if (expandIcon) expandIcon.textContent = !isExpanded ? ICON.chevronDown : ICON.chevronRight;
        if (childrenContainer) {
            if (!isExpanded && childrenContainer.childElementCount === 0) {
                materializeLazyChildren(item, childrenContainer);
            }
            childrenContainer.style.display = !isExpanded ? 'block' : 'none';
        }
    }
}

function buildTreeSelection(item) {
    return {
        kind: item.dataset.kind || '',
        value: item.dataset.value || '',
        label: item.dataset.label || '',
        area: item.dataset.area || '',
        line: item.dataset.line || '',
        segment: item.dataset.segment || '',
        spaceId: item.dataset.spaceId || '',
        deviceAddress: item.dataset.deviceAddress || '',
        deviceId: item.dataset.deviceId || ''
    };
}

function handleTreeContextMenu(event, item) {
    const selection = buildTreeSelection(item);
    const label = selection.label || selection.value || '';
    const items = [];
    if (label) {
        items.push({
            label: `Copy "${label.length > 32 ? `${label.slice(0, 32)}…` : label}"`,
            action: () => copyTextToClipboard(label)
        });
        items.push({
            label: 'Search on the web',
            action: () => openWebSearch(label)
        });
    }

    const navItems = [];
    if (selection.kind === 'group-address' && selection.value) {
        navItems.push({ label: 'Open Group Address', action: () => requestNavigation({ type: 'group-address', address: selection.value }) });
    } else if (selection.kind === 'device' && selection.deviceAddress) {
        navItems.push({ label: 'Open Device (Topology)', action: () => requestNavigation({ type: 'device', address: selection.deviceAddress }) });
    }

    if (navItems.length) {
        items.push({ type: 'separator' });
        items.push(...navItems);
    }

    if (!items.length) return;
    event.preventDefault();
    openContextMenu(items, { x: event.clientX, y: event.clientY });
}

function materializeLazyChildren(item, container) {
    const nodeId = item.dataset.nodeId;
    const node = treeNodeIndex.get(nodeId);
    if (!node) return;
    const children = node.lazyChildren && node.lazyChildren.length
        ? node.lazyChildren
        : (node.children || []);
    if (!children.length) return;
    if (node.lazyChildren && node.lazyChildren.length) {
        node.children = node.children || [];
        node.children.push(...node.lazyChildren);
        node.lazyChildren = [];
    }
    const depth = Number(item.dataset.depth || 0);
    container.innerHTML = renderTreeNodes(node.children || children, depth + 1);
}

function expandTree(expandAll) {
    const dom = getDom();
    if (!dom || !dom.sidebarTree) return;
    let pending = true;
    while (pending) {
        pending = false;
        const items = Array.from(dom.sidebarTree.querySelectorAll('.tree-item'));
        items.forEach(item => {
            if (item.dataset.hasChildren !== 'true') return;
            const nodeId = item.dataset.nodeId;
            const childrenContainer = document.getElementById(`children-${nodeId}`);
            if (!childrenContainer) return;
            if (childrenContainer.childElementCount === 0) {
                materializeLazyChildren(item, childrenContainer);
                pending = true;
            }
            childrenContainer.style.display = 'block';
            item.dataset.expanded = 'true';
            const expandIcon = item.querySelector('.expand-icon');
            if (expandIcon) expandIcon.textContent = ICON.chevronDown;
        });
    }
}

function collapseTree(collapseAll) {
    const dom = getDom();
    if (!dom || !dom.sidebarTree) return;
    dom.sidebarTree.querySelectorAll('.tree-item').forEach(item => {
        if (item.dataset.hasChildren !== 'true') return;
        const depth = Number(item.dataset.depth || 0);
        if (!collapseAll && depth === 0) return;
        const nodeId = item.dataset.nodeId;
        const childrenContainer = document.getElementById(`children-${nodeId}`);
        if (childrenContainer) {
            childrenContainer.style.display = 'none';
        }
        item.dataset.expanded = 'false';
        const expandIcon = item.querySelector('.expand-icon');
        if (expandIcon) expandIcon.textContent = ICON.chevronRight;
    });
}

function updateGraphFiltersFromSelection(selection) {
    const nextFilters = {
        ...state.filters,
        area: 'all',
        line: 'all',
        mainGroup: 'all',
        groupAddress: 'all',
        buildingSpace: 'all',
        deviceManufacturer: 'all'
    };

    if (state.currentView === 'group') {
        if (selection.kind === 'group-main') {
            nextFilters.mainGroup = selection.value;
        } else if (selection.kind === 'group-middle') {
            nextFilters.mainGroup = selection.value;
        } else if (selection.kind === 'group-address') {
            nextFilters.groupAddress = selection.value;
        }
        stateManager.setState('filters', nextFilters);
        return;
    }

    if (state.currentView === 'topology') {
        if (selection.kind === 'area') {
            nextFilters.area = selection.area;
        } else if (selection.kind === 'line') {
            nextFilters.area = selection.area;
            nextFilters.line = selection.line ? `${selection.area}.${selection.line}` : 'all';
        } else if (selection.kind === 'segment') {
            nextFilters.area = selection.area;
            nextFilters.line = selection.line ? `${selection.area}.${selection.line}` : 'all';
        } else if (selection.kind === 'device') {
            nextFilters.area = selection.area;
            nextFilters.line = selection.line ? `${selection.area}.${selection.line}` : 'all';
        }
        stateManager.setState('filters', nextFilters);
        return;
    }

    if (state.currentView === 'devices') {
        if (selection.kind === 'device-manufacturer') {
            nextFilters.deviceManufacturer = selection.value || 'all';
        } else if (selection.kind === 'device') {
            const parts = String(selection.deviceAddress || '').split('.');
            if (parts.length >= 2) {
                nextFilters.area = parts[0];
                nextFilters.line = `${parts[0]}.${parts[1]}`;
            }
        }
        stateManager.setState('filters', nextFilters);
        return;
    }

    if (state.currentView === 'buildings') {
        if (selection.kind === 'building-space' && selection.spaceId) {
            nextFilters.buildingSpace = selection.spaceId;
        }
    }
    stateManager.setState('filters', nextFilters);
}

function filterTableByTreeSelection(selection) {
    if (!state.currentTableData) return;

    if (state.currentView === 'group') {
        if (selection.kind === 'group-address' && selection.value) {
            const rows = buildGroupAddressObjectRows(selection.value);
            renderTableHeader(tableLayouts.groupObjects);
            renderTableBody(rows);
            return;
        }
        renderTableHeader(tableLayouts.groupAddresses);
        const filter = state.filters.mainGroup;
        if (filter && filter !== 'all') {
            if (filter.startsWith('main:')) {
                const main = filter.slice(5);
                const filtered = state.currentTableData.filter(row => row.data.address.startsWith(`${main}/`));
                renderTableBody(filtered);
                return;
            }
            if (filter.startsWith('mid:')) {
                const rest = filter.slice(4);
                const [main, middle] = rest.split('/');
                const prefix = `${main}/${middle}`;
                const filtered = state.currentTableData.filter(row =>
                    row.data.address === prefix || row.data.address.startsWith(`${prefix}/`)
                );
                renderTableBody(filtered);
                return;
            }
        }
    }

    if (state.currentView === 'topology') {
        const index = state.topologyIndex;
        if (!index) {
            renderTableBody([]);
            return;
        }
        if (selection.kind === 'area') {
            renderTableHeader(tableLayouts.topologyLines);
            renderTableBody(buildTopologyLineRows(index, selection.area));
            return;
        }
        if (selection.kind === 'line') {
            const lineKey = `${selection.area}.${selection.line}`;
            renderTableHeader(tableLayouts.topologySegments);
            const segmentRows = buildTopologySegmentRows(index, lineKey);
            if (segmentRows.length <= 1) {
                renderTableHeader(tableLayouts.topologyDevices);
                renderTableBody(buildTopologyDeviceRowsForLine(index, lineKey));
            } else {
                renderTableBody(segmentRows);
            }
            return;
        }
        if (selection.kind === 'segment') {
            renderTableHeader(tableLayouts.topologyDevices);
            const devices = index.devicesBySegment.get(selection.segment) || [];
            renderTableBody(buildTopologyDeviceRows(devices));
            return;
        }
        if (selection.kind === 'device') {
            const device = (state.currentProject.devices || []).find(
                (dev) => dev.individual_address === selection.deviceAddress
            );
            renderTableHeader(tableLayouts.topologyObjects);
            renderTableBody(buildTopologyGroupObjectRows(device));
            return;
        }
        renderTableHeader(tableLayouts.topologyAreas);
        renderTableBody(buildTopologyAreaRows(index));
        return;
    }

    if (state.currentView === 'devices') {
        if (selection.kind === 'device-manufacturer') {
            renderTableHeader(tableLayouts.topologyDevices);
            const filtered = state.currentTableData.filter(row => row.data.man === selection.value);
            renderTableBody(filtered);
            return;
        }
        if (selection.kind === 'device') {
            const device = (state.currentProject.devices || []).find(
                (dev) => dev.individual_address === selection.deviceAddress
            );
            renderTableHeader(tableLayouts.topologyObjects);
            renderTableBody(buildTopologyGroupObjectRows(device));
            return;
        }
        renderTableHeader(tableLayouts.topologyDevices);
        renderTableBody(state.currentTableData);
        return;
    }

    if (state.currentView === 'buildings') {
        renderTableHeader(tableLayouts.buildingDevices);
        if (selection.kind === 'building-space' && selection.spaceId) {
            const filtered = state.currentTableData.filter(row =>
                row.meta && Array.isArray(row.meta.spacePath) && row.meta.spacePath.includes(selection.spaceId)
            );
            renderTableBody(filtered);
            return;
        }
    }

    // "All items" or root
    renderTableBody(state.currentTableData);
}

function buildGroupAddressObjectRows(address) {
    const graph = state.currentProject && state.currentProject.group_address_graph
        ? state.currentProject.group_address_graph
        : null;
    if (!graph || !Array.isArray(graph.nodes)) return [];

    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const objects = graph.nodes.filter((node) =>
        node.kind === 'groupobject' &&
        node.properties &&
        node.properties.group_address === address
    );

    const rows = objects.map((obj, idx) => {
        const parent = obj.parent_id ? nodeById.get(obj.parent_id) : null;
        const deviceLabel = parent ? formatDeviceName(parent) : '';
        const props = obj.properties || {};
        const flags = props ? (props.flags || props.flags_text || '') : '';
        const dptRaw = props.datapoint_type || '';
        const sizeValue = props.object_size || resolveDptSize(dptRaw);
        const deviceAddress = parent && parent.properties ? parent.properties.address : '';
        const buildingInfo = resolveBuildingInfo(deviceAddress);
        const numberKey = props.number != null ? props.number : idx;
        return {
            id: `${obj.id || address}-${numberKey}`,
            icon: ICON.object,
            kind: 'group-object',
            graphId: obj.id || '',
            meta: {
                buildingSpaceId: buildingInfo.buildingSpaceId || ''
            },
            data: {
                number: props.number != null ? String(props.number) : '',
                object: props.object_name || props.object_name_raw || '',
                deviceAddress: deviceAddress || '',
                device: deviceLabel || (parent ? parent.label : ''),
                func: props.object_function_text || '',
                desc: props.description || props.object_text || '',
                channel: props.channel || '',
                security: props.security || '',
                buildingFunction: props.building_function || buildingInfo.buildingFunction || '',
                buildingPart: props.building_part || buildingInfo.buildingPart || '',
                type: formatDptLabel(dptRaw),
                size: sizeValue,
                ...buildFlagColumns(flags),
            },
            raw: { node: obj, device: parent }
        };
    });
    rows.sort((a, b) => String(a.data.number || '').localeCompare(String(b.data.number || ''), undefined, { numeric: true }));
    return rows;
}

function renderTableHeader(columns, sampleRow, keepOrder = false) {
    const dom = getDom();
    if (!dom || !dom.tableHead) return;
    lastTableColumns = columns;
    const signature = columns.join('|');
    if (signature !== tableColumnSignature) {
        tableColumnSignature = signature;
        tableColumnWidths = new Map();
        tableColumnKeys = [];
    }
    if (!keepOrder || tableColumnLabels.length !== columns.length - 2) {
        tableColumnLabels = columns.slice(2);
    }
    if (sampleRow && sampleRow.data) {
        tableColumnKeys = Object.keys(sampleRow.data);
    }
    tableSortState = { index: null, direction: 'asc' };

    const headers = tableColumnLabels.map((label, idx) => {
        const cls = 'sortable';
        const handle = `<span class="col-resizer" data-col-index="${idx}"></span>`;
        return `<th class="${cls}" data-sort-index="${idx}" draggable="true">${label}${handle}</th>`;
    });
    const headCells = [
        '<th></th>',
        '<th></th>',
        ...headers
    ];
    dom.tableHead.innerHTML = `<tr>${headCells.join('')}</tr>`;
    applyColumnWidths();
}

function renderTableBody(data) {
    const dom = getDom();
    if (!dom || !dom.tableBody) return;
    const rows = Array.isArray(data) ? data : [];
    if (rows.length && (!tableColumnKeys.length || tableColumnKeys.length !== Object.keys(rows[0].data || {}).length)) {
        tableColumnKeys = Object.keys(rows[0].data || {});
        if (lastTableColumns.length) {
            renderTableHeader(lastTableColumns, rows[0]);
        }
    }
    tableSourceData = rows;
    selectedTableRow = null;
    const filtered = applyTableSearch(rows);
    const sorted = applyTableSort(filtered);

    tableRowIndex = new Map();
    tableRowByGraphId = new Map();
    tableRowPositions = new Map();
    sorted.forEach((row, index) => {
        tableRowIndex.set(row.id, row);
        tableRowPositions.set(row.id, index);
        const graphId = row.graphId || resolveGraphIdFromRow(row);
        if (graphId && !tableRowByGraphId.has(graphId)) {
            tableRowByGraphId.set(graphId, row);
        }
    });
    tableSortedRows = sorted;

    tableVirtualMode = sorted.length > TABLE_VIRTUAL_THRESHOLD;
    if (tableVirtualMode) {
        tableVisibleStart = 0;
        tableVisibleEnd = 0;
        bindTableScroll();
        if (dom.tableView) {
            dom.tableView.scrollTop = 0;
        }
        scheduleTableRender(true);
    } else {
        renderAllTableRows(sorted);
    }
}

function bindTableScroll() {
    const dom = getDom();
    if (!dom || !dom.tableView || tableScrollBound) return;
    dom.tableView.addEventListener('scroll', () => {
        if (!tableVirtualMode) return;
        scheduleTableRender(false);
    });
    tableScrollBound = true;
}

function scheduleTableRender(force) {
    if (tableRenderFrame) return;
    tableRenderFrame = requestAnimationFrame(() => {
        tableRenderFrame = null;
        if (tableVirtualMode) {
            renderVirtualTable(force);
        }
    });
}

function renderAllTableRows(rows) {
    const dom = getDom();
    if (!dom || !dom.tableBody) return;
    const fragment = document.createDocumentFragment();
    rows.forEach((row, index) => {
        fragment.appendChild(buildTableRow(row, index));
    });
    dom.tableBody.innerHTML = '';
    dom.tableBody.appendChild(fragment);
    if (state.selectedId) {
        const row = dom.tableBody.querySelector(`tr[data-id="${state.selectedId}"]`);
        if (row) {
            selectedTableRow = row;
        }
    }
    applyColumnWidths();
}

function renderVirtualTable(force) {
    const dom = getDom();
    if (!dom || !dom.tableBody || !dom.tableView) return;
    const total = tableSortedRows.length;
    if (!total) {
        dom.tableBody.innerHTML = '';
        return;
    }
    tableRowHeight = measureTableRowHeight(dom);
    const viewportHeight = dom.tableView.clientHeight || 1;
    const scrollTop = dom.tableView.scrollTop || 0;
    const start = Math.max(0, Math.floor(scrollTop / tableRowHeight) - TABLE_OVERSCAN);
    const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / tableRowHeight) + TABLE_OVERSCAN);
    if (!force && start === tableVisibleStart && end === tableVisibleEnd) {
        return;
    }
    tableVisibleStart = start;
    tableVisibleEnd = end;

    const fragment = document.createDocumentFragment();
    const columnCount = 2 + (tableColumnKeys.length || Object.keys(tableSortedRows[0].data || {}).length);
    const topSpacer = createTableSpacer(start * tableRowHeight, columnCount);
    if (topSpacer) fragment.appendChild(topSpacer);
    for (let i = start; i < end; i += 1) {
        fragment.appendChild(buildTableRow(tableSortedRows[i], i));
    }
    const bottomSpacer = createTableSpacer((total - end) * tableRowHeight, columnCount);
    if (bottomSpacer) fragment.appendChild(bottomSpacer);

    dom.tableBody.innerHTML = '';
    dom.tableBody.appendChild(fragment);
    if (state.selectedId) {
        const row = dom.tableBody.querySelector(`tr[data-id="${state.selectedId}"]`);
        if (row) {
            selectedTableRow = row;
        }
    }
    applyColumnWidths();
}

function measureTableRowHeight(dom) {
    const container = dom.tableView;
    if (container) {
        const computed = getComputedStyle(container);
        const val = parseFloat(computed.getPropertyValue('--table-row-height'));
        if (Number.isFinite(val) && val > 0) {
            return val;
        }
    }
    const row = dom.tableBody.querySelector('tr.table-row');
    if (row) {
        const rect = row.getBoundingClientRect();
        if (rect && rect.height) return rect.height;
    }
    return tableRowHeight || 28;
}

function createTableSpacer(height, columnCount) {
    if (!height || height < 1) return null;
    const spacer = document.createElement('tr');
    spacer.className = 'table-spacer';
    const cell = document.createElement('td');
    cell.colSpan = columnCount;
    cell.style.height = `${height}px`;
    spacer.appendChild(cell);
    return spacer;
}

function buildTableRow(row, index) {
    const tr = document.createElement('tr');
    tr.dataset.id = row.id;
    tr.className = `table-row ${index % 2 === 0 ? 'row-even' : 'row-odd'}`;
    if (state.selectedId && row.id === state.selectedId) {
        tr.classList.add('selected-row');
    }
    const emptyCell = document.createElement('td');
    tr.appendChild(emptyCell);
    const iconCell = document.createElement('td');
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = row.icon || '';
    iconCell.appendChild(icon);
    tr.appendChild(iconCell);

    const data = row.data || {};
    const keys = tableColumnKeys.length ? tableColumnKeys : Object.keys(data);
    const cells = keys.map((key) => data[key]);
    cells.forEach((value, idx) => {
        const key = keys[idx];
        const td = document.createElement('td');
        td.textContent = value == null ? '' : String(value);
        if (key) {
            td.dataset.field = key;
        }
        if (value != null && value !== '') {
            td.dataset.value = String(value);
        }
        applyTableCellNavigation(row, key, value, td);
        tr.appendChild(td);
    });
    return tr;
}

function applyTableCellNavigation(row, key, value, cell) {
    if (!row || !cell || !key) return;
    let navKind = '';
    let navValue = '';
    if (row.kind === 'group-address' && key === 'address') {
        navKind = 'group-address';
        navValue = String(value || '');
    } else if (row.kind === 'device' && key === 'address') {
        navKind = 'device';
        navValue = String(value || '');
    } else if (row.kind === 'group-object') {
        if (key === 'deviceAddress') {
            navKind = 'device';
            navValue = String(value || '');
        } else if (key === 'group') {
            navKind = 'group-address';
            navValue = normalizeGroupAddress(resolveFirstGroupAddress(value));
        }
    }
    if (!navKind && (key === 'buildingFunction' || key === 'buildingPart')) {
        const spaceId = row.meta && row.meta.buildingSpaceId ? row.meta.buildingSpaceId : '';
        if (spaceId) {
            navKind = 'building-space';
            navValue = spaceId;
        }
    }

    if (!navKind || !navValue) return;
    cell.dataset.navKind = navKind;
    cell.dataset.navValue = navValue;
    cell.classList.add('table-cell-nav');
}

function resolveFirstGroupAddress(value) {
    if (!value) return '';
    const str = String(value);
    if (!str) return '';
    if (!str.includes(',')) return str.trim();
    return str.split(',')[0].trim();
}

function normalizeGroupAddress(value) {
    if (!value) return '';
    const str = String(value).trim();
    if (!str) return '';
    const match = str.match(/(\d{1,3}\/\d{1,3}(?:\/\d{1,3})?)/);
    return match ? match[1] : str;
}

function applyTableSearch(rows) {
    if (!tableSearchQuery) return rows;
    return rows.filter((row) => {
        const values = Object.values(row.data || {}).map(val => String(val || '').toLowerCase());
        return values.some((value) => value.includes(tableSearchQuery));
    });
}

function applyTableSort(rows) {
    if (tableSortState.index == null) return rows;
    const sorted = rows.slice();
    const direction = tableSortState.direction === 'desc' ? -1 : 1;
    sorted.sort((a, b) => {
        const aVal = getTableValue(a, tableSortState.index);
        const bVal = getTableValue(b, tableSortState.index);
        return direction * compareTableValues(aVal, bVal);
    });
    return sorted;
}

function exportTableCsv() {
    const rows = applyTableSort(applyTableSearch(tableSourceData || []));
    if (!rows.length || !tableColumnLabels.length) return;
    const keys = tableColumnKeys.length ? tableColumnKeys : Object.keys(rows[0].data || {});
    const header = tableColumnLabels;
    const lines = [];
    lines.push(header.map(escapeCsv).join(','));
    rows.forEach((row) => {
        const data = row.data || {};
        const values = keys.map((key) => data[key]);
        lines.push(values.map(escapeCsv).join(','));
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `topobus-${state.currentView}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function escapeCsv(value) {
    if (value == null) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function getTableValue(row, index) {
    const key = tableColumnKeys[index];
    if (key && row.data) {
        return row.data[key] != null ? row.data[key] : '';
    }
    return '';
}

function compareTableValues(a, b) {
    const aStr = String(a || '');
    const bStr = String(b || '');
    const aNum = Number(aStr.replace(/[^\d.-]/g, ''));
    const bNum = Number(bStr.replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        if (aNum !== bNum) return aNum - bNum;
    }
    return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
}

function resolveNavigationTargetFromTable(event) {
    if (!event) return null;
    const base = event.target instanceof Element ? event.target : event.target && event.target.parentElement ? event.target.parentElement : null;
    if (!base) return null;
    const cell = base.closest('td');
    if (!cell) return null;
    const kind = cell.dataset.navKind || '';
    let value = cell.dataset.navValue || '';
    if (!kind || !value) return null;
    if (kind === 'group-address') {
        value = normalizeGroupAddress(value);
        if (!value) return null;
    }
    return { type: kind, address: value };
}

function extractGroupAddressesFromRow(row) {
    if (!row) return [];
    const addresses = [];
    const dataGroup = row.data && row.data.group ? String(row.data.group) : '';
    if (dataGroup) {
        dataGroup.split(',').forEach((part) => {
            const trimmed = part.trim();
            if (trimmed && !addresses.includes(trimmed)) {
                addresses.push(trimmed);
            }
        });
    }
    const rawLinks = row.raw && Array.isArray(row.raw.links) ? row.raw.links : [];
    rawLinks.forEach((link) => {
        if (link && link.group_address && !addresses.includes(link.group_address)) {
            addresses.push(link.group_address);
        }
    });
    const rawLink = row.raw && row.raw.link ? row.raw.link : null;
    if (rawLink && rawLink.group_address && !addresses.includes(rawLink.group_address)) {
        addresses.push(rawLink.group_address);
    }
    const nodeProps = row.raw && row.raw.node && row.raw.node.properties ? row.raw.node.properties : null;
    if (nodeProps && nodeProps.group_address && !addresses.includes(nodeProps.group_address)) {
        addresses.push(nodeProps.group_address);
    }
    return addresses;
}

function extractDeviceAddressFromRow(row) {
    if (!row) return '';
    if (row.data && row.data.deviceAddress) return String(row.data.deviceAddress || '');
    if (row.data && row.data.address && row.kind === 'device') return String(row.data.address || '');
    const rawDevice = row.raw && row.raw.device ? row.raw.device : null;
    if (rawDevice && rawDevice.individual_address) return rawDevice.individual_address;
    if (row.raw && row.raw.node && row.raw.node.parent_id && state && state.currentNodeIndex) {
        const parent = state.currentNodeIndex.get(row.raw.node.parent_id);
        if (parent && parent.properties && parent.properties.address) {
            return parent.properties.address;
        }
    }
    return '';
}

function handleTableRowClick(row, event) {
    if (!row || !row.dataset.id) return;
    const navTarget = resolveNavigationTargetFromTable(event);
    if (navTarget) {
        requestNavigation(navTarget);
        return;
    }
    const item = tableRowIndex.get(row.dataset.id);
    if (!item) return;
    if (selectedTableRow && selectedTableRow !== row) {
        selectedTableRow.classList.remove('selected-row');
    }
    row.classList.add('selected-row');
    selectedTableRow = row;
    selectTableItem(item);
}

function handleTableContextMenu(event, rowEl) {
    const item = rowEl && rowEl.dataset.id ? tableRowIndex.get(rowEl.dataset.id) : null;
    if (!item) return;
    const base = event.target instanceof Element ? event.target : event.target && event.target.parentElement ? event.target.parentElement : null;
    const cell = base ? base.closest('td') : null;
    const cellText = cell ? String(cell.textContent || '').trim() : '';
    const items = [];

    if (cellText) {
        items.push({
            label: `Copy "${cellText.length > 32 ? `${cellText.slice(0, 32)}…` : cellText}"`,
            action: () => copyTextToClipboard(cellText)
        });
        items.push({
            label: 'Search on the web',
            action: () => openWebSearch(cellText)
        });
    }

    const navItems = [];
    if (item.kind === 'group-address' && item.data && item.data.address) {
        navItems.push({ label: 'Open Group Address', action: () => requestNavigation({ type: 'group-address', address: item.data.address }) });
    } else if (item.kind === 'device') {
        const deviceAddress = item.data && item.data.address ? item.data.address : extractDeviceAddressFromRow(item);
        if (deviceAddress) {
            navItems.push({ label: 'Open Device (Topology)', action: () => requestNavigation({ type: 'device', address: deviceAddress }) });
        }
    } else if (item.kind === 'group-object') {
        const deviceAddress = extractDeviceAddressFromRow(item);
        if (deviceAddress) {
            navItems.push({ label: 'Open Device (Topology)', action: () => requestNavigation({ type: 'device', address: deviceAddress }) });
        }
        const addresses = extractGroupAddressesFromRow(item);
        addresses.slice(0, 4).forEach((address) => {
            const normalized = normalizeGroupAddress(address);
            if (!normalized) return;
            navItems.push({ label: `Open Group Address (${normalized})`, action: () => requestNavigation({ type: 'group-address', address: normalized }) });
        });
    }

    if (navItems.length) {
        items.push({ type: 'separator' });
        items.push(...navItems);
    }

    if (!items.length) return;
    event.preventDefault();
    openContextMenu(items, { x: event.clientX, y: event.clientY });
}

function syncTableSelectionFromGraph(cell) {
    if (!cell) return;
    const match = tableRowByGraphId.get(cell.id);
    if (!match) return;
    const dom = getDom();
    if (!dom || !dom.tableBody) return;
    if (tableVirtualMode && tableRowPositions.has(match.id) && dom.tableView) {
        ensureRowVisible(match.id, dom.tableView);
        renderVirtualTable(true);
    }
    const row = dom.tableBody.querySelector(`tr[data-id="${match.id}"]`);
    if (!row) return;
    if (selectedTableRow && selectedTableRow !== row) {
        selectedTableRow.classList.remove('selected-row');
    }
    row.classList.add('selected-row');
    selectedTableRow = row;
    selectTableItem(match, { fromGraph: true });
}

function ensureRowVisible(rowId, container) {
    const index = tableRowPositions.get(rowId);
    if (!Number.isFinite(index)) return;
    const rowTop = index * tableRowHeight;
    const rowBottom = rowTop + tableRowHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (rowTop < viewTop) {
        container.scrollTop = Math.max(0, rowTop - tableRowHeight * 2);
    } else if (rowBottom > viewBottom) {
        container.scrollTop = Math.max(0, rowBottom - container.clientHeight + tableRowHeight * 2);
    }
}

function selectTableItem(item, options = {}) {
    const fromGraph = options.fromGraph === true;
    if (!item) {
        stateManager.setState('selectedId', null);
        if (!fromGraph) {
            setSelectionFromTable(null);
            selectCell(null);
        }
        return;
    }
    stateManager.setState('selectedId', item.id);
    const graphCell = fromGraph ? null : resolveGraphCell(item);
    if (graphCell) {
        selectCell(graphCell);
        return;
    }
    if (!fromGraph) {
        setSelectionFromTable(item);
        linkSelectionToGraph(item);
    }
}

function linkSelectionToGraph(item) {
    const dom = getDom();
    if (!dom || !dom.graphView || dom.graphView.style.display === 'none') return;
    if (!state.graph || !item) return;
    const graphId = item.graphId || resolveGraphIdFromRow(item);
    if (!graphId) return;
    const cell = state.graph.getCell(graphId);
    if (cell) {
        highlightCell(cell);
    }
}

function resolveGraphCell(item) {
    if (!state.graph || !item) return null;
    const graphId = item.graphId || resolveGraphIdFromRow(item);
    if (!graphId) return null;
    return state.graph.getCell(graphId) || null;
}

// ----------------------------------------------------------------------
// NAVIGATION
// ----------------------------------------------------------------------

let navigationBound = false;

function registerNavigationHandlers() {
    if (navigationBound) return;
    navigationBound = true;
    const handler = (detail) => {
        if (!detail || !detail.type) return;
        if (detail.type === 'group-address') {
            navigateToGroupAddress(detail.address || '');
        } else if (detail.type === 'device') {
            navigateToDevice(detail.address || '');
        } else if (detail.type === 'group-object') {
            navigateToGroupObject(detail);
        } else if (detail.type === 'building-space') {
            navigateToBuildingSpace(detail.address || detail.spaceId || '');
        }
    };
    onNavigate(handler);
    if (typeof globalThis !== 'undefined') {
        globalThis.topobusNavigate = handler;
    }
}

function navigateToGroupAddress(address) {
    const normalized = normalizeGroupAddress(address);
    if (!normalized) return;
    switchViewType('group', true);
    switchContentTab('table');
    const attempt = () => {
        const treeItem = findTreeItemBySelector(buildTreeSelector('group-address', normalized), normalized);
        if (treeItem) {
            applyTreeSelection(treeItem, { scrollIntoView: true });
            return true;
        }
        const row = findTableRow((item) => {
            if (item.kind !== 'group-address' || !item.data || !item.data.address) return false;
            return normalizeGroupAddress(item.data.address) === normalized;
        });
        if (row) {
            selectTableRowByItem(row);
            return true;
        }
        return false;
    };
    if (attempt()) return;
    requestAnimationFrame(() => {
        if (attempt()) return;
        setTimeout(attempt, 50);
    });
}

function navigateToDevice(address, options = {}) {
    if (!address) return;
    switchViewType('topology', true);
    const attempt = () => {
        const treeItem = findTreeItemBySelector(buildTreeSelector('device', address), null);
        if (treeItem) {
            applyTreeSelection(treeItem, { scrollIntoView: true });
        }
        if (options.selectObject) {
            selectGroupObjectInTable(options.selectObject);
        }
        return Boolean(treeItem);
    };
    if (attempt()) return;
    requestAnimationFrame(() => {
        if (attempt()) return;
        setTimeout(attempt, 50);
    });
}

function navigateToGroupObject(detail) {
    const deviceAddress = detail.deviceAddress || detail.address || '';
    const number = detail.number || '';
    const groupAddress = detail.groupAddress || '';
    if (deviceAddress) {
        navigateToDevice(deviceAddress, { selectObject: { number, groupAddress } });
        return;
    }
    if (groupAddress) {
        navigateToGroupAddress(groupAddress);
    }
}

function navigateToBuildingSpace(spaceId) {
    if (!spaceId) return;
    switchViewType('buildings', true);
    switchContentTab('table');
    const selector = buildTreeSelector('building-space', spaceId);
    const attempt = () => {
        const treeItem = findTreeItemBySelector(selector, null);
        if (treeItem) {
            applyTreeSelection(treeItem, { scrollIntoView: true });
            return true;
        }
        return false;
    };
    if (attempt()) return;
    requestAnimationFrame(() => {
        if (attempt()) return;
        setTimeout(attempt, 50);
    });
}

function selectGroupObjectInTable(criteria) {
    if (!criteria) return;
    const number = criteria.number ? String(criteria.number) : '';
    const groupAddress = criteria.groupAddress || '';
    const row = findTableRow((item) => {
        if (item.kind !== 'group-object') return false;
        if (number && String(item.data && item.data.number ? item.data.number : '') === number) return true;
        if (groupAddress) {
            const addresses = extractGroupAddressesFromRow(item);
            return addresses.includes(groupAddress);
        }
        return false;
    });
    if (row) {
        selectTableRowByItem(row);
    }
}

function findTableRow(predicate) {
    if (!predicate) return null;
    const rows = Array.isArray(tableSourceData) ? tableSourceData : [];
    return rows.find((item) => predicate(item)) || null;
}

function selectTableRowByItem(item) {
    if (!item) return;
    const dom = getDom();
    if (!dom || !dom.tableBody) return;
    if (tableVirtualMode && dom.tableView) {
        ensureRowVisible(item.id, dom.tableView);
        renderVirtualTable(true);
    }
    const rowEl = dom.tableBody.querySelector(`tr[data-id="${item.id}"]`);
    if (rowEl) {
        if (selectedTableRow && selectedTableRow !== rowEl) {
            selectedTableRow.classList.remove('selected-row');
        }
        rowEl.classList.add('selected-row');
        selectedTableRow = rowEl;
        if (dom.tableView && !tableVirtualMode) {
            rowEl.scrollIntoView({ block: 'nearest' });
        }
    }
    selectTableItem(item);
}

function buildTreeSelector(kind, value) {
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
    if (kind === 'group-address') {
        return `.tree-item[data-kind="group-address"][data-value="${escaped}"]`;
    }
    if (kind === 'device') {
        return `.tree-item[data-kind="device"][data-device-address="${escaped}"]`;
    }
    if (kind === 'building-space') {
        return `.tree-item[data-kind="building-space"][data-space-id="${escaped}"]`;
    }
    return '';
}

function findTreeItemBySelector(selector, groupAddress) {
    if (!selector) return null;
    const dom = getDom();
    if (!dom || !dom.sidebarTree) return null;
    let item = dom.sidebarTree.querySelector(selector);
    if (!item) {
        expandTree(true);
        item = dom.sidebarTree.querySelector(selector);
    }
    if (!item && groupAddress) {
        const items = Array.from(dom.sidebarTree.querySelectorAll('.tree-item[data-kind="group-address"]'));
        const normalizedTarget = normalizeGroupAddress(groupAddress);
        item = items.find((node) => normalizeGroupAddress(node.dataset.value || '') === normalizedTarget) || null;
    }
    return item;
}

// ----------------------------------------------------------------------
// UTILS
// ----------------------------------------------------------------------

function toggleSidebar() {
    const dom = getDom();
    if (!dom || !dom.sidebar) return;
    const wasCollapsed = dom.sidebar.classList.contains('collapsed');
    if (wasCollapsed) {
        dom.sidebar.classList.remove('collapsed');
        const lastWidth = Number(dom.sidebar.dataset.lastWidth || 0);
        dom.sidebar.style.width = lastWidth > 0 ? `${lastWidth}px` : '';
    } else {
        const currentWidth = dom.sidebar.offsetWidth || 0;
        dom.sidebar.dataset.lastWidth = String(currentWidth);
        dom.sidebar.classList.add('collapsed');
        dom.sidebar.style.width = '0px';
    }
    const isCollapsed = dom.sidebar.classList.contains('collapsed');

    dom.sidebarReopenBtn.style.display = isCollapsed ? 'block' : 'none';
    dom.leftResizer.style.display = isCollapsed ? 'none' : 'block';

    const btn = dom.sidebar.querySelector('.panel-toggle-btn');
    if (btn) btn.textContent = isCollapsed ? ICON.chevronRight : ICON.chevronLeft;
}

function toggleGraphFullscreen() {
    const dom = getDom();
    const body = document.body;
    const enabled = !body.classList.contains('graph-fullscreen');
    if (enabled) {
        body.classList.add('graph-fullscreen');
        if (document.documentElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else if (dom && dom.app && dom.app.requestFullscreen) {
            dom.app.requestFullscreen().catch(() => {});
        }
    } else {
        body.classList.remove('graph-fullscreen');
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }
    updateFullscreenButton(enabled || Boolean(document.fullscreenElement));
    if (enabled && dom && dom.graphView && dom.graphView.style.display === 'none') {
        switchContentTab('graph');
    }
    setTimeout(() => fitContent(), 120);
}

function updateFullscreenButton(enabled) {
    const btn = document.getElementById('btn-graph-fullscreen');
    if (btn) {
        btn.textContent = enabled ? `${ICON.fullscreenExit} Exit Full Screen` : `${ICON.fullscreen} Full Screen`;
    }
}

function toggleProperties() {
    const dom = getDom();
    if (!dom || !dom.propertiesSidebar) return;
    const wasCollapsed = dom.propertiesSidebar.classList.contains('collapsed');
    if (wasCollapsed) {
        dom.propertiesSidebar.classList.remove('collapsed');
        const lastWidth = Number(dom.propertiesSidebar.dataset.lastWidth || 0);
        dom.propertiesSidebar.style.width = lastWidth > 0 ? `${lastWidth}px` : '';
    } else {
        const currentWidth = dom.propertiesSidebar.offsetWidth || 0;
        dom.propertiesSidebar.dataset.lastWidth = String(currentWidth);
        dom.propertiesSidebar.classList.add('collapsed');
        dom.propertiesSidebar.style.width = '0px';
    }
    const isCollapsed = dom.propertiesSidebar.classList.contains('collapsed');

    dom.propsReopenBtn.style.display = isCollapsed ? 'block' : 'none';
    dom.rightResizer.style.display = isCollapsed ? 'none' : 'block';

    const btn = dom.propertiesSidebar.querySelector('.panel-toggle-btn');
    if (btn) btn.textContent = isCollapsed ? ICON.chevronLeft : ICON.chevronRight;
}

function initializeResizers() {
    // Add simple resize logic here if time permits, otherwise stick to CSS transitions/toggles specific
    // The etsclone app.js had full resize logic. I'll omit for brevity unless requested, 
    // relying on the toggles for now, or copy paste a simplified version later.
    // Note: The user explicitly asked for resizable panels in a previous task, so I should probably implement it.

    const dom = getDom();
    setupResizer(dom.leftResizer, dom.sidebar, true);
    setupResizer(dom.rightResizer, dom.propertiesSidebar, false);
}

function setupResizer(resizer, panel, isLeft) {
    if (!resizer || !panel) return;
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.style.cursor = 'col-resize';

        const startX = e.clientX;
        const startWidth = panel.offsetWidth;

        const onMouseMove = (ev) => {
            let newWidth;
            if (isLeft) {
                newWidth = startWidth + (ev.clientX - startX);
            } else {
                newWidth = startWidth - (ev.clientX - startX);
            }
            if (newWidth > 150 && newWidth < 600) {
                panel.style.width = `${newWidth}px`;
                panel.dataset.lastWidth = String(newWidth);
            }
        };

        const onMouseUp = () => {
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function initializeTableSorting() {
    const dom = getDom();
    if (!dom || !dom.tableHead) return;

    dom.tableHead.addEventListener('click', (e) => {
        if (e.target.closest('.col-resizer')) return;
        const th = e.target.closest('th');
        if (!th || !th.dataset.sortIndex) return;
        const index = Number(th.dataset.sortIndex);
        if (!Number.isFinite(index)) return;

        if (tableSortState.index === index) {
            tableSortState.direction = tableSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            tableSortState.index = index;
            tableSortState.direction = 'asc';
        }

        dom.tableHead.querySelectorAll('th').forEach((cell) => {
            cell.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(tableSortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');

        renderTableBody(tableSourceData);
    });

    dom.tableHead.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('.col-resizer');
        if (!handle) return;
        e.preventDefault();
        const th = handle.closest('th');
        if (!th) return;
        const index = Number(handle.dataset.colIndex);
        if (!Number.isFinite(index)) return;
        const startX = e.clientX;
        const startWidth = th.offsetWidth;
        document.body.style.cursor = 'col-resize';

        const onMove = (ev) => {
            const next = Math.max(60, startWidth + (ev.clientX - startX));
            setColumnWidth(index, next);
        };
        const onUp = () => {
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    dom.tableHead.addEventListener('dragstart', (e) => {
        if (e.target.closest('.col-resizer')) return;
        const th = e.target.closest('th');
        if (!th || !th.dataset.sortIndex) return;
        e.dataTransfer.setData('text/plain', th.dataset.sortIndex);
        e.dataTransfer.effectAllowed = 'move';
    });

    dom.tableHead.addEventListener('dragover', (e) => {
        const th = e.target.closest('th');
        if (!th || !th.dataset.sortIndex) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });

    dom.tableHead.addEventListener('drop', (e) => {
        const th = e.target.closest('th');
        if (!th || !th.dataset.sortIndex) return;
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        const to = Number(th.dataset.sortIndex);
        if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
        reorderColumns(from, to);
    });
}

function setColumnWidth(index, width) {
    const dom = getDom();
    if (!dom || !dom.tableHead) return;
    tableColumnWidths.set(index, width);
    applyColumnWidths();
}

function applyColumnWidths() {
    const dom = getDom();
    if (!dom || !dom.tableHead || !dom.tableBody) return;
    tableColumnWidths.forEach((width, index) => {
        const headCell = dom.tableHead.querySelector(`th[data-sort-index="${index}"]`);
        if (headCell) headCell.style.width = `${width}px`;
        const cells = dom.tableBody.querySelectorAll(`tr td:nth-child(${index + 3})`);
        cells.forEach((cell) => {
            cell.style.width = `${width}px`;
            cell.style.maxWidth = `${width}px`;
        });
    });
}

function reorderColumns(from, to) {
    if (from < 0 || to < 0) return;
    if (!tableColumnKeys.length || !tableColumnLabels.length) return;
    const key = tableColumnKeys.splice(from, 1)[0];
    const label = tableColumnLabels.splice(from, 1)[0];
    tableColumnKeys.splice(to, 0, key);
    tableColumnLabels.splice(to, 0, label);
    if (tableColumnWidths.size) {
        const widthArr = [];
        const total = tableColumnLabels.length;
        for (let i = 0; i < total; i += 1) {
            widthArr[i] = tableColumnWidths.get(i);
        }
        const moved = widthArr.splice(from, 1)[0];
        widthArr.splice(to, 0, moved);
        tableColumnWidths = new Map();
        widthArr.forEach((width, idx) => {
            if (width != null) tableColumnWidths.set(idx, width);
        });
    }
    renderTableHeader(lastTableColumns, null, true);
    renderTableBody(tableSourceData);
}
