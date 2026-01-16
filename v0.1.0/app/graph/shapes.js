import { readTheme } from '../theme.js';

export function initShapes() {
    if (joint.shapes.knx && joint.shapes.knx.Device) return;

    const theme = readTheme();

    joint.dia.Element.define('knx.Device', {
        size: { width: 280, height: 150 },
        attrs: {
            body: {
                refWidth: '100%',
                refHeight: '100%',
                fill: theme.deviceFill,
                stroke: theme.deviceBorder,
                strokeWidth: 2,
                rx: 10,
                ry: 10
            },
            header: {
                refWidth: '100%',
                height: 44,
                fill: theme.deviceHeader,
                stroke: 'none',
                rx: 10,
                ry: 10
            },
            headerMask: {
                refWidth: '100%',
                height: 12,
                y: 32,
                fill: theme.deviceHeader,
                stroke: 'none'
            },
            address: {
                refX: '50%',
                refY: 16,
                textAnchor: 'middle',
                textVerticalAnchor: 'middle',
                fontSize: 13,
                fontWeight: 700,
                fill: theme.ink,
                fontFamily: theme.fontSans
            },
            name: {
                refX: '50%',
                refY: 32,
                textAnchor: 'middle',
                textVerticalAnchor: 'middle',
                fontSize: 12,
                fontWeight: 600,
                fill: theme.ink,
                fontFamily: theme.fontSans
            }
        }
    }, {
        markup: [
            { tagName: 'rect', selector: 'body' },
            { tagName: 'rect', selector: 'header' },
            { tagName: 'rect', selector: 'headerMask' },
            { tagName: 'text', selector: 'address' },
            { tagName: 'text', selector: 'name' }
        ]
    });

    joint.dia.Element.define('knx.GroupObject', {
        size: { width: 240, height: 28 },
        attrs: {
            body: {
                refWidth: '100%',
                refHeight: '100%',
                fill: theme.objectFill,
                stroke: theme.objectBorder,
                strokeWidth: 1.5,
                rx: 6,
                ry: 6
            },
            name: {
                refX: 10,
                refY: '50%',
                textAnchor: 'start',
                textVerticalAnchor: 'middle',
                fontSize: 11.5,
                fontWeight: 600,
                fill: theme.ink,
                fontFamily: theme.fontSans
            },
            address: {
                refX: '100%',
                refX2: -10,
                refY: '50%',
                textAnchor: 'end',
                textVerticalAnchor: 'middle',
                fontSize: 11,
                fontWeight: 700,
                fill: theme.accent,
                fontFamily: theme.fontMono
            }
        }
    }, {
        markup: [
            { tagName: 'rect', selector: 'body' },
            { tagName: 'text', selector: 'name' },
            { tagName: 'text', selector: 'address' }
        ]
    });

    joint.dia.Element.define('knx.Area', {
        size: { width: 520, height: 300 },
        attrs: {
            body: {
                refWidth: '100%',
                refHeight: '100%',
                fill: theme.areaFill,
                stroke: theme.areaBorder,
                strokeWidth: 2.5,
                strokeDasharray: '10,6',
                rx: 12,
                ry: 12
            },
            label: {
                refX: 18,
                refY: 18,
                textAnchor: 'start',
                textVerticalAnchor: 'middle',
                fontSize: 13,
                fontWeight: 700,
                fill: theme.ink,
                fontFamily: theme.fontSans
            }
        }
    }, {
        markup: [
            { tagName: 'rect', selector: 'body' },
            { tagName: 'text', selector: 'label' }
        ]
    });

    joint.dia.Element.define('knx.Line', {
        size: { width: 440, height: 240 },
        attrs: {
            body: {
                refWidth: '100%',
                refHeight: '100%',
                fill: theme.lineFill,
                stroke: theme.lineBorder,
                strokeWidth: 2,
                rx: 10,
                ry: 10
            },
            label: {
                refX: 16,
                refY: 16,
                textAnchor: 'start',
                textVerticalAnchor: 'middle',
                fontSize: 12,
                fontWeight: 700,
                fill: theme.ink,
                fontFamily: theme.fontSans
            }
        }
    }, {
        markup: [
            { tagName: 'rect', selector: 'body' },
            { tagName: 'text', selector: 'label' }
        ]
    });

    joint.dia.Element.define('knx.CompositeContainer', {
        size: { width: 300, height: 100 },
        attrs: {
            body: {
                refWidth: '100%',
                refHeight: '100%',
                fill: 'none',
                stroke: '#333',
                strokeWidth: 2,
                rx: 5,
                ry: 5
            },
            header: {
                refWidth: '100%',
                height: 28,
                fill: theme.deviceHeader,
                stroke: 'none',
                rx: 5,
                ry: 5
            },
            label: {
                refX: 12,
                refY: 16,
                textAnchor: 'start',
                textVerticalAnchor: 'middle',
                fontSize: 14,
                fontWeight: 'bold',
                fill: '#333',
                fontFamily: theme.fontSans
            }
        }
    }, {
        markup: [
            { tagName: 'rect', selector: 'body' },
            { tagName: 'rect', selector: 'header' },
            { tagName: 'text', selector: 'label' }
        ]
    });
}
