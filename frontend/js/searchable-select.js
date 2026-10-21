/* Progressive enhancement: native selects remain the source of the selected IDs. */
const searchableSelects = new Map();

function normalizeSelectQuery(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function syncSearchableSelects() {
    searchableSelects.forEach(control => control.sync());
}

function enhanceSearchableSelect(select) {
    if (searchableSelects.has(select)) return;
    const root = document.createElement('div');
    root.className = 'searchable-select';
    const input = document.createElement('input');
    input.id = select.id + 'Search';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.required = select.required;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');
    const popup = document.createElement('div');
    popup.className = 'searchable-select-popup';
    popup.hidden = true;
    const list = document.createElement('div');
    list.id = select.id + 'Options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', select.id === 'sendDocumentId' ? 'Documentos' : 'Destinatários');
    input.setAttribute('aria-controls', list.id);
    const status = document.createElement('p');
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const note = document.createElement('div');
    note.className = 'searchable-select-note';
    note.hidden = true;
    popup.append(list, note);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'select-clear';
    clear.setAttribute('aria-label', select.id === 'sendDocumentId' ? 'Limpar documento' : 'Limpar destinatário');
    clear.innerHTML = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m5 5 10 10M15 5 5 15"/></svg>';
    clear.hidden = true;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'select-toggle';
    toggle.tabIndex = -1;
    toggle.setAttribute('aria-label', select.id === 'sendDocumentId' ? 'Mostrar documentos' : 'Mostrar destinatários');
    toggle.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m5 7 5 5 5-5"/></svg>';
    root.append(input, clear, toggle, popup, status);
    select.after(root);
    const label = document.querySelector('label[for="' + select.id + '"]');
    if (label) label.htmlFor = input.id;
    select.required = false;
    select.hidden = true;

    let items = [];
    let shown = [];
    let activeIndex = -1;
    let lastValue = null;
    let typing = false;
    let dispatching = false;
    const maxVisible = 60;
    const collator = new Intl.Collator('pt-BR', {sensitivity: 'base', numeric: true});

    function updateValidity() {
        input.setCustomValidity(select.value ? '' : select.dataset.selectionMessage);
        clear.hidden = !input.value;
    }
    function close() {
        popup.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        activeIndex = -1;
    }
    function highlight(index) {
        activeIndex = index;
        [...list.querySelectorAll('[role="option"]')].forEach((option, current) => {
            option.classList.toggle('is-active', current === index);
        });
        const active = list.querySelectorAll('[role="option"]')[index];
        if (active) {
            input.setAttribute('aria-activedescendant', active.id);
            active.scrollIntoView({block: 'nearest'});
        } else input.removeAttribute('aria-activedescendant');
    }
    function dispatchChange() {
        dispatching = true;
        try { select.dispatchEvent(new Event('change', {bubbles: true})); }
        finally { dispatching = false; }
    }
    function choose(item) {
        if (select.disabled || input.disabled) return;
        select.value = item.value;
        lastValue = item.value;
        input.value = item.label;
        typing = false;
        updateValidity();
        input.removeAttribute('aria-invalid');
        close();
        dispatchChange();
        input.focus({preventScroll: true});
        // Focusing an option with a pointer must not reopen the menu.
        close();
    }
    function render(query, highlightFirst = false) {
        const terms = normalizeSelectQuery(query).trim().split(/\s+/).filter(Boolean);
        const matches = items.filter(item => terms.every(term => item.search.includes(term)));
        shown = matches.slice(0, maxVisible);
        list.replaceChildren();
        for (const [index, item] of shown.entries()) {
            const option = document.createElement('div');
            option.className = 'searchable-select-option';
            option.id = select.id + 'Option' + index;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(item.value === select.value));
            const title = document.createElement('span');
            title.className = 'select-option-title';
            title.textContent = item.label;
            option.appendChild(title);
            if (item.detail && item.detail !== item.label) {
                const detail = document.createElement('span');
                detail.className = 'select-option-detail';
                detail.textContent = item.detail;
                option.appendChild(detail);
            }
            option.addEventListener('mousedown', event => event.preventDefault());
            option.addEventListener('click', () => choose(item));
            list.appendChild(option);
        }
        if (!matches.length) {
            const empty = document.createElement('p');
            empty.className = 'searchable-select-empty';
            empty.textContent = items.length ? select.dataset.empty :
                (select.id === 'sendDocumentId' ? 'Nenhum documento disponível.' : 'Nenhum destinatário disponível.');
            list.appendChild(empty);
        }
        note.hidden = matches.length <= maxVisible;
        note.textContent = 'Mostrando ' + maxVisible + ' de ' + matches.length + '. Digite para refinar.';
        status.textContent = matches.length + (matches.length === 1 ? ' opção encontrada.' : ' opções encontradas.');
        highlight(highlightFirst && shown.length ? 0 : -1);
    }
    function open() {
        if (input.disabled) return;
        popup.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        render(typing ? input.value : '');
    }
    function sync(force = false) {
        const loading = !items.length && /carregando/i.test(select.options[0]?.textContent || '');
        input.disabled = select.disabled || loading;
        clear.disabled = input.disabled;
        toggle.disabled = input.disabled;
        input.placeholder = loading ? 'Carregando…' : select.dataset.placeholder;
        if (force || lastValue !== select.value) {
            const option = select.selectedOptions[0];
            input.value = select.value ? option?.dataset.label || option?.textContent.trim() || '' : '';
            lastValue = select.value;
            typing = false;
        }
        updateValidity();
        if (input.disabled) close();
    }
    function readOptions() {
        items = [...select.options].filter(option => option.value && !option.disabled).map(option => {
            const label = option.dataset.label || option.textContent.trim();
            const detail = option.dataset.detail || '';
            return {value: option.value, label, detail, search: normalizeSelectQuery(label + ' ' + detail)};
        }).sort((a, b) => collator.compare(a.label, b.label));
        sync();
        if (!popup.hidden) render(typing ? input.value : '');
    }
    input.addEventListener('focus', open);
    input.addEventListener('click', () => { if (popup.hidden) open(); });
    input.addEventListener('input', () => {
        typing = true;
        const hadSelection = !!select.value;
        select.value = '';
        lastValue = '';
        updateValidity();
        input.removeAttribute('aria-invalid');
        if (hadSelection) dispatchChange();
        popup.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        render(input.value, true);
    });
    input.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (popup.hidden) open();
            if (shown.length) highlight(event.key === 'ArrowDown' ? Math.min(activeIndex + 1, shown.length - 1) : activeIndex <= 0 ? shown.length - 1 : activeIndex - 1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (!popup.hidden && activeIndex >= 0) choose(shown[activeIndex]);
            else open();
        } else if (event.key === 'Escape') {
            if (!popup.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
        } else if (event.key === 'Tab') close();
    });
    input.addEventListener('invalid', () => {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        open();
    });
    clear.addEventListener('mousedown', event => event.preventDefault());
    clear.addEventListener('click', () => {
        select.value = '';
        lastValue = '';
        input.value = '';
        typing = false;
        updateValidity();
        input.removeAttribute('aria-invalid');
        dispatchChange();
        input.focus({preventScroll: true});
        open();
    });
    toggle.addEventListener('mousedown', event => event.preventDefault());
    toggle.addEventListener('click', () => {
        const wasOpen = !popup.hidden;
        input.focus({preventScroll: true});
        if (wasOpen) close(); else open();
    });
    select.addEventListener('change', () => { if (!dispatching) { sync(true); close(); } });
    root.addEventListener('focusout', event => {
        if (event.relatedTarget && !root.contains(event.relatedTarget)) close();
    });
    document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); });
    select.form?.addEventListener('reset', () => queueMicrotask(() => { sync(true); close(); }));
    new MutationObserver(readOptions).observe(select, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']});
    searchableSelects.set(select, {sync});
    readOptions();
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('select[data-searchable-select]').forEach(enhanceSearchableSelect);
});
