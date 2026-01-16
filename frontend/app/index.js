import { initDom } from './dom.js';
import { initShapes } from './graph/shapes.js';
import { setupUploadHandlers, setupPasswordControls } from './upload.js';
import { setupViewSelector, setupControls, setupResizeHandler, refreshViewControls } from './controls.js';
import { setupFilterControls } from './filters.js';
import { setupMinimap } from './minimap.js';
import { loadDptCatalog } from './dpt.js';
import './details.js';

export function initApp() {
    initDom();
    initShapes();
    loadDptCatalog();
    setupUploadHandlers();
    setupViewSelector();
    setupControls();
    setupFilterControls();
    setupMinimap();
    setupResizeHandler();
    setupPasswordControls();
    refreshViewControls();
}
