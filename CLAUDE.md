# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CarPriceFinder** is a Chrome extension + Node.js server system that automatically analyzes car prices on Auto1.com and compares them with LeBonCoin market prices. It uses AI to detect premium options (M-Sport, AMG, S-Line) and adjusts price estimates accordingly, helping car dealers identify profitable purchase opportunities.

**Key Value Proposition**: Saves 10h/week of manual price comparison + identifies +500-1000€ margin opportunities per vehicle.

## Development Commands

### Server (Node.js Backend)
```bash
# Start server (production mode)
cd server && npm start

# Start with debug logging
cd server && NODE_ENV=development npm start

# Install dependencies
cd server && npm install
```

**Server runs on**: `http://localhost:3001`

### Chrome Extension
1. Open `chrome://extensions/`
2. Enable "Developer mode" (toggle top-right)
3. Click "Load unpacked"
4. Select the CarPriceFinder root directory (not /server subdirectory)
5. Extension should appear with manifest v3

**Reload extension after code changes**: Click reload icon in chrome://extensions/

### Configuration
- Copy `server/.env.example` to `server/.env`
- Add `OPENAI_API_KEY=your_key` for AI features (optional)
- Without API key, extension uses rule-based option detection

## Architecture

### High-Level Flow
```
Auto1.com page load
  → inject.js (injected by manifest)
  → intercept.js (loaded into page context)
  → Intercepts fetch() calls to Auto1 API
  → Extracts car data (brand, model, km, price, equipment)
  → Sends to Node.js server /api/estimation
  → Server:
      1. Detects premium options (AI or rules)
      2. Scrapes LeBonCoin API for market prices
      3. Calculates margin (LBC price - Auto1 price)
      4. Returns: { detectedOptions, baseLbcPrice, adjustedPrice, margin }
  → intercept.js injects visual price card into Auto1 UI
```

### Key Components

#### Extension (Frontend)
- **manifest.json**: Chrome extension config (manifest v3)
- **inject.js**: Minimal script injector (runs at document_start)
- **intercept.js**: Main logic (runs in page context, NOT content script)
  - Intercepts `fetch()` to Auto1's internal API
  - Implements smart caching (configurable 1h-7d)
  - Manages settings via chrome.storage.local
  - Renders price analysis cards in Auto1 UI
- **popup.html/js**: Extension settings interface
  - Request timeout (1-12s)
  - Cache duration (1h-7d)
  - Force refresh / clear cache

**Important**: `intercept.js` runs in page context (not isolated content script) to intercept fetch(). It's loaded via inject.js + web_accessible_resources.

#### Server (Backend)
- **lbcScraper.js**: Express server (port 3001)
  - `/api/health`: Server status + AI availability
  - `/api/estimation`: Main analysis endpoint
  - `/api/lbc-url`: Generate LeBonCoin search URLs
- **aiOptionDetector.js**: Premium option detection logic
  - Rule-based patterns (always active)
  - OpenAI GPT-3.5 enhancement (optional)
  - Returns: { options: [], confidence: 0-1, valueImpact: 0.15 }

**LeBonCoin API**: Uses mobile app headers (`api_key: ba0c2dad52b3ec`) to bypass rate limits.

### Data Flow: Cache System
```
intercept.js cacheKey generation:
  hash(brand, model, year, km, fuel, description, equipment)

Cache hit (if timestamp < cacheTimeout && !forceRefreshMode):
  → Return cached analysis instantly (<100ms)
  → Display "CACHE" badge in UI

Cache miss:
  → Call server /api/estimation
  → Store result in chrome.storage.local
  → Persist cache across browser sessions
```

**Force Refresh Mode**: User can enable 5-minute cache bypass via popup. Useful when car listings update frequently.

### Premium Options Detection

**Rule-based patterns** (always active):
```javascript
// aiOptionDetector.js
PREMIUM_OPTIONS = {
  'M-Sport': { brands: ['BMW'], valueImpact: 0.10, keywords: ['m sport', 'm-sport'] },
  'AMG': { brands: ['Mercedes'], valueImpact: 0.20, keywords: ['amg'] },
  'S-Line': { brands: ['Audi'], valueImpact: 0.08, keywords: ['s line', 's-line'] }
}
```

**AI enhancement** (if OPENAI_API_KEY set):
- GPT-3.5-turbo analyzes full equipment list
- Detects options not in rule patterns
- Validates rule-based detections
- Returns confidence scores (0.6-1.0)

**Adding new options**: Edit `PREMIUM_OPTIONS` in aiOptionDetector.js with brand, valueImpact (%), keywords.

## Technical Constraints

### Scraping Considerations
- **LeBonCoin**: Uses mobile API (api_key required). Rate limit: ~100 req/min.
- **Auto1**: Extension intercepts existing fetch() calls (no additional requests).
- **Risk mitigation**: Smart caching reduces server load 60-80%.

### Chrome Extension Limitations
- Manifest v3 (service workers, not background pages)
- intercept.js must run in page context (not content script) to intercept fetch()
- chrome.storage.local limit: 10MB (sufficient for ~1000 cached analyses)

### Performance
- **Cache hit**: <100ms (instant)
- **Cache miss**: 1-12s depending on user setting
- **AI analysis**: +500ms if OpenAI enabled
- **Target**: 95%+ uptime, <5% error rate

## Common Development Tasks

### Testing Cache System
```javascript
// In browser console (on auto1.com)
chrome.storage.local.get(['carFinderCache'], (result) => {
  console.log('Cache entries:', Object.keys(result.carFinderCache || {}).length);
});

// Clear cache programmatically
chrome.storage.local.set({ carFinderCache: {} });
```

### Debugging Server API
```bash
# Test health endpoint
curl http://localhost:3001/api/health

# Test estimation endpoint
curl -G http://localhost:3001/api/estimation \
  --data-urlencode "brand=BMW" \
  --data-urlencode "model=320" \
  --data-urlencode "year=2020" \
  --data-urlencode "km=50000" \
  --data-urlencode "fuel=diesel" \
  --data-urlencode "price=25000"
```

### Monitoring AI Usage
- Set `NODE_ENV=development` in server/.env
- Check console for `[AI]` prefixed logs
- Verify `aiEnabled: true` in /api/health response

## Business Context (Important)

This is being productized as a **SaaS platform** for car dealers:
- **Target users**: Professional car dealers (15k France), individuals (50k), garages (8k)
- **Roadmap**: See PRODUCT_BRIEF_COMMERCIAL.md, EXECUTIVE_SUMMARY.md
- **Next milestone**: premiers utilisateurs payants → MRR positif

**When implementing features**: Prioritize features that improve dealer workflow (time saved, margin detection accuracy).

## Modèle Freemium (Réel)

**Ce que voit un utilisateur non-abonné :**
- L'analyse tourne, les emojis (🟢🟡🔴) s'affichent = il voit si c'est une bonne affaire ou non
- Les chiffres exacts (prix LBC, marge en €) sont **floutés**
- Message d'upgrade affiché pour débloquer les chiffres

**Ce que voit un abonné :**
- Tout débloqué : prix marché ajusté, marge estimée en €, options détectées

**Formule de communication EXTERNE (prospects, emails, posts) :**
→ **"Gratuit pour tester, sans carte bancaire"**
- Ne jamais écrire "Gratuit en mode indicateur 🟢🟡🔴" — jargon interne incompréhensible
- Ne jamais mentionner "payant" dans un premier contact — refroidit les prospects
- Ne jamais parler de "extension Chrome" — parler du résultat, pas de la techno

## Acquisition & Marketing

### Dashboard de suivi
- **URL prod** : `carlytics.fr/suivi.html`
- **PIN** : 1996
- **Fichier local** : `acquisition/dashboard.html` (servi via `npx serve -p 5556`)
- **Fichier prod** : `landing/suivi.html`

### Canaux d'acquisition et priorités

| Canal | Statut | Priorité | Volume |
|-------|--------|----------|--------|
| Cold email | ✅ Prêt | 🔥 Haute | 35 contacts |
| LinkedIn DMs | ✅ Prêt | 🔥 Haute | 14 contacts |
| Facebook groupes | ⏳ En attente | 🟡 Faible | Groupes = ventes, pas pros |
| Forums VO | ❌ Abandonné | — | Forums morts en 2026 |

### Fichiers d'acquisition (`/acquisition/`)
- `contacts_cold_email.csv` — 35 contacts cold email
- `emails_a_envoyer.md` — séquence email J0 / J+3 / J+7
- `contacts_linkedin.csv` — 14 contacts LinkedIn (employés Auto1 exclus)
- `linkedin_posts.md` — posts LinkedIn + DM template (vouvoiement)
- `facebook_posts.md` — posts Facebook (faible priorité)
- `forums_messages.md` — messages forums (abandonné)

### To-do acquisition
- **Lundi 8h** : envoyer 15 emails J0 depuis contact@carlytics.fr + 14 DMs LinkedIn
- **Jeudi** : relances J+3
- **Lundi +7** : bilan et ajustement messaging

### Agents Claude utilisés (tâches ponctuelles)
Les "agents" sont des tâches ponctuelles confiées à Claude, pas des processus persistants.
- **Agent Cold Email** ✅ : génération de 35 contacts + séquence email complète
- **Agent Démo** ✅ : création de la démo TikTok (demo-tiktok.html dans /screenshots)
- **Agent LinkedIn** ✅ : recherche de 14 contacts marchands VO + DM template vouvoiement
- **Agent Facebook** ⏳ : posts créés, faible priorité (groupes = ventes véhicules, pas pros)
- **Agent Forums** ❌ : recherche effectuée → forums VO publics morts en 2026, abandonné

## Commercial Documentation

**Do NOT modify** these files unless explicitly requested:
- `PRODUCT_BRIEF_COMMERCIAL.md`: Complete product specifications (20 pages)
- `EXECUTIVE_SUMMARY.md`: 1-page investor pitch
- `ACTION_PLAN_IMMEDIATE.md`: 7-day validation plan
- `START_TODAY.md`: Quick-start checklist
- `BRAINSTORM_INDEX.md`: Documentation index

**Purpose**: These are strategic planning documents for commercialization, not technical specs.

## Code Style

- JavaScript (ES6+, no TypeScript)
- Async/await for promises (avoid .then())
- Functional style preferred (map/filter/reduce over loops)
- Comments in French for business logic, English for technical details
- Console logs: `console.log('[🎯 Component] Message')` with emoji prefixes

## Production Server

```bash
ssh root@72.61.96.39
# ⚠️ Mot de passe : NE PAS stocker ici (repo GitHub). Utiliser un gestionnaire de mots de passe.
```

- **Domains**: carlytics.fr / api.carlytics.fr / app.carlytics.fr
- **Stack**: Docker Compose (Caddy + Node API + Postgres)
- **Path**: `/opt/carlytics/`
- **Deploy**: `git pull && docker compose build api && docker compose up -d`

## Environment Variables

```bash
# server/.env (copier depuis .env.example)

# --- Serveur ---
PORT=9001
NODE_ENV=development               # "production" en prod

# --- Base de données ---
DATABASE_URL=postgres://cpf:cpf_secret@localhost:5432/carpricefinder
POSTGRES_PASSWORD=cpf_secret

# --- LeBonCoin scraping ---
LBC_API_KEY=ba0c2dad52b3ec        # Clé API mobile LBC (publique, dans l'app)

# --- Stripe ---
STRIPE_SECRET_KEY=sk_live_...     # sk_test_... en dev
STRIPE_WEBHOOK_SECRET=whsec_...   # Depuis Stripe Dashboard > Webhooks
STRIPE_PRICE_ID_STARTER=price_... # Plan Starter (49€/mois)
STRIPE_PRICE_ID_PRO=price_...     # Plan Pro (89€/mois)
STRIPE_PRICE_ID_AGENCY=price_...  # Plan Agence (149€/mois)

# --- Email transactionnel (Resend) ---
RESEND_API_KEY=re_...             # resend.com > API Keys
FROM_EMAIL=Carlytics <noreply@carlytics.fr>
# ⚠️ Sans RESEND_API_KEY : emails non envoyés, code affiché uniquement dans les logs

# --- CORS ---
ALLOWED_ORIGINS=https://www.auto1.com,https://app.carlytics.fr
FRONTEND_URL=https://app.carlytics.fr

# --- AI (optionnel) ---
OPENAI_API_KEY=sk-...             # Sans cette clé : détection rule-based uniquement
```

## Services Externes

| Service | Usage | Dashboard |
|---------|-------|-----------|
| **Resend** | Emails transactionnels (OTP, reset password, welcome) | resend.com |
| **Stripe** | Paiements abonnements (Starter 49€ / Pro 89€ / Agence 149€) | dashboard.stripe.com |
| **PostHog** | Analytics & tracking comportement utilisateurs | eu.posthog.com |
| **Hostinger** | DNS du domaine carlytics.fr + boîte mail contact@carlytics.fr | hpanel.hostinger.com |
| **Chrome Web Store** | Distribution de l'extension Chrome | chrome.google.com/webstore/devconsole |
| **OpenAI** | Détection options premium (optionnel, GPT-3.5-turbo) | platform.openai.com |

### Points importants
- **Emails** : envoyés via Resend (pas Hostinger). Logs dans resend.com > Emails. Le domaine `carlytics.fr` doit être vérifié dans Resend (SPF + DKIM configurés).
- **Hostinger** : uniquement pour les DNS et la boîte mail `contact@carlytics.fr`. Aucun email transactionnel ne passe par Hostinger.
- **Landing page** : servie via bind mount Docker `./landing:/srv/landing:ro`. Un simple `git pull` suffit à déployer (pas besoin de rebuild Docker).
- **Dashboard** (`app.carlytics.fr`) : app Vite/React dans `/dashboard`, rebuild Docker nécessaire après modif.
- **Cache navigateur** : `Cache-Control: max-age=86400` sur la landing. Tester en navigation privée ou hard refresh (Cmd+Shift+R) après déploiement.

## Deploy Workflow

### Landing page (carlytics.fr)
```bash
# Local
git add landing/ && git commit -m "feat: ..." && git push

# Serveur (bind mount → immédiat)
ssh root@72.61.96.39
cd /opt/carlytics && git pull
# ✅ En ligne immédiatement
```

### API / Dashboard (app.carlytics.fr)
```bash
ssh root@72.61.96.39
cd /opt/carlytics
git pull origin main
docker compose build api   # ou: docker compose build dashboard
docker compose up -d api   # ⚠️ TOUJOURS builder avant up sinon l'ancien code tourne
```

> ⚠️ **Erreur fréquente** : `docker compose up -d` sans `build` utilise l'ancienne image.
> Toujours faire `build` après un `git pull`.

### Vérifier les logs en prod
```bash
ssh root@72.61.96.39
cd /opt/carlytics
docker compose logs api --tail=50 -f     # Logs API temps réel
docker compose logs caddy --tail=20      # Logs Caddy (SSL, reverse proxy)
docker compose ps                        # État des containers
```

## Pricing Actuel

| Plan | Prix | Analyses/mois | Alertes |
|------|------|---------------|---------|
| Starter | 49€/mois | 200 | 3 |
| Pro | 89€/mois | Illimitées | 10 |
| Agence | 149€/mois | Illimitées | Illimitées |

- **Freemium** : gratuit pour tester (emojis visibles, chiffres floutés pour non-abonnés)
- Codes promo activés sur Stripe Checkout

## Authentication Flow

1. User entre son email → `POST /api/auth/request-code`
2. Resend envoie un OTP 6 chiffres (expire 10 min)
3. User entre le code → `POST /api/auth/verify-code`
4. JWT token retourné → stocké en localStorage dashboard
5. Extension vérifie le token via `POST /api/auth/verify-token`

## LeBonCoin & DataDome

### Problème connu
DataDome (anti-bot de LBC) bloque **toutes les IPs de datacenter** (Hostinger, DigitalOcean, OVH, AWS...).
- LBC répond `{ads:[]}` vide — pas de captcha, difficile à détecter
- Le ban est **temporaire** (quelques jours) si le volume de requêtes est raisonnable
- L'IP Hostinger `72.61.96.39` a été bannie ~15 mars 2026 suite à trop de requêtes en tests

### Comportement quand banni
- Plugin affiche les cartes avec 🟢🟡🔴 mais "LBC: N/A"
- Logs API : `🧹 Annonces après filtrage: 0` sur tous les fallbacks
- Réponse API en ~60-100ms (pas de timeout)

### Solution long terme
- **Cache 7 jours** : chaque voiture analysée une seule fois → ~40 req/jour max
- Ne jamais tester en rafale depuis le serveur
- Si ban persistant : proxy résidentiel (Bright Data ~15$/mois)

🔨 **Travail terminé !**
