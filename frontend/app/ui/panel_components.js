export function createSection(title) {
    const section = document.createElement('div');
    section.className = 'panel-section';
    if (title) {
        const h3 = document.createElement('h3');
        h3.textContent = title;
        section.appendChild(h3);
    }
    return section;
}

export function addRow(section, label, value, options = {}) {
    if (!section) return;
    if (value == null || value === '') return;
    const row = document.createElement('div');
    row.className = 'panel-row';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const valueEl = document.createElement('div');
    valueEl.className = 'panel-value';
    valueEl.textContent = String(value);
    if (options.className) {
        valueEl.classList.add(options.className);
    }
    if (options.dataset) {
        Object.entries(options.dataset).forEach(([key, val]) => {
            if (val == null || val === '') return;
            valueEl.dataset[key] = String(val);
        });
    }

    row.appendChild(valueEl);
    section.appendChild(row);
}

export function addRowNode(section, label, node) {
    if (!section || !node) return;
    const row = document.createElement('div');
    row.className = 'panel-row';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    row.appendChild(labelEl);

    row.appendChild(node);
    section.appendChild(row);
}

export function buildPanelList() {
    const list = document.createElement('div');
    list.className = 'panel-list';
    return list;
}

export function buildEmptyState(message) {
    const empty = document.createElement('div');
    empty.className = 'panel-empty';
    empty.textContent = message;
    return empty;
}
