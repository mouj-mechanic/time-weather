# Time + Weather (World Dashboard)

A simple **GitHub Pages** site that shows **local time + live weather** for:

- Sofia
- Paris
- Athens
- Tunis

Weather data comes from **Open‑Meteo** (no API key needed).

## Run locally

Because browsers block `fetch()` from `file://`, run a tiny local server:

### Option 1: Python

```bash
python -m http.server 5173
```

Open `http://localhost:5173`

### Option 2: Node

```bash
npx serve .
```

## Deploy on GitHub Pages

1. Push this folder to a GitHub repository (example name: `time-weather`)
2. On GitHub: **Settings → Pages**
3. **Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: `main` / folder: `/ (root)`
4. Save → wait 1–2 minutes

Then you can open your site from anywhere using your Pages URL.

