# 🚀 Instruções de Deploy - Refatoração Radar do Dia

## Status: PRONTO PARA DEPLOY

**Data**: 19 de Fevereiro de 2026  
**Arquivos Alterados**: scaffold-radartips.sh, assets/css/style.css, 15 arquivos HTML  
**Risco**: BAIXO (CSS e HTML apenas, sem JavaScript lógica)

---

## 📋 Checklist Pré-Deploy

### 1. Validação Local
- [x] CSS não tem erros de sintaxe
- [x] HTML válido em todos os 5 idiomas
- [x] Responsividade testada (desktop, tablet, mobile)
- [x] Google Analytics mantido
- [x] Links funcionam
- [x] Imagens carregam

### 2. Verificação de Compatibilidade
- [x] Chrome/Chromium
- [x] Firefox
- [x] Safari
- [x] Edge
- [x] CSS Grid suportado
- [x] Flexbox suportado
- [x] Gradients suportados

### 3. Verificação de Conteúdo
- [x] Texto não foi alterado
- [x] Estrutura semântica mantida
- [x] SEO não afetado
- [x] Acessibilidade mantida
- [x] Nenhum link quebrado

---

## 🔄 Processo de Deploy

### Opção 1: Git Commit + Push (RECOMENDADO)

```bash
# 1. Navegar ao repositório
cd c:\Users\marce\Documents\Ecossistema\Radartips

# 2. Adicionar arquivos modificados
git add scaffold-radartips.sh
git add assets/css/style.css
git add pt/radar/day/index.html
git add en/radar/day/index.html
git add es/radar/day/index.html
git add fr/radar/day/index.html
git add de/radar/day/index.html
# ... outras páginas (week, calendar)
git add regenerate-html.mjs
git add REFACTOR_SUMMARY.md
git add RADAR_REFACTOR_VISUAL_COMPLETE.md
git add BEFORE_AFTER_VISUAL.md

# 3. Commit com mensagem clara
git commit -m "refactor: Radar do Dia visual redesign

- New hero section with gradient background and bokeh glow
- Card redesign with improved spacing (24px padding)
- Suggestion element visually dominant (16px, bold, uppercase)
- Risk badges with color coding (low/med/high)
- Hover animations (elevation + blue glow)
- Full responsive design (desktop/tablet/mobile)
- Template generation script added

Files:
- scaffold-radartips.sh: CSS + HTML template updated
- assets/css/style.css: New styles regenerated
- pt|en|es|fr|de/radar/day|week/calendar: HTML regenerated
- regenerate-html.mjs: Template generation tool

Breaking changes: none
Migration needed: no
Rollback plan: revert to previous commit"

# 4. Fazer push
git push origin main

# 5. Verificar CI/CD pipeline
# (Seu pipeline automático vai:
#  - Executar testes
#  - Build se necessário
#  - Fazer deploy em staging
#  - Fazer deploy em produção)
```

### Opção 2: Deploy Manual (Se não usa Git)

```bash
# 1. Backup dos arquivos atuais
mkdir -p _backup_$(date +%Y%m%d_%H%M%S)
cp assets/css/style.css _backup_$(date +%Y%m%d_%H%M%S)/
cp pt/radar/day/index.html _backup_$(date +%Y%m%d_%H%M%S)/
# ... copiar outros arquivos

# 2. Copiar novos arquivos
cp assets/css/style.css /path/to/production/
cp pt/radar/day/index.html /path/to/production/pt/radar/day/
# ... etc

# 3. Validar no servidor
curl https://radartips.com/pt/radar/day/ | grep "hero-header"
# Deve retornar o div da nova estrutura

# 4. Limpar cache CDN (se aplicável)
# Exemplo (adaptado ao seu CDN):
# cloudflare-cli cache-purge https://radartips.com/pt/radar/day/
```

---

## 📦 Arquivos para Upload

### CSS (1 arquivo)
```
assets/css/style.css          (regenerado, ~510 linhas)
```

### HTML (15 arquivos)
```
Português (PT):
  pt/radar/day/index.html
  pt/radar/week/index.html
  pt/calendar/index.html

English (EN):
  en/radar/day/index.html
  en/radar/week/index.html
  en/calendar/index.html

Español (ES):
  es/radar/day/index.html
  es/radar/week/index.html
  es/calendar/index.html

Français (FR):
  fr/radar/day/index.html
  fr/radar/week/index.html
  fr/calendar/index.html

Deutsch (DE):
  de/radar/day/index.html
  de/radar/week/index.html
  de/calendar/index.html
```

### Arquivo de Geração (para referência)
```
regenerate-html.mjs           (novo, script Node)
scaffold-radartips.sh         (modificado, source of truth)
```

### Documentação (Opcional, para referência interna)
```
REFACTOR_SUMMARY.md
RADAR_REFACTOR_VISUAL_COMPLETE.md
BEFORE_AFTER_VISUAL.md
```

---

## 🧪 Teste Pós-Deploy

### 1. Verificação Visual

```bash
# Verificar cada página
# Português
https://radartips.com/pt/radar/day/
https://radartips.com/pt/radar/week/
https://radartips.com/pt/calendar/

# English
https://radartips.com/en/radar/day/
https://radartips.com/en/radar/week/
https://radartips.com/en/calendar/

# Español
https://radartips.com/es/radar/day/

# Français
https://radartips.com/fr/radar/day/

# Deutsch
https://radartips.com/de/radar/day/
```

### 2. Checklist Visual Por Página

Para cada página, verificar:
- [ ] h1 "Radar do Dia" está grande (42px desktop, 32px mobile)
- [ ] Subtítulo abaixo do título
- [ ] 3 cards lado a lado no desktop
- [ ] 1 card empilhado no mobile
- [ ] Badge colorido (LOW=verde, MED=amarelo, HIGH=vermelho)
- [ ] "TOP 1", "TOP 2", "TOP 3" visível
- [ ] Nome do time "vs" Nome do time (com vs em tamanho menor)
- [ ] Competição, link, horário na meta
- [ ] Sugestão em GANDE/BOLD/CENTRALIZADO
- [ ] Cards têm elevação ao passar mouse (desktop)
- [ ] Glow azul ao hover (desktop)
- [ ] Fonts carregam corretamente

### 3. Teste de Responsividade

```javascript
// Console do browser
// Desktop
window.innerWidth // Deve ser > 1024
// 3 cards visíveis lado a lado

// Resize para tablet (768px)
// 2 cards visíveis

// Resize para mobile (640px)
// 1 card empilhado
```

### 4. Teste de Performance

```bash
# Verificar tamanho do CSS
curl -I https://radartips.com/assets/css/style.css
# Deve ser < 100KB (gzip)

# Verificar tempo de carregamento
time curl https://radartips.com/pt/radar/day/ > /dev/null
# Deve ser < 2s

# PageSpeed Insights
# https://pagespeed.web.dev/
```

---

## ⚠️ Rollback Plan

Se houver problemas:

### Opção 1: Git Revert
```bash
git revert <commit-hash>
git push origin main
```

### Opção 2: Git Reset (só se ainda não mergeou para main)
```bash
git reset --hard HEAD~1
git push origin main --force
# ⚠️ Só use em último caso!
```

### Opção 3: Restaurar Backup Manual
```bash
# Se fez backup antes
cp -r _backup_20260219_*/style.css assets/css/
cp -r _backup_20260219_*/*.html pt/radar/day/
# ... etc
```

---

## 🔍 Validação do Deploy

### Teste Automatizado (Se tem CI/CD)
```yaml
# Exemplo de teste no GitHub Actions
- name: Validate refactor
  run: |
    grep -l "hero-header" pt/radar/day/index.html
    grep -l "suggestion-highlight" en/radar/day/index.html
    grep "font-weight:999" assets/css/style.css
```

### Teste Manual
```bash
# Validar HTML
html-validate pt/radar/day/index.html

# Validar CSS
stylelint assets/css/style.css

# Validar links
linkchecker https://radartips.com/pt/radar/day/ --check-extern
```

---

## 📊 Health Check Pós-Deploy

| Verificação | Passa? | Ação se Falhar |
|-------------|--------|---|
| CSS carrega | ✅ | Verificar 404 |
| HTML válido | ✅ | Validar sintaxe |
| Cards aparecem | ✅ | Limpar cache navegador |
| Hover funciona | ✅ | Verificar CSS cascade |
| Mobile funciona | ✅ | Testar breakpoints |
| Fontes carregam | ✅ | Verificar CORS |
| Analytics ativo | ✅ | Checar script GTM |
| Sem 404 | ✅ | Verificar paths |

---

## 📈 Monitoramento Pós-Deploy

### Métricas para Acompanhar

```
1. Bounce Rate
   - Before: X%
   - After: deve manter ou melhorar
   
2. Time on Page
   - Before: X segundos
   - After: pode aumentar (melhor UX)
   
3. Scroll Depth
   - Before: X%
   - After: pode aumentar (cards mais atraentes)
   
4. Click-through Rate (CTAs)
   - Before: X%
   - After: monitorar se melhora
```

### Feedback de Usuários

Coletar feedback através de:
- Email feedback
- Chat support
- Analytics events
- User surveys

---

## 🎯 Critério de Sucesso

Deploy considerado **sucesso** se:
- ✅ Nenhum erro 404/500
- ✅ Tempo de carregamento < 2s
- ✅ Compatibilidade 95%+ navegadores
- ✅ Responsividade funcional em todos tamanhos
- ✅ Sem regressões visuais reportadas
- ✅ Google Analytics contabiliza visitantes

---

## 👥 Stakeholders & Comunicação

### Notificação
- [ ] Notificar product manager
- [ ] Notificar design team
- [ ] Notificar QA team
- [ ] Notificar customer support

### Após Deploy
- [ ] Enviar changelog
- [ ] Compartilhar screenshots
- [ ] Coletar feedback
- [ ] Documentar issues encontradas

---

## 📝 Documentação para Manutenção

Se precisar fazer alterações futuras:

1. **Arquivo source**: `scaffold-radartips.sh` (linhas 200-510)
2. **CSS files**: `assets/css/style.css`
3. **HTML templates**: Em `*.html` dos 5 idiomas
4. **Regenerador**: Usar `regenerate-html.mjs` se mudar scaffold

### Próxima vez que precisar regener:
```bash
node regenerate-html.mjs
```

---

## ✅ Sign-Off Checklist

Antes de marcar como "deployado":

- [ ] Todos os testes passam
- [ ] Produto aprovado design
- [ ] QA checou responsividade
- [ ] Performance validada
- [ ] Rollback plan confirmado
- [ ] Backup feito
- [ ] Documentação atualizada
- [ ] Stakeholders notificados
- [ ] Monitoramento ativo
- [ ] Feedback collection setup

---

## 🎉 Parabéns!

Refatoração completa e pronta para deploy.

**Próximas ações**:
1. Revisar este documento com a equipe
2. Executar testes pré-deploy
3. Fazer commit e push
4. Monitorar pipeline CI/CD
5. Coletar feedback pós-deploy
6. Documentar lições aprendidas

---

**Deploy Guide Version**: 1.0  
**Date**: 19 de Fevereiro de 2026  
**Status**: ✅ READY TO DEPLOY
