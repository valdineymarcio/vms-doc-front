const API = "http://localhost:8080";
let currentUser = null;

if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

let embeddedSignState = {
  mode: null, // "own" | "transfer" | null
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
    throw new Error("Sessão expirada.");
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

async function bootPage(options = {}) {
  const {
    adminOnly = false,
    allowedRoles = []
  } = options;

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

    if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
      alert("Você não tem permissão para acessar esta página.");
      window.location.href = "dashboard.html";
      return false;
    }

    applyRoleVisibility();
    return true;
  } catch (error) {
    console.error(error);
    localStorage.removeItem("token");
    window.location.href = "login.html";
    return false;
  }
}

function applyRoleVisibility() {
  if (!currentUser) return;

  document.querySelectorAll("[data-admin-only]").forEach(el => {
    el.style.display = currentUser.role === "ADMIN" ? "" : "none";
  });

  document.querySelectorAll("[data-user-and-admin]").forEach(el => {
    el.style.display = ["ADMIN", "USER"].includes(currentUser.role) ? "" : "none";
  });
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
  if (status === "RETURNED") return `<span class="status-badge status-returned">DEVOLVIDO</span>`;
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
  const ok = await bootPage({ allowedRoles: ["ADMIN", "USER"] });
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
    if (!tbody) return;
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
    if (!tbody) return;
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
  const ok = await bootPage({ allowedRoles: ["ADMIN", "USER"] });
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
    msg.innerText = error.message || "Erro ao enviar documento.";
    console.error(error);
  }
}

/* =========================
   CATEGORIES
========================= */

async function initCategoriesPage() {
  const ok = await bootPage({ allowedRoles: ["ADMIN", "USER"] });
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
    if (!tbody) return;
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
  const ok = await bootPage({ allowedRoles: ["ADMIN"] });
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
    if (!tbody) return;
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
  const ok = await bootPage({ allowedRoles: ["ADMIN", "USER"] });
  if (!ok) return;

  loadDocumentsSelect("sendDocumentId");
  loadUsersSelect("sendReceiverId");
  clearEmbeddedViewer();
}

async function previewSelectedDocumentForSend() {
  const documentId = document.getElementById("sendDocumentId").value;

  if (!documentId) {
    alert("Selecione um documento.");
    return;
  }

  try {
    await openEmbeddedViewer({
      mode: "view",
      documentId: documentId,
      transferId: null,
      containerId: "embeddedPdfContainer",
      infoId: "sendViewerInfo",
      titleId: "sendViewerTitle",
      buttonId: "confirmOwnSignBtn",
      titleText: "Visualização do documento"
    });
  } catch (error) {
    console.error("Erro ao visualizar documento:", error);
    const info = document.getElementById("sendViewerInfo");
    if (info) info.innerText = "Erro ao carregar documento para visualização.";
  }
}

async function prepareOwnDocumentSignature() {
  const documentId = document.getElementById("sendDocumentId").value;
  if (!documentId) {
    alert("Selecione um documento.");
    return;
  }

  await openEmbeddedViewer({
    mode: "own",
    documentId,
    transferId: null,
    containerId: "embeddedPdfContainer",
    infoId: "sendViewerInfo",
    titleId: "sendViewerTitle",
    buttonId: "confirmOwnSignBtn",
    titleText: "Assinatura do documento"
  });
}

async function sendDocumentToUser() {
  const documentId = document.getElementById("sendDocumentId").value;
  const receiverId = document.getElementById("sendReceiverId").value;
  const msg = document.getElementById("sendMsg");

  msg.innerText = "";

  if (!documentId || !receiverId) {
    msg.innerText = "Selecione documento e destinatário.";
    return;
  }

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
  const ok = await bootPage({ allowedRoles: ["ADMIN", "USER"] });
  if (!ok) return;
  clearEmbeddedViewer();
  loadInbox();
}

async function loadInbox() {
  try {
    const data = await apiRequest("/api/transfers/inbox", {
      method: "GET",
      headers: authHeaders(false)
    });

    const tbody = document.querySelector("#inboxTable tbody");
    if (!tbody) return;
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
            <div class="action-row">
              <button class="btn-secondary small-btn" onclick="previewReceivedTransfer('${item.id}','${item.documentId}','${item.status}')">Visualizar</button>
              ${(item.status === "SENT" || item.status === "READ")
                ? `<button class="btn-primary small-btn" onclick="prepareTransferSignature('${item.id}','${item.documentId}')">Assinar</button>`
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

async function previewReceivedTransfer(transferId, documentId, status) {
  try {
    if (status === "SENT") {
      await apiRequest(`/api/transfers/${transferId}/read`, {
        method: "PATCH",
        headers: authHeaders(false)
      });
      loadInbox();
    }

    await openEmbeddedViewer({
      mode: "view",
      documentId,
      transferId,
      containerId: "embeddedPdfContainer",
      infoId: "viewerInfo",
      titleId: "viewerTitle",
      buttonId: "confirmSignBtn",
      titleText: "Visualização do documento recebido"
    });
  } catch (error) {
    console.error(error);
  }
}

async function prepareTransferSignature(transferId, documentId) {
  await openEmbeddedViewer({
    mode: "transfer",
    documentId,
    transferId,
    containerId: "embeddedPdfContainer",
    infoId: "viewerInfo",
    titleId: "viewerTitle",
    buttonId: "confirmSignBtn",
    titleText: "Assinatura do documento recebido"
  });
}

/* =========================
   EMBEDDED PDF VIEWER / SIGN
========================= */

async function openEmbeddedViewer(config) {
  embeddedSignState.mode = config.mode;
  embeddedSignState.documentId = config.documentId;
  embeddedSignState.transferId = config.transferId;
  embeddedSignState.page = null;
  embeddedSignState.x = null;
  embeddedSignState.y = null;
  embeddedSignState.targetContainerId = config.containerId;
  embeddedSignState.targetInfoId = config.infoId;
  embeddedSignState.targetButtonId = config.buttonId;

  const container = document.getElementById(config.containerId);
  const info = document.getElementById(config.infoId);
  const title = document.getElementById(config.titleId);
  const confirmBtn = document.getElementById(config.buttonId);

  if (!container) {
    throw new Error("Container do PDF não encontrado.");
  }

  container.innerHTML = "";
  if (info) {
    info.innerText = config.mode === "view"
      ? "Carregando documento..."
      : "Clique no ponto exato do documento onde a assinatura deve ser aplicada.";
  }

  if (title) {
    title.innerText = config.titleText;
  }

  if (confirmBtn) {
    confirmBtn.disabled = config.mode === "view";
  }

  const response = await fetch(API + `/api/documents/${config.documentId}/view`, {
    headers: authHeaders(false)
  });

  if (!response.ok) {
    throw new Error("Erro ao carregar documento no endpoint /view.");
  }

  const blob = await response.blob();

  if (!blob.type.includes("pdf")) {
    if (info) {
      info.innerText = "Somente documentos PDF podem ser visualizados nesta área.";
    }
    container.innerHTML = `<p class="muted-text">O arquivo selecionado não é um PDF.</p>`;
    if (confirmBtn) confirmBtn.disabled = true;
    return;
  }

  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF.js não foi carregado.");
  }

  const pdfData = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const scale = 1.4;
    const viewport = page.getViewport({ scale });

    const wrapper = document.createElement("div");
    wrapper.className = "pdf-page-wrapper";

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page-canvas";
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext("2d");

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    if (config.mode !== "view") {
      canvas.addEventListener("click", (event) => {
        handleSignaturePlacement(event, canvas, wrapper, pageNum, scale);
      });
    }

    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
  }

  if (info && config.mode === "view") {
    info.innerText = "Documento carregado com sucesso.";
  }
}

function handleSignaturePlacement(event, canvas, wrapper, pageNum, scale) {
  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  embeddedSignState.page = pageNum;
  embeddedSignState.x = clickX / scale;
  embeddedSignState.y = (canvas.height - clickY) / scale - 72;

  if (embeddedSignState.previewEl) {
    embeddedSignState.previewEl.remove();
  }

  const preview = document.createElement("div");
  preview.className = "signature-preview";
  preview.style.left = `${clickX}px`;
  preview.style.top = `${clickY}px`;

  const now = new Date().toLocaleString("pt-BR");

  preview.innerHTML = `
    <strong>DOCUMENTO ASSINADO</strong><br>
    Nome: ${currentUser.name}<br>
    Perfil: ${currentUser.role}<br>
    Data/Hora: ${now}
  `;

  wrapper.appendChild(preview);
  embeddedSignState.previewEl = preview;

  const info = document.getElementById(embeddedSignState.targetInfoId);
  info.innerText = `Assinatura posicionada na página ${pageNum}. Clique em "Confirmar assinatura".`;

  const confirmBtn = document.getElementById(embeddedSignState.targetButtonId);
  confirmBtn.disabled = false;
}

async function confirmEmbeddedSignature() {
  if (!embeddedSignState.page || embeddedSignState.x === null || embeddedSignState.y === null) {
    alert("Selecione um ponto no documento para assinar.");
    return;
  }

  try {
    if (embeddedSignState.mode === "own") {
      await apiRequest(`/api/documents/${embeddedSignState.documentId}/sign-positioned`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({
          page: embeddedSignState.page,
          x: embeddedSignState.x,
          y: embeddedSignState.y
        })
      });

      alert("Documento assinado com sucesso.");
    }

    if (embeddedSignState.mode === "transfer") {
      await apiRequest(`/api/transfers/${embeddedSignState.transferId}/sign`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({
          page: embeddedSignState.page,
          x: embeddedSignState.x,
          y: embeddedSignState.y
        })
      });

      alert("Documento assinado e devolvido ao remetente com sucesso.");
      loadInbox();
    }

    clearEmbeddedViewer();
  } catch (error) {
    console.error(error);
    alert("Erro ao assinar documento.");
  }
}

function clearEmbeddedViewer() {
  embeddedSignState = {
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

  const container = document.getElementById("embeddedPdfContainer");
  if (container) container.innerHTML = "";

  const info1 = document.getElementById("viewerInfo");
  if (info1) info1.innerText = "Selecione um documento para visualizar.";

  const info2 = document.getElementById("sendViewerInfo");
  if (info2) info2.innerText = "Selecione um documento para visualizar ou assinar.";

  const title1 = document.getElementById("viewerTitle");
  if (title1) title1.innerText = "Visualização do documento";

  const title2 = document.getElementById("sendViewerTitle");
  if (title2) title2.innerText = "Visualização do documento";

  const btn1 = document.getElementById("confirmSignBtn");
  if (btn1) btn1.disabled = true;

  const btn2 = document.getElementById("confirmOwnSignBtn");
  if (btn2) btn2.disabled = true;
}

/* =========================
   AUDIT
========================= */

async function initAuditPage() {
  const ok = await bootPage({ allowedRoles: ["ADMIN"] });
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
    if (!tbody) return;
    tbody.innerHTML = "";

    data.forEach(item => {
      tbody.innerHTML += `
        <tr>
          <td>${item.descricao ?? item.action}</td>
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
   FOLDERS
========================= */

async function initFoldersPage() {
  const ok = await bootPage({ allowedRoles: ["ADMIN", "USER"] });
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
    if (!grid) return;
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