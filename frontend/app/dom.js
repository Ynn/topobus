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
