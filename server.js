const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";
const ADMIN_USER = process.env.ADMIN_USER || "evsu1093";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "evsu1093";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

if (isProduction) {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "evsu1093") {
    console.error("Refusing to start: set a unique ADMIN_PASSWORD environment variable.");
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 12) {
    console.error("Refusing to start: ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }
  if (!process.env.SESSION_SECRET) {
    console.error("Refusing to start: set SESSION_SECRET so admin sessions stay valid after restart.");
    process.exit(1);
  }
}

const DATA_DIR =
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "messages.json");
const MAX_MESSAGE_LENGTH = 10000;
const MAX_NICKNAME_LENGTH = 40;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ messages: [] }, null, 2));
  }
}

function readMessages() {
  ensureStore();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

function writeMessages(messages) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify({ messages }, null, 2));
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: "Admin login required." });
}

function requireSameOrigin(req, res, next) {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    return next();
  }

  const originHeader = req.get("origin") || req.get("referer");
  if (!originHeader) {
    return res.status(403).json({ error: "Missing origin." });
  }

  try {
    const originHost = new URL(originHeader).host;
    if (originHost !== req.get("host")) {
      return res.status(403).json({ error: "Cross-origin requests are blocked." });
    }
  } catch {
    return res.status(403).json({ error: "Invalid origin." });
  }

  return next();
}

function requireMessageId(req, res, next) {
  if (!UUID_PATTERN.test(req.params.id || "")) {
    return res.status(400).json({ error: "Invalid message id." });
  }
  return next();
}

const app = express();
app.disable("x-powered-by");

if (isProduction || process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);
app.use(express.json({ limit: "64kb" }));
app.use(requireSameOrigin);
app.use(
  session({
    name: "evsu.admin.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait and try again." },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in a few minutes." },
});
const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 4,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "You are sending notes too quickly. Please wait a bit." },
});
const POST_COOLDOWN_MS = 45 * 1000;
const recentPosts = new Map();

app.use(generalLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/messages", (_req, res) => {
  const approved = readMessages()
    .filter((message) => message.status === "approved")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(({ id, nickname, body, createdAt }) => ({
      id,
      nickname,
      body,
      createdAt,
    }));
  res.json({ messages: approved });
});

app.post("/api/messages", postLimiter, (req, res) => {
  const nickname = sanitizeText(req.body?.nickname, MAX_NICKNAME_LENGTH) || "Anonymous";
  const body = sanitizeText(req.body?.body, MAX_MESSAGE_LENGTH);

  if (body.length < 8) {
    return res.status(400).json({ error: "Write a little more — at least 8 characters." });
  }

  const poster = req.ip || "unknown";
  const now = Date.now();
  const previous = recentPosts.get(poster);
  if (previous && now - previous.at < POST_COOLDOWN_MS) {
    const seconds = Math.ceil((POST_COOLDOWN_MS - (now - previous.at)) / 1000);
    return res.status(429).json({
      error: `Please wait ${seconds} seconds before sending another note.`,
    });
  }

  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  if (previous && previous.bodyHash === bodyHash && now - previous.at < 15 * 60 * 1000) {
    return res.status(429).json({ error: "That note was already sent." });
  }

  const messages = readMessages();
  const message = {
    id: crypto.randomUUID(),
    nickname,
    body,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  writeMessages(messages);
  recentPosts.set(poster, { at: now, bodyHash });
  if (recentPosts.size > 2000) {
    for (const [key, value] of recentPosts) {
      if (now - value.at > 15 * 60 * 1000) {
        recentPosts.delete(key);
      }
    }
  }

  res.status(201).json({
    ok: true,
    message: "Your note was sent. An admin will review it before it goes on the wall.",
  });
});

app.get("/api/admin/session", (req, res) => {
  res.json({ authenticated: Boolean(req.session && req.session.authenticated) });
});

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const userOk = safeEqual(username, ADMIN_USER);
  const passOk = safeEqual(password, ADMIN_PASSWORD);

  if (!userOk || !passOk) {
    return res.status(401).json({ error: "Wrong username or password." });
  }

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: "Could not start admin session." });
    }
    req.session.authenticated = true;
    req.session.username = ADMIN_USER;
    req.session.save((saveErr) => {
      if (saveErr) {
        return res.status(500).json({ error: "Could not start admin session." });
      }
      res.json({ ok: true });
    });
  });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("evsu.admin.sid");
    res.json({ ok: true });
  });
});

app.get("/api/admin/messages", requireAdmin, (_req, res) => {
  const messages = readMessages().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const counts = messages.reduce(
    (acc, message) => {
      acc.total += 1;
      acc[message.status] = (acc[message.status] || 0) + 1;
      return acc;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 }
  );
  res.json({ messages, counts });
});

app.patch("/api/admin/messages/:id", requireAdmin, requireMessageId, (req, res) => {
  const allowed = ["approved", "rejected", "pending"];
  const status = req.body?.status;
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Status must be approved, rejected, or pending." });
  }

  const messages = readMessages();
  const index = messages.findIndex((message) => message.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Message not found." });
  }

  if (messages[index].status === "approved") {
    return res.status(409).json({ error: "Approved messages can only be deleted." });
  }

  messages[index].status = status;
  messages[index].reviewedAt = new Date().toISOString();
  writeMessages(messages);
  res.json({ ok: true, message: messages[index] });
});

app.delete("/api/admin/messages/:id", requireAdmin, requireMessageId, (req, res) => {
  const messages = readMessages();
  const next = messages.filter((message) => message.id !== req.params.id);
  if (next.length === messages.length) {
    return res.status(404).json({ error: "Message not found." });
  }
  writeMessages(next);
  res.json({ ok: true });
});

app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use(express.static(path.join(__dirname, "public")));

app.get("/admin/*", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  ensureStore();
  console.log(`Freedom Wall: http://localhost:${PORT}`);
  console.log(`Admin site:    http://localhost:${PORT}/admin`);
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    console.log("Set ADMIN_USER, ADMIN_PASSWORD, and SESSION_SECRET before deploying.");
  }
});
