import { state } from './state.js';
import { getDom } from './dom.js';
// import { refreshViewControls } from './controls.js'; // Deprecated
import { applyFiltersAndRender, updateFilterOptions } from './filters.js';
import { parseKnxprojFile } from './parser.js';
import { updateClassicView } from './classic_view.js';
import { ApiError, NetworkError } from './utils/api_client.js';
import { stateManager } from './state_manager.js';

export function setupUploadHandlers() {
    const dom = getDom();
    if (!dom || !dom.uploadZone || !dom.fileInput) return;

    let dragDepth = 0;
    const hasFiles = (event) => {
        const types = event.dataTransfer ? Array.from(event.dataTransfer.types || []) : [];
        return types.includes('Files');
    };
    const showUploadZone = () => {
        dom.uploadZone.classList.remove('hidden');
    };
    const hideUploadZone = () => {
        dom.uploadZone.classList.add('hidden');
        dom.uploadZone.classList.remove('dragover');
    };

    document.addEventListener('dragenter', (e) => {
        if (!hasFiles(e)) return;
        dragDepth += 1;
        showUploadZone();
    });

    document.addEventListener('dragleave', (e) => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) {
            hideUploadZone();
        }
    });

    document.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        showUploadZone();
    });

    dom.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.uploadZone.classList.add('dragover');
    });

    dom.uploadZone.addEventListener('dragleave', () => {
        dom.uploadZone.classList.remove('dragover');
    });

    dom.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.uploadZone.classList.remove('dragover');
        dragDepth = 0;
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.knxproj')) {
            hidePasswordPrompt();
            uploadFile(file);
        } else {
            alert('Please provide a .knxproj file');
        }
    });

    dom.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            hidePasswordPrompt();
            uploadFile(file);
        }
    });
}

export function setupPasswordControls() {
    const dom = getDom();
    if (!dom || !dom.passwordSubmit || !dom.passwordInput) return;

    dom.passwordSubmit.addEventListener('click', () => {
        if (state.lastFile) {
            uploadFile(state.lastFile);
        }
    });

    dom.passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (state.lastFile) {
                uploadFile(state.lastFile);
            }
        }
    });
}

async function uploadFile(file) {
    stateManager.setState('lastFile', file);
    const dom = getDom();
    if (!dom) return;

    // UI Loading State
    if (dom.uploadZone) dom.uploadZone.classList.add('hidden');
    if (dom.loadingMessage) dom.loadingMessage.textContent = 'Loading project...';
    if (dom.loading) dom.loading.classList.remove('hidden');

    try {
        // Reset password input if not needed
        const password = dom.passwordInput ? dom.passwordInput.value.trim() : '';

        // Parsing
        const data = await parseKnxprojFile(file, password || null);
        stateManager.setStatePatch({
            currentProject: data,
            lastGraphKey: null,
            lastGraphViewType: null,
            graphLoadingActive: false,
            groupSummaryMode: false,
            groupAddressIndex: buildGroupAddressIndex(data),
            deviceIndex: buildDeviceIndex(data)
        });
        updateFilterOptions(data);

        hidePasswordPrompt();

        if (dom.loading) dom.loading.classList.add('hidden');

        // Update Project Stats / Title in Classic View
        if (dom.projectTitle) {
            dom.projectTitle.textContent = data.project_name || file.name;
        }

        // Initialize Views
        updateClassicView();

        // Render graph only if the graph view is visible
        if (dom.graphView && dom.graphView.style.display !== 'none') {
            applyFiltersAndRender();
        }

    } catch (error) {
        handleUploadError(error);
    }
}

function handleUploadError(error) {
    const dom = getDom();
    if (!dom) return;
    if (dom.loading) dom.loading.classList.add('hidden');
    if (dom.uploadZone) dom.uploadZone.classList.remove('hidden');

    const message = error && error.message ? error.message : String(error || 'Upload failed.');
    if (isPasswordError(message)) {
        showPasswordPrompt(message);
        return;
    }

    if (error instanceof NetworkError) {
        setUploadError('Network error. Please check your connection and try again.');
        return;
    }
    if (error instanceof ApiError) {
        setUploadError(`Upload failed (${error.status}): ${message}`);
        return;
    }

    setUploadError(`Upload failed: ${message}`);
}

function isPasswordError(message) {
    const lower = String(message || '').toLowerCase();
    return lower.includes('password') || lower.includes('encrypted');
}

function showPasswordPrompt(message) {
    const dom = getDom();
    if (!dom || !dom.passwordRow) return;
    dom.passwordRow.classList.remove('hidden');
    if (dom.passwordHint) {
        dom.passwordHint.textContent = message || 'Password required for this project.';
    }
}

function hidePasswordPrompt() {
    const dom = getDom();
    if (!dom || !dom.passwordRow) return;
    dom.passwordRow.classList.add('hidden');
    if (dom.passwordHint) {
        dom.passwordHint.textContent = '';
    }
    if (dom.passwordInput) {
        dom.passwordInput.value = '';
    }
}

function setUploadError(message) {
    const dom = getDom();
    if (!dom || !dom.uploadZone) return;
    let errorBox = dom.uploadZone.querySelector('.upload-error');
    if (!errorBox) {
        errorBox = document.createElement('div');
        errorBox.className = 'upload-error';
        dom.uploadZone.appendChild(errorBox);
    }
    errorBox.textContent = message;
}

function buildGroupAddressIndex(project) {
    const map = new Map();
    if (!project || !project.group_addresses) return map;
    project.group_addresses.forEach((ga) => {
        map.set(ga.address, ga);
    });
    return map;
}

function buildDeviceIndex(project) {
    const map = new Map();
    if (!project || !project.devices) return map;
    project.devices.forEach((device) => {
        if (device && device.individual_address) {
            map.set(device.individual_address, device);
        }
    });
    return map;
}
