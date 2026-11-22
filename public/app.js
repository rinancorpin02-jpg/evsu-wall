const viewButtons = document.querySelectorAll("[data-switch]");

function setView(view) {
  document.body.dataset.view = view;
  viewButtons.forEach((button) => {
    const on = button.dataset.switch === view;
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-pressed", String(on));
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.switch));
});

const form = document.getElementById("confession-form");
const bodyInput = document.getElementById("body");
const charCount = document.getElementById("char-count");
const statusEl = document.getElementById("form-status");
const notesEl = document.getElementById("notes");
const sentDialog = document.getElementById("sent-dialog");
let sentTimer = 0;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

bodyInput?.addEventListener("input", () => {
  if (charCount) charCount.textContent = `${bodyInput.value.length} / 10000`;
});

async function loadNotes() {
  const response = await fetch("/api/messages");
  const data = await response.json();
  const messages = data.messages || [];

  if (!notesEl) return;

  if (!messages.length) {
    notesEl.innerHTML =
      '<p class="empty">The wall is still empty. Send a note and wait for an admin to pin it up.</p>';
    return;
  }

  notesEl.innerHTML = messages
    .map((message) => {
      const name = escapeHtml(message.nickname);
      const ago = escapeHtml(formatAgo(message.createdAt));
      return `
        <article>
          <p>${escapeHtml(message.body)}</p>
          <div class="note-foot">
            <span>${name} · ${ago}</span>
            <button type="button" class="heart" aria-label="Like" aria-pressed="false">♡</button>
          </div>
        </article>
      `;
    })
    .join("");
}

notesEl?.addEventListener("click", (event) => {
  const heart = event.target.closest(".heart");
  if (!heart) return;
  const liked = heart.getAttribute("aria-pressed") === "true";
  heart.setAttribute("aria-pressed", String(!liked));
  heart.textContent = liked ? "♡" : "♥";
});

const sendButton = form?.querySelector('button[type="submit"]');

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!sendButton || sendButton.disabled) return;
  sendButton.disabled = true;
  if (statusEl) {
    statusEl.className = "status";
    statusEl.textContent = "Sending…";
  }

  const payload = {
    nickname: document.getElementById("nickname")?.value || "",
    body: bodyInput?.value || "",
  };

  try {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not send your note.");
    }
    form.reset();
    if (charCount) charCount.textContent = "0 / 10000";
    if (statusEl) {
      statusEl.className = "status";
      statusEl.textContent = "";
    }
    showSentModal();
  } catch (error) {
    if (statusEl) {
      statusEl.className = "status err";
      statusEl.textContent = error.message;
    }
  } finally {
    window.setTimeout(() => {
      sendButton.disabled = false;
    }, 3000);
  }
});

loadNotes().catch(() => {
  if (notesEl) {
    notesEl.innerHTML = '<p class="empty">Could not load the wall right now.</p>';
  }
});

function showSentModal() {
  if (!sentDialog) return;
  window.clearTimeout(sentTimer);
  document.body.classList.add("modal-open");
  if (!sentDialog.open) {
    sentDialog.showModal();
  }
  sentTimer = window.setTimeout(() => {
    if (sentDialog.open) {
      sentDialog.close();
    }
  }, 3000);
}

sentDialog?.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
  window.clearTimeout(sentTimer);
});
