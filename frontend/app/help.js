import { getDom } from './dom.js';

let activeHelpTab = 'help';

export function initHelp() {
    const dom = getDom();
    if (!dom) return;

    if (dom.helpBtn) {
        dom.helpBtn.addEventListener('click', () => openHelp());
    }
    if (dom.helpClose) {
        dom.helpClose.addEventListener('click', () => closeHelp());
    }
    if (dom.helpOverlay) {
        dom.helpOverlay.addEventListener('click', (event) => {
            if (event.target === dom.helpOverlay) closeHelp();
        });
    }

    bindHelpTabs(dom);
}

function openHelp() {
    const dom = getDom();
    if (!dom || !dom.helpOverlay) return;
    dom.helpOverlay.classList.remove('hidden');
    setActiveHelpTab(activeHelpTab, dom.helpOverlay);
}

function closeHelp() {
    const dom = getDom();
    if (!dom || !dom.helpOverlay) return;
    dom.helpOverlay.classList.add('hidden');
}

function bindHelpTabs(dom) {
    if (!dom.helpOverlay) return;
    const tabs = Array.from(dom.helpOverlay.querySelectorAll('.settings-tab'));
    if (!tabs.length) return;
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const key = tab.getAttribute('data-help-tab') || 'help';
            activeHelpTab = key;
            setActiveHelpTab(key, dom.helpOverlay);
        });
    });
}

function setActiveHelpTab(key, root) {
    if (!root) return;
    const tabs = Array.from(root.querySelectorAll('.settings-tab'));
    const panels = Array.from(root.querySelectorAll('.settings-tab-panel'));
    tabs.forEach((tab) => {
        const tabKey = tab.getAttribute('data-help-tab');
        const isActive = tabKey === key;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panels.forEach((panel) => {
        const panelKey = panel.getAttribute('data-help-panel');
        panel.classList.toggle('active', panelKey === key);
    });
}
