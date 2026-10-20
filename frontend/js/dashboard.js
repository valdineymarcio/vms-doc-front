/* =====================================================
   DASHBOARD
===================================================== */

async function initDashboardPage() {

    const ok =
        await bootPage({
            allowedRoles: [
                "ADMIN",
                "USER"
            ]
        });

    if (!ok) {
        return;
    }

    renderDashboardUser();
    startReturnedRefresh();

    await Promise.all([
        loadDashboardDocuments(),
        loadDashboardInbox(),
        loadReturnedTransfers(),
        loadCategoriesSelect("searchCategoryId")
    ]);
}


/* =====================================================
   USUÁRIO NO DASHBOARD
===================================================== */

function renderDashboardUser() {

    const title =
        document.getElementById(
            "welcomeTitle"
        );

    if (!title || !currentUser) {
        return;
    }

    const name =
        currentUser.name || "Usuário";

    const firstName =
        name
            .trim()
            .split(" ")[0];

    title.innerText =
        `Olá, ${firstName}`;
}


/* =====================================================
   DOCUMENTOS
===================================================== */

async function loadDashboardDocuments() {

    try {

        const documents =
            await apiRequest(
                "/api/documents",
                {
                    method: "GET",
                    headers:
                        authHeaders(false)
                }
            );

        updateDocumentCounters(
            documents
        );

        renderDashboardDocuments(
            documents
        );

    } catch (error) {

        console.error(
            "Erro ao carregar documentos:",
            error
        );

        showDashboardDocumentsError(
            error.message
        );
    }
}


/* =====================================================
   CONTADORES
===================================================== */

function updateDocumentCounters(
    documents
) {

    const list =
        Array.isArray(documents)
            ? documents
            : [];


    const total =
        list.length;


    const signed =
        list.filter(
            doc =>
                doc.status === "SIGNED"
        ).length;


    const pending =
        list.filter(
            doc =>
                doc.status !== "SIGNED"
        ).length;


    const totalEl =
        document.getElementById(
            "totalDocuments"
        );

    const signedEl =
        document.getElementById(
            "signedDocuments"
        );

    const pendingEl =
        document.getElementById(
            "pendingDocuments"
        );


    if (totalEl) {
        totalEl.innerText =
            total;
    }

    if (signedEl) {
        signedEl.innerText =
            signed;
    }

    if (pendingEl) {
        pendingEl.innerText =
            pending;
    }
}


/* =====================================================
   RECEBIDOS
===================================================== */

async function loadDashboardInbox() {

    try {

        const transfers =
            await apiRequest(
                "/api/transfers/inbox",
                {
                    method: "GET",
                    headers:
                        authHeaders(false)
                }
            );


        const counter =
            document.getElementById(
                "receivedDocuments"
            );


        if (counter) {

            counter.innerText =
                Array.isArray(transfers)
                    ? transfers.length
                    : 0;
        }

    } catch (error) {

        console.error(
            "Erro ao carregar recebidos:",
            error
        );


        const counter =
            document.getElementById(
                "receivedDocuments"
            );


        if (counter) {
            counter.innerText =
                "0";
        }
    }
}


/* =====================================================
   RENDERIZAR DOCUMENTOS
===================================================== */

function renderDashboardDocuments(
    documents
) {

    const tbody =
        document.querySelector(
            "#documentsTable tbody"
        );

    const wrapper =
        document.getElementById(
            "documentsTableWrapper"
        );

    const empty =
        document.getElementById(
            "documentsEmptyState"
        );


    if (!tbody) {
        return;
    }


    tbody.innerHTML =
        "";


    if (
        !Array.isArray(documents) ||
        documents.length === 0
    ) {

        if (wrapper) {
            wrapper.style.display =
                "none";
        }

        if (empty) {
            empty.style.display =
                "block";
        }

        return;
    }


    if (wrapper) {
        wrapper.style.display =
            "block";
    }


    if (empty) {
        empty.style.display =
            "none";
    }


    const ordered =
        [...documents].sort(
            (a, b) => {

                const dateA =
                    new Date(
                        a.createdAt || 0
                    );

                const dateB =
                    new Date(
                        b.createdAt || 0
                    );

                return dateB - dateA;
            }
        );


    ordered.forEach(
        doc => {

            tbody.appendChild(
                createDashboardDocumentRow(
                    doc
                )
            );
        }
    );
}


/* =====================================================
   LINHA DA TABELA
===================================================== */

function createDashboardDocumentRow(doc) {
    const row = document.createElement('tr');
    row.innerHTML = '<td><div class="table-title">' + escapeHtml(doc.title || '-') + '</div></td>' +
        '<td>' + escapeHtml(doc.originalFilename || '-') + '</td><td>' + formatDate(doc.createdAt) + '</td>';
    const cell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'action-row';
    const view = document.createElement('button');
    view.className = 'btn-secondary small-btn';
    view.textContent = 'Abrir';
    view.addEventListener('click', () => openMainDocument(doc.id, doc.title));
    const send = document.createElement('a');
    send.className = 'btn-secondary small-btn';
    send.href = 'send.html?documentId=' + encodeURIComponent(doc.id);
    send.textContent = 'Enviar';
    const download = document.createElement('button');
    download.className = 'btn-text small-btn';
    download.textContent = 'Baixar';
    download.addEventListener('click', () => downloadDocument(doc.id));
    actions.appendChild(view); actions.appendChild(send); actions.appendChild(download);
    cell.appendChild(actions); row.appendChild(cell);
    return row;
}

async function searchDashboardDocuments() {

    const input =
        document.getElementById(
            "search"
        );


    if (!input) {
        return;
    }


    const value =
        input.value
            .trim();


    const categoryId = document.getElementById("searchCategoryId")?.value || "";

    if (!value && !categoryId) {

        await loadDashboardDocuments();

        return;
    }


    try {

        const documents =
            await apiRequest(
                documentSearchPath(value, categoryId),
                {
                    method: "GET",
                    headers:
                        authHeaders(false)
                }
            );


        renderDashboardDocuments(
            documents
        );


    } catch (error) {

        console.error(
            "Erro ao pesquisar documentos:",
            error
        );


        showDashboardDocumentsError(
            error.message
        );
    }
}


/* =====================================================
   LIMPAR PESQUISA
===================================================== */

async function clearDocumentSearch() {
    const category = document.getElementById("searchCategoryId");
    if (category) category.value = "";

    const input =
        document.getElementById(
            "search"
        );


    if (input) {

        input.value =
            "";
    }


    await loadDashboardDocuments();
}


/* =====================================================
   ERRO
===================================================== */

function showDashboardDocumentsError(
    message
) {

    const tbody =
        document.querySelector(
            "#documentsTable tbody"
        );


    const wrapper =
        document.getElementById(
            "documentsTableWrapper"
        );


    const empty =
        document.getElementById(
            "documentsEmptyState"
        );


    if (tbody) {

        tbody.innerHTML =
            "";
    }


    if (wrapper) {

        wrapper.style.display =
            "none";
    }


    if (empty) {

        empty.style.display =
            "block";

        empty.innerHTML = `

            <div class="empty-state-icon">
                ⚠️
            </div>

            <h3>
                Não foi possível carregar os documentos
            </h3>

            <p>
                ${escapeHtml(
                    message ||
                    "Ocorreu um erro."
                )}
            </p>
        `;
    }
}
let returnedRefreshTimer = null;
let returnedRefreshInstalled = false;

function refreshReturnedIfVisible() {
    if (document.hidden || !getToken()) return;
    return loadReturnedTransfers();
}

function startReturnedRefresh() {
    if (!returnedRefreshInstalled) {
        window.addEventListener('focus', refreshReturnedIfVisible);
        document.addEventListener('visibilitychange', refreshReturnedIfVisible);
        window.addEventListener('pageshow', event => {
            if (event.persisted) {
                startReturnedRefresh();
                refreshReturnedIfVisible();
            }
        });
        window.addEventListener('pagehide', () => {
            clearInterval(returnedRefreshTimer);
            returnedRefreshTimer = null;
        });
        window.addEventListener('storage', event => {
            if (event.key === 'token' || event.key === null) window.location.reload();
        });
        returnedRefreshInstalled = true;
    }
    if (returnedRefreshTimer === null) {
        returnedRefreshTimer = setInterval(refreshReturnedIfVisible, 15000);
    }
}
