# Deploy EVSU Freedom Wall on Railway

This app is a Node.js Express server. It needs a host that keeps the process running and can store `messages.json` on disk. Railway is the best match. Vercel and Netlify are not a good fit.

Railway’s Free plan currently includes a small monthly credit and a 0.5 GB volume. That is enough for a campus wall if traffic stays light. Always-on use may exceed the free credit; Hobby is the next step.

---

## What you will have when you finish

| URL | What it is |
| --- | --- |
| `https://your-app.up.railway.app/` | Public Freedom Wall |
| `https://your-app.up.railway.app/admin` | Admin review (login required) |

Notes stay after redeploys only if you attach a **volume**. Admin logins reset after a redeploy (sessions are in memory).

---

## Before you start

You need:

- A [GitHub](https://github.com) account
- A [Railway](https://railway.com) account (GitHub login is easiest)
- This project folder on your computer
- A strong admin password (at least **12 characters**, not `evsu1093`)

Do **not** put the real password in the code or in Git.

---

## Part 1 — Put the project on GitHub

Railway deploys from Git.

### 1. Confirm Git is available

Open PowerShell in `C:\EVSU Freedom Wall` and run:

```powershell
git --version
```

If that fails, install Git from https://git-scm.com/download/win and try again.

### 2. Create a GitHub repository

1. Go to https://github.com/new
2. Repository name: `evsu-freedom-wall` (or similar)
3. Keep it **Private** if only your team should see the source
4. Do **not** add a README, `.gitignore`, or license (this folder already has files)
5. Click **Create repository**

### 3. Push this folder

In PowerShell, from `C:\EVSU Freedom Wall`:

```powershell
git init
git add .
git status
```

Confirm `.env` and `data/` are **not** listed. Then:

```powershell
git commit -m "Prepare Freedom Wall for Railway"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/evsu-freedom-wall.git
git push -u origin main
```

Replace `YOUR_USERNAME` and the repo name with yours.

If GitHub asks you to sign in, use a personal access token or GitHub Desktop, not your account password.

---

## Part 2 — Create the Railway project

1. Open https://railway.com and sign in
2. Click **New project**
3. Choose **Deploy from GitHub repo**
4. Authorize Railway if GitHub asks
5. Select `evsu-freedom-wall`
6. Wait for the first build

The first deploy will likely **crash**. That is expected. Production mode refuses to start until you set `ADMIN_PASSWORD` and `SESSION_SECRET`.

---

## Part 3 — Environment variables

Open the service → **Variables** → add these. Railway already sets `PORT`. You still need:

| Variable | Required | What to put |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` |
| `ADMIN_USER` | Yes | Your admin username |
| `ADMIN_PASSWORD` | Yes | 12+ characters, unique, not `evsu1093` |
| `SESSION_SECRET` | Yes | A long random string (see below) |

Optional:

| Variable | When to use |
| --- | --- |
| `DATA_DIR` | Only if you mount the volume somewhere other than `/app/data` |

### Generate `SESSION_SECRET` (PowerShell)

```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

Copy the output into Railway. Do not reuse the admin password.

After saving variables, Railway should redeploy on its own. If it does not, open **Deployments** and click **Redeploy**.

---

## Part 4 — Persistent storage (do not skip)

Without a volume, every deploy or restart **wipes the wall**.

1. Open the same service
2. Click **+ New** / **Volume** (or **Add volume** in the service settings)
3. Set the **mount path** to:

```text
/app/data
```

4. Save and wait for the service to restart

Why `/app/data`: Railway puts the app in `/app`. This project writes notes to `./data`. Mounting `/app/data` keeps `messages.json` on the volume. The app also reads `RAILWAY_VOLUME_MOUNT_PATH` if Railway sets it.

Use **one** replica. Railway volumes do not work with multiple replicas.

---

## Part 5 — Public URL

1. Open the service → **Settings** → **Networking**
2. Click **Generate domain**
3. You get something like `https://evsu-freedom-wall-production.up.railway.app`

Optional health check (Settings → Deploy):

- Path: `/api/health`

Optional custom domain:

1. Add your domain in Networking
2. Create the DNS record Railway shows (usually a CNAME)
3. Wait for HTTPS to become active

---

## Part 6 — Test the live site

1. Open the public URL. You should see the Freedom Wall.
2. Send a short test note. You should get the success modal.
3. Open `/admin` and sign in with `ADMIN_USER` / `ADMIN_PASSWORD`.
4. Approve the test note.
5. Refresh the public page and confirm it appears.
6. Redeploy once (Deployments → Redeploy), then check that the approved note is **still there**. If it vanished, the volume mount is wrong.

---

## Day-to-day use

- Share only the public URL with students.
- Keep `/admin` and the password private.
- A deploy or restart logs you out of admin. Log in again.
- Notes remain if the volume is mounted.
- Spam is limited (cooldown, 4 notes per 15 minutes, duplicate text blocked). Abuse still needs you to reject/delete in admin.

To ship a code change later:

```powershell
git add .
git commit -m "Describe the change"
git push
```

Railway rebuilds from `main` automatically.

---

## If the deploy fails

Open the failed deployment → **View logs**.

| Log / problem | Fix |
| --- | --- |
| `Refusing to start: set a unique ADMIN_PASSWORD` | Set `ADMIN_PASSWORD` (12+ chars, not `evsu1093`) and redeploy |
| `Refusing to start: set SESSION_SECRET` | Set `SESSION_SECRET` and redeploy |
| Application failed to respond | Confirm it listens (this app binds `0.0.0.0` and `PORT`). Generate a domain. |
| Build cannot find `package.json` | The GitHub repo root must be this project folder |
| Notes disappear after redeploy | Add a volume at `/app/data` |
| `Wrong username or password` on `/admin` | Use the Railway variables, not the old local `evsu1093` defaults |
| Rate-limit / IP warnings | Production already sets `trust proxy`. Redeploy the latest code |

---

## What not to use for this app

| Host | Why it is a poor fit |
| --- | --- |
| Vercel / Netlify | Serverless. No lasting disk. Express + JSON file store does not fit. |
| Render free web service | Easy Node host, but it sleeps when idle and does not keep files on the free disk. |
| Fly.io (new accounts) | No lasting free tier for new orgs. |

Railway Free is the closest “this app just runs” option. If the $1 credit is not enough for 24/7 uptime, upgrade to Hobby or expect the service to stop when credit runs out.

---

## Security checklist before you share the link

- [ ] `NODE_ENV` is `production`
- [ ] `ADMIN_PASSWORD` is unique and 12+ characters
- [ ] `SESSION_SECRET` is a long random value
- [ ] Volume is mounted at `/app/data`
- [ ] GitHub repo does not contain `.env` or real passwords
- [ ] You tested `/admin` on the Railway URL, not only on localhost
- [ ] Students only get the public URL, not admin
