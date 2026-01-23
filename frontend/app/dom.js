let dom = null;

export function initDom() {
    dom = {
        app: document.getElementById('app-window'),
        uploadZone: document.getElementById('upload-zone'),
        fileInput: document.getElementById('file-input'),
        // Views
        viewTabs: document.getElementById('view-tabs'),
        centerTabs: document.getElementById('center-tabs'),
        tableView: document.getElementById('table-view'),
        graphView: document.getElementById('graph-view'),

        // Sidebar
        sidebar: document.getElementById('left-sidebar'),
        sidebarTree: document.getElementById('sidebar-tree'),
        sidebarTitle: document.getElementById('sidebar-title'),
        sidebarTitleText: document.getElementById('sidebar-title-text'),
        toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
        sidebarReopenBtn: document.getElementById('sidebar-reopen'),
        leftResizer: document.getElementById('left-resizer'),

        // Properties
        propertiesSidebar: document.getElementById('right-sidebar'),
        propertiesPanel: document.getElementById('properties-panel'),
        togglePropsBtn: document.getElementById('toggle-props-btn'),
        propsReopenBtn: document.getElementById('properties-reopen'),
        rightResizer: document.getElementById('right-resizer'),
        detailsContent: document.getElementById('properties-panel'),
        panelToggle: document.getElementById('toggle-props-btn'),

        // Table
        mainTable: document.getElementById('main-table'),
        tableHead: document.getElementById('table-head'),
        tableBody: document.getElementById('table-body'),
        emptyTableState: document.getElementById('empty-table-state'),
        graphMode: document.getElementById('graph-mode'),

        // Toolbar
        mainToolbar: document.getElementById('main-toolbar'),

        // Search
        searchInput: document.getElementById('search-input'),
        searchClear: document.querySelector('.search-clear'),
        settingsBtn: document.getElementById('settings-btn'),
        settingsOverlay: document.getElementById('settings-overlay'),
        settingsClose: document.getElementById('settings-close'),
        settingsTheme: document.getElementById('settings-theme'),
        settingsPreset: document.getElementById('settings-elk-preset'),
        settingsAlgorithm: document.getElementById('settings-elk-algorithm'),
        settingsDirection: document.getElementById('settings-elk-direction'),
        settingsEdgeRouting: document.getElementById('settings-elk-edge-routing'),
        settingsLayering: document.getElementById('settings-elk-layering'),
        settingsNodePlacement: document.getElementById('settings-elk-node-placement'),
        settingsCrossing: document.getElementById('settings-elk-crossing'),
        settingsCycleBreaking: document.getElementById('settings-elk-cycle-breaking'),
        settingsConsiderModelOrder: document.getElementById('settings-elk-consider-model'),
        settingsMergeEdges: document.getElementById('settings-elk-merge-edges'),
        settingsSplinesMode: document.getElementById('settings-elk-splines-mode'),
        settingsThoroughness: document.getElementById('settings-elk-thoroughness'),
        settingsSpacingNodeNode: document.getElementById('settings-elk-spacing-node'),
        settingsSpacingLayer: document.getElementById('settings-elk-spacing-layer'),
        settingsSpacingEdgeNodeBetweenLayers: document.getElementById('settings-elk-spacing-edge-node-layers'),
        settingsSpacingEdgeEdgeBetweenLayers: document.getElementById('settings-elk-spacing-edge-edge-layers'),
        settingsSpacingEdgeNode: document.getElementById('settings-elk-spacing-edge-node'),
        settingsSpacingEdgeEdge: document.getElementById('settings-elk-spacing-edge-edge'),
        settingsStressIterations: document.getElementById('settings-stress-iterations'),
        settingsStressEpsilon: document.getElementById('settings-stress-epsilon'),
        settingsStressEdgeLength: document.getElementById('settings-stress-edge-length'),

        // Buttons / Controls
        btnOpenProject: document.getElementById('btn-open-project'),

        // Graph related (keep existing names where possible)
        paper: document.getElementById('paper'),
        paperContainer: document.getElementById('paper-scroll'),
        minimapWrap: document.getElementById('minimap-wrap'),
        minimap: document.getElementById('minimap'),

        // Loading
        loading: document.getElementById('loading'),
        loadingMessage: document.getElementById('loading-message'),

        // Stats
        projectTitle: document.getElementById('project-title'),

        // Password
        passwordRow: document.getElementById('password-row'),
        passwordInput: document.getElementById('password-input'),
        passwordSubmit: document.getElementById('password-submit'),
        passwordHint: document.getElementById('password-hint')
    };

    return dom;
}

export function getDom() {
    return dom;
}
