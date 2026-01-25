import { ICON } from './icons.js';
import { createSection, addRow, addRowNode, buildPanelList, buildEmptyState } from './panel_components.js';
import { formatDatapointType, resolveDatapointInfo } from '../dpt.js';
import { formatFlagsText, resolveDptSize } from '../formatters/device.js';

const lastTabByKind = new Map();

function createNavLink(label, kind, value) {
    const link = document.createElement('span');
    link.className = 'panel-link';
    link.textContent = label;
    link.dataset.navKind = kind;
    link.dataset.navValue = value;
    return link;
}

function resetPropertiesTabs(dom) {
    if (!dom || !dom.propertiesTabs) return;
    dom.propertiesTabs.innerHTML = '';
    const tab = document.createElement('div');
    tab.className = 'prop-tab active';
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = ICON.info;
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
        icon.textContent = tab.icon || ICON.info;
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

function groupLinksByObject(links) {
    const grouped = new Map();
    links.forEach((link) => {
        const number = link.number != null ? String(link.number) : '';
        const name = link.object_name || '';
        const channel = link.channel || '';
        const key = `${number}|${name}|${channel}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                number,
                object_name: name,
                object_function_text: link.object_function_text || '',
                datapoint_type: link.datapoint_type || '',
                object_size: link.object_size || '',
                channel,
                flags: link.flags || null,
                flags_text: link.flags_text || '',
                group_addresses: []
            });
        }
        const entry = grouped.get(key);
        if (!entry.datapoint_type && link.datapoint_type) {
            entry.datapoint_type = link.datapoint_type;
        }
        if (!entry.object_size && link.object_size) {
            entry.object_size = link.object_size;
        }
        if (link.group_address) {
            entry.group_addresses.push(link.group_address);
        }
    });
    return Array.from(grouped.values());
}

function buildGroupObjectsSection(objects, childrenCount, addressesCount, options = {}) {
    const linkCount = objects.length;
    const section = createSection(`Group Objects${linkCount ? ` (${linkCount})` : ''}`);
    if (!linkCount) {
        addRow(section, 'Group Objects', String(childrenCount || 0));
        addRow(section, 'Group Addresses', String(addressesCount || 0));
        return section;
    }

    const table = document.createElement('table');
    table.className = 'panel-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>#</th>
                <th>Object</th>
                <th>Group Address</th>
                <th>Function</th>
                <th>DPT</th>
                <th>Flags</th>
            </tr>
        </thead>
    `;
    const tbody = document.createElement('tbody');
    const sortedObjects = [...objects].sort((a, b) => {
        const num = String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true });
        if (num !== 0) return num;
        return String(a.object_name || '').localeCompare(String(b.object_name || ''), undefined, { numeric: true });
    });
    sortedObjects.forEach((obj) => {
        const row = document.createElement('tr');

        const numberCell = document.createElement('td');
        numberCell.textContent = obj.number || '';
        row.appendChild(numberCell);

        const nameCell = document.createElement('td');
        const nameLink = document.createElement('span');
        nameLink.className = 'panel-link';
        nameLink.textContent = obj.object_name || 'Group Object';
        if (options.deviceAddress) {
            nameLink.dataset.navKind = 'device';
            nameLink.dataset.navValue = options.deviceAddress;
        }
        nameCell.appendChild(nameLink);
        row.appendChild(nameCell);

        const gaCell = document.createElement('td');
        const gaList = document.createElement('div');
        gaList.className = 'panel-link-list';
        const uniqueAddresses = [];
        obj.group_addresses.forEach((addr) => {
            if (!uniqueAddresses.includes(addr)) {
                uniqueAddresses.push(addr);
            }
        });
        if (uniqueAddresses.length) {
            uniqueAddresses.forEach((addr) => {
                const gaLink = document.createElement('span');
                gaLink.className = 'panel-link';
                gaLink.textContent = addr;
                gaLink.dataset.navKind = 'group-address';
                gaLink.dataset.navValue = addr;
                gaList.appendChild(gaLink);
            });
        }
        gaCell.appendChild(gaList);
        row.appendChild(gaCell);

        const funcCell = document.createElement('td');
        funcCell.textContent = obj.object_function_text || '';
        row.appendChild(funcCell);

        const dptCell = document.createElement('td');
        dptCell.textContent = formatDatapointType(obj.datapoint_type);
        row.appendChild(dptCell);

        const flagsCell = document.createElement('td');
        if (obj.flags) {
            const f = obj.flags;
            const active = [];
            if (f.communication) active.push('C');
            if (f.read) active.push('R');
            if (f.write) active.push('W');
            if (f.transmit) active.push('T');
            if (f.update) active.push('U');
            flagsCell.textContent = active.join(' ');
        } else if (obj.flags_text) {
            flagsCell.textContent = obj.flags_text.replace(/I/g, '').replace(/\s+/g, ' ').trim();
        }
        row.appendChild(flagsCell);

        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
}

function extractConfigEntries(deviceInfo) {
    if (!deviceInfo) return [];
    if (Array.isArray(deviceInfo.configuration_entries) && deviceInfo.configuration_entries.length) {
        return deviceInfo.configuration_entries.filter((entry) => {
            if (!entry || !entry.name) return false;
            return true;
        });
    }
    const fallback = deviceInfo.configuration || {};
    return Object.entries(fallback).map(([name, value]) => ({
        name,
        value: value != null ? String(value) : '',
        ref_id: null,
        source: null
    })).filter((entry) => entry.name);
}

function buildParametersSection(entries) {
    const section = createSection(`Parameters${entries.length ? ` (${entries.length})` : ''}`);
    if (!entries.length) {
        section.appendChild(buildEmptyState('No parameters available.'));
        return section;
    }

    const grouped = new Map();
    entries.forEach((entry) => {
        const key = entry.context || (entry.source === 'Property' ? 'Properties' : 'General');
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(entry);
    });

    const groups = Array.from(grouped.entries()).sort((a, b) => {
        return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true });
    });

    groups.forEach(([groupLabel, groupEntries]) => {
        const groupSection = createSection(groupLabel);
        const table = document.createElement('table');
        table.className = 'panel-table';

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Parameter</th>
                <th>Value</th>
                <th>Type</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const sortedEntries = [...groupEntries].sort((a, b) => {
            return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
        });

        sortedEntries.forEach((entry) => {
            const rawValue = entry.value_raw != null ? String(entry.value_raw) : '';
            const valueLabel = entry.value_label != null ? String(entry.value_label) : (entry.value != null ? String(entry.value) : '');
            const displayValue = valueLabel || (rawValue ? `${rawValue} [RAW]` : '');
            const row = document.createElement('tr');

            const nameCell = document.createElement('td');
            nameCell.textContent = entry.name || 'Parameter';
            row.appendChild(nameCell);

            const valueCell = document.createElement('td');
            valueCell.textContent = displayValue;
            if (rawValue && rawValue !== valueLabel) {
                valueCell.title = `RAW: ${rawValue}`;
            }
            row.appendChild(valueCell);

            const typeCell = document.createElement('td');
            typeCell.textContent = entry.parameter_type || '';
            row.appendChild(typeCell);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        groupSection.appendChild(table);
        section.appendChild(groupSection);
    });
    return section;
}

function kindLabel(kind) {
    if (kind === 'device') return 'Device';
    if (kind === 'group-object') return 'Group Object';
    if (kind === 'group-address') return 'Group Address';
    if (kind === 'area') return 'Area';
    if (kind === 'line') return 'Line';
    if (kind === 'segment') return 'Segment';
    if (kind === 'group-main') return 'Main Group';
    if (kind === 'group-middle') return 'Middle Group';
    if (kind === 'building-space') return 'Building Space';
    return 'Selection';
}

function buildHeader(entity) {
    const header = document.createElement('div');
    header.className = 'panel-header';

    const typeLabel = document.createElement('div');
    typeLabel.className = 'panel-type';
    typeLabel.textContent = kindLabel(entity.kind);
    header.appendChild(typeLabel);

    const title = document.createElement('h2');
    title.className = 'panel-title';
    title.textContent = entity.title || 'Selection';
    header.appendChild(title);

    if (entity.subtitle) {
        const subtitle = document.createElement('div');
        subtitle.className = 'panel-subtitle';
        subtitle.textContent = entity.subtitle;
        header.appendChild(subtitle);
    }

    return header;
}

export function renderDetails(entity, container, options = {}) {
    if (!container) return;
    container.innerHTML = '';

    const dom = options.dom || null;
    if (!entity) {
        container.innerHTML = '<div class="empty-state">Select an item to view properties</div>';
        resetPropertiesTabs(dom);
        return;
    }

    container.appendChild(buildHeader(entity));

    if (entity.kind === 'group-address') {
        const infoSection = createSection('Group Address');
        addRow(infoSection, 'Address', entity.address, {
            className: 'panel-link',
            dataset: { navKind: 'group-address', navValue: entity.address }
        });
        addRow(infoSection, 'Name', entity.name);
        addRow(infoSection, 'Description', entity.description);
        addRow(infoSection, 'Comment', entity.comment);
        addRow(infoSection, 'Datapoint', formatDatapointType(entity.datapoint_type));
        addRow(infoSection, 'Size', entity.datapoint_size || resolveDptSize(entity.datapoint_type));
        addRow(infoSection, 'Main Group', entity.main_name);
        addRow(infoSection, 'Main Description', entity.main_description);
        addRow(infoSection, 'Main Comment', entity.main_comment);
        addRow(infoSection, 'Middle Group', entity.middle_name);
        addRow(infoSection, 'Middle Description', entity.middle_description);
        addRow(infoSection, 'Middle Comment', entity.middle_comment);

        const linkedDevices = Array.isArray(entity.linked_devices) ? entity.linked_devices : [];
        const normalizedDevices = linkedDevices.map((device) => {
            if (typeof device === 'string') {
                return { address: device, name: '' };
            }
            return {
                address: device.address || '',
                name: device.name || ''
            };
        }).filter((device) => device.address);
        const linkedSection = createSection(`Linked Devices${normalizedDevices.length ? ` (${normalizedDevices.length})` : ''}`);
        if (!normalizedDevices.length) {
            linkedSection.appendChild(buildEmptyState('No linked devices.'));
        } else {
            const list = buildPanelList();
            const sortedDevices = [...normalizedDevices].sort((a, b) => String(a.address).localeCompare(String(b.address), undefined, { numeric: true }));
            sortedDevices.forEach((device) => {
                const item = document.createElement('div');
                item.className = 'panel-item nav-target';
                item.dataset.navKind = 'device';
                item.dataset.navValue = device.address;
                const title = document.createElement('div');
                title.className = 'panel-item-title';
                title.textContent = device.address;
                item.appendChild(title);
                if (device.name) {
                    const meta = document.createElement('div');
                    meta.className = 'panel-item-meta';
                    const value = document.createElement('span');
                    value.className = 'panel-item-value';
                    value.textContent = device.name;
                    meta.appendChild(value);
                    item.appendChild(meta);
                }
                list.appendChild(item);
            });
            linkedSection.appendChild(list);
        }

        renderDetailsTabs(dom, container, entity.kind, [
            { key: 'info', label: 'Info', icon: ICON.info, content: [infoSection] },
            { key: 'devices', label: `Devices (${normalizedDevices.length})`, icon: ICON.link, content: [linkedSection] }
        ]);
        return;
    }

    if (entity.kind === 'device') {
        const infoSection = createSection('Device Info');
        addRow(infoSection, 'Name', entity.name);
        addRow(infoSection, 'Address', entity.address, {
            className: 'panel-link',
            dataset: { navKind: 'device', navValue: entity.address }
        });
        if (entity.building_function) {
            addRow(infoSection, 'Building Function', entity.building_function, {
                className: entity.building_space_id ? 'panel-link' : '',
                dataset: entity.building_space_id ? { navKind: 'building-space', navValue: entity.building_space_id } : null
            });
        }
        if (entity.building_part) {
            addRow(infoSection, 'Building Part', entity.building_part, {
                className: entity.building_space_id ? 'panel-link' : '',
                dataset: entity.building_space_id ? { navKind: 'building-space', navValue: entity.building_space_id } : null
            });
        }
        addRow(infoSection, 'Manufacturer', entity.manufacturer);
        addRow(infoSection, 'Product', entity.product);
        addRow(infoSection, 'Reference', entity.product_reference);
        addRow(infoSection, 'Serial', entity.serial_number);
        addRow(infoSection, 'Description', entity.description);
        addRow(infoSection, 'Comment', entity.comment);
        addRow(infoSection, 'Last Modified', entity.last_modified);
        addRow(infoSection, 'Last Download', entity.last_download);

        const infoSections = [infoSection];

        const programSection = createSection('Application Program');
        addRow(programSection, 'Program', entity.app_program_name);
        addRow(programSection, 'Version', entity.app_program_version);
        addRow(programSection, 'Number', entity.app_program_number);
        addRow(programSection, 'Type', entity.app_program_type);
        addRow(programSection, 'Mask Version', entity.app_mask_version);
        if (programSection.childElementCount > 1) {
            infoSections.push(programSection);
        }

        const networkSection = createSection('Network');
        addRow(networkSection, 'Connection Type', entity.medium);
        addRow(networkSection, 'Segment Number', entity.segment_number);
        addRow(networkSection, 'Segment Id', entity.segment_id);
        addRow(networkSection, 'Segment Medium', entity.segment_medium);
        addRow(networkSection, 'Segment Domain', entity.segment_domain_address);
        addRow(networkSection, 'IP Assignment', entity.ip_assignment);
        addRow(networkSection, 'IP Address', entity.ip_address);
        addRow(networkSection, 'Subnet Mask', entity.ip_subnet_mask);
        addRow(networkSection, 'Default Gateway', entity.ip_default_gateway);
        addRow(networkSection, 'MAC Address', entity.mac_address);
        if (networkSection.childElementCount > 1) {
            infoSections.push(networkSection);
        }

        const links = Array.isArray(entity.group_links) ? entity.group_links : [];
        const addressList = Array.from(new Set(links.map((link) => link.group_address).filter(Boolean)));
        const groupedObjects = groupLinksByObject(links);
        const groupObjectsSection = buildGroupObjectsSection(groupedObjects, 0, addressList.length, {
            deviceAddress: entity.address || ''
        });

        const configEntries = extractConfigEntries(entity);
        const paramsSection = buildParametersSection(configEntries);

        const tabs = [
            { key: 'info', label: 'Info', icon: ICON.info, content: infoSections },
            { key: 'objects', label: `Objects (${groupedObjects.length})`, icon: ICON.object, content: [groupObjectsSection] }
        ];
        if (configEntries.length > 0) {
            tabs.push({
                key: 'params',
                label: `Parameters (${configEntries.length})`,
                icon: ICON.settings,
                content: [paramsSection]
            });
        }
        renderDetailsTabs(dom, container, entity.kind, tabs);
        return;
    }

    if (entity.kind === 'group-object') {
        const infoSection = createSection('Object Details');
        addRow(infoSection, 'Number', entity.number);
        addRow(infoSection, 'Name', entity.name);
        addRow(infoSection, 'Function Text', entity.object_function_text);
        addRow(infoSection, 'ComObject Text', entity.object_text);
        addRow(infoSection, 'Datapoint', formatDatapointType(entity.datapoint_type));
        addRow(infoSection, 'Size', entity.object_size || resolveDptSize(entity.datapoint_type));
        addRow(infoSection, 'Description', entity.description);
        addRow(infoSection, 'Comment', entity.comment);
        if (entity.group_addresses && entity.group_addresses.length) {
            const list = document.createElement('div');
            list.className = 'panel-link-list';
            entity.group_addresses.forEach((address) => {
                if (!address) return;
                list.appendChild(createNavLink(address, 'group-address', address));
            });
            addRowNode(infoSection, 'Group Addresses', list);
        }

        const settingsSection = createSection('Settings');
        if (entity.flags) {
            const flagMap = {
                C: 'Comm',
                R: 'Read',
                W: 'Write',
                T: 'Transmit',
                U: 'Update'
            };
            const activeFlags = formatFlagsText(entity.flags).split(' ');
            const flagContainer = document.createElement('div');
            flagContainer.className = 'panel-flags';
            Object.keys(flagMap).forEach((flag) => {
                const isActive = activeFlags.includes(flag);
                const badge = document.createElement('span');
                badge.className = `flag-badge ${isActive ? 'active' : ''}`;
                badge.textContent = flag;
                badge.title = flagMap[flag];
                flagContainer.appendChild(badge);
            });
            addRowNode(settingsSection, 'Flags', flagContainer);
        } else if (entity.flags_text) {
            addRow(settingsSection, 'Flags', formatFlagsText(entity.flags_text));
        }
        addRow(settingsSection, 'Security', entity.security);
        addRow(settingsSection, 'Building Function', entity.building_function);
        addRow(settingsSection, 'Building Part', entity.building_part);

        const tabs = [
            { key: 'info', label: 'Info', icon: ICON.info, content: [infoSection] },
            { key: 'settings', label: 'Settings', icon: ICON.settings, content: [settingsSection] }
        ];

        if (entity.parent_cell_id && entity.parent_label && options.onSelectCell) {
            const linkSection = createSection('Parent Device');
            const link = document.createElement('div');
            link.className = 'panel-link';
            link.textContent = entity.parent_label;
            link.onclick = () => {
                options.onSelectCell(entity.parent_cell_id);
                if (options.onFocusCell) {
                    options.onFocusCell(entity.parent_cell_id);
                }
            };
            linkSection.appendChild(link);
            tabs.push({ key: 'parent', label: 'Parent', icon: ICON.link, content: [linkSection] });
        } else if (entity.device) {
            const linkSection = createSection('Device');
            const deviceAddress = entity.device.properties ? entity.device.properties.address : entity.device.individual_address;
            addRow(linkSection, 'Address', deviceAddress, {
                className: 'panel-link',
                dataset: { navKind: 'device', navValue: deviceAddress }
            });
            addRow(linkSection, 'Name', entity.device.properties ? entity.device.properties.name : entity.device.name);
            tabs.push({ key: 'device', label: 'Device', icon: ICON.link, content: [linkSection] });
        }

        renderDetailsTabs(dom, container, entity.kind, tabs);
        return;
    }

    if (entity.kind === 'area') {
        const infoSection = createSection('Area Info');
        addRow(infoSection, 'Address', entity.address);
        addRow(infoSection, 'Name', entity.name);
        addRow(infoSection, 'Description', entity.description);
        addRow(infoSection, 'Comment', entity.comment);
        addRow(infoSection, 'Completion', entity.completion);
        renderDetailsTabs(dom, container, entity.kind, [
            { key: 'info', label: 'Info', icon: ICON.info, content: [infoSection] }
        ]);
        return;
    }

    if (entity.kind === 'line') {
        const infoSection = createSection('Line Info');
        addRow(infoSection, 'Address', entity.address);
        addRow(infoSection, 'Name', entity.name);
        addRow(infoSection, 'Description', entity.description);
        addRow(infoSection, 'Comment', entity.comment);
        addRow(infoSection, 'Connection Type', entity.medium);
        addRow(infoSection, 'Completion', entity.completion);
        renderDetailsTabs(dom, container, entity.kind, [
            { key: 'info', label: 'Info', icon: ICON.info, content: [infoSection] }
        ]);
        return;
    }

    if (entity.kind === 'segment') {
        const infoSection = createSection('Segment Info');
        addRow(infoSection, 'Segment', entity.segment);
        addRow(infoSection, 'Name', entity.name);
        addRow(infoSection, 'Medium', entity.medium);
        addRow(infoSection, 'Domain', entity.domain);
        renderDetailsTabs(dom, container, entity.kind, [
            { key: 'info', label: 'Info', icon: ICON.info, content: [infoSection] }
        ]);
        return;
    }

    if (entity.kind === 'group-main' || entity.kind === 'group-middle') {
        const label = entity.kind === 'group-main' ? 'Main Group' : 'Middle Group';
        const infoSection = createSection(label);
        addRow(infoSection, 'Address', entity.address);
        addRow(infoSection, 'Name', entity.name);
        addRow(infoSection, 'Description', entity.description);
        addRow(infoSection, 'Comment', entity.comment);
        renderDetailsTabs(dom, container, entity.kind, [
            { key: 'info', label: 'Info', icon: ICON.info, content: [infoSection] }
        ]);
        return;
    }

    if (entity.kind === 'building-space') {
        const infoSection = createSection('Building Space');
        addRow(infoSection, 'Type', entity.space_type || '');
        addRow(infoSection, 'Name', entity.name);
        addRow(infoSection, 'Number', entity.number);
        addRow(infoSection, 'Default Line', entity.default_line);
        addRow(infoSection, 'Description', entity.description);
        addRow(infoSection, 'Completion', entity.completion);
        renderDetailsTabs(dom, container, entity.kind, [
            { key: 'info', label: 'Info', icon: ICON.info, content: [infoSection] }
        ]);
        return;
    }

    const infoSection = createSection('Properties');
    if (entity.props) {
        Object.entries(entity.props).forEach(([key, value]) => {
            if (typeof value !== 'string') return;
            const formatted = key === 'datapoint_type' ? formatDatapointType(value) : value;
            addRow(infoSection, key, formatted);
        });
    }
    renderDetailsTabs(dom, container, entity.kind, [
        { key: 'info', label: 'Info', icon: ICON.info, content: [infoSection] }
    ]);
}
