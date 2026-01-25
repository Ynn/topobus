import { state } from './state.js';
import { getDom } from './dom.js';
import { getSelection, registerSelectionListener } from './selection_store.js';
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

function ensureDetailsBindings() {
    if (detailsInitialized) return;
    const dom = getDom();
    if (!dom || !dom.detailsContent) return;
    registerSelectionListener(handleSelectionUpdate);
    bindDetailsInteractions();
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
