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

    if (kind === 'composite-device') {
        const infoSection = createSection('Device Info');
        addRow(infoSection, 'Name', fullName);
        addRow(infoSection, 'Address', fullAddress);
        const original = cell.get('originalDevice');
        if (original && original.properties) {
            addRow(infoSection, 'Manufacturer', original.properties.manufacturer);
            addRow(infoSection, 'Product', original.properties.product);
            addRow(infoSection, 'Reference', original.properties.product_reference);
            addRow(infoSection, 'Serial', original.properties.serial_number);
            addRow(infoSection, 'Description', original.properties.description);
            addRow(infoSection, 'Comment', original.properties.comment);
            addRow(infoSection, 'Application Program', original.properties.app_program_name);
            addRow(infoSection, 'Program Version', original.properties.app_program_version);
            addRow(infoSection, 'Program Number', original.properties.app_program_number);
            addRow(infoSection, 'Program Type', original.properties.app_program_type);
            addRow(infoSection, 'Mask Version', original.properties.app_mask_version);
            addRow(infoSection, 'Connection Type', original.properties.medium);
            addRow(infoSection, 'Segment Number', original.properties.segment_number);
            addRow(infoSection, 'Segment Id', original.properties.segment_id);
            addRow(infoSection, 'Segment Medium', original.properties.segment_medium);
            addRow(infoSection, 'Segment Domain', original.properties.segment_domain_address);
            addRow(infoSection, 'IP Assignment', original.properties.ip_assignment);
            addRow(infoSection, 'IP Address', original.properties.ip_address);
            addRow(infoSection, 'Subnet Mask', original.properties.ip_subnet_mask);
            addRow(infoSection, 'Default Gateway', original.properties.ip_default_gateway);
            addRow(infoSection, 'MAC Address', original.properties.mac_address);
        }
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

    if (kind === 'device') {
        const infoSection = createSection('Device Info');
        addRow(infoSection, 'Manufacturer', props.manufacturer);
        addRow(infoSection, 'Product', props.product);
        addRow(infoSection, 'Reference', props.product_reference);
        addRow(infoSection, 'Serial', props.serial_number);
        addRow(infoSection, 'Description', props.description);
        addRow(infoSection, 'Comment', props.comment);
        addRow(infoSection, 'Application Program', props.app_program_name);
        addRow(infoSection, 'Program Version', props.app_program_version);
        addRow(infoSection, 'Program Number', props.app_program_number);
        addRow(infoSection, 'Program Type', props.app_program_type);
        addRow(infoSection, 'Mask Version', props.app_mask_version);
        addRow(infoSection, 'Connection Type', props.medium);
        addRow(infoSection, 'Segment Number', props.segment_number);
        addRow(infoSection, 'Segment Id', props.segment_id);
        addRow(infoSection, 'Segment Medium', props.segment_medium);
        addRow(infoSection, 'Segment Domain', props.segment_domain_address);
        addRow(infoSection, 'IP Assignment', props.ip_assignment);
        addRow(infoSection, 'IP Address', props.ip_address);
        addRow(infoSection, 'Subnet Mask', props.ip_subnet_mask);
        addRow(infoSection, 'Default Gateway', props.ip_default_gateway);
        addRow(infoSection, 'MAC Address', props.mac_address);
        container.appendChild(infoSection);

        if (config && Object.keys(config).length > 0) {
            const configSection = createSection('Configuration');
            Object.entries(config)
                .sort(([a], [b]) => a.localeCompare(b))
                .forEach(([key, val]) => {
                    addRow(configSection, key, val);
                });
            container.appendChild(configSection);
        }

        const children = state.graph
            ? state.graph.getElements().filter(el => el.get('parent') === cell.id)
            : [];
        const addresses = Array.from(new Set(children.map((el) => el.get('groupAddress')).filter(Boolean)));

        if (nodeData && nodeData.group_links && nodeData.group_links.length > 0) {
            const linkCount = nodeData.group_links.length;
            const linksSection = createSection(`Group Objects (${linkCount})`);

            const list = document.createElement('div');
            list.className = 'objects-list';
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '8px';

            nodeData.group_links.forEach(link => {
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
    return 'Node';
}

registerSelectionListener(updateDetailsPanel);
