# RadarTips Web (Next.js on Cloudflare Workers)

This folder contains the new web-app frontend built with **Next.js (App Router)** and deployed to **Cloudflare Workers** via **@opennextjs/cloudflare**.

## Quick start

```bash
cd apps/web
npm i
# Local (Node.js dev server)
npm run dev

# Preview on Workers runtime (recommended before deploying)
npm run preview

# Deploy to Cloudflare Workers
npm run deploy
```

## Data source

The radar pages fetch JSON from:

- `RADARTIPS_DATA_BASE_URL` (env var)
- default: `https://radartips.com/data`

Example:

```bash
RADARTIPS_DATA_BASE_URL=https://radartips.com/data npm run dev
```
