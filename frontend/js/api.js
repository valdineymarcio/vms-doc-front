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


    await Promise.all([
        loadDocumentsSelect(
            "sendDocumentId"
        ),

        loadUsersSelect(
            "sendReceiverId"
        )
    ]);
}


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


    try {

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


        if (msg) {

            msg.innerText =
                "Documento enviado com sucesso.";
        }


    } catch (error) {

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

    const transfers =
        await apiRequest(
            "/api/transfers/inbox",
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


    if (!tbody) {
        return;
    }


    tbody.innerHTML =
        "";


    transfers.forEach(
        item => {

            tbody.innerHTML += `

                <tr>

                    <td>
                        ${escapeHtml(
                            item.documentTitle
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            item.senderName
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

                    </td>

                </tr>

            `;
        }
    );
}


async function previewReceivedTransfer(
    transferId,
    documentId,
    status
) {

    await openEmbeddedViewer({
        mode:
            "view",

        documentId,

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
}


async function prepareTransferSignature(
    transferId,
    documentId
) {

    await openEmbeddedViewer({
        mode:
            "transfer",

        documentId,

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
            "Assinatura do documento recebido"
    });
}


/* =====================================================
   PDF
===================================================== */

async function openEmbeddedViewer(
    config
) {

    embeddedSignState = {
        ...embeddedSignState,
        ...config
    };


    const container =
        document.getElementById(
            config.containerId
        );


    if (!container) {
        return;
    }


    container.innerHTML =
        "";


    let url;


    if (config.transferId) {

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


    const blob =
        await response.blob();


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
        let number = 1;
        number <= pdf.numPages;
        number++
    ) {

        const page =
            await pdf.getPage(
                number
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


        await page.render({
            canvasContext:
                canvas.getContext(
                    "2d"
                ),

            viewport
        }).promise;


        wrapper.appendChild(
            canvas
        );


        container.appendChild(
            wrapper
        );
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