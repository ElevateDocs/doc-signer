# Document Signer

A simple, self-hosted alternative to DocuSign: upload a document (or just the pages you need), tap to place signature boxes, and get a link. Send that link to your client any way you like — email, text, WhatsApp. They open it on their phone, no account or app install required, sign with their finger, and it's submitted straight back into your dashboard.

- **You** use `/new` to prepare a document and `/` (the dashboard) to check on things and download signed files. Both are password-protected.
- **Your client** only ever sees the `/sign/<id>` link you send them. No login for them.

---

## 1. Get a free database (MongoDB Atlas)

The app needs somewhere to store documents so they survive server restarts.

1. Go to [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. Create a new project, then build a database — choose the **free "M0" cluster**.
3. When prompted, create a database user (username + password) — save these, you'll need them.
4. Under **Network Access**, add IP address `0.0.0.0/0` (allow access from anywhere) — this is what lets your hosted app connect from Render.
5. Click **Connect** on your cluster → **Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<username>` and `<password>` with your actual database user credentials, and add a database name before the `?`, e.g. `.../docsigner?retryWrites=true...`. Keep this string handy — it's your `MONGODB_URI`.

## 2. Put this code on GitHub

Render deploys from a Git repository.

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Create a new **empty** repository (e.g. `doc-signer`).
3. Upload this entire folder to that repository (GitHub's web UI lets you drag-and-drop files if you'd rather not use the command line — use "Add file → Upload files").

## 3. Deploy on Render (free)

1. Go to [render.com](https://render.com) and sign up (free, no credit card required).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account and select the repository you just created.
4. Render should auto-detect Node.js. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Under **Environment Variables**, add:
   - `MONGODB_URI` → the connection string from step 1
   - `DASHBOARD_USER` → a username only you know
   - `DASHBOARD_PASSWORD` → a strong password only you know
6. Click **Create Web Service**. After a minute or two you'll get a live URL like `https://doc-signer-xxxx.onrender.com`.

That URL *is* your app. Visit it and log in with the `DASHBOARD_USER`/`DASHBOARD_PASSWORD` you set — that's your dashboard.

### Important limitation on the free plan

Render's free tier spins your app down after 15 minutes of no traffic, and wakes it back up (takes ~30-60 seconds) on the next visit. This is just a cold start — your stored documents are safe in MongoDB Atlas, not on Render's disk, so nothing is lost. The only visible effect is that the *first* time you or your client open a link after a period of inactivity, the page takes a little longer to load. If that delay bothers you, Render's paid "Starter" tier ($7/mo) keeps it always warm.

---

## 4. How to use it

### Sending a document

1. Go to `https://your-app.onrender.com/new` and log in.
2. Upload a PDF or image.
3. Uncheck any pages you don't want to send — you can send just part of a document.
4. Click **"➕ Place signature box"**, then tap on the page(s) wherever you need a signature. Drag a box to reposition it, tap the × to remove it. Add as many boxes (even across multiple pages) as you need.
5. Fill in your name and an optional message, then click **Create Signing Link**.
6. Copy the link or click **Email this link** to open it in your email app, ready to send.

### What your client sees

They open the link on their phone, read your message, tap each highlighted box, and either draw their signature with a finger or type their name (rendered in a signature-style font). Once every box is signed, they tap **Complete & Send Back** — the signed document is submitted automatically, and they can also download or share a copy for themselves.

### Checking on things

Visit `/` (your dashboard) any time to see every document you've sent, its status (Pending / Signed), and to download the signed copy.

---

## Limits & notes

- **File size:** keep original documents under ~5MB. This keeps things fast and comfortably under MongoDB's free-tier storage.
- **File types:** PDF, JPG, and PNG.
- **Security:** the dashboard and "new document" page are protected by the username/password you set in Render's environment variables — don't share those, and don't reuse a password from elsewhere. The `/sign/<id>` links are unguessable but not expiring; delete a document from your dashboard once you no longer need its link to be valid.
- **This isn't a legal e-signature service.** It doesn't provide the certified audit trail, identity verification, or legal certifications that DocuSign/Adobe Sign offer. It's a lightweight, private tool for everyday documents (forms, internal agreements, simple contracts) where a basic signature is enough. For anything requiring legally certified e-signatures, use a licensed provider.

## Running locally (optional, for testing before you deploy)

```
cp .env.example .env
# edit .env and fill in MONGODB_URI, DASHBOARD_USER, DASHBOARD_PASSWORD
npm install
npm start
```

Then visit `http://localhost:3000`.
