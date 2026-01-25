import { initDom } from './dom.js';
import { initShapes } from './graph/shapes.js';
import { setupUploadHandlers, setupPasswordControls } from './upload.js';
import { setupFilterControls } from './filters.js';
import { setupMinimap } from './minimap.js';
import { loadDptCatalog } from './dpt.js';
import { initClassicView } from './classic_view.js';
import { initSettings } from './settings.js';
import { initHelp } from './help.js';
import { initDetails } from './details.js';
import { initNavigationLinks } from './navigation.js';

export function initApp() {
    initDom();
    initSettings();
    initHelp();
    initClassicView();
    initDetails();
    initNavigationLinks();
    initShapes();
    loadDptCatalog();
    setupUploadHandlers();

    // Graph specific controls initialization
    setupFilterControls();
    setupMinimap();
    setupPasswordControls();
}
