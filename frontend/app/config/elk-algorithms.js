export const ELK_ALGORITHMS = Object.freeze({
    layered: {
        id: 'layered',
        name: 'Hierarchical (Layered)',
        description: 'Best for directed graphs with a hierarchy.',
        recommended: ['topology', 'composite'],
        requiresOverlapResolution: false,
        overlapIterations: 0
    },
    stress: {
        id: 'stress',
        name: 'Force-Directed (Stress)',
        description: 'Organic layout for dense connectivity.',
        recommended: ['group', 'device'],
        requiresOverlapResolution: true,
        overlapIterations: 18
    },
    force: {
        id: 'force',
        name: 'Force-Directed (Force)',
        description: 'Fast force layout for exploratory views.',
        recommended: ['group', 'device'],
        requiresOverlapResolution: true,
        overlapIterations: 18
    },
    disco: {
        id: 'disco',
        name: 'Disco',
        description: 'Compact force layout for high-level overview.',
        recommended: ['group', 'device'],
        requiresOverlapResolution: true,
        overlapIterations: 18
    }
});

export function resolveElkAlgorithm(algorithmId) {
    if (!algorithmId) return ELK_ALGORITHMS.layered;
    return ELK_ALGORITHMS[algorithmId] || ELK_ALGORITHMS.layered;
}
