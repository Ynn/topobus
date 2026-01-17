import { state } from './state.js';
import { getDom } from './dom.js';
import { toBool } from './utils.js';
import { registerSelectionListener, selectCell } from './selection.js';
import { focusCell } from './interactions.js';
import { formatDatapointType } from './dpt.js';

export function updateDetailsPanel(cell) {
    const dom = getDom();
    if (!dom || !dom.detailsContent) return;
    const container = dom.detailsContent;
    container.innerHTML = '';

    if (!cell) {
        container.innerHTML = '<div class="empty-state">Select a node to view properties</div>';
        return;
    }

    const nodeData = state.currentNodeIndex ? state.currentNodeIndex.get(cell.id) : null;
    const cellProps = cell && cell.get ? (cell.get('nodeProps') || cell.get('properties')) : null;
    const props = nodeData ? nodeData.properties : (cellProps || {});
    const kind = nodeData ? nodeData.kind : cell.get('kind');
    const fullAddress = cell.get('fullAddress') || props.address || '';
    const fullName = cell.get('fullName') || props.name || (nodeData ? nodeData.label : '') || '';
    const config = nodeData ? nodeData.configuration : {};

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

    const createSection = (title) => {
        const section = document.createElement('div');
        section.className = 'panel-section';
        const h3 = document.createElement('h3');
        h3.textContent = title;
        section.appendChild(h3);
        return section;
    };

    const addRow = (section, label, value) => {
        if (!value) return;
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
    };

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
        container.appendChild(infoSection);
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
        container.appendChild(infoSection);
        return;
    }

    if (kind === 'area') {
        const infoSection = createSection('Area Info');
        addRow(infoSection, 'Address', props.address || props.area || fullAddress);
        addRow(infoSection, 'Name', props.name || fullName);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        container.appendChild(infoSection);
        return;
    }

    if (kind === 'line') {
        const infoSection = createSection('Line Info');
        addRow(infoSection, 'Address', props.address || fullAddress);
        addRow(infoSection, 'Name', props.name || fullName);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        addRow(infoSection, 'Connection Type', props.medium);
        container.appendChild(infoSection);
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
        container.appendChild(infoSection);
        return;
    }

    if (kind === 'composite-main' || kind === 'composite-middle') {
        const label = kind === 'composite-main' ? 'Main Group' : 'Middle Group';
        const infoSection = createSection(label);
        addRow(infoSection, 'Address', props.address || fullAddress);
        addRow(infoSection, 'Name', props.name || fullName);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        container.appendChild(infoSection);
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
        container.appendChild(infoSection);
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
        addRow(infoSection, 'Application Program', deviceProps.app_program_name);
        addRow(infoSection, 'Program Version', deviceProps.app_program_version);
        addRow(infoSection, 'Program Number', deviceProps.app_program_number);
        addRow(infoSection, 'Program Type', deviceProps.app_program_type);
        addRow(infoSection, 'Mask Version', deviceProps.app_mask_version);
        addRow(infoSection, 'Connection Type', deviceProps.medium);
        addRow(infoSection, 'Segment Number', deviceProps.segment_number);
        addRow(infoSection, 'Segment Id', deviceProps.segment_id);
        addRow(infoSection, 'Segment Medium', deviceProps.segment_medium);
        addRow(infoSection, 'Segment Domain', deviceProps.segment_domain_address);
        addRow(infoSection, 'IP Assignment', deviceProps.ip_assignment);
        addRow(infoSection, 'IP Address', deviceProps.ip_address);
        addRow(infoSection, 'Subnet Mask', deviceProps.ip_subnet_mask);
        addRow(infoSection, 'Default Gateway', deviceProps.ip_default_gateway);
        addRow(infoSection, 'MAC Address', deviceProps.mac_address);
        container.appendChild(infoSection);

        const configuration = deviceInfo && deviceInfo.configuration ? deviceInfo.configuration : config;
        const configEntries = deviceInfo && Array.isArray(deviceInfo.configuration_entries)
            ? deviceInfo.configuration_entries
            : null;
        const configSection = buildConfigSection(configuration, configEntries, createSection);

        const links = deviceInfo && Array.isArray(deviceInfo.group_links)
            ? deviceInfo.group_links
            : (nodeData && Array.isArray(nodeData.group_links) ? nodeData.group_links : []);

        const children = state.graph
            ? state.graph.getElements().filter(el => el.get('parent') === cell.id)
            : [];
        const addresses = Array.from(new Set(children.map((el) => el.get('groupAddress')).filter(Boolean)));

        if (links.length > 0) {
            const linkCount = links.length;
            const linksSection = createSection(`Group Objects (${linkCount})`);

            const list = document.createElement('div');
            list.className = 'objects-list';
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '8px';

            links.forEach(link => {
                const item = document.createElement('div');
                item.className = 'object-item';
                item.style.padding = '8px';
                item.style.background = '#fff';
                item.style.border = '1px solid var(--border)';
                item.style.borderRadius = '6px';
                item.style.fontSize = '0.85rem';

                const line1 = document.createElement('div');
                line1.style.fontWeight = '600';
                line1.style.color = 'var(--ink)';
                line1.style.marginBottom = '2px';
                line1.textContent = link.object_name;

                const line2 = document.createElement('div');
                line2.style.color = 'var(--muted)';
                line2.style.fontSize = '0.75rem';
                line2.style.display = 'flex';
                line2.style.justifyContent = 'space-between';

                const gaSpan = document.createElement('span');
                gaSpan.className = 'panel-tag ga-tag';
                gaSpan.textContent = link.group_address;
                gaSpan.style.margin = '0';

                const flagsSpan = document.createElement('span');
                if (link.flags) {
                    const f = link.flags;
                    const active = [];
                    if (f.communication) active.push('C');
                    if (f.read) active.push('R');
                    if (f.write) active.push('W');
                    if (f.transmit) active.push('T');
                    if (f.update) active.push('U');
                    flagsSpan.textContent = active.join(' ');
                } else if (link.flags_text) {
                    flagsSpan.textContent = link.flags_text;
                }

                line2.appendChild(gaSpan);
                line2.appendChild(flagsSpan);

                item.appendChild(line1);
                item.appendChild(line2);
                list.appendChild(item);
            });
            linksSection.appendChild(list);
            container.appendChild(linksSection);
        } else {
            const statsSection = createSection('Statistics');
            addRow(statsSection, 'Group Objects', String(children.length));
            addRow(statsSection, 'Group Addresses', String(addresses.length));
            container.appendChild(statsSection);
        }

        if (configSection) {
            container.appendChild(configSection);
        }
    } else if (kind === 'groupobject') {
        const infoSection = createSection('Object Details');
        addRow(infoSection, 'Number', props.number);
        addRow(infoSection, 'Function Text', props.object_function_text);
        addRow(infoSection, 'ComObject Name', props.object_name_raw);
        addRow(infoSection, 'ComObject Text', props.object_text);
        addRow(infoSection, 'Datapoint', formatDatapointType(props.datapoint_type));
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        container.appendChild(infoSection);

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

        addRow(settingsSection, 'Direction', describeDirection(props.is_transmitter, props.is_receiver));
        container.appendChild(settingsSection);

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
                container.appendChild(linkSection);
            }
        }
    } else {
        const infoSection = createSection('Properties');
        Object.entries(props).forEach(([k, v]) => {
            if (typeof v !== 'string') return;
            const value = k === 'datapoint_type' ? formatDatapointType(v) : v;
            addRow(infoSection, k, value);
        });
        container.appendChild(infoSection);
    }
}

function describeDirection(isTx, isRx) {
    const tx = toBool(isTx);
    const rx = toBool(isRx);
    if (tx && rx) return 'Transmit + Receive';
    if (tx) return 'Transmit';
    if (rx) return 'Receive';
    return 'Passive';
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

function buildConfigSection(configuration, entries, createSection) {
    const list = Array.isArray(entries) && entries.length
        ? entries
        : (configuration
            ? Object.entries(configuration).map(([key, value]) => ({
                name: key,
                value,
                ref_id: null,
                source: null
            }))
            : []);
    if (!list.length) return null;

    const section = createSection('Configuration');
    const table = document.createElement('table');
    table.className = 'panel-table';

    const header = document.createElement('tr');
    const keyHead = document.createElement('th');
    keyHead.textContent = 'Parameter';
    const valHead = document.createElement('th');
    valHead.textContent = 'Value';
    const refHead = document.createElement('th');
    refHead.textContent = 'Ref';
    header.appendChild(keyHead);
    header.appendChild(valHead);
    header.appendChild(refHead);
    table.appendChild(header);

    list
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .forEach((entry) => {
            const row = document.createElement('tr');
            const keyCell = document.createElement('td');
            keyCell.textContent = entry.name || '';
            const valCell = document.createElement('td');
            valCell.textContent = entry.value || '';
            const refCell = document.createElement('td');
            refCell.textContent = formatConfigRef(entry);
            row.appendChild(keyCell);
            row.appendChild(valCell);
            row.appendChild(refCell);
            table.appendChild(row);
        });

    section.appendChild(table);
    return section;
}

function formatConfigRef(entry) {
    const parts = [];
    if (entry.source) {
        parts.push(entry.source);
    }
    if (entry.ref_id) {
        parts.push(entry.ref_id);
    }
    return parts.join(' ');
}

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
