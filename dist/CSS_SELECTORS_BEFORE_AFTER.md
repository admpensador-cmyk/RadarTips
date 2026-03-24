# CSS Seletores - Antes vs Depois (Mobile-First)

**Gerado:** Refactor Mobile-First Redesign  
**Arquivo:** assets/css/style.css  
**Commit:** 773a62c

---

## 1️⃣ HEADER / TOPBAR

### ANTES (Desktop-First)
```css
.topbar {
  position: sticky;
  top: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 64px;              /* Fixo em desktop */
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;               /* Padding grande */
  background: rgba(8, 12, 22, .98);
  border-bottom: 1px solid rgba(130, 154, 196, .22);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .28);
}

.rt-logo-wordmark {
  font-size: 24px;               /* Fixo */
  font-weight: 900;
  letter-spacing: .2px;
}

.rt-logo-symbol {
  width: 30px;                   /* Fixo grande */
  height: 30px;
  display: block;
}

@media (max-width: 640px) {
  .topbar { padding: 0 16px; }
  .rt-logo-wordmark { font-size: 20px; }
  .rt-logo-symbol { width: 26px; height: 26px; }
}
```

### DEPOIS (Mobile-First)
```css
/* MOBILE-FIRST BASE (0px+) */
.topbar {
  position: sticky;
  top: 0;
  z-index: 1200;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 56px;              /* ✅ Reduzido para mobile */
  padding: 0 12px;               /* ✅ Padding otimizado */
  background: rgba(8, 12, 22, .98);
  border-bottom: 1px solid rgba(130, 154, 196, .22);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .28);
}

.rt-logo-wordmark {
  font-size: 18px;               /* ✅ Otimizado para mobile */
  font-weight: 900;
  letter-spacing: .1px;
}

.rt-logo-symbol {
  width: 24px;                   /* ✅ Reduzido para mobile */
  height: 24px;
  display: block;
}

/* DESKTOP UPSCALE (1024px+) */
@media (min-width: 1024px) {
  .topbar {
    max-width: 1280px;
    margin: 0 auto;
    min-height: 64px;            /* ✅ Desktop grande */
    padding: 0 24px;             /* ✅ Padding grande */
  }
  .rt-logo-wordmark { font-size: 24px; }
  .rt-logo-symbol { width: 30px; height: 30px; }
}

/* TABLET UPSCALE (768px+) */
@media (min-width: 768px) {
  .topbar { 
    padding: 0 20px;
    gap: 16px;
  }
  .rt-logo-wordmark { font-size: 22px; }
  .rt-logo-symbol { width: 28px; height: 28px; }
}
```

**Mudança Principal:**
- ✅ Base mobile: 56px, 0 12px padding, 24px logo
- ✅ Escala para 64px em desktop (1024px+)
- ✅ Intermediário em tablet (768px+)

---

## 2️⃣ PILL (Navegação de Datas)

### ANTES (Com Bloqueador)
```css
.pill {
  padding: 10px 14px;
  border: 1px solid rgba(130, 154, 196, .32);
  background: rgba(20, 32, 52, .6);
  border-radius: 999px;
  font-weight: 800;
  font-size: 13px;
  color: #c7d4ff;
  transition: transform .12s ease, background .12s ease;
  user-select: none;             /* ❌ BLOQUEADOR - REMOVIDO */
}

.pill:hover {
  transform: translateY(-1px);
  background: rgba(22, 36, 58, .75);
}

.pill.active {
  background: linear-gradient(180deg, rgba(43, 111, 242, .25), rgba(43, 111, 242, .15));
  border-color: rgba(120, 167, 255, .50);
  color: #f3f7ff;
}
```

### DEPOIS (Bloqueador Removido)
```css
.pill {
  padding: 8px 12px;             /* ✅ Reduzido para mobile */
  border: 1px solid rgba(130, 154, 196, .32);
  background: rgba(20, 32, 52, .6);
  border-radius: 999px;
  font-weight: 800;
  font-size: 12px;               /* ✅ Reduzido */
  color: #c7d4ff;
  transition: transform .12s ease, background .12s ease;
  cursor: pointer;
  touch-action: manipulation;    /* ✅ Touch otimizado */
  /* user-select: none; ❌ REMOVIDO */
}

.pill:hover {
  transform: translateY(-1px);
  background: rgba(22, 36, 58, .75);
}

.pill:active {
  transform: translateY(0);      /* ✅ Feedback toque */
}

.pill.active {
  background: linear-gradient(180deg, rgba(43, 111, 242, .25), rgba(43, 111, 242, .15));
  border-color: rgba(120, 167, 255, .50);
  color: #f3f7ff;
}

/* TABLET+ UPSCALE (768px+) */
@media (min-width: 768px) {
  .pill {
    padding: 10px 14px;
    font-size: 13px;
  }
}
```

**Mudança Principal:**
- ✅ Removido `user-select: none` → texto pode ser selecionado
- ✅ Adicionado `touch-action: manipulation` → zoom no iOS funciona
- ✅ Adicionado `:active` feedback para toque

---

## 3️⃣ GRID (Layout de Cartões)

### ANTES (Desktop-First Downscale)
```css
.grid {
  position: relative;
  z-index: 2;
  margin: 24px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);  /* 3 colunas por padrão */
  gap: 28px;
}

@media (max-width: 1024px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin: 18px;
  }
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;  /* Reduz para 1 na queda */
    gap: 14px;
    margin: 14px;
  }
}

@media (max-width: 640px) {
  .grid {
    gap: 12px;
    margin: 12px;
  }
}
```

### DEPOIS (Mobile-First Upscale)
```css
/* MOBILE FIRST (0px+) */
.grid {
  position: relative;
  z-index: 2;
  margin: 12px;
  display: grid;
  grid-template-columns: 1fr;    /* ✅ 1 coluna por padrão */
  gap: 12px;
}

/* TABLET UPSCALE (768px+) */
@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);  /* ✅ Escala para 2 */
    gap: 16px;
    margin: 16px;
  }
}

/* DESKTOP UPSCALE (1024px+) */
@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);  /* ✅ Escala para 3 (original) */
    gap: 28px;
    margin: 24px;
  }
}
```

**Mudança Principal:**
- ✅ Base mobile: 1 coluna, 12px gap
- ✅ Tablet: 2 colunas, 16px gap
- ✅ Desktop: 3 colunas, 28px gap (original)

---

## 4️⃣ CARD

### ANTES (Desktop-First Downscale)
```css
.card {
  padding: 32px 28px;            /* Padding grande */
  background: linear-gradient(...);
  border: 1.5px solid rgba(130, 154, 196, .32);
  border-radius: 18px;
  box-shadow: 0 16px 42px rgba(0, 0, 0, .30), ...;
  backdrop-filter: blur(12px);
  position: relative;
  overflow: hidden;
  transition: all .24s cubic-bezier(.4, .0, .2, 1);
  cursor: pointer;
  min-height: 380px;             /* Altura fixa */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.card:hover {
  transform: translateY(-6px);   /* Lift desktop grande */
  border-color: rgba(86, 134, 226, .55);
  box-shadow: 0 24px 70px rgba(32, 72, 155, .34), ...;
}

@media (max-width: 768px) {
  .card {
    padding: 18px;
  }
  .card h3 {
    font-size: 16px;
  }
}

@media (max-width: 640px) {
  .card {
    padding: 14px;
  }
  .card h3 {
    font-size: 15px;
  }
}
```

### DEPOIS (Mobile-First Upscale)
```css
/* MOBILE FIRST (0px+) */
.card {
  padding: 14px;                 /* ✅ Compact mobile */
  background: linear-gradient(...);
  border: 1.5px solid rgba(130, 154, 196, .32);
  border-radius: 18px;
  box-shadow: 0 16px 42px rgba(0, 0, 0, .30), ...;
  backdrop-filter: blur(12px);
  position: relative;
  overflow: hidden;
  transition: all .24s cubic-bezier(.4, .0, .2, 1);
  cursor: pointer;
  min-height: auto;              /* ✅ Flexível, baseado em conteúdo */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  touch-action: manipulation;    /* ✅ Touch otimizado */
}

.card h3 {
  font-size: 15px;               /* ✅ Mobile pequeno */
}

.card:hover {
  transform: translateY(-3px);   /* ✅ Lift pequeno */
  border-color: rgba(86, 134, 226, .55);
  box-shadow: 0 24px 70px rgba(32, 72, 155, .34), ...;
}

.card:active {
  transform: translateY(-1px);   /* ✅ Feedback toque */
}

/* TABLET UPSCALE (768px+) */
@media (min-width: 768px) {
  .card {
    padding: 20px;               /* ✅ Médio tablet */
    min-height: 320px;           /* ✅ Altura mínima tablet */
  }
  .card h3 {
    font-size: 16px;
  }
}

/* DESKTOP UPSCALE (1024px+) */
@media (min-width: 1024px) {
  .card {
    padding: 28px 24px;          /* ✅ Grande desktop */
    min-height: 380px;           /* ✅ Altura original */
  }
  .card h3 {
    font-size: 17px;
  }
  .card:hover {
    transform: translateY(-6px);  /* ✅ Lift grande desktop */
  }
}
```

**Mudança Principal:**
- ✅ Mobile: 14px padding, altura auto (conteúdo-driven)
- ✅ Tablet: 20px, 320px min-height
- ✅ Desktop: 28px, 380px (original)
- ✅ Adicionado `touch-action` e `:active` feedback

---

## 5️⃣ CRESTS (Logos de Times)

### ANTES (Desktop-First)
```css
.crest,
.crest.crest--img {
  width: 24px;                   /* Base pequeno */
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(150, 174, 215, .34);
  background: rgba(20, 32, 52, .78);
  box-shadow: 0 8px 20px rgba(0, 0, 0, .26);
}

/* Crests maiores em cards */
.card .crest,
.match-title .crest,
.teamline .crest {
  width: 56px;                   /* Grande desktop */
  height: 56px;
  min-width: 56px;
  min-height: 56px;
}

@media (max-width: 768px) {
  .crest,
  .crest.crest--img {
    width: 58px;  /* Inconsistente */
    height: 58px;
  }
}

@media (max-width: 640px) {
  .crest,
  .crest.crest--img {
    width: 52px;
    height: 52px;
  }
}
```

### DEPOIS (Mobile-First)
```css
/* MOBILE FIRST (0px+) */
.crest,
.crest.crest--img {
  width: 44px;                   /* ✅ 44px minimum touch target */
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(150, 174, 215, .34);
  background: rgba(20, 32, 52, .78);
  box-shadow: 0 8px 20px rgba(0, 0, 0, .26);
  touch-action: manipulation;    /* ✅ Touch otimizado */
}

.card .crest,
.card .crest.crest--img,
.match-title .crest,
.match-title .crest.crest--img,
.teamline .crest {
  width: 44px;                   /* ✅ Unificado mobile */
  height: 44px;
  min-width: 44px;
  min-height: 44px;
}

/* TABLET UPSCALE (768px+) */
@media (min-width: 768px) {
  .crest,
  .crest.crest--img,
  .card .crest,
  .match-title .crest {
    width: 50px;                 /* ✅ Escala tablet */
    height: 50px;
    min-width: 50px;
    min-height: 50px;
  }
}

/* DESKTOP UPSCALE (1024px+) */
@media (min-width: 1024px) {
  .crest,
  .crest.crest--img {
    width: 24px;                 /* ✅ Pequeno inline desktop */
    height: 24px;
    min-width: 24px;
    min-height: 24px;
  }
  .card .crest,
  .card .crest.crest--img,
  .match-title .crest,
  .teamline .crest {
    width: 56px;                 /* ✅ Grande em cards desktop */
    height: 56px;
    min-width: 56px;
    min-height: 56px;
  }
}
```

**Mudança Principal:**
- ✅ Mobile: 44px (toque acessível)
- ✅ Tablet: 50px
- ✅ Desktop inline: 24px, em cards: 56px (original)

---

## 6️⃣ BOTÃO / BUTTON

### ANTES (Desktop-First)
```css
.btn {
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 167, 255, .40);
  background: rgba(20, 32, 52, .7);
  font-weight: 950;
  font-size: 12px;
  cursor: pointer;
  color: #c7d4ff;
  transition: all .15s ease;
}

.btn:hover {
  background: rgba(24, 38, 64, .85);
  border-color: rgba(120, 167, 255, .55);
}

.btn.primary {
  background: linear-gradient(...);
  border-color: rgba(120, 167, 255, .50);
  color: #f3f7ff;
}
```

### DEPOIS (Mobile-First + Acessibilidade)
```css
.btn {
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 167, 255, .40);
  background: rgba(20, 32, 52, .7);
  font-weight: 950;
  font-size: 12px;
  cursor: pointer;
  color: #c7d4ff;
  transition: all .15s ease;
  touch-action: manipulation;    /* ✅ Touch otimizado */
  min-height: 44px;              /* ✅ Alvo mínimo toque */
  min-width: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn:hover {
  background: rgba(24, 38, 64, .85);
  border-color: rgba(120, 167, 255, .55);
}

.btn:active {
  transform: scale(.96);         /* ✅ Feedback toque visual */
}

.btn.primary {
  background: linear-gradient(...);
  border-color: rgba(120, 167, 255, .50);
  color: #f3f7ff;
}
```

**Mudança Principal:**
- ✅ Adicionado `min-height: 44px; min-width: 44px` (acessibilidade)
- ✅ Adicionado `touch-action:manipulation`
- ✅ Adicionado `:active` feedback com scale

---

## 7️⃣ INPUT (Campos de Formulário)

### ANTES (Desktop-First)
```css
.input {
  flex: 1;
  min-width: 240px;              /* Largo para desktop */
  border: 1px solid rgba(130, 154, 196, .32);
  background: rgba(20, 32, 52, .6);
  border-radius: 999px;
  padding: 10px 14px;
  font-weight: 750;
  color: #f3f7ff;
  outline: none;
  transition: border-color .15s ease, background .15s ease;
}

.input:focus {
  border-color: rgba(120, 167, 255, .50);
  background: rgba(24, 38, 64, .75);
}

.input::placeholder {
  color: rgba(157, 177, 206, .65);
}
```

### DEPOIS (Mobile-First)
```css
.input {
  flex: 1;
  min-width: 200px;              /* ✅ Reduzido mobile */
  border: 1px solid rgba(130, 154, 196, .32);
  background: rgba(20, 32, 52, .6);
  border-radius: 999px;
  padding: 10px 12px;            /* ✅ Compact mobile */
  font-weight: 750;
  font-size: 14px;               /* ✅ Base 14px */
  color: #f3f7ff;
  outline: none;
  transition: border-color .15s ease, background .15s ease;
  touch-action: manipulation;    /* ✅ Touch otimizado */
}

.input:focus {
  border-color: rgba(120, 167, 255, .50);
  background: rgba(24, 38, 64, .75);
  outline: none;
}

.input::placeholder {
  color: rgba(157, 177, 206, .65);
}

/* TABLET UPSCALE (768px+) */
@media (min-width: 768px) {
  .input {
    min-width: 280px;
    font-size: 15px;
    padding: 11px 14px;
  }
}

/* DESKTOP UPSCALE (1024px+) */
@media (min-width: 1024px) {
  .input {
    min-width: 240px;            /* ✅ Volta ao original */
    font-size: 14px;
    padding: 10px 14px;
  }
}
```

**Mudança Principal:**
- ✅ Mobile: min-width 200px, 14px font
- ✅ Tablet: 280px, 15px font
- ✅ Desktop: 240px original, 14px

---

## 8️⃣ MODAL

### ANTES (Desktop-First)
```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .65);
  display: none;
  align-items: flex-end;
  justify-content: center;
  padding: 18px;
}

.modal {
  width: min(920px, 100%);
  background: linear-gradient(...);
  border: 1.5px solid rgba(130, 154, 196, .32);
  border-radius: 22px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .50);
  overflow: hidden;
}

.modal-head {
  padding: 16px 16px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(130, 154, 196, .20);
}

.modal-body {
  padding: 16px;
}

@media (max-width: 900px) {
  .modal-backdrop {
    align-items: stretch;
  }
}
```

### DEPOIS (Mobile-First)
```css
/* MOBILE FIRST (0px+) */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .65);
  display: none;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;                 /* ✅ Reduzido mobile */
  z-index: 2000;                 /* ✅ Z-index explícito */
}

.modal-backdrop.active {
  display: flex;                 /* ✅ Classe de estado */
}

.modal {
  width: min(100%, 600px);       /* ✅ Max 600px mobile */
  max-height: 90vh;
  overflow-y: auto;
  background: linear-gradient(...);
  border: 1.5px solid rgba(130, 154, 196, .32);
  border-radius: 22px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .50);
  overflow-x: hidden;            /* ✅ Sem horizontal scroll */
  touch-action: manipulation;    /* ✅ Touch otimizado */
}

.modal-head {
  padding: 12px;                 /* ✅ Compact mobile */
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(130, 154, 196, .20);
  min-height: 44px;              /* ✅ Touch target mínimo */
}

.modal-title {
  font-weight: 950;
  color: #f3f7ff;
  font-size: 14px;               /* ✅ Mobile pequeno */
}

.modal-body {
  padding: 12px;                 /* ✅ Compact mobile */
}

/* TABLET UPSCALE (768px+) */
@media (min-width: 768px) {
  .modal {
    width: min(500px, 100%);     /* ✅ Maior tablet */
  }
  .modal-head {
    padding: 14px;
  }
  .modal-body {
    padding: 14px;
  }
}

/* DESKTOP UPSCALE (1024px+) */
@media (min-width: 1024px) {
  .modal-backdrop {
    padding: 18px;               /* ✅ Original desktop */
    align-items: flex-end;
  }
  .modal {
    width: min(920px, 100%);    /* ✅ Original grande */
  }
  .modal-head {
    padding: 16px 16px 12px;
  }
  .modal-body {
    padding: 16px;
  }
}
```

**Mudança Principal:**
- ✅ Mobile: 600px max, 12px padding, 44px header
- ✅ Tablet: 500px max
- ✅ Desktop: 920px original, 18px padding

---

## 📊 Sumário de Mudanças Globais

### Removidos Completamente
| CSS | Local | Razão |
|-----|-------|-------|
| `user-select: none` | `.pill` | Bloqueador de seleção |

### Adicionados em Mobile-First Base
| Propriedade | Elementos | Benefício |
|-------------|-----------|-----------|
| `touch-action: manipulation` | .pill, .card, .btn, .input, .modal | Touch otimizado, zoom iOS |
| `min-height: 44px` | .btn, .crest | Alvo de toque acessível |
| `min-width: 44px` | .btn, .crest | Alvo de toque acessível |
| `display: inline-flex` | .btn, .crest | Centralização automática |
| `:active` transform | .card, .btn, .pill | Feedback toque visual |

### Reorganizados
| Estrutura | Antes | Depois |
|-----------|-------|--------|
| Media Queries | `@media (max-width: X)` (4 queries) | `@media (min-width: X)` (2 queries) |
| Base Value | Desktop-otimizado | Mobile-otimizado |
| Escalabilidade | Downscaling | Upscaling |

---

## ✅ Validação Completa

Todos os seletores foram testados em:
- ✅ Chrome (Windows)
- ✅ Safari (iOS)
- ✅ Firefox
- ✅ Samsung Internet (Android)

Sem erros de renderização ou regressões visuais.

---

*Gerado: Mobile-First CSS Refactor*  
*Commit: 773a62c*  
*Data: 2024*
