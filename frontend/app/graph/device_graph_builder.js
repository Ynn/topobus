import { PERFORMANCE_THRESHOLDS } from '../config/performance.js';

export class DeviceGraphBuilder {
    constructor(options = {}) {
        this.config = {
            minEdges: options.minEdges ?? PERFORMANCE_THRESHOLDS.DEVICE_GRAPH.MIN_EDGES,
            maxEdges: options.maxEdges ?? PERFORMANCE_THRESHOLDS.DEVICE_GRAPH.MAX_EDGES,
            edgesPerDevice: options.edgesPerDevice ?? PERFORMANCE_THRESHOLDS.DEVICE_GRAPH.EDGES_PER_DEVICE,
            maxPairs: options.maxPairs ?? PERFORMANCE_THRESHOLDS.DEVICE_GRAPH.MAX_PAIRS,
            maxGroupAddressesPerEdge: options.maxGroupAddressesPerEdge ?? PERFORMANCE_THRESHOLDS.DEVICE_GRAPH.MAX_GROUP_ADDRESSES_PER_EDGE
        };
    }

    build(projectData) {
        if (!projectData || !projectData.group_address_graph) {
            return { nodes: [], edges: [] };
        }
        const graph = projectData.group_address_graph;
        if (!Array.isArray(graph.nodes)) {
            return { nodes: [], edges: [] };
        }

        const allowedAddresses = this.#collectAllowedAddresses(projectData.devices);
        const deviceNodes = this.#buildDeviceNodes(graph.nodes, projectData.devices, allowedAddresses);
        const allowedDeviceIds = new Set(deviceNodes.map((node) => node.id));
        const gaToDevices = this.#buildGroupAddressMap(graph.nodes, allowedDeviceIds);
        const edges = this.#buildEdges(gaToDevices, deviceNodes.length);

        return { nodes: deviceNodes, edges };
    }

    buildCacheKey(projectData, filters) {
        const projectName = projectData && projectData.project_name ? projectData.project_name : 'project';
        const devicesCount = Array.isArray(projectData?.devices) ? projectData.devices.length : 0;
        const groupCount = Array.isArray(projectData?.group_addresses) ? projectData.group_addresses.length : 0;
        const signature = `${projectName}|${devicesCount}|${groupCount}`;
        const safeFilters = filters || {};
        return [
            signature,
            safeFilters.area || 'all',
            safeFilters.line || 'all',
            safeFilters.deviceManufacturer || 'all'
        ].join('|');
    }

    #collectAllowedAddresses(devices) {
        const allowed = new Set();
        if (Array.isArray(devices) && devices.length) {
            devices.forEach((device) => {
                if (device && device.individual_address) {
                    allowed.add(device.individual_address);
                }
            });
        }
        return allowed;
    }

    #buildDeviceNodes(nodes, devices, allowedAddresses) {
        const deviceNodes = nodes.filter((node) => {
            if (node.kind !== 'device') return false;
            if (!allowedAddresses.size) return true;
            const address = node.properties?.address || '';
            return allowedAddresses.has(address);
        });

        const addressInGraph = new Set(
            deviceNodes
                .map((node) => node.properties?.address || '')
                .filter(Boolean)
        );

        if (Array.isArray(devices)) {
            devices.forEach((device) => {
                const address = device?.individual_address || '';
                if (!address || !allowedAddresses.has(address)) return;
                if (addressInGraph.has(address)) return;
                const clean = String(address).replace(/[/.]/g, '_');
                deviceNodes.push({
                    id: clean ? `device_${clean}` : `device_${deviceNodes.length}`,
                    kind: 'device',
                    label: device.name || address,
                    properties: {
                        address,
                        name: device.name || '',
                        manufacturer: device.manufacturer || '',
                        product: device.product || ''
                    }
                });
                addressInGraph.add(address);
            });
        }

        return deviceNodes;
    }

    #buildGroupAddressMap(nodes, allowedDeviceIds) {
        const gaToDevices = new Map();
        nodes.forEach((node) => {
            if (node.kind !== 'groupobject') return;
            const parent = node.parent_id;
            if (!parent || !allowedDeviceIds.has(parent)) return;
            const ga = node.properties?.group_address || '';
            if (!ga) return;
            if (!gaToDevices.has(ga)) {
                gaToDevices.set(ga, new Set());
            }
            gaToDevices.get(ga).add(parent);
        });
        return gaToDevices;
    }

    #buildEdges(gaToDevices, deviceCount) {
        const maxEdges = Math.max(
            this.config.minEdges,
            Math.min(this.config.maxEdges, deviceCount * this.config.edgesPerDevice)
        );
        const maxPairs = Math.max(this.config.maxPairs, maxEdges * 3);
        const pairMap = new Map();

        gaToDevices.forEach((devices, ga) => {
            const list = Array.from(devices).sort();
            if (list.length < 2) return;
            const hub = list[0];
            for (let i = 1; i < list.length; i += 1) {
                const target = list[i];
                const [a, b] = hub < target ? [hub, target] : [target, hub];
                const key = `${a}|${b}`;
                let entry = pairMap.get(key);
                if (!entry) {
                    if (pairMap.size >= maxPairs) return;
                    entry = { source: a, target: b, count: 0, addresses: [] };
                    pairMap.set(key, entry);
                }
                entry.count += 1;
                if (entry.addresses.length < this.config.maxGroupAddressesPerEdge) {
                    entry.addresses.push(ga);
                }
            }
        });

        const entries = Array.from(pairMap.values());
        entries.sort((a, b) => b.count - a.count);
        const selected = entries.slice(0, maxEdges);

        return selected.map((entry, idx) => ({
            id: `device_link_${idx}`,
            source: entry.source,
            target: entry.target,
            kind: 'links',
            label: null,
            properties: {
                direction: 'undirected',
                link_count: String(entry.count),
                group_addresses: entry.addresses.join(', ')
            }
        }));
    }
}
