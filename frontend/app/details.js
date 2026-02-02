import { state } from './state.js';
import { getDom } from './dom.js';
import { getSelection, registerSelectionListener, setSelection } from './selection_store.js';
import { renderDetails } from './ui/details_panel.js';
import { selectCell } from './selection.js';
import { focusCell } from './interactions.js';
import { initContextMenu, openContextMenu, copyTextToClipboard, openWebSearch } from './context_menu.js';
import { requestNavigation } from './navigation.js';

function selectCellById(cellId) {
    if (!cellId || !state.graph) return;
    const cell = state.graph.getCell(cellId);
    if (!cell) return;
    selectCell(cell);
}

function focusCellById(cellId) {
    if (!cellId || !state.graph) return;
    const cell = state.graph.getCell(cellId);
    if (!cell) return;
    focusCell(cell);
}

function handleSelectionUpdate(selection) {
    const dom = getDom();
    if (!dom || !dom.detailsContent) return;

    if (selection && dom.app && dom.app.classList.contains('tablet-layout')) {
        dom.app.classList.add('panel-open');
        if (dom.panelToggle) {
            dom.panelToggle.setAttribute('aria-expanded', 'true');
        }
    }

    const entity = selection ? selection.entity : null;
    renderDetails(entity, dom.detailsContent, {
        dom,
        onSelectCell: selectCellById,
        onFocusCell: focusCellById
    });
}

let detailsInitialized = false;
let projectTitleBound = false;

function countBuildingSpaces(spaces) {
    if (!Array.isArray(spaces)) return 0;
    let total = 0;
    const walk = (list) => {
        list.forEach((space) => {
            if (!space) return;
            total += 1;
            if (Array.isArray(space.children) && space.children.length) {
                walk(space.children);
            }
        });
    };
    walk(spaces);
    return total;
}

function countSegments(project) {
    if (state.topologyIndex && state.topologyIndex.segmentsByLine) {
        let total = 0;
        state.topologyIndex.segmentsByLine.forEach((segmentMap) => {
            total += segmentMap.size;
        });
        return total;
    }
    const devices = Array.isArray(project.devices) ? project.devices : [];
    const segmentKeys = new Set();
    devices.forEach((device) => {
        const address = String(device.individual_address || '');
        const parts = address.split('.');
        if (parts.length < 2) return;
        const lineKey = `${parts[0]}.${parts[1]}`;
        const number = device.segment_number != null ? String(device.segment_number) : '';
        const id = device.segment_id != null ? String(device.segment_id) : '';
        const segKey = number || id || '0';
        segmentKeys.add(`${lineKey}|${segKey}`);
    });
    return segmentKeys.size;
}

function countGroupLinks(project) {
    const devices = Array.isArray(project.devices) ? project.devices : [];
    let total = 0;
    devices.forEach((device) => {
        if (Array.isArray(device.group_links) && device.group_links.length) {
            total += device.group_links.length;
            return;
        }
        if (typeof device._link_count === 'number') {
            total += device._link_count;
        }
    });
    return total;
}

function countAreasLines(project) {
    const areas = Array.isArray(project.areas) ? project.areas.length : 0;
    const lines = Array.isArray(project.lines) ? project.lines.length : 0;
    if (areas > 0 && lines > 0) {
        return { areas, lines };
    }
    const devices = Array.isArray(project.devices) ? project.devices : [];
    const areaSet = new Set();
    const lineSet = new Set();
    devices.forEach((device) => {
        const address = String(device.individual_address || '');
        const parts = address.split('.');
        if (parts.length < 2) return;
        const area = parts[0];
        const line = parts[1];
        if (area) areaSet.add(area);
        if (area && line) lineSet.add(`${area}.${line}`);
    });
    return {
        areas: areas || areaSet.size,
        lines: lines || lineSet.size
    };
}

function buildProjectEntity() {
    const project = state.currentProject;
    if (!project) return null;
    const info = project.project_info || project.projectInfo || null;
    const name = project.project_name || (info && info.name) || 'Project';
    const subtitleParts = [];
    if (info && info.project_number) subtitleParts.push(`Project ${info.project_number}`);
    if (info && info.project_type) subtitleParts.push(info.project_type);
    const areaLineCounts = countAreasLines(project);
    const stats = {
        areas: areaLineCounts.areas,
        lines: areaLineCounts.lines,
        segments: countSegments(project),
        devices: Array.isArray(project.devices) ? project.devices.length : 0,
        group_addresses: Array.isArray(project.group_addresses) ? project.group_addresses.length : 0,
        group_links: countGroupLinks(project),
        locations: countBuildingSpaces(project.locations)
    };
    return {
        kind: 'project',
        id: state.currentProjectKey || name,
        title: name,
        subtitle: subtitleParts.join(' · '),
        info,
        stats,
        graph_counts: project._graph_counts || null,
        cache: state.cacheStats || null,
        project_key: state.currentProjectKey || ''
    };
}

function ensureDetailsBindings() {
    if (detailsInitialized) return;
    const dom = getDom();
    if (!dom || !dom.detailsContent) return;
    registerSelectionListener(handleSelectionUpdate);
    bindDetailsInteractions();
    if (dom.projectTitle && !projectTitleBound) {
        dom.projectTitle.setAttribute('role', 'button');
        dom.projectTitle.setAttribute('tabindex', '0');
        dom.projectTitle.addEventListener('click', () => {
            const entity = buildProjectEntity();
            if (!entity) return;
            setSelection({ kind: entity.kind, id: entity.id || '', address: '', entity, source: 'project' });
        });
        dom.projectTitle.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            const entity = buildProjectEntity();
            if (!entity) return;
            setSelection({ kind: entity.kind, id: entity.id || '', address: '', entity, source: 'project' });
        });
        projectTitleBound = true;
    }
    detailsInitialized = true;
}

function resolveNavFromElement(target) {
    if (!target || !target.dataset) return null;
    const kind = target.dataset.navKind || '';
    const value = target.dataset.navValue || '';
    if (!kind || !value) return null;
    return { kind, value };
}

function resolveEventTargetElement(target) {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (target.parentElement) return target.parentElement;
    return null;
}

function getPanelText(target) {
    if (!target) return '';
    if (target.dataset && target.dataset.navValue) {
        return String(target.dataset.navValue);
    }
    return String(target.textContent || '').trim();
}

function handleDetailsClick(event) {
    const base = resolveEventTargetElement(event.target);
    if (!base) return;
    const target = base.closest('[data-nav-kind]');
    if (!target) return;
    const nav = resolveNavFromElement(target);
    if (!nav) return;
    requestNavigation({ type: nav.kind, address: nav.value });
}

function handleDetailsContextMenu(event) {
    const dom = getDom();
    if (!dom || !dom.detailsContent || !dom.detailsContent.contains(event.target)) return;
    const base = resolveEventTargetElement(event.target);
    if (!base) return;
    const target = base.closest('[data-nav-kind], .panel-value, .panel-item, .panel-link');
    const text = getPanelText(target);
    const nav = resolveNavFromElement(target);
    const selection = getSelection();
    const items = [];

    if (text) {
        items.push({
            label: `Copy "${text.length > 32 ? `${text.slice(0, 32)}…` : text}"`,
            action: () => copyTextToClipboard(text)
        });
        items.push({
            label: 'Search on the web',
            action: () => openWebSearch(text)
        });
    }

    if (nav) {
        items.push({ type: 'separator' });
        if (nav.kind === 'group-address') {
            items.push({ label: 'Open Group Address', action: () => requestNavigation({ type: 'group-address', address: nav.value }) });
        } else if (nav.kind === 'device') {
            items.push({ label: 'Open Device (Topology)', action: () => requestNavigation({ type: 'device', address: nav.value }) });
        }
    } else if (selection && selection.kind) {
        items.push({ type: 'separator' });
        if (selection.kind === 'group-address') {
            items.push({ label: 'Open Group Address', action: () => requestNavigation({ type: 'group-address', address: selection.address }) });
        } else if (selection.kind === 'device') {
            items.push({ label: 'Open Device (Topology)', action: () => requestNavigation({ type: 'device', address: selection.address }) });
        } else if (selection.kind === 'group-object' && selection.entity) {
            const deviceAddress = selection.entity.device && selection.entity.device.individual_address ? selection.entity.device.individual_address : '';
            if (deviceAddress) {
                items.push({ label: 'Open Device (Topology)', action: () => requestNavigation({ type: 'device', address: deviceAddress }) });
            }
            const groupAddresses = Array.isArray(selection.entity.group_addresses) ? selection.entity.group_addresses : [];
            if (groupAddresses.length) {
                items.push({
                    label: `Open Group Address (${groupAddresses[0]})`,
                    action: () => requestNavigation({ type: 'group-address', address: groupAddresses[0] })
                });
            }
        }
    }

    if (!items.length) return;
    event.preventDefault();
    openContextMenu(items, { x: event.clientX, y: event.clientY });
}

function bindDetailsInteractions() {
    const dom = getDom();
    if (!dom || !dom.detailsContent) return;
    if (dom.detailsContent.dataset.navBound === 'true') return;
    dom.detailsContent.addEventListener('click', handleDetailsClick);
    dom.detailsContent.addEventListener('contextmenu', handleDetailsContextMenu);
    dom.detailsContent.dataset.navBound = 'true';
    initContextMenu();
}

export function initDetails() {
    ensureDetailsBindings();
    if (detailsInitialized) return;
    const retry = () => {
        if (detailsInitialized) return;
        ensureDetailsBindings();
        if (!detailsInitialized) {
            requestAnimationFrame(retry);
        }
    };
    requestAnimationFrame(retry);
}
