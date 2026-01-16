export const state = {
    currentProject: null,
    currentGraphData: null,
    currentNodeIndex: null,
    groupAddressIndex: null,
    graph: null,
    paper: null,
    currentView: 'group',
    minimapState: null,
    minimapFrame: null,
    minimapTimeout: null,
    wheelHandler: null,
    panState: null,
    interactionsBound: false,
    lastFile: null,
    dptCatalog: null,
    selectedCellId: null,
    scrollMode: false,
    scrollPadding: 0,
    linkAlignFrame: null,
    pendingLinkAlign: null,
    elkLayoutToken: 0,
    filteredProject: null,
    filters: {
        area: 'all',
        line: 'all',
        mainGroup: 'all'
    },
    filterOptions: {
        areas: [],
        lines: new Map(),
        mainGroups: []
    },
    isLargeGraph: false,
    minimapDisabled: false,
    viewPreferences: {
        linkStyle: 'auto',
        density: 'comfortable'
    }
};
