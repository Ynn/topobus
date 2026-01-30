import { resolveDptSize } from '../formatters/device.js';

function canonicalKind(kind) {
    if (!kind) return '';
    if (kind === 'groupaddress') return 'group-address';
    if (kind === 'groupobject') return 'group-object';
    if (kind === 'composite-ga') return 'group-address';
    if (kind === 'composite-object') return 'group-object';
    if (kind === 'composite-device') return 'device';
    if (kind === 'composite-main') return 'group-main';
    if (kind === 'composite-middle') return 'group-middle';
    return kind;
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

function resolveDeviceInfoByAddress(state, address) {
    if (!address || !state || !state.deviceIndex) return null;
    return state.deviceIndex.get(address) || null;
}

const buildingLookupCache = { project: null, map: new Map() };

function buildBuildingLookup(project) {
    const lookup = new Map();
    if (!project || !Array.isArray(project.locations)) return lookup;
    const walk = (spaces, path) => {
        spaces.forEach((space) => {
            if (!space) return;
            const label = space.name || space.number || space.id || '';
            const nextPath = label ? path.concat([label]) : path;
            const part = nextPath.join(' / ');
            const func = space.space_type || '';
            const devices = Array.isArray(space.devices) ? space.devices : [];
            devices.forEach((deviceRef) => {
                if (deviceRef && deviceRef.address) {
                    lookup.set(deviceRef.address, {
                        buildingPart: part,
                        buildingFunction: func,
                        buildingSpaceId: space.id || ''
                    });
                }
            });
            const children = Array.isArray(space.children) ? space.children : [];
            if (children.length) {
                walk(children, nextPath);
            }
        });
    };
    walk(project.locations, []);
    return lookup;
}

function resolveBuildingInfo(state, address) {
    if (!state || !state.currentProject || !address) {
        return { buildingPart: '', buildingFunction: '', buildingSpaceId: '' };
    }
    if (buildingLookupCache.project !== state.currentProject) {
        buildingLookupCache.project = state.currentProject;
        buildingLookupCache.map = buildBuildingLookup(state.currentProject);
    }
    return buildingLookupCache.map.get(address) || { buildingPart: '', buildingFunction: '', buildingSpaceId: '' };
}

function resolveGroupAddressInfo(state, address) {
    const project = state && state.currentProject;
    if (!project || !Array.isArray(project.group_addresses)) return null;
    return project.group_addresses.find((ga) => ga.address === address) || null;
}

function buildGroupAddressFallbackMap(project) {
    const map = new Map();
    const devices = Array.isArray(project.devices) ? project.devices : [];
    devices.forEach((device) => {
        const links = Array.isArray(device.group_links) ? device.group_links : [];
        links.forEach((link) => {
            if (!link || !link.group_address) return;
            const address = link.group_address;
            let entry = map.get(address);
            if (!entry) {
                entry = { datapoint_type: '', object_size: '' };
                map.set(address, entry);
            }
            if (!entry.datapoint_type && link.datapoint_type) {
                entry.datapoint_type = link.datapoint_type;
            }
            if (!entry.object_size && link.object_size) {
                entry.object_size = link.object_size;
            }
            if (!entry.object_size && link.datapoint_type) {
                entry.object_size = resolveDptSize(link.datapoint_type);
            }
        });
    });
    return map;
}

const fallbackCache = { project: null, map: new Map() };

function resolveGroupAddressFallback(state, address) {
    const project = state && state.currentProject;
    if (!project || !address) return null;
    if (fallbackCache.project !== project) {
        fallbackCache.project = project;
        fallbackCache.map = buildGroupAddressFallbackMap(project);
    }
    return fallbackCache.map.get(address) || null;
}

function buildEntityHeader({ kind, name, address, titleFallback }) {
    const title = name || address || titleFallback || 'Selection';
    let subtitle = '';
    if (address && title !== address) {
        subtitle = address;
    }
    return { title, subtitle };
}

function normalizeGroupAddressFromProps(state, props, nameFallback, addressFallback) {
    const address = props.address || addressFallback || '';
    const fallback = resolveGroupAddressFallback(state, address);
    const datapointType = props.datapoint_type || (fallback ? fallback.datapoint_type : '');
    const datapointSize = resolveDptSize(datapointType) || (fallback ? fallback.object_size : '');
    const info = resolveGroupAddressInfo(state, address);
    const linkedDevices = [];
    if (info && Array.isArray(info.linked_devices)) {
        const unique = new Map();
        info.linked_devices.forEach((deviceAddress) => {
            const normalized = String(deviceAddress || '').trim();
            if (!normalized) return;
            const device = state && state.deviceIndex ? state.deviceIndex.get(normalized) : null;
            const name = device && device.name ? device.name : '';
            if (!unique.has(normalized)) {
                unique.set(normalized, name);
            } else if (!unique.get(normalized) && name) {
                unique.set(normalized, name);
            }
        });
        unique.forEach((name, addr) => {
            linkedDevices.push({ address: addr, name: name || '' });
        });
    }
    return {
        address,
        name: props.name || nameFallback || '',
        description: props.description || props.desc || '',
        comment: props.comment || '',
        datapoint_type: datapointType,
        datapoint_size: datapointSize,
        main_name: props.main_name || props.main_group_name || '',
        main_description: props.main_description || '',
        main_comment: props.main_comment || '',
        middle_name: props.middle_name || props.middle_group_name || '',
        middle_description: props.middle_description || '',
        middle_comment: props.middle_comment || '',
        linked_devices: linkedDevices
    };
}

function normalizeDeviceFromProps(state, props, rawDevice) {
    const address = props.address || props.individual_address || '';
    const deviceInfo = rawDevice || resolveDeviceInfoByAddress(state, address);
    const mapped = mapDeviceInfoToProps(deviceInfo);
    const buildingInfo = resolveBuildingInfo(state, address);
    const merged = { ...props, ...mapped };
    return {
        address: merged.address || address,
        name: merged.name || props.name || '',
        manufacturer: merged.manufacturer || '',
        product: merged.product || '',
        product_reference: merged.product_reference || '',
        serial_number: merged.serial_number || '',
        description: merged.description || '',
        comment: merged.comment || '',
        last_modified: merged.last_modified || '',
        last_download: merged.last_download || '',
        app_program_name: merged.app_program_name || '',
        app_program_version: merged.app_program_version || '',
        app_program_number: merged.app_program_number || '',
        app_program_type: merged.app_program_type || '',
        app_mask_version: merged.app_mask_version || '',
        medium: merged.medium || '',
        segment_number: merged.segment_number || '',
        segment_id: merged.segment_id || '',
        segment_medium: merged.segment_medium || '',
        segment_domain_address: merged.segment_domain_address || '',
        ip_assignment: merged.ip_assignment || '',
        ip_address: merged.ip_address || '',
        ip_subnet_mask: merged.ip_subnet_mask || '',
        ip_default_gateway: merged.ip_default_gateway || '',
        mac_address: merged.mac_address || '',
        building_function: merged.building_function || buildingInfo.buildingFunction || '',
        building_part: merged.building_part || buildingInfo.buildingPart || '',
        building_space_id: buildingInfo.buildingSpaceId || '',
        group_links: deviceInfo && Array.isArray(deviceInfo.group_links) ? deviceInfo.group_links : (props.group_links || []),
        configuration_entries: deviceInfo && Array.isArray(deviceInfo.configuration_entries) ? deviceInfo.configuration_entries : (props.configuration_entries || []),
        configuration: deviceInfo && deviceInfo.configuration ? deviceInfo.configuration : (props.configuration || {})
    };
}

function normalizeGroupObjectFromProps(props, raw) {
    const parseBool = (value) => {
        if (value === true) return true;
        if (value === false) return false;
        if (value == null) return null;
        const str = String(value).trim().toLowerCase();
        if (str === 'true' || str === '1' || str === 'yes') return true;
        if (str === 'false' || str === '0' || str === 'no') return false;
        return null;
    };

    const parseGroupAddressList = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) {
            return value.map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
        }
        const str = String(value);
        return str
            .split(/[,\n\t\r\f\v ]+/)
            .map((v) => v.trim())
            .filter(Boolean);
    };

    const link = raw && raw.link ? raw.link : null;
    const links = raw && Array.isArray(raw.links) ? raw.links : (link ? [link] : []);
    const groupAddresses = [];

    // Prefer the precomputed full list (graph nodes export this as `group_addresses`).
    parseGroupAddressList(props && props.group_addresses).forEach((address) => {
        if (!groupAddresses.includes(address)) {
            groupAddresses.push(address);
        }
    });

    // Then add addresses from provided links (table selections often supply `raw.links`).
    links.forEach((entry) => {
        if (entry && entry.group_address && !groupAddresses.includes(entry.group_address)) {
            groupAddresses.push(entry.group_address);
        }
    });

    // Fallback for minimal payloads.
    if (props && props.group_address && !groupAddresses.includes(props.group_address)) {
        groupAddresses.push(props.group_address);
    }

    const etsSending = parseBool(props.ets_sending != null ? props.ets_sending : (link ? link.ets_sending : null));
    const etsReceiving = parseBool(props.ets_receiving != null ? props.ets_receiving : (link ? link.ets_receiving : null));
    return {
        number: props.number || (link ? link.number : ''),
        name: props.object || props.object_name || props.object_name_raw || (link ? link.object_name : ''),
        object_function_text: props.func || props.object_function_text || (link ? link.object_function_text : ''),
        object_text: props.object_text || (link ? link.object_text : ''),
        description: props.description || props.desc || (link ? link.description : ''),
        comment: props.comment || (link ? link.comment : ''),
        channel: props.channel || (link ? link.channel : ''),
        datapoint_type: props.datapoint_type || props.type || (link ? link.datapoint_type : ''),
        object_size: props.object_size || props.size || (link ? link.object_size : ''),
        flags: props.flags || (link ? link.flags : null),
        flags_text: props.flags_text || (link ? link.flags_text : ''),
        security: props.security || (link ? link.security : ''),
        building_function: props.building_function || props.buildingFunction || (link ? link.building_function : ''),
        building_part: props.building_part || props.buildingPart || (link ? link.building_part : ''),
        group_addresses: groupAddresses,
        ets_sending_address: props.ets_sending_address || (link ? link.ets_sending_address : ''),
        ets_sending: etsSending,
        ets_receiving: etsReceiving
    };
}

export function normalizeFromGraphCell(cell, state) {
    if (!cell) return null;
    const nodeData = state && state.currentNodeIndex ? state.currentNodeIndex.get(cell.id) : null;
    const cellProps = cell.get ? (cell.get('nodeProps') || cell.get('properties')) : null;
    const props = nodeData ? (nodeData.properties || {}) : (cellProps || {});
    const kind = canonicalKind(nodeData ? nodeData.kind : (cell.get ? cell.get('kind') : ''));
    const fullAddress = cell.get ? (cell.get('fullAddress') || props.address || '') : (props.address || '');
    const fullName = cell.get ? (cell.get('fullName') || (nodeData ? nodeData.label : '') || props.name || '') : (props.name || '');
    const base = { kind, id: cell.id || '', source: { type: 'graph', raw: cell } };

    if (kind === 'group-address') {
        const gaProps = normalizeGroupAddressFromProps(state, props, fullName, fullAddress);
        const header = buildEntityHeader({ kind, name: gaProps.name, address: gaProps.address, titleFallback: 'Group Address' });
        return { ...base, ...gaProps, title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'device') {
        const deviceProps = normalizeDeviceFromProps(state, props, null);
        const header = buildEntityHeader({ kind, name: deviceProps.name || fullName, address: deviceProps.address || fullAddress, titleFallback: 'Device' });
        return { ...base, ...deviceProps, title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'group-object') {
        const original = cell.get ? cell.get('originalObject') : null;
        const originalProps = original && original.properties ? original.properties : {};
        const merged = { ...props, ...originalProps };
        const groupObject = normalizeGroupObjectFromProps(merged, { link: originalProps, links: null, device: null });
        const header = buildEntityHeader({ kind, name: groupObject.name || fullName, address: groupObject.group_addresses && groupObject.group_addresses[0], titleFallback: 'Group Object' });
        const parentId = cell.get ? cell.get('parent') : null;
        let parentLabel = '';
        if (parentId && state && state.graph) {
            const parent = state.graph.getCell(parentId);
            if (parent) {
                parentLabel = `${parent.get('fullAddress') || ''} ${parent.get('fullName') || ''}`.trim();
            }
        }
        return {
            ...base,
            ...groupObject,
            address: (groupObject.group_addresses && groupObject.group_addresses[0]) || '',
            title: header.title,
            subtitle: header.subtitle,
            parent_cell_id: parentId || '',
            parent_label: parentLabel
        };
    }

    if (kind === 'line') {
        const header = buildEntityHeader({ kind, name: props.name || fullName, address: props.address || fullAddress, titleFallback: 'Line' });
        return {
            ...base,
            address: props.address || fullAddress,
            name: props.name || fullName,
            description: props.description || '',
            comment: props.comment || '',
            medium: props.medium || props.medium_type || '',
            completion: props.completion_status || '',
            title: header.title,
            subtitle: header.subtitle
        };
    }

    if (kind === 'segment') {
        const header = buildEntityHeader({ kind, name: props.name || fullName, address: props.segment || props.address || fullAddress, titleFallback: 'Segment' });
        return {
            ...base,
            segment: props.segment || props.segment_id || '',
            name: props.name || fullName,
            medium: props.medium || props.segment_medium_type || '',
            domain: props.domain || props.segment_domain_address || '',
            title: header.title,
            subtitle: header.subtitle
        };
    }

    if (kind === 'area') {
        const header = buildEntityHeader({ kind, name: props.name || fullName, address: props.address || props.area || fullAddress, titleFallback: 'Area' });
        return {
            ...base,
            address: props.address || props.area || fullAddress,
            name: props.name || fullName,
            description: props.description || '',
            comment: props.comment || '',
            completion: props.completion_status || '',
            title: header.title,
            subtitle: header.subtitle
        };
    }

    if (kind === 'group-main' || kind === 'group-middle') {
        const header = buildEntityHeader({ kind, name: props.name || fullName, address: props.address || fullAddress, titleFallback: kind === 'group-main' ? 'Main Group' : 'Middle Group' });
        return {
            ...base,
            address: props.address || fullAddress,
            name: props.name || fullName,
            description: props.description || '',
            comment: props.comment || '',
            title: header.title,
            subtitle: header.subtitle
        };
    }

    if (kind === 'building-space') {
        const header = buildEntityHeader({ kind, name: props.name || fullName, address: props.number || '', titleFallback: 'Building Space' });
        return {
            ...base,
            space_type: cell.get ? (cell.get('spaceType') || props.space_type || '') : (props.space_type || ''),
            name: props.name || fullName,
            number: props.number || '',
            default_line: props.default_line || '',
            description: props.description || '',
            completion: props.completion_status || '',
            title: header.title,
            subtitle: header.subtitle
        };
    }

    const header = buildEntityHeader({ kind, name: fullName, address: fullAddress, titleFallback: 'Selection' });
    return { ...base, title: header.title, subtitle: header.subtitle, props };
}

export function normalizeFromTableItem(item, state) {
    if (!item) return null;
    const kind = canonicalKind(item.kind || '');
    const data = item.data || {};
    const raw = item.raw || {};
    const base = { kind, id: item.id || '', source: { type: 'table', raw: item } };

    if (kind === 'group-address') {
        const props = normalizeGroupAddressFromProps(state, raw, data.name, data.address);
        const header = buildEntityHeader({ kind, name: props.name, address: props.address, titleFallback: 'Group Address' });
        return { ...base, ...props, title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'device') {
        const props = normalizeDeviceFromProps(state, data, raw);
        const header = buildEntityHeader({ kind, name: props.name || data.name, address: props.address || data.address, titleFallback: 'Device' });
        return { ...base, ...props, title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'group-object') {
        const nodeProps = raw && raw.node && raw.node.properties ? raw.node.properties : null;
        const merged = nodeProps ? { ...nodeProps, ...data } : data;
        const props = normalizeGroupObjectFromProps(merged, {
            link: raw && raw.link ? raw.link : nodeProps,
            links: raw && raw.links ? raw.links : null,
            device: raw && raw.device ? raw.device : null
        });
        const header = buildEntityHeader({ kind, name: props.name, address: props.group_addresses && props.group_addresses[0], titleFallback: 'Group Object' });
        return { ...base, ...props, address: (props.group_addresses && props.group_addresses[0]) || '', title: header.title, subtitle: header.subtitle, device: raw.device || null };
    }

    if (kind === 'line') {
        const header = buildEntityHeader({ kind, name: data.name, address: data.line, titleFallback: 'Line' });
        return { ...base, address: data.line || '', name: data.name || '', description: data.desc || '', medium: data.medium || '', title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'segment') {
        const header = buildEntityHeader({ kind, name: data.name, address: data.segment, titleFallback: 'Segment' });
        return { ...base, segment: data.segment || '', name: data.name || '', medium: data.medium || '', domain: data.domain || '', title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'area') {
        const header = buildEntityHeader({ kind, name: data.name, address: data.area, titleFallback: 'Area' });
        return { ...base, address: data.area || '', name: data.name || '', description: data.desc || '', title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'building-space') {
        const header = buildEntityHeader({ kind, name: data.name || data.location, address: data.address, titleFallback: 'Building Space' });
        return { ...base, name: data.name || data.location || '', address: data.address || '', description: data.desc || '', title: header.title, subtitle: header.subtitle };
    }

    const header = buildEntityHeader({ kind, name: data.name || '', address: data.address || '', titleFallback: 'Selection' });
    return { ...base, props: data, title: header.title, subtitle: header.subtitle };
}

export function normalizeFromTreeSelection(selection, state) {
    if (!selection) return null;
    const kind = canonicalKind(selection.kind || '');
    const base = { kind, id: selection.value || selection.deviceId || selection.deviceAddress || '', source: { type: 'tree', raw: selection } };

    if (kind === 'group-address') {
        const props = normalizeGroupAddressFromProps(state, { address: selection.value || '' }, selection.label, selection.value);
        const header = buildEntityHeader({ kind, name: props.name || selection.label, address: props.address, titleFallback: 'Group Address' });
        return { ...base, ...props, title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'device') {
        const props = normalizeDeviceFromProps(state, { address: selection.deviceAddress || '' }, null);
        const header = buildEntityHeader({ kind, name: props.name || selection.label, address: props.address || selection.deviceAddress, titleFallback: 'Device' });
        return { ...base, ...props, title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'area') {
        const address = selection.area || '';
        const header = buildEntityHeader({ kind, name: selection.label, address, titleFallback: 'Area' });
        return { ...base, address, name: selection.label || '', description: '', comment: '', title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'line') {
        const address = selection.area && selection.line ? `${selection.area}.${selection.line}` : selection.label;
        const header = buildEntityHeader({ kind, name: selection.label, address, titleFallback: 'Line' });
        return { ...base, address, name: selection.label || '', description: '', comment: '', medium: '', title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'segment') {
        const address = selection.segment || selection.label || '';
        const header = buildEntityHeader({ kind, name: selection.label, address, titleFallback: 'Segment' });
        return { ...base, segment: selection.segment || '', name: selection.label || '', medium: '', domain: '', title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'group-main' || kind === 'group-middle') {
        const header = buildEntityHeader({ kind, name: selection.label, address: selection.value || '', titleFallback: kind === 'group-main' ? 'Main Group' : 'Middle Group' });
        return { ...base, address: selection.value || '', name: selection.label || '', description: '', comment: '', title: header.title, subtitle: header.subtitle };
    }

    if (kind === 'building-space') {
        const header = buildEntityHeader({ kind, name: selection.label, address: selection.spaceId || '', titleFallback: 'Building Space' });
        return { ...base, space_type: '', name: selection.label || '', number: '', default_line: '', description: '', completion: '', title: header.title, subtitle: header.subtitle };
    }

    const header = buildEntityHeader({ kind, name: selection.label || '', address: selection.value || '', titleFallback: 'Selection' });
    return { ...base, title: header.title, subtitle: header.subtitle, props: selection };
}
