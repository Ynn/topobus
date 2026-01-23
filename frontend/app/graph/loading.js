import { state } from '../state.js';
import { getDom } from '../dom.js';

export function startGraphLoading(message) {
    const dom = getDom();
    if (!dom || !dom.loading) return;
    if (message && dom.loadingMessage) {
        dom.loadingMessage.textContent = message;
    }
    dom.loading.classList.remove('hidden');
    if (dom.graphView) {
        dom.graphView.classList.add('graph-loading');
    }
    state.graphLoadingActive = true;
}

export function stopGraphLoading() {
    if (state.elkLayoutActive) return;
    const dom = getDom();
    if (!dom) return;
    if (!state.graphLoadingActive) return;
    if (dom.loading) {
        dom.loading.classList.add('hidden');
    }
    if (dom.graphView) {
        dom.graphView.classList.remove('graph-loading');
    }
    state.graphLoadingActive = false;
}
