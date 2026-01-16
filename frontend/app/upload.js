import { state } from './state.js';
import { getDom } from './dom.js';
import { refreshViewControls } from './controls.js';
import { applyFiltersAndRender, updateFilterOptions } from './filters.js';
import { parseKnxprojFile } from './parser.js';

export function setupUploadHandlers() {
    const dom = getDom();
    if (!dom || !dom.uploadZone || !dom.fileInput) return;

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
    state.lastFile = file;
    const dom = getDom();
    if (!dom) return;
    dom.uploadZone.classList.add('hidden');
    dom.loading.classList.remove('hidden');

    try {
        const password = dom.passwordInput ? dom.passwordInput.value.trim() : '';
        const data = await parseKnxprojFile(file, password || null);
        state.currentProject = data;
        state.groupAddressIndex = buildGroupAddressIndex(data);
        updateFilterOptions(data);

        hidePasswordPrompt();
        dom.loading.classList.add('hidden');
        dom.visualization.classList.remove('hidden');

        if (dom.projectName) {
            dom.projectName.textContent = data.project_name;
        }
        const deviceCount = data.group_address_graph.nodes.filter(n => n.kind === 'device').length;
        const gaCount = data.group_address_graph.nodes.filter(n => n.kind === 'groupaddress').length;
        const goCount = data.group_address_graph.nodes.filter(n => n.kind === 'groupobject').length;
        if (dom.stats) {
            dom.stats.innerHTML = `
            <p><strong>Devices:</strong> ${deviceCount}</p>
            <p><strong>Group Objects:</strong> ${goCount}</p>
            <p><strong>Group Addresses:</strong> ${gaCount}</p>
        `;
        }

        applyFiltersAndRender();
        refreshViewControls();
    } catch (error) {
        handleUploadError(error.message || String(error));
    }
}

function handleUploadError(message) {
    const dom = getDom();
    if (!dom) return;
    dom.loading.classList.add('hidden');
    dom.uploadZone.classList.remove('hidden');

    if (isPasswordError(message)) {
        showPasswordPrompt(message);
        return;
    }

    alert(`Upload failed: ${message}`);
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

function buildGroupAddressIndex(project) {
    const map = new Map();
    if (!project || !project.group_addresses) return map;
    project.group_addresses.forEach((ga) => {
        map.set(ga.address, ga);
    });
    return map;
}
