const API =
    "http://localhost:8080";

/* =====================================================
   TEMA
===================================================== */

const THEME_STORAGE_KEY =
    "vmsdocs-theme";

function applySavedTheme() {

    const savedTheme =
        localStorage.getItem(
            THEME_STORAGE_KEY
        );

    const theme =
        savedTheme === "light"
            ? "light"
            : "dark";

    document
        .documentElement
        .setAttribute(
            "data-theme",
            theme
        );
}

function getCurrentTheme() {

    return document
        .documentElement
        .getAttribute(
            "data-theme"
        ) === "light"
        ? "light"
        : "dark";
}

function setTheme(
    theme
) {

    const selectedTheme =
        theme === "light"
            ? "light"
            : "dark";

    document
        .documentElement
        .setAttribute(
            "data-theme",
            selectedTheme
        );

    localStorage.setItem(
        THEME_STORAGE_KEY,
        selectedTheme
    );

    updateThemeSwitcherState();
}

function updateThemeSwitcherState() {

    const toggle =
        document.getElementById(
            "themeToggle"
        );

    const lightLabel =
        document.getElementById(
            "themeLabelLight"
        );

    const darkLabel =
        document.getElementById(
            "themeLabelDark"
        );

    const theme =
        getCurrentTheme();

    if (toggle) {
        toggle.checked =
            theme === "dark";
    }

    if (lightLabel) {
        lightLabel.classList.toggle(
            "active",
            theme === "light"
        );
    }

    if (darkLabel) {
        darkLabel.classList.toggle(
            "active",
            theme === "dark"
        );
    }
}

function createThemeSelector() {

    if (
        document.getElementById(
            "themeSwitcher"
        )
    ) {
        return;
    }

    const sidebar =
        document.querySelector(
            ".sidebar"
        );

    if (!sidebar) {
        return;
    }

    const sections =
        sidebar.querySelectorAll(
            ".sidebar-section"
        );

    let accountSection =
        null;

    sections.forEach(
        section => {

            if (
                section.style.marginTop ===
                "auto"
            ) {

                accountSection =
                    section;
            }
        }
    );

    const themeSection =
        document.createElement(
            "div"
        );

    themeSection.className =
        "sidebar-section sidebar-theme-section";

    themeSection.innerHTML = `

        <p class="sidebar-title">
            Aparência
        </p>

        <div
            id="themeSwitcher"
            class="sidebar-theme-box"
        >

            <div class="theme-switch-row">

                <span
                    id="themeLabelLight"
                    class="theme-switch-label"
                >
                    ☀️
                </span>

                <label
                    class="theme-toggle"
                    title="Alternar tema"
                >

                    <input
                        type="checkbox"
                        id="themeToggle"
                    >

                    <span
                        class="theme-slider"
                    ></span>

                </label>

                <span
                    id="themeLabelDark"
                    class="theme-switch-label"
                >
                    🌙
                </span>

            </div>

        </div>

    `;

    if (accountSection) {

        sidebar.insertBefore(
            themeSection,
            accountSection
        );

    } else {

        sidebar.appendChild(
            themeSection
        );
    }

    const toggle =
        document.getElementById(
            "themeToggle"
        );

    if (toggle) {

        toggle.addEventListener(
            "change",
            function () {

                if (
                    this.checked
                ) {

                    setTheme(
                        "dark"
                    );

                } else {

                    setTheme(
                        "light"
                    );
                }
            }
        );
    }

    updateThemeSwitcherState();
}

applySavedTheme();

document.addEventListener(
    "DOMContentLoaded",
    function () {

        createThemeSelector();
    }
);


/* =====================================================
   DADOS GLOBAIS
===================================================== */

let currentUser =
    null;

let embeddedSignState = {
    mode: null,
    documentId: null,
    transferId: null,
    page: null,
    x: null,
    y: null,
    previewEl: null,
    targetContainerId: null,
    targetInfoId: null,
    targetButtonId: null
};

/* =====================================================
   ASSINATURA PENDENTE DO REMETENTE

   Na tela de envio, a assinatura NÃO altera o documento
   original. Aqui guardamos somente a posição escolhida.
   Depois que a transferência é criada, essa posição é
   aplicada à CÓPIA da transferência pelo endpoint
   /api/transfers/{id}/sign-sender.
===================================================== */

let pendingSenderSignature = null;

if (
    typeof pdfjsLib !==
    "undefined"
) {

    pdfjsLib
        .GlobalWorkerOptions
        .workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}


/* =====================================================
   TOKEN
===================================================== */

function getToken() {

    return localStorage.getItem(
        "token"
    );
}

function authHeaders(
    json = true
) {

    const headers =
        {};

    const token =
        getToken();

    if (token) {

        headers.Authorization =
            "Bearer " + token;
    }

    if (json) {

        headers[
            "Content-Type"
        ] =
            "application/json";
    }

    return headers;
}


/* =====================================================
   ERROS
===================================================== */

async function readErrorMessage(
    response
) {

    try {

        const type =
            response.headers.get(
                "Content-Type"
            ) || "";

        if (
            type.includes(
                "application/json"
            )
        ) {

            const data =
                await response
                    .clone()
                    .json();

            if (data.message) {
                return data.message;
            }

            if (data.detail) {
                return data.detail;
            }

            if (data.error) {
                return data.error;
            }
        }

        const text =
            await response.text();

        if (
            text &&
            text.trim()
        ) {

            return text.trim();
        }

    } catch (error) {

        console.error(
            error
        );
    }

    return (
        "Erro HTTP "
        +
        response.status
    );
}

async function apiRequest(
    path,
    options = {}
) {

    let response;

    try {

        response =
            await fetch(
                API + path,
                options
            );

    } catch (error) {

        throw new Error(
            "Não foi possível conectar ao servidor."
        );
    }

    if (
        !response.ok
    ) {

        const message =
            await readErrorMessage(
                response
            );

        if (
            response.status === 401
        ) {

            const loginRequest =
                path ===
                "/api/auth/login";

            if (!loginRequest) {

                localStorage.removeItem(
                    "token"
                );

                window.location.href =
                    "index.html";
            }

            throw new Error(
                message ||
                "E-mail ou senha inválidos."
            );
        }

        if (
            response.status === 403
        ) {

            throw new Error(
                message ||
                "Você não possui permissão."
            );
        }

        throw new Error(
            message
        );
    }

    if (
        response.status === 204
    ) {

        return null;
    }

    const type =
        response.headers.get(
            "Content-Type"
        ) || "";

    if (
        type.includes(
            "application/json"
        )
    ) {

        return response.json();
    }

    return response;
}


/* =====================================================
   USUÁRIO
===================================================== */

async function fetchCurrentUser() {

    currentUser =
        await apiRequest(
            "/api/auth/me",
            {
                method:
                    "GET",

                headers:
                    authHeaders(
                        false
                    )
            }
        );

    return currentUser;
}

function getCurrentRole() {

    if (!currentUser) {
        return "";
    }

    let role =
        String(
            currentUser.role ||
            ""
        )
            .trim()
            .toUpperCase();

    if (
        role.startsWith(
            "ROLE_"
        )
    ) {

        role =
            role.substring(
                5
            );
    }

    return role;
}


/* =====================================================
   VISIBILIDADE
===================================================== */

function applyRoleVisibility() {

    const role =
        getCurrentRole();

    const isAdmin =
        role === "ADMIN";

    document
        .querySelectorAll(
            "[data-admin-only]"
        )
        .forEach(
            element => {

                if (isAdmin) {

                    element
                        .classList
                        .add(
                            "admin-visible"
                        );

                    element.style.setProperty(
                        "display",
                        "block",
                        "important"
                    );

                } else {

                    element
                        .classList
                        .remove(
                            "admin-visible"
                        );

                    element.style.setProperty(
                        "display",
                        "none",
                        "important"
                    );
                }
            }
        );
}


/* =====================================================
   PROTEÇÃO
===================================================== */

async function bootPage(
    options = {}
) {

    const {
        adminOnly = false,
        allowedRoles = []
    } =
        options;

    if (!getToken()) {

        window.location.href =
            "index.html";

        return false;
    }

    try {

        await fetchCurrentUser();

        const role =
            getCurrentRole();

        if (
            adminOnly &&
            role !== "ADMIN"
        ) {

            window.location.href =
                "dashboard.html";

            return false;
        }

        if (
            allowedRoles.length >
            0
        ) {

            const normalized =
                allowedRoles.map(
                    item =>
                        String(item)
                            .replace(
                                "ROLE_",
                                ""
                            )
                            .toUpperCase()
                );

            if (
                !normalized.includes(
                    role
                )
            ) {

                window.location.href =
                    "dashboard.html";

                return false;
            }
        }

        applyRoleVisibility();

        return true;

    } catch (error) {

        console.error(
            error
        );

        localStorage.removeItem(
            "token"
        );

        window.location.href =
            "index.html";

        return false;
    }
}


/* =====================================================
   LOGIN
===================================================== */

async function login() {

    const email =
        document
            .getElementById(
                "email"
            )
            ?.value
            .trim()
            .toLowerCase();

    const password =
        document
            .getElementById(
                "password"
            )
            ?.value;

    const msg =
        document.getElementById(
            "msg"
        );

    if (
        !email ||
        !password
    ) {

        if (msg) {

            msg.innerText =
                "Informe o e-mail e a senha.";
        }

        return;
    }

    try {

        const data =
            await apiRequest(
                "/api/auth/login",
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            email,
                            password
                        })
                }
            );

        localStorage.setItem(
            "token",
            data.token
        );

        window.location.href =
            "dashboard.html";

    } catch (error) {

        if (msg) {

            msg.innerText =
                error.message;
        }
    }
}

function logout() {

    localStorage.removeItem(
        "token"
    );

    window.location.href =
        "index.html";
}


/* =====================================================
   STATUS
===================================================== */

function renderStatus(
    status
) {

    if (
        status === "SIGNED"
    ) {

        return `
            <span class="status-badge status-signed">
                Assinado
            </span>
        `;
    }

    if (
        status === "READ"
    ) {

        return `
            <span class="status-badge status-read">
                Visualizado
            </span>
        `;
    }

    if (
        status === "SENT"
    ) {

        return `
            <span class="status-badge status-sent">
                Novo
            </span>
        `;
    }

    if (
        status === "RETURNED"
    ) {

        return `
            <span class="status-badge status-returned">
                Assinado e devolvido
            </span>
        `;
    }

    return `
        <span class="status-badge status-pending">
            Pendente
        </span>
    `;
}

function formatDate(
    value
) {

    if (!value) {
        return "-";
    }

    return new Date(
        value
    )
        .toLocaleString(
            "pt-BR"
        );
}


/* =====================================================
   UPLOAD
===================================================== */

async function initUploadPage() {

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

    await loadCategoriesSelect(
        "categoryId"
    );
}

async function uploadDocument() {

    const title =
        document.getElementById(
            "title"
        )?.value.trim();

    const description =
        document.getElementById(
            "description"
        )?.value.trim();

    const categoryId =
        document.getElementById(
            "categoryId"
        )?.value;

    const file =
        document.getElementById(
            "file"
        )?.files[0];

    const msg =
        document.getElementById(
            "msg"
        );

    if (!title) {

        if (msg) {

            msg.innerText =
                "Informe o título.";
        }

        return;
    }

    if (!file) {

        if (msg) {

            msg.innerText =
                "Selecione um arquivo.";
        }

        return;
    }

    try {

        const form =
            new FormData();

        form.append(
            "title",
            title
        );

        form.append(
            "description",
            description || ""
        );

        if (categoryId) {

            form.append(
                "categoryId",
                categoryId
            );
        }

        form.append(
            "file",
            file
        );

        const headers =
            {};

        const token =
            getToken();

        if (token) {

            headers.Authorization =
                "Bearer " + token;
        }

        await apiRequest(
            "/api/documents",
            {
                method:
                    "POST",

                headers,

                body:
                    form
            }
        );

        if (msg) {

            msg.innerText =
                "Documento salvo com sucesso.";
        }

    } catch (error) {

        if (msg) {

            msg.innerText =
                error.message;
        }
    }
}


/* =====================================================
   CATEGORIAS
===================================================== */

async function initCategoriesPage() {

    const ok =
        await bootPage({
            adminOnly:
                true
        });

    if (!ok) {
        return;
    }

    await loadCategories();
}

async function loadCategories() {

    const data =
        await apiRequest(
            "/api/categories",
            {
                method:
                    "GET",

                headers:
                    authHeaders(
                        false
                    )
            }
        );

    const tbody =
        document.querySelector(
            "#categoriesTable tbody"
        );

    if (!tbody) {
        return;
    }

    tbody.innerHTML =
        "";

    data.forEach(
        category => {

            tbody.innerHTML += `
                <tr>

                    <td>
                        ${escapeHtml(
                            category.name
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            category.description
                            ??
                            "-"
                        )}
                    </td>

                </tr>
            `;
        }
    );
}

async function createCategory() {

    const name =
        document.getElementById(
            "categoryName"
        )?.value.trim();

    const description =
        document.getElementById(
            "categoryDescription"
        )?.value.trim();

    const msg =
        document.getElementById(
            "categoryMsg"
        );

    try {

        await apiRequest(
            "/api/categories",
            {
                method:
                    "POST",

                headers:
                    authHeaders(
                        true
                    ),

                body:
                    JSON.stringify({
                        name,
                        description
                    })
            }
        );

        if (msg) {

            msg.innerText =
                "Categoria cadastrada.";
        }

        await loadCategories();

    } catch (error) {

        if (msg) {

            msg.innerText =
                error.message;
        }
    }
}

async function loadCategoriesSelect(
    selectId
) {

    const select =
        document.getElementById(
            selectId
        );

    if (!select) {
        return;
    }

    const data =
        await apiRequest(
            "/api/categories",
            {
                method:
                    "GET",

                headers:
                    authHeaders(
                        false
                    )
            }
        );

    select.innerHTML =
        `
            <option value="">
                Sem categoria
            </option>
        `;

    data.forEach(
        category => {

            select.innerHTML += `
                <option value="${category.id}">
                    ${escapeHtml(category.name)}
                </option>
            `;
        }
    );
}


/* =====================================================
   USUÁRIOS
===================================================== */

async function initUsersPage() {

    const ok =
        await bootPage({
            adminOnly:
                true
        });

    if (!ok) {
        return;
    }

    await loadUsers();
}

async function loadUsers() {

    const users =
        await apiRequest(
            "/api/users",
            {
                method:
                    "GET",

                headers:
                    authHeaders(
                        false
                    )
            }
        );

    const tbody =
        document.querySelector(
            "#usersTable tbody"
        );

    if (!tbody) {
        return;
    }

    tbody.innerHTML =
        "";

    users.forEach(
        user => {

            tbody.innerHTML += `
                <tr>

                    <td>
                        ${escapeHtml(
                            user.name
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            user.email
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            user.role
                        )}
                    </td>

                    <td>
                        ${
                            user.active
                                ? "Ativo"
                                : "Inativo"
                        }
                    </td>

                </tr>
            `;
        }
    );
}

async function createUser() {

    const name =
        document.getElementById(
            "userName"
        )?.value.trim();

    const email =
        document.getElementById(
            "userEmail"
        )?.value.trim();

    const password =
        document.getElementById(
            "userPassword"
        )?.value;

    const role =
        document.getElementById(
            "userRole"
        )?.value;

    await apiRequest(
        "/api/users",
        {
            method:
                "POST",

            headers:
                authHeaders(
                    true
                ),

            body:
                JSON.stringify({
                    name,
                    email,
                    password,
                    role
                })
        }
    );

    await loadUsers();
}


/* =====================================================
   DESTINATÁRIOS
===================================================== */

async function loadUsersSelect(
    selectId
) {

    const select =
        document.getElementById(
            selectId
        );

    if (!select) {
        return;
    }

    const users =
        await apiRequest(
            "/api/users/recipients",
            {
                method:
                    "GET",

                headers:
                    authHeaders(
                        false
                    )
            }
        );

    select.innerHTML =
        `
            <option value="">
                Selecione um usuário
            </option>
        `;

    users.forEach(
        user => {

            if (
                currentUser &&
                user.id ===
                currentUser.id
            ) {

                return;
            }

            select.innerHTML += `
                <option value="${user.id}">
                    ${escapeHtml(
                        user.name
                    )}
                    -
                    ${escapeHtml(
                        user.email
                    )}
                </option>
            `;
        }
    );
}


/* =====================================================
   DOCUMENTOS SELECT
===================================================== */

async function loadDocumentsSelect(
    selectId
) {

    const select =
        document.getElementById(
            selectId
        );

    if (!select) {
        return;
    }

    const documents =
        await apiRequest(
            "/api/documents",
            {
                method:
                    "GET",

                headers:
                    authHeaders(
                        false
                    )
            }
        );

    select.innerHTML =
        `
            <option value="">
                Selecione um documento
            </option>
        `;

    documents.forEach(
        doc => {

            select.innerHTML += `
                <option value="${doc.id}">
                    ${escapeHtml(doc.title)}
                </option>
            `;
        }
    );
}


/* =====================================================
   DOWNLOAD
===================================================== */

async function downloadDocument(
    id
) {

    const response =
        await fetch(
            API +
            `/api/documents/${id}/download`,
            {
                headers:
                    authHeaders(
                        false
                    )
            }
        );

    if (!response.ok) {

        alert(
            await readErrorMessage(
                response
            )
        );

        return;
    }

    const blob =
        await response.blob();

    const url =
        URL.createObjectURL(
            blob
        );

    const link =
        document.createElement(
            "a"
        );

    link.href =
        url;

    link.download =
        "documento";

    link.click();

    URL.revokeObjectURL(
        url
    );
}


/* =====================================================
   ENVIAR
===================================================== */

async function initSendPage() {

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

    pendingSenderSignature = null;

    await Promise.all([
        loadDocumentsSelect(
            "sendDocumentId"
        ),

        loadUsersSelect(
            "sendReceiverId"
        )
    ]);

    const documentSelect =
        document.getElementById(
            "sendDocumentId"
        );

    if (documentSelect) {

        documentSelect.addEventListener(
            "change",
            function () {

                pendingSenderSignature = null;

                clearEmbeddedViewer();

                const msg =
                    document.getElementById(
                        "sendMsg"
                    );

                if (msg) {
                    msg.innerText = "";
                }
            }
        );
    }
}


/* =====================================================
   VISUALIZAR DOCUMENTO ANTES DE ENVIAR
===================================================== */

async function previewSelectedDocumentForSend() {

    const documentId =
        document
            .getElementById(
                "sendDocumentId"
            )
            ?.value;

    if (!documentId) {

        alert(
            "Selecione um documento."
        );

        return;
    }

    try {

        await openEmbeddedViewer({

            mode:
                "view",

            documentId:
                documentId,

            transferId:
                null,

            containerId:
                "embeddedPdfContainer",

            infoId:
                "sendViewerInfo",

            titleId:
                "sendViewerTitle",

            buttonId:
                "confirmOwnSignBtn",

            titleText:
                "Visualização do documento"
        });

    } catch (error) {

        console.error(
            "Erro ao visualizar documento:",
            error
        );

        const info =
            document.getElementById(
                "sendViewerInfo"
            );

        if (info) {

            info.innerText =
                error.message ||
                "Não foi possível visualizar o documento.";
        }
    }
}


/* =====================================================
   PREPARAR ASSINATURA DO REMETENTE
===================================================== */

async function prepareOwnDocumentSignature() {

    const documentId =
        document
            .getElementById(
                "sendDocumentId"
            )
            ?.value;

    if (!documentId) {

        alert(
            "Selecione um documento."
        );

        return;
    }

    pendingSenderSignature = null;

    try {

        await openEmbeddedViewer({

            mode:
                "own",

            documentId:
                documentId,

            transferId:
                null,

            containerId:
                "embeddedPdfContainer",

            infoId:
                "sendViewerInfo",

            titleId:
                "sendViewerTitle",

            buttonId:
                "confirmOwnSignBtn",

            titleText:
                "Posicionar assinatura antes do envio"
        });

        const info =
            document.getElementById(
                "sendViewerInfo"
            );

        if (info) {
            info.innerText =
                "Clique no ponto onde deseja inserir sua assinatura. O documento original não será alterado.";
        }

    } catch (error) {

        console.error(
            "Erro ao preparar assinatura:",
            error
        );

        const info =
            document.getElementById(
                "sendViewerInfo"
            );

        if (info) {

            info.innerText =
                error.message ||
                "Não foi possível preparar a assinatura.";
        }
    }
}


/* =====================================================
   ENVIAR DOCUMENTO
===================================================== */

async function sendDocumentToUser() {

    const documentId =
        document.getElementById(
            "sendDocumentId"
        )?.value;

    const receiverId =
        document.getElementById(
            "sendReceiverId"
        )?.value;

    const msg =
        document.getElementById(
            "sendMsg"
        );

    if (!documentId) {

        if (msg) {
            msg.innerText =
                "Selecione um documento.";
        }

        return;
    }

    if (!receiverId) {

        if (msg) {
            msg.innerText =
                "Selecione um destinatário.";
        }

        return;
    }

    try {

        if (msg) {
            msg.innerText =
                "Criando cópia e enviando documento...";
        }

        const transfer =
            await apiRequest(
                `/api/documents/${documentId}/send`,
                {
                    method:
                        "POST",

                    headers:
                        authHeaders(
                            true
                        ),

                    body:
                        JSON.stringify({
                            receiverId
                        })
                }
            );

        if (
            !transfer ||
            !transfer.id
        ) {

            throw new Error(
                "A transferência foi criada, mas o servidor não retornou o ID."
            );
        }

        if (pendingSenderSignature) {

            if (msg) {
                msg.innerText =
                    "Aplicando assinatura na cópia da transferência...";
            }

            await apiRequest(
                `/api/transfers/${transfer.id}/sign-sender`,
                {
                    method:
                        "PATCH",

                    headers:
                        authHeaders(
                            true
                        ),

                    body:
                        JSON.stringify({

                            page:
                                pendingSenderSignature.page,

                            x:
                                pendingSenderSignature.x,

                            y:
                                pendingSenderSignature.y
                        })
                }
            );
        }

        pendingSenderSignature = null;

        clearEmbeddedViewer();

        if (msg) {

            msg.innerText =
                "Documento enviado com sucesso.";
        }

    } catch (error) {

        console.error(
            "Erro ao enviar documento:",
            error
        );

        if (msg) {

            msg.innerText =
                error.message;
        }
    }
}


/* =====================================================
   RECEBIDOS
===================================================== */

async function initInboxPage() {

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

    await loadInbox();
}

async function loadInbox() {

    try {

        const transfers =
            await apiRequest(
                `/api/transfers/inbox?t=${Date.now()}`,
                {
                    method:
                        "GET",

                    headers:
                        authHeaders(
                            false
                        )
                }
            );

        const tbody =
            document.querySelector(
                "#inboxTable tbody"
            );

        const empty =
            document.getElementById(
                "inboxEmptyState"
            );

        if (!tbody) {
            return;
        }

        const wrapper =
            tbody.closest(
                ".table-wrapper"
            );

        tbody.innerHTML =
            "";

        if (
            !Array.isArray(transfers) ||
            transfers.length === 0
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

        transfers.forEach(
            item => {

                const canSign =
                    item.status === "SENT"
                    ||
                    item.status === "READ";

                tbody.innerHTML += `

                    <tr>

                        <td>

                            <div class="table-title">

                                ${escapeHtml(
                                    item.documentTitle
                                    ??
                                    "Documento"
                                )}

                            </div>

                        </td>

                        <td>

                            ${escapeHtml(
                                item.senderName
                                ??
                                "-"
                            )}

                        </td>

                        <td>

                            ${renderStatus(
                                item.status
                            )}

                        </td>

                        <td>

                            ${formatDate(
                                item.sentAt
                            )}

                        </td>

                        <td>

                            ${
                                item.readAt
                                    ?
                                    formatDate(
                                        item.readAt
                                    )
                                    :
                                    "-"
                            }

                        </td>

                        <td>

                            <div class="action-row">

                                <button
                                    class="btn-secondary small-btn"
                                    onclick="previewReceivedTransfer(
                                        '${item.id}',
                                        '${item.documentId}',
                                        '${item.status}'
                                    )"
                                >
                                    Visualizar
                                </button>

                                ${
                                    canSign
                                        ?
                                        `
                                            <button
                                                class="btn-primary small-btn"
                                                onclick="prepareTransferSignature(
                                                    '${item.id}',
                                                    '${item.documentId}'
                                                )"
                                            >
                                                Assinar
                                            </button>
                                        `
                                        :
                                        ""
                                }

                            </div>

                        </td>

                    </tr>

                `;
            }
        );

    } catch (error) {

        console.error(
            "Erro ao carregar recebidos:",
            error
        );
    }
}

async function previewReceivedTransfer(
    transferId,
    documentId,
    status
) {

    try {

        if (
            status === "SENT"
        ) {

            await apiRequest(
                `/api/transfers/${transferId}/read`,
                {
                    method:
                        "PATCH",

                    headers:
                        authHeaders(
                            false
                        )
                }
            );
        }

        await openEmbeddedViewer({

            mode:
                "view",

            documentId:
                documentId,

            transferId:
                transferId,

            containerId:
                "embeddedPdfContainer",

            infoId:
                "viewerInfo",

            titleId:
                "viewerTitle",

            buttonId:
                "confirmSignBtn",

            titleText:
                "Visualização do documento recebido"
        });

        await loadInbox();

    } catch (error) {

        console.error(
            "Erro ao visualizar documento recebido:",
            error
        );

        alert(
            error.message ||
            "Não foi possível visualizar o documento."
        );
    }
}

async function prepareTransferSignature(
    transferId,
    documentId
) {

    try {

        await openEmbeddedViewer({

            mode:
                "transfer",

            documentId:
                documentId,

            transferId:
                transferId,

            containerId:
                "embeddedPdfContainer",

            infoId:
                "viewerInfo",

            titleId:
                "viewerTitle",

            buttonId:
                "confirmSignBtn",

            titleText:
                "Posicionar assinatura"
        });

        const info =
            document.getElementById(
                "viewerInfo"
            );

        if (info) {

            info.innerText =
                "Clique no ponto do documento onde deseja inserir a assinatura.";
        }

    } catch (error) {

        console.error(
            "Erro ao preparar assinatura:",
            error
        );

        alert(
            error.message ||
            "Não foi possível preparar a assinatura."
        );
    }
}


/* =====================================================
   PDF
===================================================== */

async function openEmbeddedViewer(
    config
) {

    embeddedSignState = {

        mode:
            config.mode,

        documentId:
            config.documentId,

        transferId:
            config.transferId,

        page:
            null,

        x:
            null,

        y:
            null,

        previewEl:
            null,

        targetContainerId:
            config.containerId,

        targetInfoId:
            config.infoId,

        targetButtonId:
            config.buttonId
    };

    const container =
        document.getElementById(
            config.containerId
        );

    const info =
        document.getElementById(
            config.infoId
        );

    const title =
        document.getElementById(
            config.titleId
        );

    const confirmButton =
        document.getElementById(
            config.buttonId
        );

    if (!container) {

        throw new Error(
            "Área de visualização do documento não encontrada."
        );
    }

    container.innerHTML =
        "";

    if (title) {

        title.innerText =
            config.titleText ||
            "Visualização do documento";
    }

    if (info) {

        if (
            config.mode === "view"
        ) {

            info.innerText =
                "Carregando documento...";

        } else {

            info.innerText =
                "Clique no ponto do documento onde deseja inserir a assinatura.";
        }
    }

    if (confirmButton) {

        confirmButton.disabled =
            true;
    }

    let url;

    if (
        config.transferId
    ) {

        url =
            `/api/transfers/${config.transferId}/view`;

    } else {

        url =
            `/api/documents/${config.documentId}/view`;
    }

    const response =
        await fetch(
            API + url,
            {
                headers:
                    authHeaders(
                        false
                    )
            }
        );

    if (!response.ok) {

        throw new Error(
            await readErrorMessage(
                response
            )
        );
    }

    const blob =
        await response.blob();

    if (
        !blob.type.includes(
            "pdf"
        )
    ) {

        throw new Error(
            "Somente documentos PDF podem ser assinados."
        );
    }

    if (
        typeof pdfjsLib ===
        "undefined"
    ) {

        throw new Error(
            "O visualizador PDF não foi carregado."
        );
    }

    const buffer =
        await blob.arrayBuffer();

    const pdf =
        await pdfjsLib
            .getDocument({
                data:
                    buffer
            })
            .promise;

    for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
    ) {

        const page =
            await pdf.getPage(
                pageNumber
            );

        const scale =
            1.4;

        const viewport =
            page.getViewport({
                scale
            });

        const wrapper =
            document.createElement(
                "div"
            );

        wrapper.className =
            "pdf-page-wrapper";

        wrapper.style.position =
            "relative";

        const canvas =
            document.createElement(
                "canvas"
            );

        canvas.className =
            "pdf-page-canvas";

        canvas.width =
            viewport.width;

        canvas.height =
            viewport.height;

        const context =
            canvas.getContext(
                "2d"
            );

        await page.render({

            canvasContext:
                context,

            viewport:
                viewport

        }).promise;

        if (
            config.mode !== "view"
        ) {

            canvas.style.cursor =
                "crosshair";

            canvas.addEventListener(
                "click",
                function (event) {

                    handleSignaturePlacement(
                        event,
                        canvas,
                        wrapper,
                        pageNumber,
                        scale
                    );
                }
            );
        }

        wrapper.appendChild(
            canvas
        );

        container.appendChild(
            wrapper
        );
    }

    if (
        info &&
        config.mode === "view"
    ) {

        info.innerText =
            "Documento carregado com sucesso.";
    }
}


/* =====================================================
   POSICIONAR ASSINATURA NO PDF
===================================================== */

function handleSignaturePlacement(
    event,
    canvas,
    wrapper,
    pageNumber,
    scale
) {

    const rect =
        canvas.getBoundingClientRect();

    const scaleX =
        canvas.width /
        rect.width;

    const scaleY =
        canvas.height /
        rect.height;

    const clickXCanvas =
        (
            event.clientX -
            rect.left
        )
        *
        scaleX;

    const clickYCanvas =
        (
            event.clientY -
            rect.top
        )
        *
        scaleY;

    const pdfX =
        clickXCanvas /
        scale;

    let pdfY =
        (
            canvas.height -
            clickYCanvas
        )
        /
        scale
        -
        72;

    if (
        pdfY < 0
    ) {

        pdfY =
            0;
    }

    embeddedSignState.page =
        pageNumber;

    embeddedSignState.x =
        pdfX;

    embeddedSignState.y =
        pdfY;

    if (
        embeddedSignState.previewEl
    ) {

        embeddedSignState
            .previewEl
            .remove();
    }

    const preview =
        document.createElement(
            "div"
        );

    preview.className =
        "signature-preview";

    const visibleX =
        event.clientX -
        rect.left;

    const visibleY =
        event.clientY -
        rect.top;

    preview.style.left =
        `${visibleX}px`;

    preview.style.top =
        `${visibleY}px`;

    preview.innerHTML = `

        <strong>
            DOCUMENTO ASSINADO
        </strong>

        <br>

        ${escapeHtml(
            currentUser?.name
            ??
            "Usuário"
        )}

        <br>

        ${new Date()
            .toLocaleString(
                "pt-BR"
            )}

    `;

    wrapper.appendChild(
        preview
    );

    embeddedSignState.previewEl =
        preview;

    const info =
        document.getElementById(
            embeddedSignState
                .targetInfoId
        );

    if (info) {

        info.innerText =
            `Assinatura posicionada na página ${pageNumber}. Clique em Confirmar Assinatura.`;
    }

    const button =
        document.getElementById(
            embeddedSignState
                .targetButtonId
        );

    if (button) {

        button.disabled =
            false;
    }
}


/* =====================================================
   CONFIRMAR ASSINATURA
===================================================== */

async function confirmEmbeddedSignature() {

    if (
        embeddedSignState.page === null ||
        embeddedSignState.x === null ||
        embeddedSignState.y === null
    ) {

        alert(
            "Clique no documento para escolher onde a assinatura deve aparecer."
        );

        return;
    }

    const button =
        document.getElementById(
            embeddedSignState.targetButtonId
        );

    if (button) {

        button.disabled =
            true;

        button.innerText =
            "Assinando...";
    }

    try {

        /* =================================================
           ASSINATURA DO REMETENTE ANTES DO ENVIO
        ================================================= */

        if (
            embeddedSignState.mode === "own"
        ) {

            pendingSenderSignature = {

                documentId:
                    embeddedSignState.documentId,

                page:
                    embeddedSignState.page,

                x:
                    embeddedSignState.x,

                y:
                    embeddedSignState.y
            };

            clearEmbeddedViewer();

            const info =
                document.getElementById(
                    "sendViewerInfo"
                );

            if (info) {
                info.innerText =
                    "Assinatura preparada. Agora escolha o destinatário e clique em Enviar Documento.";
            }

            alert(
                "Posição da assinatura salva. A assinatura será aplicada somente na cópia enviada."
            );

            return;
        }


        /* =================================================
           DOCUMENTO RECEBIDO
        ================================================= */

        if (
            embeddedSignState.mode === "transfer"
        ) {

            /*
             * ALTERAÇÃO APENAS PARA MELHORAR
             * O FEEDBACK DURANTE O DELAY.
             */
            if (button) {

                button.disabled =
                    true;

                button.innerText =
                    "Assinando e devolvendo...";
            }

            const info =
                document.getElementById(
                    embeddedSignState.targetInfoId
                );

            if (info) {

                info.innerText =
                    "Processando assinatura e devolvendo o documento...";
            }


            const transferId =
                embeddedSignState.transferId;


            const updatedTransfer =
                await apiRequest(
                    `/api/transfers/${transferId}/sign`,
                    {
                        method:
                            "PATCH",

                        headers:
                            authHeaders(
                                true
                            ),

                        body:
                            JSON.stringify({

                                page:
                                    embeddedSignState.page,

                                x:
                                    embeddedSignState.x,

                                y:
                                    embeddedSignState.y
                            })
                    }
                );


            if (
                !updatedTransfer ||
                updatedTransfer.status !== "RETURNED"
            ) {

                console.error(
                    "Transferência retornada pelo backend:",
                    updatedTransfer
                );

                throw new Error(
                    "O documento foi assinado, mas a transferência não foi marcada como devolvida."
                );
            }


            /*
             * ALTERAÇÃO DO DELAY:
             * atualiza a caixa antes de limpar o PDF.
             */
            if (
                typeof loadInbox ===
                "function"
            ) {

                await loadInbox();
            }


            clearEmbeddedViewer();


            alert(
                "Documento assinado e devolvido com sucesso."
            );

            return;
        }

    } catch (error) {

        console.error(
            "Erro ao assinar documento:",
            error
        );

        alert(
            error.message ||
            "Não foi possível assinar o documento."
        );

        if (button) {

            button.disabled =
                false;

            button.innerText =
                "Confirmar Assinatura";
        }
    }
}


/* =====================================================
   LIMPAR VISUALIZADOR
===================================================== */

function clearEmbeddedViewer() {

    embeddedSignState = {

        mode:
            null,

        documentId:
            null,

        transferId:
            null,

        page:
            null,

        x:
            null,

        y:
            null,

        previewEl:
            null,

        targetContainerId:
            null,

        targetInfoId:
            null,

        targetButtonId:
            null
    };

    const container =
        document.getElementById(
            "embeddedPdfContainer"
        );

    if (container) {

        container.innerHTML =
            "";
    }

    const sendInfo =
        document.getElementById(
            "sendViewerInfo"
        );

    if (sendInfo) {

        sendInfo.innerText =
            "Selecione um documento acima para visualizar.";
    }

    const inboxInfo =
        document.getElementById(
            "viewerInfo"
        );

    if (inboxInfo) {

        inboxInfo.innerText =
            "Selecione um documento para visualizar.";
    }

    const ownButton =
        document.getElementById(
            "confirmOwnSignBtn"
        );

    if (ownButton) {

        ownButton.disabled =
            true;

        ownButton.innerText =
            "Confirmar Assinatura";
    }

    const transferButton =
        document.getElementById(
            "confirmSignBtn"
        );

    if (transferButton) {

        transferButton.disabled =
            true;

        transferButton.innerText =
            "Confirmar Assinatura";
    }
}


/* =====================================================
   PASTAS
===================================================== */

async function initFoldersPage() {

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

    await loadFolders();
}

async function loadFolders() {

    const categories =
        await apiRequest(
            "/api/categories",
            {
                method:
                    "GET",

                headers:
                    authHeaders(
                        false
                    )
            }
        );

    const grid =
        document.getElementById(
            "foldersGrid"
        );

    if (!grid) {
        return;
    }

    grid.innerHTML =
        "";

    categories.forEach(
        category => {

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "folder-card";

            card.innerHTML = `

                <div class="folder-icon">
                    📁
                </div>

                <h4>
                    ${escapeHtml(
                        category.name
                    )}
                </h4>

                <p>
                    ${escapeHtml(
                        category.description
                        ??
                        "Sem descrição"
                    )}
                </p>

            `;

            card.addEventListener(
                "click",
                () => {

                    loadDocumentsByCategory(
                        category.id,
                        category.name,
                        category.description
                    );
                }
            );

            grid.appendChild(
                card
            );
        }
    );
}

async function loadDocumentsByCategory(
    categoryId,
    categoryName,
    categoryDescription
) {

    const documents =
        await apiRequest(
            `/api/documents/search?categoryId=${encodeURIComponent(categoryId)}`,
            {
                method:
                    "GET",

                headers:
                    authHeaders(
                        false
                    )
            }
        );

    const section =
        document.getElementById(
            "folderDocumentsSection"
        );

    if (section) {

        section.style.display =
            "block";
    }

    const title =
        document.getElementById(
            "selectedCategoryTitle"
        );

    if (title) {

        title.innerText =
            `Pasta: ${categoryName}`;
    }

    const description =
        document.getElementById(
            "selectedCategoryDescription"
        );

    if (description) {

        description.innerText =
            categoryDescription ||
            "Sem descrição";
    }

    const tbody =
        document.querySelector(
            "#categoryDocumentsTable tbody"
        );

    if (!tbody) {
        return;
    }

    tbody.innerHTML =
        "";

    documents.forEach(
        doc => {

            tbody.innerHTML += `

                <tr>

                    <td>

                        <div class="table-title">
                            ${escapeHtml(
                                doc.title
                            )}
                        </div>

                    </td>

                    <td>
                        ${formatDate(
                            doc.createdAt
                        )}
                    </td>

                    <td>

                        <button
                            class="btn-secondary small-btn"
                            onclick="downloadDocument('${doc.id}')"
                        >
                            Download
                        </button>

                    </td>

                </tr>

            `;
        }
    );
}


/* =====================================================
   AUDITORIA
===================================================== */

async function initAuditPage() {

    const ok =
        await bootPage({
            adminOnly:
                true
        });

    if (!ok) {
        return;
    }

    await loadAudit();
}

async function loadAudit() {

    const data =
        await apiRequest(
            "/api/audit",
            {
                method:
                    "GET",

                headers:
                    authHeaders(
                        false
                    )
            }
        );

    const tbody =
        document.querySelector(
            "#auditTable tbody"
        );

    if (!tbody) {
        return;
    }

    tbody.innerHTML =
        "";

    data.forEach(
        item => {

            tbody.innerHTML += `

                <tr>

                    <td>
                        ${escapeHtml(
                            item.descricao
                            ??
                            item.action
                            ??
                            "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            item.userId
                            ??
                            "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            item.documentId
                            ??
                            "-"
                        )}
                    </td>

                    <td>
                        ${formatDate(
                            item.createdAt
                        )}
                    </td>

                </tr>

            `;
        }
    );
}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(
    text
) {

    return String(
        text ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}