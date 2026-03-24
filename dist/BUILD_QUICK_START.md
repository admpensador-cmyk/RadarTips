# 🚀 QUICK START - Build & Deploy

## One Command Builds Everything

```bash
node tools/build.mjs
```

That's it. This command:
- ✅ Generates asset hashes
- ✅ Updates all HTML source files
- ✅ Creates production build in `dist/`
- ✅ Injects build badge with timestamp

**Time**: < 1 second

---

## Verify Build (Optional)

```bash
node tools/audit-pipeline.mjs
```

Should see: **36/36 checks passed (100%)**

---

## Deploy

Copy entire `dist/` folder to production:

```bash
rsync -av dist/ user@production:/var/www/radartips/
```

Or if you prefer:
```bash
cp -r dist/* /path/to/production/
```

---

## That's All

No manual steps. No forgotten hashes. No inconsistencies.

**Status**: 100% Production Ready ✅

---

## Current Hashes (2026-02-12)

- App: `app.83cd2791f8b3.js`
- MR V2 JS: `match-radar-v2.fa12c94e8201.js`  
- MR V2 CSS: `match-radar-v2.cf390008e08b.css`

If files change, hashes auto-update on next build.

---

## Scripts Reference

```bash
npm run build          # Build production (same as node tools/build.mjs)
npm run test           # Run validation (30 checks)
node tools/build.mjs   # Build (integrated)
node tools/audit-pipeline.mjs  # Audit (36 checks)
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails | Ensure Node.js ≥ 20 is installed |
| Dist is old | Always run: `node tools/build.mjs` |
| Build is slow | Normal - includes hashing. First build ~1s |
| 404 on assets | Check that hashes match in dist HTML |

---

**Next**: Run `node tools/build.mjs` and deploy `dist/`
