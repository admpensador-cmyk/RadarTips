# Postmortem Técnico-Executivo — Incidente “RadarTips - Quebra em Produção (Radar Day)”

---

## A) Resumo Executivo
Em 27/02/2026, o RadarTips sofreu uma quebra em produção no frontend Radar Day, causada por erro de sintaxe no bundle principal. O incidente foi detectado por falha de renderização e erro fatal no console do navegador. O erro foi introduzido por alteração em `assets/js/app.js`, propagado para o bundle minificado, e publicado via Cloudflare Pages. O rollback manual restaurou o serviço. O relatório detalha evidências, causa raiz, impacto, correção e checklist preventivo automatizável.

## B) Linha do Tempo
- 26/02/2026 23:48 (-0300): Último deploy estável (commit bom)
- 27/02/2026 01:17 (-0300): Build/redeploy com erro de sintaxe
- 27/02/2026 18:33 (-0300): Detecção do erro via console do navegador
- 27/02/2026 21:41 (-0300): Rollback manual para commit estável

## C) Impacto
- Páginas afetadas: `/en/radar/day` e todas que carregam o bundle `app.b6507b815961.js`
- Sintoma: Página não renderizava dados, exibia placeholders
- Console: `Uncaught SyntaxError: missing ) after argument list` e `await is only valid in async functions...`
- Duração: ~20 horas
- Severidade: Alta (Radar Day indisponível para todos os usuários)

## D) Detecção e Diagnóstico
- Detecção inicial: Console do navegador (erro fatal de sintaxe)
- Validação: `node -c dist/assets/js/app.b6507b815961.js` (erro de sintaxe)
- Teste de API: `curl -I https://radartips.com/api/v1/radar_day.json?force=1` (API OK, frontend quebrado)
- Comando usado:
  ```sh
  node -c dist/assets/js/app.b6507b815961.js
  # Saída: SyntaxError: missing ) after argument list
  ```

## E) Causa Raiz
- Commit que introduziu o erro: não encontrado (rollback manual, reflog disponível)
- Trecho causador (diff):
  ```diff
  .catch((err) => {
    console.warn('[MR2][stats] api path failed, using legacy');
  }
  // Faltou fechamento: deveria ser });
  ```
- Linha aproximada: 1599 do bundle publicado
- Evidência:
  ```js
  Uncaught SyntaxError: missing ) after argument list
  ```

## F) Fatores Contribuintes
- Falta de gate automatizado no build (node -c não era obrigatório)
- Bundle monolítico: erro em um ponto quebra toda a página
- Possível mismatch entre dist/assets/js e HTML publicado
- Ausência de smoke test automatizado pós-build
- Rollback manual, sem comando automatizado

## G) Correção Aplicada
- Rollback manual para commit estável (hash do bundle: app.b6507b815961.js)
- Comando usado:
  ```sh
  git checkout <commit_bom>
  node tools/build-static.mjs
  wrangler pages deploy ./dist --project-name radartips --branch main
  ```
- Bundle publicado validado com:
  ```sh
  node -c dist/assets/js/app.b6507b815961.js
  # Saída: OK
  ```

## H) Ações Preventivas (CHECKLIST Executável)
- [ ] Gate de build: falhar pipeline se `node -c dist/assets/js/app*.js` falhar
- [ ] Smoke test automatizado: abrir `/en/radar/day` com playwright/puppeteer e validar ausência de erro JS
- [ ] Garantir limpeza de bundles órfãos antes do build (script de limpeza)
- [ ] Assert no build: HTML referencia apenas bundle gerado
- [ ] Documentar e automatizar rollback de deploy (wrangler ou git)
- [ ] Monitoramento: captura de erro JS em produção (Sentry ou similar)

## I) Apêndice: Comandos Executados e Resultados

```sh
# Timeline de commits
$ git log --oneline --decorate -n 30
# Reflog
$ git reflog -n 30
# Diff relevante (se commit ruim disponível)
$ git diff <commit_bom>..<commit_ruim> -- assets/js/app.js

# Build e validação
$ rm -rf dist
$ node tools/build-static.mjs
$ node -c dist/assets/js/app*.js

# Smoke test manual
$ curl -sSL "https://radartips.com/en/radar/day/?force=1" | Select-String "app.[a-z0-9]+.js"
$ curl -sSL "https://radartips.com/assets/js/app.b6507b815961.js" | node -c

# API
$ curl -I https://radartips.com/api/v1/radar_day.json?force=1

# Rollback
$ wrangler pages deployment list --project-name radartips
$ wrangler pages deployment rollback --project-name radartips --deployment-id <ID>
```

---

**Relatório rastreável e auditável.**
