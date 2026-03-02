# Carlytics (CarPriceFinder)

Extension Chrome + plateforme SaaS pour l'analyse automatique des prix de vehicules sur Auto1.com avec comparaison LeBonCoin, detection IA d'options premium et calcul de marge.

> **Gain**: 10h/semaine de comparaisons manuelles en moins, +500-1000EUR de marge identifiee par vehicule.

---

## Fonctionnement

```
Auto1.com (navigation)
  -> Extension Chrome intercept.js
  -> Capture les appels fetch() Auto1 API
  -> Extraction: marque, modele, km, prix, equipements
  -> Envoi au serveur /api/estimation
  -> Serveur:
      1. Detection options premium (IA ou regles)
      2. Scraping LeBonCoin API (prix marche)
      3. Calcul marge (prix LBC - prix Auto1)
  -> Affichage carte prix dans l'UI Auto1
```

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Extension | Chrome Manifest v3, JS vanilla |
| Serveur | Node.js, Express 5, port 9001 |
| Base de donnees | PostgreSQL 16 |
| Dashboard | React 19, Vite, React Query, Recharts |
| Paiement | Stripe (3 plans) |
| Email | Resend |
| Deploiement | Docker Compose, Caddy (reverse proxy) |
| IA (optionnel) | OpenAI GPT-3.5-turbo |

**Domaines production**: `carlytics.fr` / `api.carlytics.fr` / `app.carlytics.fr`

---

## Installation locale

### Prerequis

- Node.js >= 18
- PostgreSQL 16 (ou Docker)
- Chrome/Chromium

### 1. Cloner et configurer

```bash
git clone https://github.com/your-user/CarPriceFinder.git
cd CarPriceFinder
cp .env.example server/.env
```

Editer `server/.env` avec vos valeurs (voir section [Variables d'environnement](#variables-denvironnement)).

### 2. Base de donnees

**Option A : Docker (recommande)**

```bash
docker compose up postgres -d
```

**Option B : PostgreSQL local**

```bash
createdb carpricefinder
psql carpricefinder < server/init.sql
```

### 3. Serveur

```bash
cd server
npm install
npm start        # production
npm run dev      # avec logs debug
```

Le serveur demarre sur `http://localhost:9001`.

### 4. Dashboard

```bash
cd dashboard
npm install
npm run dev      # http://localhost:5173
npm run build    # build production
```

### 5. Extension Chrome

1. Ouvrir `chrome://extensions/`
2. Activer le "Mode developpeur"
3. Cliquer "Charger l'extension non empaquetee"
4. Selectionner le dossier racine `CarPriceFinder/`
5. Naviguer sur auto1.com

---

## Deploiement Docker (production)

```bash
# Configurer les variables
cp .env.production.example server/.env
# Editer server/.env avec les vrais secrets

# Lancer tout
docker compose up -d
```

Services deployes :
- **caddy** : Reverse proxy HTTPS (ports 80/443)
- **api** : Serveur Node.js (port 9001 interne)
- **postgres** : Base de donnees
- **backup** : Backup automatique toutes les 6h (retention 7 jours)

---

## Architecture

```
CarPriceFinder/
|-- manifest.json            # Config extension (Manifest v3)
|-- background.js            # Service worker extension
|-- inject.js                # Injecteur de script (document_start)
|-- intercept.js             # Logique principale (page context)
|-- content-bridge.js        # Pont content script <-> page
|-- popup.html / popup.js    # Interface settings extension
|-- package.json             # Deps racine (extension)
|
|-- server/
|   |-- lbcScraper.js        # Serveur Express (endpoints API)
|   |-- aiOptionDetector.js  # Detection options premium
|   |-- db.js                # Pool PostgreSQL
|   |-- init.sql             # Schema base de donnees
|   |-- stripe.js            # Integration Stripe
|   |-- email.js             # Emails transactionnels (Resend)
|   |-- alertMatcher.js      # Matching alertes utilisateur
|   |-- create-key.js        # Generateur de cles API
|   +-- .env                 # Variables d'environnement
|
|-- dashboard/               # App React (SaaS)
|   |-- src/
|   |   |-- pages/           # Login, Dashboard, Vehicles, Alerts, History, Settings
|   |   |-- components/      # Composants UI reutilisables
|   |   |-- api/             # Client API avec auth
|   |   |-- hooks/           # React hooks custom
|   |   +-- utils/           # Utilitaires
|   +-- package.json
|
|-- landing/                 # Site vitrine
|   |-- index.html           # Page d'accueil
|   |-- beta.html            # Inscription beta
|   |-- success.html         # Confirmation paiement
|   +-- style.css
|
|-- docker-compose.yml       # Stack production
|-- Dockerfile               # Build serveur
|-- Caddyfile                # Config reverse proxy
+-- deploy.sh                # Script deploiement
```

### Flux de donnees principal

```
intercept.js (page Auto1)
  |-- Intercepte fetch() API Auto1
  |-- Genere cacheKey (hash brand+model+year+km+fuel+desc+equip)
  |-- Cache hit? -> Affichage immediat (<100ms)
  |-- Cache miss -> POST /api/estimation
       |-- aiOptionDetector.js -> Detection options
       |-- LeBonCoin mobile API -> Prix marche
       |-- Calcul marge + ajustements
       +-- Reponse -> Stockage cache + affichage
```

---

## API Endpoints

### Publics
| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Status serveur + disponibilite IA |
| POST | `/api/check-subscription` | Verification abonnement |
| POST | `/api/request-code` | Demande code magic link |
| POST | `/api/verify-code` | Verification code auth |
| POST | `/api/webhook` | Webhook Stripe |

### Proteges (header `X-API-Key`)
| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/api/estimation` | Analyse de prix principale |
| GET | `/api/lbc-url` | Generation URL LeBonCoin |
| POST | `/api/upload-images` | Upload images vehicule |
| GET/POST/DELETE | `/api/vehicles` | CRUD vehicules sauvegardes |
| GET/POST/PUT/DELETE | `/api/alerts` | CRUD alertes prix |
| GET | `/api/dashboard/stats` | Statistiques dashboard |
| GET | `/api/observations/history` | Historique observations prix |

---

## Base de donnees

Schema PostgreSQL (`server/init.sql`) :

| Table | Role |
|-------|------|
| `subscribers` | Comptes utilisateurs + cles API |
| `auth_codes` | Codes d'authentification magic link |
| `estimation_cache` | Cache serveur des estimations |
| `price_observations` | Collecte donnees ML (tracking prix) |
| `saved_vehicles` | Vehicules sauvegardes par utilisateur |
| `alerts` | Alertes prix/criteres utilisateur |
| `alert_matches` | Historique correspondances alertes |

---

## Authentification

- **Cle API** : Header `X-API-Key` sur tous les endpoints proteges
- **Magic link** : Email OTP via `request-code` / `verify-code`
- **Format cles** : `cpf_live_<48 hex>` (genere par `server/create-key.js`)
- **Google SSO** : OAuth2 via `identity` permission Chrome

---

## Detection d'options premium

### Regles (toujours actives)

| Option | Marques | Impact prix |
|--------|---------|-------------|
| M-Sport | BMW | +10% |
| AMG | Mercedes | +20% |
| AMG Line | Mercedes | +8% |
| S-Line | Audi | +8% |
| RS | Audi | +25% |
| Quattro | Audi | +5% |
| R-Line | VW | +7% |
| GTI | VW | +15% |
| ST-Line | Ford | +8% |
| GT-Line | Kia | +6% |
| Type R | Honda | +20% |
| Cooper S | Mini | +12% |
| JCW | Mini | +18% |

### IA (optionnel, si `OPENAI_API_KEY` configure)

GPT-3.5-turbo analyse l'equipement complet, detecte les options hors patterns, valide les regles et retourne un score de confiance (0.6-1.0).

---

## Variables d'environnement

```bash
# Serveur
PORT=9001
NODE_ENV=development

# Base de donnees
DATABASE_URL=postgres://cpf:cpf_secret@localhost:5432/carpricefinder

# LeBonCoin
LBC_API_KEY=ba0c2dad52b3ec

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# CORS
ALLOWED_ORIGINS=https://www.auto1.com,http://localhost:5173,http://localhost:9001

# Email (Resend)
RESEND_API_KEY=re_...
FROM_EMAIL=Carlytics <noreply@carlytics.fr>

# IA (optionnel)
OPENAI_API_KEY=sk-...

# Dashboard
FRONTEND_URL=http://localhost:5173
DASHBOARD_URL=http://localhost:5173

# Session
SESSION_SECRET=dev-secret-change-in-production
```

---

## Commandes utiles

```bash
# Health check serveur
curl http://localhost:9001/api/health

# Test estimation
curl -G http://localhost:9001/api/estimation \
  -H "X-API-Key: cpf_live_..." \
  --data-urlencode "brand=BMW" \
  --data-urlencode "model=320" \
  --data-urlencode "year=2020" \
  --data-urlencode "km=50000" \
  --data-urlencode "fuel=diesel" \
  --data-urlencode "price=25000"

# Generer une cle API
node server/create-key.js

# Build dashboard production
cd dashboard && npm run build

# Logs Docker
docker compose logs -f api
```

---

## Depannage

**Pas de prix affiche ?**
- Verifier que le serveur tourne : `curl http://localhost:9001/api/health`
- Verifier la cle API dans les settings extension
- Ouvrir la console navigateur (F12) pour voir les erreurs

**Serveur ne demarre pas ?**
- Verifier que PostgreSQL est accessible : `psql $DATABASE_URL`
- Verifier le port 9001 libre : `lsof -i :9001`

**Extension non detectee sur Auto1 ?**
- Recharger l'extension dans `chrome://extensions/`
- Verifier que `host_permissions` inclut `auto1.com`

---

## Contexte business

Plateforme SaaS pour professionnels de l'automobile :
- **Cible** : Concessionnaires (15k FR), particuliers (50k), garages (8k)
- **Plans** : 3 formules via Stripe
- **Objectif** : 100 utilisateurs payants

---

## Licence

MIT
