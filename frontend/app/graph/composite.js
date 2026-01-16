import { readTheme, getLayoutSettings } from '../theme.js';
import {
    compareGroupAddress,
    compareIndividualAddress,
    formatDeviceName,
    measureTextWidth,
    parseGroupAddress
} from '../utils.js';
import { computeGroupDeviceWidth, updateDeviceText, updateGroupObjectText } from './layout.js';

export function renderCompositeGraph(projectData, graph) {
    const root = buildHierarchy(projectData);
    const metrics = getCompositeMetrics();

    calculateSizes(root, metrics);

    const cells = [];
    renderHierarchy(root, cells, 40, 40, metrics);

    if (graph.resetCells) {
        graph.resetCells(cells);
    } else {
        graph.addCells(cells);
    }
}

function buildHierarchy(projectData) {
    const graphData = projectData.group_address_graph;
    const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]));
    const gaNodes = graphData.nodes.filter(n => n.kind === 'groupaddress');
    const objectNodes = graphData.nodes.filter(n => n.kind === 'groupobject');

    const gaByAddress = new Map();
    const mainNameByKey = new Map();
    const middleNameByKey = new Map();
    const mainDescriptionByKey = new Map();
    const middleDescriptionByKey = new Map();
    const mainCommentByKey = new Map();
    const middleCommentByKey = new Map();

    gaNodes.forEach(node => {
        const address = extractGroupAddress(node).address;
        if (address) gaByAddress.set(address, node);

        const parts = parseGroupAddress(address);
        const main = parts[0];
        const middle = parts[1];
        const props = node.properties || {};
        if (props.main_name && Number.isFinite(main) && main !== Number.MAX_SAFE_INTEGER) {
            mainNameByKey.set(String(main), props.main_name);
        }
        if (props.main_description && Number.isFinite(main) && main !== Number.MAX_SAFE_INTEGER) {
            mainDescriptionByKey.set(String(main), props.main_description);
        }
        if (props.main_comment && Number.isFinite(main) && main !== Number.MAX_SAFE_INTEGER) {
            mainCommentByKey.set(String(main), props.main_comment);
        }
        if (props.middle_name &&
            Number.isFinite(main) && main !== Number.MAX_SAFE_INTEGER &&
            Number.isFinite(middle) && middle !== Number.MAX_SAFE_INTEGER) {
            middleNameByKey.set(`${main}/${middle}`, props.middle_name);
        }
        if (props.middle_description &&
            Number.isFinite(main) && main !== Number.MAX_SAFE_INTEGER &&
            Number.isFinite(middle) && middle !== Number.MAX_SAFE_INTEGER) {
            middleDescriptionByKey.set(`${main}/${middle}`, props.middle_description);
        }
        if (props.middle_comment &&
            Number.isFinite(main) && main !== Number.MAX_SAFE_INTEGER &&
            Number.isFinite(middle) && middle !== Number.MAX_SAFE_INTEGER) {
            middleCommentByKey.set(`${main}/${middle}`, props.middle_comment);
        }
    });

    const objectsByAddress = new Map();
    objectNodes.forEach(obj => {
        const address = obj.properties && obj.properties.group_address ? obj.properties.group_address : '';
        if (!address) return;
        if (!objectsByAddress.has(address)) {
            objectsByAddress.set(address, []);
        }
        objectsByAddress.get(address).push(obj);
    });

    const root = {
        type: 'root',
        children: []
    };

    const mainGroups = new Map();
    const sortedAddresses = Array.from(objectsByAddress.keys()).sort(compareGroupAddress);

    sortedAddresses.forEach(address => {
        const parts = parseGroupAddress(address);
        const addressParts = String(address).split(/[/.]/).filter(Boolean);
        const main = addressParts[0] !== undefined ? addressParts[0] : String(parts[0]);
        const middle = addressParts[1] !== undefined ? addressParts[1] : String(parts[1]);

        const mainKey = String(main);
        const mainName = mainNameByKey.get(mainKey) || '';
        const mainDescription = mainDescriptionByKey.get(mainKey) || '';
        const mainComment = mainCommentByKey.get(mainKey) || '';
        const mainLabel = mainNameByKey.has(mainKey)
            ? `Main ${main} : ${mainNameByKey.get(mainKey)}`
            : `Main ${main}`;

        if (!mainGroups.has(main)) {
            const mainValue = Number(main);
            const node = {
                type: 'main',
                id: `main_${main}`,
                label: mainLabel,
                name: mainName,
                address: String(main),
                description: mainDescription,
                comment: mainComment,
                order: Number.isFinite(mainValue) ? mainValue : Number.MAX_SAFE_INTEGER,
                children: new Map(),
                width: 0,
                height: 0
            };
            mainGroups.set(main, node);
            root.children.push(node);
        }

        const mainNode = mainGroups.get(main);
        const middleKey = `${main}/${middle}`;
        const middleAddress = `${main}/${middle}`;
        const middleName = middleNameByKey.get(middleKey) || '';
        const middleDescription = middleDescriptionByKey.get(middleKey) || '';
        const middleComment = middleCommentByKey.get(middleKey) || '';
        const middleLabel = middleNameByKey.has(middleKey)
            ? `${middleAddress} : ${middleNameByKey.get(middleKey)}`
            : middleAddress;

        if (!mainNode.children.has(middle)) {
            const middleValue = Number(middle);
            mainNode.children.set(middle, {
                type: 'middle',
                id: `mid_${main}_${middle}`,
                label: middleLabel,
                name: middleName,
                address: middleAddress,
                description: middleDescription,
                comment: middleComment,
                order: Number.isFinite(middleValue) ? middleValue : Number.MAX_SAFE_INTEGER,
                children: [],
                width: 0,
                height: 0
            });
        }

        const middleNode = mainNode.children.get(middle);
        const gaNode = gaByAddress.get(address) || null;
        const gaLabel = extractGroupAddress(gaNode, address);

        const gaItem = {
            type: 'ga',
            id: `ga_${address.replace(/[/.]/g, '_')}`,
            label: gaLabel.name ? gaLabel.name : gaLabel.address,
            address: gaLabel.address,
            fullLabel: gaLabel.name ? `${gaLabel.address} - ${gaLabel.name}` : gaLabel.address,
            node: gaNode,
            children: [],
            width: 0,
            height: 0
        };
        middleNode.children.push(gaItem);

        const objects = objectsByAddress.get(address) || [];
        const deviceMap = new Map();

        objects.forEach(obj => {
            const deviceId = obj.parent_id || 'unknown';
            const device = nodeMap.get(deviceId) || null;
            const key = device ? device.id : `${deviceId}_${deviceMap.size}`;
            if (!deviceMap.has(key)) {
                deviceMap.set(key, { device, objects: [] });
            }
            deviceMap.get(key).objects.push(obj);
        });

        const deviceEntries = Array.from(deviceMap.values());
        deviceEntries.sort((a, b) => {
            if (a.device && b.device) return compareIndividualAddress(a.device, b.device);
            if (a.device) return -1;
            if (b.device) return 1;
            return 0;
        });

        deviceEntries.forEach((entry, idx) => {
            const device = entry.device;
            const deviceAddress = device && device.properties ? device.properties.address : '';
            const deviceName = device
                ? (formatDeviceName(device) || (device.properties ? device.properties.name : '') || device.label)
                : 'Unknown Device';

            entry.objects.sort((a, b) => {
                const aNum = Number(a.properties && a.properties.number ? a.properties.number : NaN);
                const bNum = Number(b.properties && b.properties.number ? b.properties.number : NaN);
                if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
                const aName = a.properties && a.properties.object_name ? a.properties.object_name : a.label;
                const bName = b.properties && b.properties.object_name ? b.properties.object_name : b.label;
                return String(aName).localeCompare(String(bName));
            });

            gaItem.children.push({
                type: 'device',
                id: `dev_${gaItem.id}_${idx}`,
                label: deviceName,
                device,
                deviceAddress,
                deviceName,
                objects: entry.objects.map(o => ({
                    label: o.label || (o.properties && o.properties.object_name) || 'Object',
                    node: o
                })),
                width: 0,
                height: 0
            });
        });
    });

    root.children.sort((a, b) => a.order - b.order);
    root.children.forEach(main => {
        main.children = Array.from(main.children.values()).sort((a, b) => a.order - b.order);
        main.children.forEach(mid => {
            mid.children.sort((a, b) => compareGroupAddress(a.address, b.address));
        });
    });

    return root;
}

function extractGroupAddress(node, fallback = '') {
    if (!node) {
        return { address: fallback, name: '' };
    }
    const address = node.properties && node.properties.address
        ? node.properties.address
        : (node.label ? String(node.label).split('\n')[0] : fallback);
    let name = '';
    if (node.properties && node.properties.name) {
        name = node.properties.name;
    } else if (node.label) {
        const parts = String(node.label).split('\n');
        if (parts.length > 1) name = parts.slice(1).join(' ').trim();
    }
    return { address, name };
}

function getCompositeMetrics() {
    const settings = getLayoutSettings();
    const scale = settings ? settings.scale : 1;

    return {
        settings,
        padding: Math.max(14, Math.round(16 * scale)),
        gap: Math.max(16, Math.round(18 * scale)),
        mainHeader: Math.max(32, Math.round(36 * scale)),
        middleHeader: Math.max(28, Math.round(32 * scale)),
        gaHeader: Math.max(26, Math.round(30 * scale)),
        font: {
            main: Math.max(13, Math.round(15 * scale)),
            middle: Math.max(11, Math.round(13 * scale)),
            ga: Math.max(11, Math.round(12 * scale))
        }
    };
}

function calculateSizes(node, metrics) {
    const theme = readTheme();
    const padding = metrics.padding;
    const gap = metrics.gap;

    if (node.type === 'device') {
        const settings = metrics.settings;
        const objectNodes = node.objects.map(obj => obj.node).filter(Boolean);
        const fallbackDevice = {
            properties: {
                address: node.deviceAddress || '',
                name: node.deviceName || node.label
            },
            label: node.label || ''
        };
        const deviceNode = node.device || fallbackDevice;
        const width = computeGroupDeviceWidth(deviceNode, objectNodes, settings);
        const rows = node.objects.length;
        node.width = width;
        node.height = settings.headerHeight + settings.padding +
            rows * settings.rowHeight + Math.max(0, rows - 1) * settings.rowGap;
        return;
    }

    if (node.children) {
        node.children.forEach(c => calculateSizes(c, metrics));
    }

    if (node.type === 'ga') {
        let currentH = metrics.gaHeader + padding;
        const labelFont = `700 ${metrics.font.ga}px ${theme.fontSans}`;
        let maxW = Math.max(220, measureTextWidth(node.fullLabel, labelFont) + padding * 2);

        node.children.forEach(child => {
            child.relativeX = padding;
            child.relativeY = currentH;
            maxW = Math.max(maxW, child.width + padding * 2);
            currentH += child.height + gap;
        });

        if (node.children.length > 0) {
            currentH -= gap;
        }

        node.width = maxW;
        node.height = currentH + padding;
    } else if (node.type === 'middle' || node.type === 'main' || node.type === 'root') {
        const count = node.children.length;
        if (count === 0) {
            node.width = 160;
            node.height = 90;
            return;
        }

        let totalArea = 0;
        node.children.forEach(c => {
            totalArea += (c.width + gap) * (c.height + gap);
        });

        let targetWidth = Math.sqrt(totalArea) * 1.6;
        if (targetWidth < 420) targetWidth = 420;
        if (node.type === 'root') targetWidth = 1400;

        const header = node.type === 'main' ? metrics.mainHeader : (node.type === 'middle' ? metrics.middleHeader : 0);
        const startY = node.type === 'root' ? padding : header;

        let currentX = padding;
        let currentY = startY;
        let rowH = 0;
        let maxW = 0;

        node.children.forEach(child => {
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
            const fontSize = node.type === 'main' ? metrics.font.main : metrics.font.middle;
            const font = `700 ${fontSize}px ${theme.fontSans}`;
            const tW = measureTextWidth(node.label, font) + padding * 2;
            node.width = Math.max(node.width, tW);
        }
    }
}

function renderHierarchy(node, cells, absoluteX, absoluteY, metrics) {
    const theme = readTheme();
    const settings = metrics.settings;
    const x = absoluteX + (node.relativeX || 0);
    const y = absoluteY + (node.relativeY || 0);

    let el = null;

    if (node.type === 'main') {
        const headerHeight = metrics.mainHeader;
        el = new joint.shapes.knx.CompositeContainer({
            position: { x, y },
            size: { width: node.width, height: node.height },
            attrs: {
                label: {
                    text: node.label,
                    fill: theme.ink,
                    fontSize: metrics.font.main,
                    refY: Math.round(headerHeight * 0.62)
                },
                body: {
                    fill: theme.areaFill,
                    stroke: theme.areaBorder,
                    strokeWidth: 2,
                    strokeDasharray: '8 6',
                    rx: 10,
                    ry: 10
                },
                header: {
                    height: headerHeight,
                    fill: theme.lineFill,
                    rx: 10,
                    ry: 10
                }
            }
        });
        el.set('kind', 'composite-main');
        el.set('containerPadding', metrics.padding);
        el.set('containerHeader', headerHeight);
        el.set('z', 1);
        el.set('nodeProps', {
            address: node.address || '',
            name: node.name || '',
            description: node.description || '',
            comment: node.comment || ''
        });
        el.set('fullAddress', node.address || '');
        el.set('fullName', node.label || '');
    } else if (node.type === 'middle') {
        const headerHeight = metrics.middleHeader;
        el = new joint.shapes.knx.CompositeContainer({
            position: { x, y },
            size: { width: node.width, height: node.height },
            attrs: {
                label: {
                    text: node.label,
                    fontSize: metrics.font.middle,
                    fill: theme.ink,
                    refY: Math.round(headerHeight * 0.62)
                },
                body: {
                    fill: theme.lineFill,
                    stroke: theme.lineBorder,
                    strokeWidth: 1.6,
                    rx: 8,
                    ry: 8
                },
                header: {
                    height: headerHeight,
                    fill: theme.areaFill,
                    rx: 8,
                    ry: 8
                }
            }
        });
        el.set('kind', 'composite-middle');
        el.set('containerPadding', metrics.padding);
        el.set('containerHeader', headerHeight);
        el.set('z', 2);
        el.set('nodeProps', {
            address: node.address || '',
            name: node.name || '',
            description: node.description || '',
            comment: node.comment || ''
        });
        el.set('fullAddress', node.address || '');
        el.set('fullName', node.label || '');
    } else if (node.type === 'ga') {
        const headerHeight = metrics.gaHeader;
        el = new joint.shapes.knx.CompositeContainer({
            position: { x, y },
            size: { width: node.width, height: node.height },
            attrs: {
                label: {
                    text: node.fullLabel,
                    fontSize: metrics.font.ga,
                    fontWeight: 'bold',
                    fill: theme.ink,
                    refY: Math.round(headerHeight * 0.62)
                },
                body: {
                    fill: theme.objectFill,
                    stroke: theme.objectBorder,
                    strokeWidth: 1.4,
                    rx: 8,
                    ry: 8
                },
                header: {
                    height: headerHeight,
                    fill: theme.objectFillTx,
                    rx: 8,
                    ry: 8
                }
            }
        });
        el.set('kind', 'composite-ga');
        el.set('fullAddress', node.address);
        el.set('fullName', node.label || node.fullLabel);
        el.set('groupAddress', node.address);
        el.set('nodeProps', node.node ? node.node.properties : {});
        el.set('containerPadding', metrics.padding);
        el.set('containerHeader', headerHeight + metrics.padding);
        el.set('z', 3);
    } else if (node.type === 'device') {
        const address = node.deviceAddress || (node.device && node.device.properties ? node.device.properties.address : '') || '';
        const name = node.deviceName || node.label || 'Device';
        el = new joint.shapes.knx.Device({
            position: { x, y },
            size: { width: node.width, height: node.height },
            attrs: {
                address: { text: address },
                name: { text: name }
            }
        });
        el.set('kind', 'composite-device');
        el.set('fullAddress', address);
        el.set('fullName', name);
        el.set('originalDevice', node.device || null);
        el.set('containerPadding', settings.padding);
        el.set('containerHeader', settings.headerHeight);
        el.set('z', 4);
        updateDeviceText(el, node.width, settings);

        let curY = settings.headerHeight;
        node.objects.forEach(obj => {
            const groupAddress = obj.node && obj.node.properties && obj.node.properties.group_address
                ? obj.node.properties.group_address
                : '';
            const isTx = obj.node && obj.node.properties && obj.node.properties.is_transmitter === 'true';
            const isRx = obj.node && obj.node.properties && obj.node.properties.is_receiver === 'true';
            const fill = isTx ? theme.objectFillTx : theme.objectFill;
            const addressColor = isTx ? theme.accent : (isRx ? theme.ink : theme.muted);
            const childWidth = node.width - settings.padding * 2;

            const objEl = new joint.shapes.knx.GroupObject({
                position: { x: x + settings.padding, y: y + curY },
                size: { width: childWidth, height: settings.rowHeight },
                attrs: {
                    body: { fill },
                    name: { text: obj.label },
                    address: { text: groupAddress, fill: addressColor }
                }
            });
            objEl.set('kind', 'composite-object');
            objEl.set('fullName', obj.label);
            objEl.set('groupAddress', groupAddress);
            objEl.set('isTransmitter', isTx);
            objEl.set('isReceiver', isRx);
            objEl.set('originalObject', obj.node || null);
            objEl.set('nodeProps', obj.node ? obj.node.properties : {});
            objEl.set('z', 5);
            updateGroupObjectText(objEl, childWidth, settings);

            el.embed(objEl);
            objEl.set('expectedParent', el.id);
            cells.push(objEl);
            curY += settings.rowHeight + settings.rowGap;
        });
    }

    if (el) {
        cells.push(el);
    }

    if (node.children) {
        let parentBaseX = absoluteX;
        let parentBaseY = absoluteY;

        if (node.type !== 'root') {
            parentBaseX = x;
            parentBaseY = y;
        }

        node.children.forEach(child => {
            const childEl = renderHierarchy(child, cells, parentBaseX, parentBaseY, metrics);
            if (el && childEl) {
                el.embed(childEl);
                childEl.set('expectedParent', el.id);
            }
        });
    }

    return el;
}
