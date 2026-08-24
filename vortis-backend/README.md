# Vortis Backend — Render Deployment

This is your `handler.js` rewritten as a standalone Express server (`server.js`).
Same logic, same routes, same fallback chains — just running as a persistent
process instead of a Vercel serverless function, so there's no 60s/300s
timeout wall anymore.

**Tested locally** — boots clean, `/health` and `/` respond correctly.

---

## 1. What changed vs. the Vercel version

- `export default function handler(req, res)` → `app.post('/api/handler', ...)`
- Removed `export const config = { maxDuration: 60, ... }` — doesn't exist outside Vercel, and isn't needed since Render doesn't impose a function timeout
- Body size limit now set via `express.json({ limit: '5mb' })` instead of Vercel's `bodyParser`
- Added a `/health` route (Render uses this to confirm your service is alive) and a `/` root route
- `app.set('trust proxy', true)` added so `x-forwarded-for` still resolves the real client IP behind Render's proxy
- The code-chat NVIDIA stream no longer needs the 55-second "stay under Vercel's cap" ceiling — bumped to a generous 280s dead-connection guard instead
- Everything else — Groq/NVIDIA/Cloudflare fallback chains, rate limiting, search, vision, TTS, image gen, memory — is untouched logic, just moved into one Express route

## 2. Frontend change required

Your frontend currently calls something like:
```
https://your-vercel-app.vercel.app/api/handler
```
Once deployed, point it at:
```
https://<your-render-service>.onrender.com/api/handler
```
That's the only endpoint — same path, same request/response shape, same SSE streaming format. No other frontend code should need to change.

## 3. Push this to GitHub

```bash
cd api-server
git init
git add .
git commit -m "Express backend for Render"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```
(`.env` is already in `.gitignore` — never commit real keys.)

## 4. Create the Render service

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
2. Connect your GitHub repo (authorize Render if it's your first time)
3. Fill in:
   - **Name:** `vortis-backend` (or whatever you like)
   - **Region:** closest to your users
   - **Branch:** `main`
   - **Root Directory:** `api-server` (only if this folder isn't your repo root — leave blank if it is)
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (or Starter $7/mo if you want to skip cold starts)

## 5. Add environment variables

In the Render dashboard, on the same service: **Environment** tab → **Add Environment Variable**. Add every key from `.env.example`:

| Key | Value |
|---|---|
| `ALLOWED_ORIGINS` | your frontend URL, e.g. `https://vortis-ai.vercel.app` |
| `FIREBASE_SERVICE_ACCOUNT` | the full service account JSON, **as one single-line string** |
| `GROQ_API_KEY` | from console.groq.com |
| `NVIDIA_API_KEY` | from build.nvidia.com |
| `CLOUDFLARE_API_TOKEN` | Workers AI token |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account ID |
| `TAVILY_API_KEY` | tavily.com |
| `SERPER_API_KEY` | serper.dev |
| `WORKER_SECRET` | your Flux worker's shared secret |

`PORT` — don't set this one. Render injects it automatically and `server.js` already reads `process.env.PORT`.

**Tip for the Firebase JSON:** open the service account file, then run this to collapse it to one line before pasting into Render:
```bash
node -e "console.log(JSON.stringify(require('./your-service-account.json')))"
```

## 6. Deploy

Click **Create Web Service**. Render will pull the repo, run `npm install`, then `npm start`. Watch the logs — you're looking for:
```
Vortis backend listening on port 10000
```
(Render assigns its own internal port via `$PORT` — that's expected and fine.)

## 7. Verify it's live

```bash
curl https://<your-render-service>.onrender.com/health
# → {"status":"ok"}
```

Then test the real endpoint with a valid Firebase ID token:
```bash
curl -N -X POST https://<your-render-service>.onrender.com/api/handler \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <firebase-id-token>" \
  -d '{"action":"chat","prompt":"You are a helpful assistant.","history":[{"role":"user","content":"write a 200 line python script that sorts a list"}]}'
```
You should see `data: {"content":"..."}` lines streaming in continuously — including past whatever point used to cut off on Vercel.

## 8. Point your frontend at it, then done

Update the API base URL in your frontend to the Render URL from step 6, redeploy the frontend (still on Vercel — no reason to move that), and you're fully off the 60-second wall.

## Free tier note

Render's free web services spin down after 15 minutes idle and take 30-50s to wake on the next request. If that first-message delay bothers users, flip the Instance Type to **Starter ($7/mo)** in the Render dashboard — no code changes needed, it just stays warm.
