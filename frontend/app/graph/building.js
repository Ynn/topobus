import { readTheme, getLayoutSettings } from '../theme.js';
import { formatDeviceName, measureTextWidth } from '../utils.js';
import { updateDeviceText } from './layout.js';

export function renderBuildingGraph(projectData, graph) {
    const root = buildHierarchy(projectData);
    const metrics = getBuildingMetrics();

    if (!root.children.length) {
        renderEmptyState(graph);
        return;
    }

    calculateSizes(root, metrics, 0);

    const cells = [];
    renderHierarchy(root, cells, 40, 40, metrics, 0);

    if (graph.resetCells) {
        graph.resetCells(cells);
    } else {
        graph.addCells(cells);
    }
}

function renderEmptyState(graph) {
    const theme = readTheme();
    const empty = new joint.shapes.standard.Rectangle({
        position: { x: 40, y: 40 },
        size: { width: 360, height: 120 },
        attrs: {
            body: {
                fill: '#fff',
                stroke: theme.border,
                strokeWidth: 1.5,
                rx: 10,
                ry: 10
            },
            label: {
                text: 'No building structure found in this project.',
                fontSize: 12,
                fontFamily: theme.fontSans,
                fill: theme.muted
            }
        }
    });
    empty.set('kind', 'building-empty');
    if (graph.resetCells) {
        graph.resetCells([empty]);
    } else {
        graph.addCells([empty]);
    }
}

function buildHierarchy(projectData) {
    const root = {
        type: 'root',
        children: []
    };
    const locations = projectData && Array.isArray(projectData.locations)
        ? projectData.locations
        : [];
    if (!locations.length) return root;

    const deviceIndex = buildDeviceIndex(projectData);
    root.children = locations.map((space) => buildSpaceNode(space, deviceIndex));
    return root;
}

function buildDeviceIndex(projectData) {
    const index = new Map();
    const devices = projectData && Array.isArray(projectData.devices)
        ? projectData.devices
        : [];
    devices.forEach((device) => {
        if (device && device.individual_address) {
            index.set(device.individual_address, device);
        }
    });
    return index;
}

function buildSpaceNode(space, deviceIndex) {
    const children = [];
    const nested = Array.isArray(space.children) ? space.children : [];
    nested.forEach((child) => children.push(buildSpaceNode(child, deviceIndex)));

    const devices = Array.isArray(space.devices) ? space.devices : [];
    devices.forEach((deviceRef, idx) => {
        children.push(buildDeviceNode(deviceRef, deviceIndex, `${space.id || 'space'}_${idx}`));
    });

    return {
        type: 'space',
        id: space.id || '',
        name: space.name || '',
        label: buildSpaceLabel(space),
        spaceType: space.space_type || 'Space',
        number: space.number || '',
        defaultLine: space.default_line || '',
        description: space.description || '',
        completionStatus: space.completion_status || '',
        children,
        width: 0,
        height: 0,
        headerHeight: 0,
        fontSize: 0
    };
}

function buildDeviceNode(deviceRef, deviceIndex, fallbackId) {
    const address = deviceRef && deviceRef.address ? deviceRef.address : '';
    const info = address ? deviceIndex.get(address) : null;
    const baseName = info ? info.name : (deviceRef && deviceRef.name ? deviceRef.name : '');
    const deviceProps = info
        ? mapDeviceInfoToProps(info)
        : { address, name: baseName };
    const label = formatDeviceName({ properties: deviceProps, label: baseName }) || baseName || address || 'Device';

    return {
        type: 'device',
        id: safeId(`bdev_${deviceRef && deviceRef.instance_id ? deviceRef.instance_id : fallbackId}`),
        label,
        address,
        props: deviceProps,
        width: 0,
        height: 0
    };
}

function buildSpaceLabel(space) {
    const type = space.space_type || 'Space';
    const name = space.name || '';
    const number = space.number || '';
    if (name) {
        return `${type} - ${name}`;
    }
    if (number) {
        return `${type} ${number}`;
    }
    return type;
}

function getBuildingMetrics() {
    const settings = getLayoutSettings();
    const scale = settings ? settings.scale : 1;
    return {
        settings,
        padding: Math.max(12, Math.round(14 * scale)),
        gap: Math.max(14, Math.round(16 * scale)),
        headerBase: Math.max(26, Math.round(30 * scale)),
        headerMin: Math.max(22, Math.round(24 * scale)),
        fontBase: Math.max(11, Math.round(12 * scale)),
        deviceWidth: Math.max(settings.topologyDeviceWidth, Math.round(190 * scale)),
        deviceHeight: settings.topologyDeviceHeight
    };
}

function calculateSizes(node, metrics, depth) {
    const theme = readTheme();
    const padding = metrics.padding;
    const gap = metrics.gap;

    if (node.type === 'device') {
        node.width = metrics.deviceWidth;
        node.height = metrics.deviceHeight;
        return;
    }

    if (node.children) {
        node.children.forEach((child) => calculateSizes(child, metrics, depth + 1));
    }

    if (node.type === 'space') {
        const headerHeight = Math.max(metrics.headerMin, metrics.headerBase - depth * 2);
        const fontSize = Math.max(10, metrics.fontBase - Math.floor(depth / 2));
        node.headerHeight = headerHeight;
        node.fontSize = fontSize;

        if (!node.children || node.children.length === 0) {
            node.width = Math.max(200, Math.round(220 * metrics.settings.scale));
            node.height = headerHeight + padding * 2 + 10;
            if (node.label) {
                const font = `700 ${fontSize}px ${theme.fontSans}`;
                const labelWidth = measureTextWidth(node.label, font) + padding * 2;
                node.width = Math.max(node.width, labelWidth);
            }
            return;
        }

        let totalArea = 0;
        node.children.forEach((child) => {
            totalArea += (child.width + gap) * (child.height + gap);
        });
        let targetWidth = Math.sqrt(totalArea) * 1.4;
        if (targetWidth < 360) targetWidth = 360;

        let currentX = padding;
        let currentY = headerHeight;
        let rowH = 0;
        let maxW = 0;

        node.children.forEach((child) => {
            if (currentX + child.width > targetWidth && currentX > padding) {
                currentX = padding;
                currentY += rowH + gap;
                rowH = 0;
            }
            child.relativeX = currentX;
            child.relativeY = currentY;
            currentX += child.width + gap;
            rowH = Math.max(rowH, child.height);
            maxW = Math.max(maxW, currentX);
        });

        node.width = Math.max(maxW, currentX) + padding;
        node.height = currentY + rowH + padding;

        if (node.label) {
            const font = `700 ${fontSize}px ${theme.fontSans}`;
            const labelWidth = measureTextWidth(node.label, font) + padding * 2;
            node.width = Math.max(node.width, labelWidth);
        }
        return;
    }

    if (node.type === 'root') {
        if (!node.children || node.children.length === 0) {
            node.width = 0;
            node.height = 0;
            return;
        }

        let totalArea = 0;
        node.children.forEach((child) => {
            totalArea += (child.width + gap) * (child.height + gap);
        });
        let targetWidth = Math.sqrt(totalArea) * 1.6;
        if (targetWidth < 900) targetWidth = 900;

        let currentX = padding;
        let currentY = padding;
        let rowH = 0;
        let maxW = 0;

        node.children.forEach((child) => {
            if (currentX + child.width > targetWidth && currentX > padding) {
                currentX = padding;
                currentY += rowH + gap;
                rowH = 0;
            }
            child.relativeX = currentX;
            child.relativeY = currentY;
            currentX += child.width + gap;
            rowH = Math.max(rowH, child.height);
            maxW = Math.max(maxW, currentX);
        });

        node.width = Math.max(maxW, currentX) + padding;
        node.height = currentY + rowH + padding;
    }
}

function renderHierarchy(node, cells, absoluteX, absoluteY, metrics, depth) {
    const theme = readTheme();
    const settings = metrics.settings;
    const x = absoluteX + (node.relativeX || 0);
    const y = absoluteY + (node.relativeY || 0);

    let el = null;

    if (node.type === 'space') {
        el = new joint.shapes.knx.CompositeContainer({
            position: { x, y },
            size: { width: node.width, height: node.height },
            attrs: {
                label: {
                    text: node.label,
                    fill: theme.ink,
                    fontSize: node.fontSize,
                    refY: Math.round(node.headerHeight * 0.6)
                },
                body: {
                    fill: theme.areaFill,
                    stroke: theme.areaBorder,
                    strokeWidth: 1.6,
                    rx: 10,
                    ry: 10
                },
                header: {
                    height: node.headerHeight,
                    fill: theme.lineFill,
                    rx: 10,
                    ry: 10
                }
            }
        });
        el.set('kind', 'building-space');
        el.set('spaceType', node.spaceType);
        el.set('containerPadding', metrics.padding);
        el.set('containerHeader', node.headerHeight);
        el.set('nodeProps', {
            space_type: node.spaceType,
            name: node.name || '',
            number: node.number || '',
            default_line: node.defaultLine || '',
            description: node.description || '',
            completion_status: node.completionStatus || ''
        });
        el.set('fullName', node.label || '');
        el.set('z', depth + 1);
    } else if (node.type === 'device') {
        const address = node.address || '';
        const name = node.label || 'Device';
        el = new joint.shapes.knx.Device({
            position: { x, y },
            size: { width: node.width, height: node.height },
            attrs: {
                address: { text: address },
                name: { text: name }
            }
        });
        el.set('kind', 'device');
        el.set('fullAddress', address);
        el.set('fullName', name);
        el.set('nodeProps', node.props || {});
        el.set('z', depth + 5);
        updateDeviceText(el, node.width, settings);
    }

    if (el) {
        cells.push(el);
    }

    if (node.children) {
        let baseX = absoluteX;
        let baseY = absoluteY;
        if (node.type !== 'root') {
            baseX = x;
            baseY = y;
        }
        node.children.forEach((child) => {
            const childEl = renderHierarchy(child, cells, baseX, baseY, metrics, depth + 1);
            if (el && childEl) {
                el.embed(childEl);
                childEl.set('expectedParent', el.id);
            }
        });
    }

    return el;
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

function safeId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}
