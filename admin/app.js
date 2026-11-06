const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
const countsEl = document.getElementById("counts");
const queueEl = document.getElementById("queue");
const deleteDialog = document.getElementById("delete-dialog");
const deletePreview = document.getElementById("delete-preview");

let currentFilter = "pending";
let cache = { messages: [], counts: { total: 0, pending: 0, approved: 0, rejected: 0 } };

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

function actionButtons(message) {
  const id = message.id;
  if (message.status === "approved") {
    return `<button data-action="delete" data-id="${id}" class="delete">Delete</button>`;
  }

  return `
    <button data-action="approved" data-id="${id}" class="approve">Approve</button>
    <button data-action="rejected" data-id="${id}" class="reject">Reject</button>
    <button data-action="delete" data-id="${id}" class="delete">Delete</button>
  `;
}

function showDashboard(show) {
  loginView.classList.toggle("hidden", show);
  dashboardView.classList.toggle("hidden", !show);
}

async function checkSession() {
  const response = await fetch("/api/admin/session", { credentials: "same-origin" });
  const data = await response.json();
  if (data.authenticated) {
    showDashboard(true);
    await refresh();
  }
}

async function refresh() {
  const response = await fetch("/api/admin/messages", { credentials: "same-origin" });
  if (response.status === 401) {
    showDashboard(false);
    return;
  }
  cache = await response.json();
  render();
}

function render() {
  const { counts, messages } = cache;
  countsEl.innerHTML = `
    <article><span>Total</span><strong>${counts.total || 0}</strong></article>
    <article><span>Pending</span><strong>${counts.pending || 0}</strong></article>
    <article><span>Approved</span><strong>${counts.approved || 0}</strong></article>
    <article><span>Rejected</span><strong>${counts.rejected || 0}</strong></article>
  `;

  const filtered =
    currentFilter === "all" ? messages : messages.filter((item) => item.status === currentFilter);

  if (!filtered.length) {
    queueEl.innerHTML = `<p class="empty">No ${currentFilter === "all" ? "" : currentFilter + " "}messages yet.</p>`;
    return;
  }

  queueEl.innerHTML = filtered
    .map(
      (message) => `
      <article class="card">
        <div class="card-top">
          <div>
            <strong>${escapeHtml(message.nickname)}</strong>
            <div class="meta">${formatDate(message.createdAt)}</div>
          </div>
          <span class="badge ${escapeHtml(message.status)}">${escapeHtml(message.status)}</span>
        </div>
        <p>${escapeHtml(message.body)}</p>
        <div class="actions">${actionButtons(message)}</div>
      </article>
    `
    )
    .join("");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.className = "status";
  loginStatus.textContent = "Checking…";
  const response = await fetch("/api/admin/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: document.getElementById("username").value,
      password: document.getElementById("password").value,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    loginStatus.className = "status err";
    loginStatus.textContent = data.error || "Login failed.";
    return;
  }
  loginStatus.textContent = "";
  showDashboard(true);
  await refresh();
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
  showDashboard(false);
});

document.querySelector(".toolbar").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  currentFilter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  render();
});

let pendingDeleteId = null;

function askToDelete(id) {
  const message = cache.messages.find((item) => item.id === id);
  pendingDeleteId = id;
  const preview = message ? `${message.nickname}: ${message.body}` : "This note";
  deletePreview.textContent = preview.length > 220 ? `${preview.slice(0, 217)}…` : preview;
  deleteDialog.returnValue = "";
  deleteDialog.showModal();
}

deleteDialog.addEventListener("close", async () => {
  const id = pendingDeleteId;
  const confirmed = deleteDialog.returnValue === "delete";
  pendingDeleteId = null;
  if (!confirmed || !id) return;
  await fetch(`/api/admin/messages/${id}`, { method: "DELETE", credentials: "same-origin" });
  await refresh();
});

queueEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const { id, action } = button.dataset;
  if (action === "delete") {
    askToDelete(id);
    return;
  }
  await fetch(`/api/admin/messages/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: action }),
  });
  await refresh();
});

checkSession();
