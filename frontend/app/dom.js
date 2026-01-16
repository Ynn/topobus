let dom = null;

export function initDom() {
    dom = {
        app: document.getElementById('app'),
        uploadZone: document.getElementById('upload-zone'),
        fileInput: document.getElementById('file-input'),
        viewSelector: document.getElementById('view-selector'),
        searchInput: document.getElementById('search-input'),
        areaFilter: document.getElementById('area-filter'),
        lineFilter: document.getElementById('line-filter'),
        mainGroupFilter: document.getElementById('main-group-filter'),
        zoomInBtn: document.getElementById('zoom-in-btn'),
        zoomOutBtn: document.getElementById('zoom-out-btn'),
        fitBtn: document.getElementById('fit-btn'),
        relayoutBtn: document.getElementById('relayout-btn'),
        exportBtn: document.getElementById('export-btn'),
        exportPngBtn: document.getElementById('export-png-btn'),
        paper: document.getElementById('paper'),
        paperContainer: document.getElementById('paper-scroll'),
        minimapWrap: document.getElementById('minimap-wrap'),
        minimap: document.getElementById('minimap'),
        resizeHandle: document.getElementById('resize-handle'),
        infoPanel: document.getElementById('info-panel'),
        loading: document.getElementById('loading'),
        visualization: document.getElementById('visualization'),
        projectName: document.getElementById('project-name'),
        stats: document.getElementById('stats'),
        detailsContent: document.getElementById('details-content'),
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
