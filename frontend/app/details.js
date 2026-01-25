import { state } from './state.js';
import { getDom } from './dom.js';
import { registerSelectionListener, selectCell } from './selection.js';
import { focusCell } from './interactions.js';
import { formatDatapointType } from './dpt.js';

const lastTabByKind = new Map();

function createSection(title) {
    const section = document.createElement('div');
    section.className = 'panel-section';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    section.appendChild(h3);
    return section;
}

function addRow(section, label, value) {
    if (value == null || value === '') return;
    const row = document.createElement('div');
    row.className = 'panel-row';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const valueEl = document.createElement('div');
    valueEl.className = 'panel-value';
    valueEl.textContent = value;

    row.appendChild(valueEl);
    section.appendChild(row);
}

function resetPropertiesTabs(dom) {
    if (!dom || !dom.propertiesTabs) return;
    dom.propertiesTabs.innerHTML = '';
    const tab = document.createElement('div');
    tab.className = 'prop-tab active';
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = 'ℹ️';
    const label = document.createElement('span');
    label.textContent = 'Info';
    tab.appendChild(icon);
    tab.appendChild(label);
    dom.propertiesTabs.appendChild(tab);
}

function appendTabContent(panel, content) {
    if (!content) return;
    if (Array.isArray(content)) {
        content.forEach((node) => {
            if (node) panel.appendChild(node);
        });
        return;
    }
    panel.appendChild(content);
}

function renderDetailsTabs(dom, container, kind, tabs) {
    if (!tabs || !tabs.length) return;
    const tabBar = dom && dom.propertiesTabs ? dom.propertiesTabs : null;
    if (!tabBar) {
        appendTabContent(container, tabs[0].content);
        return;
    }

    tabBar.innerHTML = '';
    const panels = [];
    const buttons = [];

    const remembered = lastTabByKind.get(kind);
    let activeIndex = tabs.findIndex((tab) => tab.key === remembered);
    if (activeIndex < 0) activeIndex = 0;

    const activateTab = (index) => {
        buttons.forEach((btn, idx) => {
            const isActive = idx === index;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        panels.forEach((panel, idx) => {
            panel.classList.toggle('active', idx === index);
        });
        if (tabs[index]) {
            lastTabByKind.set(kind, tabs[index].key);
        }
    };

    tabs.forEach((tab, idx) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'prop-tab';
        tabEl.setAttribute('role', 'tab');
        tabEl.setAttribute('aria-selected', idx === activeIndex ? 'true' : 'false');
        tabEl.dataset.tab = tab.key;

        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.textContent = tab.icon || 'ℹ️';
        const label = document.createElement('span');
        label.textContent = tab.label || 'Info';
        tabEl.appendChild(icon);
        tabEl.appendChild(label);
        tabBar.appendChild(tabEl);
        buttons.push(tabEl);

        const panel = document.createElement('div');
        panel.className = 'panel-tab-panel';
        panel.dataset.tabPanel = tab.key;
        appendTabContent(panel, tab.content);
        container.appendChild(panel);
        panels.push(panel);

        tabEl.addEventListener('click', () => activateTab(idx));
    });

    activateTab(activeIndex);
}

function buildPanelList() {
    const list = document.createElement('div');
    list.className = 'panel-list';
    return list;
}

function buildGroupObjectsSection(links, children, addresses) {
    const linkCount = links.length;
    const section = createSection(`Group Objects${linkCount ? ` (${linkCount})` : ''}`);
    if (!linkCount) {
        addRow(section, 'Group Objects', String(children.length));
        addRow(section, 'Group Addresses', String(addresses.length));
        return section;
    }

    const list = buildPanelList();
    const sortedLinks = [...links].sort((a, b) => {
        const ga = String(a.group_address || '').localeCompare(String(b.group_address || ''), undefined, { numeric: true });
        if (ga !== 0) return ga;
        return String(a.object_name || '').localeCompare(String(b.object_name || ''), undefined, { numeric: true });
    });
    sortedLinks.forEach((link) => {
        const item = document.createElement('div');
        item.className = 'panel-item';

        const line1 = document.createElement('div');
        line1.className = 'panel-item-title';
        line1.textContent = link.object_name;

        const line2 = document.createElement('div');
        line2.className = 'panel-item-meta';

        const gaSpan = document.createElement('span');
        gaSpan.className = 'panel-tag ga-tag';
        gaSpan.textContent = link.group_address;

        const flagsSpan = document.createElement('span');
        flagsSpan.className = 'panel-item-flags';
        if (link.flags) {
            const f = link.flags;
            const active = [];
            if (f.communication) active.push('C');
            if (f.read) active.push('R');
            if (f.write) active.push('W');
            if (f.transmit) active.push('T');
            if (f.update) active.push('U');
            if (f.read_on_init) active.push('I');
            flagsSpan.textContent = active.join(' ');
        } else if (link.flags_text) {
            flagsSpan.textContent = link.flags_text;
        }

        line2.appendChild(gaSpan);
        if (flagsSpan.textContent) {
            line2.appendChild(flagsSpan);
        }

        item.appendChild(line1);
        item.appendChild(line2);
        list.appendChild(item);
    });
    section.appendChild(list);
    return section;
}

function extractConfigEntries(deviceInfo) {
    if (!deviceInfo) return [];
    if (Array.isArray(deviceInfo.configuration_entries) && deviceInfo.configuration_entries.length) {
        return deviceInfo.configuration_entries;
    }
    const fallback = deviceInfo.configuration || {};
    return Object.entries(fallback).map(([name, value]) => ({
        name,
        value: value != null ? String(value) : '',
        ref_id: null,
        source: null
    }));
}

function buildParametersSection(entries) {
    const section = createSection(`Parameters${entries.length ? ` (${entries.length})` : ''}`);
    if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'panel-empty';
        empty.textContent = 'No parameters available.';
        section.appendChild(empty);
        return section;
    }

    const list = buildPanelList();
    const sortedEntries = [...entries].sort((a, b) => {
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
    });
    sortedEntries.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'panel-item';

        const title = document.createElement('div');
        title.className = 'panel-item-title';
        title.textContent = entry.name || 'Parameter';

        const meta = document.createElement('div');
        meta.className = 'panel-item-meta';

        const value = document.createElement('span');
        value.className = 'panel-item-value';
        value.textContent = entry.value != null ? String(entry.value) : '';
        meta.appendChild(value);

        const tags = document.createElement('span');
        tags.className = 'panel-item-tags';
        if (entry.source) {
            const tag = document.createElement('span');
            tag.className = 'panel-tag';
            tag.textContent = entry.source;
            tags.appendChild(tag);
        }
        if (entry.ref_id) {
            const tag = document.createElement('span');
            tag.className = 'panel-tag';
            tag.textContent = entry.ref_id;
            tags.appendChild(tag);
        }
        if (tags.children.length) {
            meta.appendChild(tags);
        }

        item.appendChild(title);
        item.appendChild(meta);
        list.appendChild(item);
    });
    section.appendChild(list);
    return section;
}

function resolveGroupAddressInfo(address) {
    const project = state.currentProject;
    if (!project || !Array.isArray(project.group_addresses)) return null;
    return project.group_addresses.find((ga) => ga.address === address) || null;
}

function buildLinkedDevicesSection(address) {
    const info = resolveGroupAddressInfo(address);
    const devices = info && Array.isArray(info.linked_devices) ? info.linked_devices : [];
    const section = createSection(`Linked Devices${devices.length ? ` (${devices.length})` : ''}`);
    if (!devices.length) {
        const empty = document.createElement('div');
        empty.className = 'panel-empty';
        empty.textContent = 'No linked devices.';
        section.appendChild(empty);
        return section;
    }

    const list = buildPanelList();
    const sortedDevices = [...devices].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    sortedDevices.forEach((deviceAddress) => {
        const device = state.deviceIndex ? state.deviceIndex.get(deviceAddress) : null;
        const item = document.createElement('div');
        item.className = 'panel-item';

        const title = document.createElement('div');
        title.className = 'panel-item-title';
        title.textContent = deviceAddress;

        const meta = document.createElement('div');
        meta.className = 'panel-item-meta';
        const value = document.createElement('span');
        value.className = 'panel-item-value';
        value.textContent = device && device.name ? device.name : '';
        meta.appendChild(value);

        item.appendChild(title);
        item.appendChild(meta);
        list.appendChild(item);
    });
    section.appendChild(list);
    return section;
}

export function updateDetailsPanel(cell) {
    const dom = getDom();
    if (!dom || !dom.detailsContent) return;
    if (cell && dom.app && dom.app.classList.contains('tablet-layout')) {
        dom.app.classList.add('panel-open');
        if (dom.panelToggle) {
            dom.panelToggle.setAttribute('aria-expanded', 'true');
        }
    }
    const container = dom.detailsContent;
    container.innerHTML = '';

    if (!cell) {
        container.innerHTML = '<div class="empty-state">Select a node to view properties</div>';
        resetPropertiesTabs(dom);
        return;
    }

    const nodeData = state.currentNodeIndex ? state.currentNodeIndex.get(cell.id) : null;
    const cellProps = cell && cell.get ? (cell.get('nodeProps') || cell.get('properties')) : null;
    const props = nodeData ? nodeData.properties : (cellProps || {});
    const kind = nodeData ? nodeData.kind : cell.get('kind');
    const fullAddress = cell.get('fullAddress') || props.address || '';
    const fullName = cell.get('fullName') || props.name || (nodeData ? nodeData.label : '') || '';

    const header = document.createElement('div');
    header.className = 'panel-header';

    const typeLabel = document.createElement('div');
    typeLabel.className = 'panel-type';
    typeLabel.textContent = kindLabel(kind);
    header.appendChild(typeLabel);

    const title = document.createElement('h2');
    title.className = 'panel-title';
    title.textContent = fullName;
    header.appendChild(title);

    if (fullAddress) {
        const subtitle = document.createElement('div');
        subtitle.className = 'panel-subtitle';
        subtitle.textContent = fullAddress;
        header.appendChild(subtitle);
    }

    container.appendChild(header);

    if (kind === 'composite-ga') {
        const infoSection = createSection('Group Address');
        addRow(infoSection, 'Address', cell.get('groupAddress') || props.address || fullAddress);
        addRow(infoSection, 'Name', props.name || fullName);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        addRow(infoSection, 'Datapoint', formatDatapointType(props.datapoint_type));
        addRow(infoSection, 'Main Group', props.main_name);
        addRow(infoSection, 'Main Description', props.main_description);
        addRow(infoSection, 'Main Comment', props.main_comment);
        addRow(infoSection, 'Middle Group', props.middle_name);
        addRow(infoSection, 'Middle Description', props.middle_description);
        addRow(infoSection, 'Middle Comment', props.middle_comment);
        renderDetailsTabs(dom, container, kind, [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: [infoSection] }
        ]);
        return;
    }

    if (kind === 'composite-object') {
        const infoSection = createSection('Group Object');
        addRow(infoSection, 'Name', fullName);
        const original = cell.get('originalObject');
        if (original && original.properties) {
            addRow(infoSection, 'Group Address', original.properties.group_address);
            addRow(infoSection, 'Number', original.properties.number);
            addRow(infoSection, 'Function Text', original.properties.object_function_text);
            addRow(infoSection, 'ComObject Name', original.properties.object_name_raw);
            addRow(infoSection, 'ComObject Text', original.properties.object_text);
            addRow(infoSection, 'Datapoint', formatDatapointType(original.properties.datapoint_type));
            addRow(infoSection, 'Flags', original.properties.flags);
            addRow(infoSection, 'Description', original.properties.description);
            addRow(infoSection, 'Comment', original.properties.comment);
        }
        renderDetailsTabs(dom, container, kind, [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: [infoSection] }
        ]);
        return;
    }

    if (kind === 'area') {
        const infoSection = createSection('Area Info');
        addRow(infoSection, 'Address', props.address || props.area || fullAddress);
        addRow(infoSection, 'Name', props.name || fullName);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        addRow(infoSection, 'Completion', props.completion_status);
        renderDetailsTabs(dom, container, kind, [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: [infoSection] }
        ]);
        return;
    }

    if (kind === 'line') {
        const infoSection = createSection('Line Info');
        addRow(infoSection, 'Address', props.address || fullAddress);
        addRow(infoSection, 'Name', props.name || fullName);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        addRow(infoSection, 'Connection Type', props.medium);
        addRow(infoSection, 'Completion', props.completion_status);
        renderDetailsTabs(dom, container, kind, [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: [infoSection] }
        ]);
        return;
    }

    if (kind === 'groupaddress') {
        const infoSection = createSection('Group Address');
        addRow(infoSection, 'Address', props.address || fullAddress);
        addRow(infoSection, 'Name', props.name || fullName);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        addRow(infoSection, 'Datapoint', formatDatapointType(props.datapoint_type));
        addRow(infoSection, 'Main Group', props.main_name);
        addRow(infoSection, 'Main Description', props.main_description);
        addRow(infoSection, 'Main Comment', props.main_comment);
        addRow(infoSection, 'Middle Group', props.middle_name);
        addRow(infoSection, 'Middle Description', props.middle_description);
        addRow(infoSection, 'Middle Comment', props.middle_comment);
        const groupAddress = props.address || fullAddress;
        const gaInfo = resolveGroupAddressInfo(groupAddress);
        const deviceCount = gaInfo && Array.isArray(gaInfo.linked_devices) ? gaInfo.linked_devices.length : 0;
        const linkedSection = buildLinkedDevicesSection(groupAddress);
        renderDetailsTabs(dom, container, kind, [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: [infoSection] },
            { key: 'devices', label: `Devices (${deviceCount})`, icon: '🔗', content: [linkedSection] }
        ]);
        return;
    }

    if (kind === 'composite-main' || kind === 'composite-middle') {
        const label = kind === 'composite-main' ? 'Main Group' : 'Middle Group';
        const infoSection = createSection(label);
        addRow(infoSection, 'Address', props.address || fullAddress);
        addRow(infoSection, 'Name', props.name || fullName);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        renderDetailsTabs(dom, container, kind, [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: [infoSection] }
        ]);
        return;
    }

    if (kind === 'building-space') {
        const infoSection = createSection('Building Space');
        addRow(infoSection, 'Type', cell.get('spaceType') || props.space_type);
        addRow(infoSection, 'Name', props.name || fullName);
        addRow(infoSection, 'Number', props.number);
        addRow(infoSection, 'Default Line', props.default_line);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Completion', props.completion_status);
        renderDetailsTabs(dom, container, kind, [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: [infoSection] }
        ]);
        return;
    }

    if (kind === 'device' || kind === 'composite-device') {
        const deviceInfo = resolveDeviceInfo(cell, props);
        const deviceProps = deviceInfo ? mapDeviceInfoToProps(deviceInfo) : props;

        const infoSection = createSection('Device Info');
        addRow(infoSection, 'Name', deviceProps.name || fullName);
        addRow(infoSection, 'Address', deviceProps.address || fullAddress);
        addRow(infoSection, 'Manufacturer', deviceProps.manufacturer);
        addRow(infoSection, 'Product', deviceProps.product);
        addRow(infoSection, 'Reference', deviceProps.product_reference);
        addRow(infoSection, 'Serial', deviceProps.serial_number);
        addRow(infoSection, 'Description', deviceProps.description);
        addRow(infoSection, 'Comment', deviceProps.comment);
        addRow(infoSection, 'Last Modified', deviceProps.last_modified);
        addRow(infoSection, 'Last Download', deviceProps.last_download);

        const infoSections = [infoSection];

        const programSection = createSection('Application Program');
        addRow(programSection, 'Program', deviceProps.app_program_name);
        addRow(programSection, 'Version', deviceProps.app_program_version);
        addRow(programSection, 'Number', deviceProps.app_program_number);
        addRow(programSection, 'Type', deviceProps.app_program_type);
        addRow(programSection, 'Mask Version', deviceProps.app_mask_version);
        if (programSection.childElementCount > 1) {
            infoSections.push(programSection);
        }

        const networkSection = createSection('Network');
        addRow(networkSection, 'Connection Type', deviceProps.medium);
        addRow(networkSection, 'Segment Number', deviceProps.segment_number);
        addRow(networkSection, 'Segment Id', deviceProps.segment_id);
        addRow(networkSection, 'Segment Medium', deviceProps.segment_medium);
        addRow(networkSection, 'Segment Domain', deviceProps.segment_domain_address);
        addRow(networkSection, 'IP Assignment', deviceProps.ip_assignment);
        addRow(networkSection, 'IP Address', deviceProps.ip_address);
        addRow(networkSection, 'Subnet Mask', deviceProps.ip_subnet_mask);
        addRow(networkSection, 'Default Gateway', deviceProps.ip_default_gateway);
        addRow(networkSection, 'MAC Address', deviceProps.mac_address);
        if (networkSection.childElementCount > 1) {
            infoSections.push(networkSection);
        }

        const links = deviceInfo && Array.isArray(deviceInfo.group_links)
            ? deviceInfo.group_links
            : (nodeData && Array.isArray(nodeData.group_links) ? nodeData.group_links : []);

        const children = state.graph
            ? state.graph.getElements().filter(el => el.get('parent') === cell.id)
            : [];
        const addresses = Array.from(new Set(children.map((el) => el.get('groupAddress')).filter(Boolean)));

        const groupObjectsSection = buildGroupObjectsSection(links, children, addresses);
        const configEntries = extractConfigEntries(deviceInfo);
        const paramsSection = buildParametersSection(configEntries);

        renderDetailsTabs(dom, container, kind, [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: infoSections },
            { key: 'objects', label: `Objects (${links.length})`, icon: '🧩', content: [groupObjectsSection] },
            { key: 'params', label: `Parameters (${configEntries.length})`, icon: '⚙️', content: [paramsSection] }
        ]);
        return;
    }

    if (kind === 'groupobject') {
        const infoSection = createSection('Object Details');
        addRow(infoSection, 'Number', props.number);
        addRow(infoSection, 'Function Text', props.object_function_text);
        addRow(infoSection, 'ComObject Name', props.object_name_raw);
        addRow(infoSection, 'ComObject Text', props.object_text);
        addRow(infoSection, 'Datapoint', formatDatapointType(props.datapoint_type));
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);

        const settingsSection = createSection('Settings');
        if (props.flags) {
            const flagMap = {
                'C': 'Comm', 'R': 'Read', 'W': 'Write', 'T': 'Transmit', 'U': 'Update', 'I': 'Init'
            };
            const activeFlags = props.flags.split(' ');
            const flagContainer = document.createElement('div');
            flagContainer.className = 'panel-flags';
            Object.keys(flagMap).forEach(f => {
                const isActive = activeFlags.includes(f);
                const badge = document.createElement('span');
                badge.className = `flag-badge ${isActive ? 'active' : ''}`;
                badge.textContent = f;
                badge.title = flagMap[f];
                flagContainer.appendChild(badge);
            });

            const row = document.createElement('div');
            row.className = 'panel-row';
            const lb = document.createElement('label');
            lb.textContent = 'Flags';
            row.appendChild(lb);
            row.appendChild(flagContainer);
            settingsSection.appendChild(row);
        }

        addRow(settingsSection, 'Security', props.security);
        addRow(settingsSection, 'Building Function', props.building_function);
        addRow(settingsSection, 'Building Part', props.building_part);
        const tabs = [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: [infoSection] },
            { key: 'settings', label: 'Settings', icon: '⚙️', content: [settingsSection] }
        ];

        const parentId = cell.get('parent');
        if (parentId && state.graph) {
            const parent = state.graph.getCell(parentId);
            if (parent) {
                const linkSection = createSection('Parent Device');
                const link = document.createElement('div');
                link.className = 'panel-link';
                link.textContent = `${parent.get('fullAddress')} ${parent.get('fullName')}`;
                link.onclick = () => {
                    selectCell(parent);
                    focusCell(parent);
                };
                linkSection.appendChild(link);
                tabs.push({ key: 'parent', label: 'Parent', icon: '🔗', content: [linkSection] });
            }
        }
        renderDetailsTabs(dom, container, kind, tabs);
        return;
    } else {
        const infoSection = createSection('Properties');
        Object.entries(props).forEach(([k, v]) => {
            if (typeof v !== 'string') return;
            const value = k === 'datapoint_type' ? formatDatapointType(v) : v;
            addRow(infoSection, k, value);
        });
        renderDetailsTabs(dom, container, kind, [
            { key: 'info', label: 'Info', icon: 'ℹ️', content: [infoSection] }
        ]);
    }
}

function kindLabel(kind) {
    if (kind === 'device') return 'Device';
    if (kind === 'groupobject') return 'Group Object';
    if (kind === 'groupaddress') return 'Group Address';
    if (kind === 'area') return 'Area';
    if (kind === 'line') return 'Line';
    if (kind === 'composite-main') return 'Main Group';
    if (kind === 'composite-middle') return 'Middle Group';
    if (kind === 'composite-ga') return 'Group Address';
    if (kind === 'composite-device') return 'Device';
    if (kind === 'composite-object') return 'Group Object';
    if (kind === 'building-space') return 'Building Space';
    return 'Node';
}

registerSelectionListener(updateDetailsPanel);

function resolveDeviceInfo(cell, props) {
    const address = cell.get('fullAddress') || props.address || '';
    if (!address || !state.deviceIndex) return null;
    return state.deviceIndex.get(address) || null;
}

function mapDeviceInfoToProps(device) {
    if (!device) return {};
    return {
        address: device.individual_address || '',
        name: device.name || '',
        manufacturer: device.manufacturer || '',
        product: device.product || '',
        product_reference: device.product_reference || '',
        description: device.description || '',
        comment: device.comment || '',
        serial_number: device.serial_number || '',
        app_program_name: device.app_program_name || '',
        app_program_version: device.app_program_version || '',
        app_program_number: device.app_program_number || '',
        app_program_type: device.app_program_type || '',
        app_mask_version: device.app_mask_version || '',
        medium: device.medium_type || '',
        segment_number: device.segment_number || '',
        segment_id: device.segment_id || '',
        segment_medium: device.segment_medium_type || '',
        segment_domain_address: device.segment_domain_address || '',
        ip_assignment: device.ip_assignment || '',
        ip_address: device.ip_address || '',
        ip_subnet_mask: device.ip_subnet_mask || '',
        ip_default_gateway: device.ip_default_gateway || '',
        mac_address: device.mac_address || '',
        last_modified: device.last_modified || '',
        last_download: device.last_download || ''
    };
}
