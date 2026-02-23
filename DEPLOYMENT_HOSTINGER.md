# Hostinger Deployment Checklist – Samir Tutor App

## What You Need Before Deployment

### 1. Local Prerequisites
- [ ] Node.js and npm installed
- [ ] Project builds successfully: `npm run build`
- [ ] `.env` file with required variables (used at build time only)

### 2. Environment Variables (set in `.env` before building)
These are baked into the bundle at build time. Do **not** upload `.env` to the server.

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_HF_API_KEY` | Yes (for AI) | Hugging Face API key for chat/quiz |
| `VITE_SUPABASE_URL` | Optional | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Optional | Supabase anonymous key |
| `VITE_APP_URL` | Optional | Production URL (e.g. https://yourdomain.com) |
| `VITE_HF_LLAMA3_MODEL` | Optional | Default: `meta-llama/Llama-3.1-8B-Instruct` |
| `VITE_HF_JAIS_MODEL` | Optional | Jais model name |
| `VITE_USE_HF_PROVIDER` | Optional | Set `false` for free inference |

### 3. Hostinger Requirements
- [ ] Active Hostinger hosting (shared, VPS, or cloud)
- [ ] Domain pointing to Hostinger
- [ ] FTP or File Manager access
- [ ] SSL enabled (recommended for Supabase/HuggingFace)

---

## Build Output (what to upload)

After `npm run build`, the `dist/` folder contains:

```
dist/
├── index.html
├── assets/
│   ├── index-*.css
│   ├── index-*.js
│   ├── pdf.min-*.js
│   ├── es-*.js
│   └── __vite-browser-external-*.js
└── vite.svg (if present)
```

**Upload:** Everything inside `dist/`, not the `dist` folder itself.

---

## Deployment Steps

### Step 1: Build with production URL
```bash
# Optionally set production URL for Supabase redirects
# Create .env.production or update .env:
# VITE_APP_URL=https://yourdomain.com

npm run build
```

### Step 2: Log in to Hostinger
1. Go to [hostinger.com](https://www.hostinger.com)
2. Open **hPanel** → **File Manager**
3. Go to `public_html`

### Step 3: Upload files
1. Delete or backup existing files in `public_html` if needed
2. Upload all contents of `dist/` into `public_html`:
   - `index.html` at the root
   - entire `assets` folder

### Step 4: Add `.htaccess` (for SPA routing)
Create `.htaccess` in `public_html`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### Step 5: Verify
- Open your domain in a browser
- Check that the app loads
- Test chat, quiz, and file upload
- Ensure Supabase auth works if enabled

---

## Important Notes

1. **API keys:** `VITE_HF_API_KEY` and Supabase keys are embedded in the built JavaScript. Do not put sensitive keys in public repos; keep them in `.env` locally and never commit them.

2. **CORS:** Hugging Face and Supabase support browser requests. No CORS proxy is needed on Hostinger.

3. **No backend on shared hosting:** The app runs entirely in the browser. PDF processing, embeddings, and AI calls are done client-side or via external APIs.

4. **File size:** The built bundle is large (~7MB JS) due to PDF.js and ONNX. Consider code splitting or lazy loading for faster initial load.

5. **HTTPS:** Use HTTPS on your domain. Supabase and Hugging Face work best over secure connections.
