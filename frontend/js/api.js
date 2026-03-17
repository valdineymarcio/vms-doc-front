const API = "http://localhost:8080";
let currentUser = null;

function getToken() {
  return localStorage.getItem("token");
}

function authHeaders(json = true) {
  const headers = {
    Authorization: "Bearer " + getToken()
  };

  if (json) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(API + path, options);

  if (response.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "login.html";
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  if (response.status === 403) {
    throw new Error("Acesso negado.");
  }

  if (!response.ok) {
    let message = "Erro na requisição.";
    try {
      const text = await response.text();
      if (text) message = text;
    } catch (e) {}
    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response;
}

async function fetchCurrentUser() {
  currentUser = await apiRequest("/api/auth/me", {
    method: "GET",
    headers: authHeaders(false)
  });
  return currentUser;
}

async function bootPage(adminOnly = false) {
  const token = getToken();

  if (!token) {
    window.location.href = "login.html";
    return false;
  }

  try {
    await fetchCurrentUser();

    if (adminOnly && currentUser.role !== "ADMIN") {
      alert("Você não tem permissão para acessar esta página.");
      window.location.href = "dashboard.html";
      return false;
    }

    return true;
  } catch (error) {
    console.error(error);
    localStorage.removeItem("token");
    window.location.href = "login.html";
    return false;
  }
}

function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const msg = document.getElementById("msg");

  msg.innerText = "";

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    localStorage.setItem("token", data.token);
    window.location.href = "dashboard.html";
  } catch (error) {
    msg.innerText = "Login inválido.";
    console.error(error);
  }
}

function renderStatus(status) {
  if (status === "SIGNED") return `<span class="status-badge status-signed">ASSINADO</span>`;
  if (status === "READ") return `<span class="status-badge status-read">LIDO</span>`;
  if (status === "SENT") return `<span class="status-badge status-sent">ENVIADO</span>`;
  return `<span class="status-badge status-pending">PENDENTE</span>`;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("pt-BR");
}

/* =========================
   DASHBOARD
========================= */

async function initDashboard() {
  const ok = await bootPage(false);
  if (!ok) return;
  loadDocuments();
}

async function loadDocuments() {
  try {
    const data = await apiRequest("/api/documents", {
      method: "GET",
      headers: authHeaders(false)
    });

    const tbody = document.querySelector("#documentsTable tbody");
    tbody.innerHTML = "";

    data.forEach(doc => {
      tbody.innerHTML += `
        <tr>
          <td>${doc.title}</td>
          <td>${renderStatus(doc.status)}</td>
          <td>${doc.originalFilename ?? "-"}</td>
          <td>${formatDate(doc.createdAt)}</td>
          <td>
            <div class="action-row">
              <button class="btn-secondary small-btn" onclick="downloadDocument('${doc.id}')">Download</button>
              ${currentUser.role === "ADMIN" && doc.status !== "SIGNED"
                ? `<button class="btn-primary small-btn" onclick="window.location.href='sign-document.html?id=${doc.id}'">Assinar</button>
`
                : ""}
            </div>
          </td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}

async function searchDocuments() {
  const title = document.getElementById("search").value.trim();

  try {
    const data = await apiRequest("/api/documents/search?title=" + encodeURIComponent(title), {
      method: "GET",
      headers: authHeaders(false)
    });

    const tbody = document.querySelector("#documentsTable tbody");
    tbody.innerHTML = "";

    data.forEach(doc => {
      tbody.innerHTML += `
        <tr>
          <td>${doc.title}</td>
          <td>${renderStatus(doc.status)}</td>
          <td>${doc.originalFilename ?? "-"}</td>
          <td>${formatDate(doc.createdAt)}</td>
          <td>
            <div class="action-row">
              <button class="btn-secondary small-btn" onclick="downloadDocument('${doc.id}')">Download</button>
              ${currentUser.role === "ADMIN" && doc.status !== "SIGNED"
                ? `<button class="btn-primary small-btn" onclick="window.location.href='sign-document.html?id=${doc.id}'">Assinar</button>
`
                : ""}
            </div>
          </td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}

/* =========================
   UPLOAD
========================= */

async function initUploadPage() {
  const ok = await bootPage(true);
  if (!ok) return;
  loadCategoriesSelect("categoryId");
}

async function uploadDocument() {
  const title = document.getElementById("title").value;
  const description = document.getElementById("description").value;
  const categoryId = document.getElementById("categoryId").value;
  const file = document.getElementById("file").files[0];
  const msg = document.getElementById("msg");

  msg.innerText = "";

  try {
    const form = new FormData();
    form.append("title", title);
    form.append("description", description);
    if (categoryId) form.append("categoryId", categoryId);
    form.append("file", file);

    await apiRequest("/api/documents", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + getToken()
      },
      body: form
    });

    msg.innerText = "Documento enviado com sucesso.";
  } catch (error) {
    msg.innerText = "Erro ao enviar documento.";
    console.error(error);
  }
}

/* =========================
   CATEGORIES
========================= */

async function initCategoriesPage() {
  const ok = await bootPage(false);
  if (!ok) return;

  loadCategories();

  const formCard = document.getElementById("categoryFormCard");
  if (formCard && currentUser.role !== "ADMIN") {
    formCard.style.display = "none";
  }
}

async function loadCategories() {
  try {
    const data = await apiRequest("/api/categories", {
      method: "GET",
      headers: authHeaders(false)
    });

    const tbody = document.querySelector("#categoriesTable tbody");
    tbody.innerHTML = "";

    data.forEach(cat => {
      tbody.innerHTML += `
        <tr>
          <td>${cat.name}</td>
          <td>${cat.description ?? "-"}</td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}

async function createCategory() {
  const name = document.getElementById("categoryName").value;
  const description = document.getElementById("categoryDescription").value;
  const msg = document.getElementById("categoryMsg");

  msg.innerText = "";

  try {
    await apiRequest("/api/categories", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ name, description })
    });

    msg.innerText = "Categoria cadastrada com sucesso.";
    loadCategories();
  } catch (error) {
    msg.innerText = "Erro ao cadastrar categoria.";
    console.error(error);
  }
}

async function loadCategoriesSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  try {
    const data = await apiRequest("/api/categories", {
      method: "GET",
      headers: authHeaders(false)
    });

    select.innerHTML = `<option value="">Selecione</option>`;
    data.forEach(cat => {
      select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
    });
  } catch (error) {
    console.error(error);
  }
}

/* =========================
   USERS
========================= */

async function initUsersPage() {
  const ok = await bootPage(true);
  if (!ok) return;
  loadUsers();
}

async function createUser() {
  const name = document.getElementById("userName").value;
  const email = document.getElementById("userEmail").value;
  const password = document.getElementById("userPassword").value;
  const role = document.getElementById("userRole").value;
  const msg = document.getElementById("userMsg");

  msg.innerText = "";

  try {
    await apiRequest("/api/users", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ name, email, password, role })
    });

    msg.innerText = "Usuário cadastrado com sucesso.";
    loadUsers();
  } catch (error) {
    msg.innerText = "Erro ao cadastrar usuário.";
    console.error(error);
  }
}

async function loadUsers() {
  try {
    const data = await apiRequest("/api/users", {
      method: "GET",
      headers: authHeaders(false)
    });

    const tbody = document.querySelector("#usersTable tbody");
    tbody.innerHTML = "";

    data.forEach(user => {
      tbody.innerHTML += `
        <tr>
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td>${user.role}</td>
          <td>${user.active ? "Ativo" : "Inativo"}</td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadUsersSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  try {
    const data = await apiRequest("/api/users", {
      method: "GET",
      headers: authHeaders(false)
    });

    select.innerHTML = `<option value="">Selecione</option>`;
    data.forEach(user => {
      select.innerHTML += `<option value="${user.id}">${user.name} - ${user.email}</option>`;
    });
  } catch (error) {
    console.error(error);
  }
}

/* =========================
   DOCUMENT ACTIONS
========================= */

async function downloadDocument(id) {
  try {
    const response = await fetch(API + `/api/documents/${id}/download`, {
      headers: authHeaders(false)
    });

    if (!response.ok) throw new Error("Erro ao baixar documento.");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const disposition = response.headers.get("Content-Disposition");
    let filename = "documento";
    if (disposition && disposition.includes("filename=")) {
      filename = disposition.split("filename=")[1].replace(/"/g, "");
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
  }
}

async function signDocument(id) {
  try {
    await apiRequest(`/api/documents/${id}/sign`, {
      method: "PATCH",
      headers: authHeaders(false)
    });

    loadDocuments();
  } catch (error) {
    console.error(error);
  }
}

async function loadDocumentsSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  try {
    const data = await apiRequest("/api/documents", {
      method: "GET",
      headers: authHeaders(false)
    });

    select.innerHTML = `<option value="">Selecione</option>`;
    data.forEach(doc => {
      select.innerHTML += `<option value="${doc.id}">${doc.title}</option>`;
    });
  } catch (error) {
    console.error(error);
  }
}

/* =========================
   SEND / TRANSFER
========================= */

async function initSendPage() {
  const ok = await bootPage(true);
  if (!ok) return;

  loadDocumentsSelect("sendDocumentId");
  loadUsersSelect("sendReceiverId");
}

async function sendDocumentToUser() {
  const documentId = document.getElementById("sendDocumentId").value;
  const receiverId = document.getElementById("sendReceiverId").value;
  const msg = document.getElementById("sendMsg");

  msg.innerText = "";

  try {
    await apiRequest(`/api/documents/${documentId}/send`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ receiverId })
    });

    msg.innerText = "Documento encaminhado com sucesso.";
  } catch (error) {
    msg.innerText = "Erro ao encaminhar documento.";
    console.error(error);
  }
}

/* =========================
   INBOX
========================= */

async function initInboxPage() {
  const ok = await bootPage(false);
  if (!ok) return;
  loadInbox();
}

async function loadInbox() {
  try {
    const data = await apiRequest("/api/transfers/inbox", {
      method: "GET",
      headers: authHeaders(false)
    });

    const tbody = document.querySelector("#inboxTable tbody");
    tbody.innerHTML = "";

    data.forEach(item => {
      tbody.innerHTML += `
        <tr>
          <td>${item.documentTitle}</td>
          <td>${item.senderName}</td>
          <td>${renderStatus(item.status)}</td>
          <td>${formatDate(item.sentAt)}</td>
          <td>${item.readAt ? formatDate(item.readAt) : "-"}</td>
          <td>
            ${item.status !== "READ"
              ? `<button class="btn-primary small-btn" onclick="markTransferAsRead('${item.id}')">Marcar como lido</button>`
              : "-"}
          </td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}

async function markTransferAsRead(id) {
  try {
    await apiRequest(`/api/transfers/${id}/read`, {
      method: "PATCH",
      headers: authHeaders(false)
    });

    loadInbox();
  } catch (error) {
    console.error(error);
  }
}

/* =========================
   AUDIT
========================= */

async function initAuditPage() {
  const ok = await bootPage(true);
  if (!ok) return;
  loadAudit();
}

async function loadAudit() {
  try {
    const data = await apiRequest("/api/audit", {
      method: "GET",
      headers: authHeaders(false)
    });

    const tbody = document.querySelector("#auditTable tbody");
    tbody.innerHTML = "";

    data.forEach(item => {
      tbody.innerHTML += `
        <tr>
          <td>${item.action}</td>
          <td>${item.userId ?? "-"}</td>
          <td>${item.documentId ?? "-"}</td>
          <td>${formatDate(item.createdAt)}</td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}
/* =========================
   FOLDERS / DOCUMENTS BY CATEGORY
========================= */

async function initFoldersPage() {
  const ok = await bootPage(false);
  if (!ok) return;
  loadFolders();
}

async function loadFolders() {
  try {
    const categories = await apiRequest("/api/categories", {
      method: "GET",
      headers: authHeaders(false)
    });

    const grid = document.getElementById("foldersGrid");
    grid.innerHTML = "";

    if (!categories.length) {
      grid.innerHTML = `<p class="muted-text">Nenhuma categoria cadastrada.</p>`;
      return;
    }

    categories.forEach(category => {
      grid.innerHTML += `
        <div class="folder-card" onclick="loadDocumentsByCategory('${category.id}', '${escapeHtml(category.name)}', '${escapeHtml(category.description ?? "")}')">
          <div class="folder-icon">📁</div>
          <h4>${category.name}</h4>
          <p>${category.description ?? "Sem descrição"}</p>
        </div>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadDocumentsByCategory(categoryId, categoryName, categoryDescription) {
  try {
    const data = await apiRequest(`/api/documents/search?categoryId=${categoryId}`, {
      method: "GET",
      headers: authHeaders(false)
    });

    document.getElementById("folderDocumentsSection").style.display = "block";
    document.getElementById("selectedCategoryTitle").innerText = `Pasta: ${categoryName}`;
    document.getElementById("selectedCategoryDescription").innerText = categoryDescription || "Sem descrição";

    const tbody = document.querySelector("#categoryDocumentsTable tbody");
    tbody.innerHTML = "";

    if (!data.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">Nenhum documento encontrado nesta categoria.</td>
        </tr>
      `;
      return;
    }

    data.forEach(doc => {
      tbody.innerHTML += `
        <tr>
          <td>${doc.title}</td>
          <td>${renderStatus(doc.status)}</td>
          <td>${doc.originalFilename ?? "-"}</td>
          <td>${formatDate(doc.createdAt)}</td>
          <td>
            <div class="action-row">
              <button class="btn-secondary small-btn" onclick="downloadDocument('${doc.id}')">Download</button>
              ${currentUser && currentUser.role === "ADMIN" && doc.status !== "SIGNED"
                ? `<button class="btn-primary small-btn" onclick="signDocument('${doc.id}')">Assinar</button>`
                : ""}
            </div>
          </td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
let signDocumentId = null;
let signSelectedPage = 1;
let signSelectedX = null;
let signSelectedY = null;
let signPreviewElement = null;

async function initSignPage() {
  const ok = await bootPage(true);
  if (!ok) return;

  const params = new URLSearchParams(window.location.search);
  signDocumentId = params.get("id");

  if (!signDocumentId) {
    alert("Documento não informado.");
    window.location.href = "dashboard.html";
    return;
  }

  await renderPdfForSigning(signDocumentId);
}

async function renderPdfForSigning(documentId) {
  const response = await fetch(API + `/api/documents/${documentId}/download`, {
    headers: authHeaders(false)
  });

  if (!response.ok) {
    alert("Erro ao carregar PDF.");
    return;
  }

  const blob = await response.blob();
  const pdfData = await blob.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const container = document.getElementById("pdfContainer");
  container.innerHTML = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.4 });

    const wrapper = document.createElement("div");
    wrapper.className = "pdf-page-wrapper";

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page-canvas";
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    canvas.addEventListener("click", async (event) => {
      if (!currentUser) {
        await fetchCurrentUser();
      }

      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      signSelectedPage = pageNum;
      signSelectedX = clickX;
      signSelectedY = canvas.height - clickY - 70;

      if (signPreviewElement) {
        signPreviewElement.remove();
      }

      signPreviewElement = document.createElement("div");
      signPreviewElement.className = "signature-preview";
      signPreviewElement.style.left = `${clickX}px`;
      signPreviewElement.style.top = `${clickY}px`;

      const now = new Date().toLocaleString("pt-BR");

      signPreviewElement.innerHTML = `
        <strong>DOCUMENTO ASSINADO</strong><br>
        Nome: ${currentUser.name}<br>
        Perfil: ${currentUser.role}<br>
        Data/Hora: ${now}
      `;

      wrapper.appendChild(signPreviewElement);

      document.getElementById("signInfo").innerText =
        `Assinatura selecionada na página ${pageNum}.`;
    });

    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
  }
}

async function confirmSignature() {
  if (!signDocumentId || signSelectedX === null || signSelectedY === null) {
    alert("Selecione um local no documento para assinar.");
    return;
  }

  try {
    await apiRequest(`/api/documents/${signDocumentId}/sign-positioned`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({
        page: signSelectedPage,
        x: signSelectedX,
        y: signSelectedY
      })
    });

    alert("Documento assinado com sucesso.");
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error(error);
    alert("Erro ao assinar documento.");
  }
}
