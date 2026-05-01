# Deployment

## GitHub Pages (one-time setup)

The deploy workflow assumes Pages is already enabled on the repository.
Enable it once, manually:

1. Open the repo on GitHub → **Settings** → **Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Save

(The workflow tried to do this automatically with `enablement: true` on
`actions/configure-pages`, but the workflow's `GITHUB_TOKEN` is not
allowed to create the Pages site — that requires repository admin
scope. Pre-creating the site once is the simplest fix.)

After that, every push to `main` runs `.github/workflows/deploy.yml`
which:

1. Builds the static export with `NEXT_PUBLIC_BASE_PATH=/<repo-name>`
   (so URLs resolve under the project-site path)
2. Touches `out/.nojekyll` (otherwise Pages strips the `_next/` directory)
3. Publishes the artifact

The site appears at `https://<owner>.github.io/<repo-name>/`. Wait
~30 seconds after the workflow turns green for the CDN to propagate.

## Local preview of the built site

```sh
npm run build
npx http-server out -p 8080
```

`npm run dev` won't apply the `basePath`, so the production site can
look slightly different from the dev server (links, asset paths). Use
`http-server` or similar against `out/` to preview it the way GH Pages
will serve it.

## Refreshing prices from BLS

```sh
cd data/pipeline
pip install -r requirements.txt
python build_all.py        # downloads + processes
python emit_overrides.py   # writes src/data/blsOverrides.js
cd ../..
npm run build              # bake into bundle
```

`npm run pipeline` does both Python steps in one command.

## Live grocery / nutrition APIs

See [`API_PROXY.md`](API_PROXY.md) for the full Cloudflare Worker
deployment walkthrough, including OAuth setup for FatSecret + Kroger
and the answer to per-store filtering.
