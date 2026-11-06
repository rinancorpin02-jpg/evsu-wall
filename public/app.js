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

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

bodyInput.addEventListener("input", () => {
  charCount.textContent = `${bodyInput.value.length} / 10000`;
});

async function loadNotes() {
  const response = await fetch("/api/messages");
  const data = await response.json();
  const messages = data.messages || [];

  if (!messages.length) {
    notesEl.innerHTML =
      '<p class="empty">The wall is still empty. Send a note and wait for an admin to pin it up.</p>';
    return;
  }

  notesEl.innerHTML = messages
    .map((message, index) => {
      const tilt = ((index % 5) - 2) * 1.2;
      return `
        <article style="--tilt: ${tilt}deg">
          <div class="meta">
            <span>${escapeHtml(message.nickname)}</span>
            <span>${formatDate(message.createdAt)}</span>
          </div>
          <p>${escapeHtml(message.body)}</p>
        </article>
      `;
    })
    .join("");
}

const sendButton = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sendButton.disabled) return;
  sendButton.disabled = true;
  statusEl.className = "status";
  statusEl.textContent = "Sending…";

  const payload = {
    nickname: document.getElementById("nickname").value,
    body: bodyInput.value,
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
    charCount.textContent = "0 / 10000";
    statusEl.className = "status";
    statusEl.textContent = "";
    showSentModal();
  } catch (error) {
    statusEl.className = "status err";
    statusEl.textContent = error.message;
  } finally {
    window.setTimeout(() => {
      sendButton.disabled = false;
    }, 3000);
  }
});

loadNotes().catch(() => {
  notesEl.innerHTML = '<p class="empty">Could not load the wall right now.</p>';
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

const scrollHint = document.getElementById("scroll-hint");
const approvedNotes = document.getElementById("approved-notes");

if (scrollHint && approvedNotes && "IntersectionObserver" in window) {
  const noteWatcher = new IntersectionObserver(
    ([entry]) => {
      scrollHint.classList.toggle("is-hidden", entry.isIntersecting);
    },
    { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
  );
  noteWatcher.observe(approvedNotes);
}
