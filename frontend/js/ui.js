/* Screen behavior and presentation; API contracts remain in api.js. */
let toastTimer;
function showToast(message, kind = 'success') {
    const toast = document.getElementById('appToast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
}

function setFeedback(id, message, kind = '') {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.dataset.kind = kind;
}

function syncSendFlow() {
    const doc = document.getElementById('sendDocumentId');
    if (!doc) return;
    const receiver = document.getElementById('sendReceiverId');
    const signature = document.getElementById('includeSenderSignature');
    const summary = document.getElementById('senderSignatureSummary');
    const button = document.getElementById('sendButton');
    const hint = document.getElementById('sendFlowHint');
    const prepared = pendingSenderSignature?.documentId === doc.value;
    signature.disabled = !doc.value || sendInProgress || !!pendingSend;
    document.getElementById('previewSendBtn').disabled = !doc.value || sendInProgress || !!pendingSend;
    summary.hidden = !prepared;
    if (prepared) summary.textContent = 'Sua assinatura está posicionada na página ' + pendingSenderSignature.page + '. Você pode clicar em outro local para ajustá-la.';
    button.disabled = sendInProgress || !doc.value || !receiver.value || (signature.checked && !prepared && !pendingSend);
    const viewerButton = document.getElementById('confirmOwnSignBtn');
    if (viewerButton) { viewerButton.disabled = button.disabled; viewerButton.textContent = sendInProgress ? 'Enviando…' : 'Assinar e enviar'; }
    button.textContent = sendInProgress ? 'Enviando…' : pendingSend ? 'Tentar assinatura novamente' : signature.checked ? 'Assinar e enviar' : 'Enviar documento';
    hint.textContent = pendingSend ? 'A cópia já foi enviada. Conclua a assinatura pendente.' : !doc.value || !receiver.value ? 'Selecione o documento e o destinatário para continuar.' : signature.checked && !prepared ? 'Clique no PDF para escolher onde sua assinatura aparecerá.' : 'Tudo pronto. Acompanhe o retorno em Devolvidos.';
}

function clearSendForm() {
    if (sendInProgress || pendingSend) return;
    document.getElementById('sendForm').reset();
    pendingSenderSignature = null;
    clearEmbeddedViewer();
    setFeedback('sendMsg', '');
    syncSendFlow();
}

function closeDocumentViewer() {
    if (signatureInProgress || sendInProgress) return;
    const panel = document.getElementById(embeddedSignState.targetContainerId)?.closest('[data-viewer-panel]');
    clearEmbeddedViewer();
    if (panel) panel.hidden = true;
}

function showDashboardTab() {
    if (!document.querySelector('[data-dashboard-tab]')) return;
    const selected = window.location.hash === '#returnedDocuments' ? 'returnedDocuments' : 'documents';
    document.querySelectorAll('[data-dashboard-panel]').forEach(panel => { panel.hidden = panel.id !== selected; });
    document.querySelectorAll('[data-dashboard-tab]').forEach(tab => {
        const active = tab.dataset.dashboardTab === selected;
        tab.classList.toggle('active', active);
        if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    });
    document.querySelectorAll('.sidebar-nav a[href^="dashboard.html"]').forEach(link => {
        const active = link.getAttribute('href') === (selected === 'documents' ? 'dashboard.html' : 'dashboard.html#returnedDocuments');
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (embeddedSignState.targetContainerId && !signatureInProgress) closeDocumentViewer();
}
window.addEventListener('hashchange', showDashboardTab);

async function openMainDocument(id, title) {
    try {
        await openEmbeddedViewer({mode: 'view', documentId: id, containerId: 'documentPdfContainer',
            titleId: 'documentViewerTitle', infoId: 'documentViewerInfo', titleText: title});
    } catch (error) { setFeedback('documentViewerInfo', error.message, 'error'); }
}

function clearUploadForm() {
    const form = document.getElementById('uploadForm');
    if (form.dataset.busy) return;
    form.reset();
    setFeedback('msg', '');
    document.getElementById('selectedFileInfo').style.display = 'none';
    document.getElementById('uploadNextActions').hidden = true;
}

function onDocumentUploaded(doc) {
    document.getElementById('uploadNextActions').hidden = false;
    document.getElementById('sendUploadedDocument').href = 'send.html' + (doc?.id ? '?documentId=' + encodeURIComponent(doc.id) : '');
    setFeedback('msg', 'Documento salvo. Agora você pode enviá-lo ou consultar sua biblioteca.', 'success');
}

function closeSelectedFolder() { document.getElementById('folderDocumentsSection').style.display = 'none'; }
function clearCategoryForm() {
    document.getElementById('categoryFormCard').reset();
    setFeedback('categoryMsg', '');
}
function clearUserForm() {
    document.getElementById('userForm').reset();
    setFeedback('userMsg', '');
}
async function submitUserForm(form) {
    if (form.dataset.busy) return;
    form.dataset.busy = 'true';
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Criando…';
    try {
        await createUser();
        form.reset();
        setFeedback('userMsg', 'Usuário criado com sucesso.', 'success');
    } catch (error) { setFeedback('userMsg', error.message, 'error'); }
    finally { delete form.dataset.busy; button.disabled = false; button.textContent = 'Criar usuário'; }
}

// Native forms support Enter, validation, labels and password managers.
document.addEventListener('DOMContentLoaded', () => {
    showDashboardTab();
    const toggle = document.getElementById('navigationToggle');
    const closeNavigation = () => {
        document.body.classList.remove('navigation-open');
        toggle?.setAttribute('aria-expanded', 'false');
    };
    toggle?.addEventListener('click', () => {
        const open = document.body.classList.toggle('navigation-open');
        toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNavigation(); });
    document.addEventListener('click', event => {
        if (!event.target.closest('.sidebar, #navigationToggle')) closeNavigation();
    });
    document.querySelectorAll('.sidebar-nav a').forEach(link => link.addEventListener('click', closeNavigation));
    const doc = document.getElementById('sendDocumentId');
    if (doc) {
        doc.addEventListener('change', () => {
            document.getElementById('includeSenderSignature').checked = false;
            pendingSenderSignature = null;
            syncSendFlow();
        });
        document.getElementById('sendReceiverId').addEventListener('change', syncSendFlow);
        document.getElementById('includeSenderSignature').addEventListener('change', async event => {
            pendingSenderSignature = null;
            syncSendFlow();
            if (event.target.checked) await prepareOwnDocumentSignature();
            else if (embeddedSignState.documentId === doc.value) await previewSelectedDocumentForSend();
            syncSendFlow();
        });
        syncSendFlow();
    }
    const file = document.getElementById('file');
    file?.addEventListener('change', () => {
        const selected = file.files[0];
        const info = document.getElementById('selectedFileInfo');
        info.style.display = selected ? 'block' : 'none';
        if (selected) {
            document.getElementById('selectedFileName').textContent = selected.name;
            document.getElementById('selectedFileSize').textContent = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:1}).format(selected.size / 1024) + ' KB';
            const title = document.getElementById('title');
            if (!title.value.trim()) title.value = selected.name.replace(/\.[^.]+$/, '');
        }
        document.getElementById('uploadNextActions').hidden = true;
    });
});

async function runPage(name) {
    try { await window[name](); }
    catch (error) {
        showToast(error.message || 'Não foi possível carregar esta tela.', 'error');
        document.querySelectorAll('.loading-cell').forEach(cell => { cell.textContent = 'Não foi possível carregar. Atualize a página para tentar novamente.'; });
    }
}
async function submitCategoryForm(form) {
    if (form.dataset.busy) return;
    form.dataset.busy = 'true';
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try { await createCategory(); }
    finally { delete form.dataset.busy; button.disabled = false; }
}
