# Match Radar V2 - Deployment Checklist

## ✅ Pre-Deployment (Verify in Dev)

- [x] Dev server running on port 8080
- [x] All 30 validation tests pass
- [x] Browser can access pages: http://localhost:8080/pt/radar/day/index.html
- [x] All hashed assets present in `assets/` folder
- [x] All 83 HTML files have correct hashed references
- [x] No console errors in browser DevTools

## ✅ Build Process

1. **Ensure app.js is unchanged** (or hash-js will generate new hash)
   ```bash
   # Current hash: app.83cd2791f8b3.js (2025-02-12)
   ```

2. **Update hashes if needed**:
   ```bash
   node tools/hash-js.mjs
   ```

3. **Build production**:
   ```bash
   node tools/build-static.mjs
   ```

4. **Verify all files present**:
   ```bash
   # Should show hashed files
   ls -la dist/assets/match-radar-v2.*
   ls -la dist/assets/app.*.js
   ```

## ✅ Deployment

### Files to Deploy
- `dist/**` - Complete build (everything)
- OR sync specific changes if partial deploy

### After Deployment
1. Test main pages load:
   - [ ] https://radartips.com/pt/radar/day/ → HTTP 200
   - [ ] https://radartips.com/en/radar/day/ → HTTP 200
   - [ ] https://radartips.com/assets/app.83cd2791f8b3.js → HTTP 200
   - [ ] https://radartips.com/assets/match-radar-v2.*.js → HTTP 200
   - [ ] https://radartips.com/assets/match-radar-v2.*.css → HTTP 200

2. Browser testing:
   - [ ] Calendar loads
   - [ ] Click match card → Modal opens
   - [ ] Markets tab shows data
   - [ ] Estatísticas tab shows graphs
   - [ ] Close buttons work
   - [ ] No console errors

3. Check error logs:
   - [ ] No 404 errors for assets
   - [ ] No script errors in logs

## ✅ Rollback Plan

If issues occur:
1. **Quick rollback**: Revert `dist/` to previous build
2. **HTML-only issue**: Update just `dist/**/*.html` files
3. **Assets issue**: 
   - Old hashes still in `assets/` (e.g., `app.cba3bb4ebed9.js`)
   - Can revert HTML references to previous hash
   - Run `node tools/hash-js.mjs` to regenerate

## 📊 Current Status

**Hashes (2025-02-12)**:
- App: `app.83cd2791f8b3.js`
- MR V2 JS: `match-radar-v2.fa12c94e8201.js`
- MR V2 CSS: `match-radar-v2.cf390008e08b.css`

**Build Command**:
```bash
cd "c:\Users\marce\Documents\Ecossistema\Radartips"
node tools/build-static.mjs
```

**Test Command**:
```bash
node tools/final-validation.mjs
```

**Result**: ✅ 30/30 tests pass (100%)

---

## 🚀 One-Line Deploy

```bash
node tools/build-static.mjs && echo "✅ Build complete, ready to sync dist/"
```

---

**Deployment Owner**: [Your Name]  
**Date**: [Deployment Date]  
**Hash Verified**: app.83cd2791f8b3.js
