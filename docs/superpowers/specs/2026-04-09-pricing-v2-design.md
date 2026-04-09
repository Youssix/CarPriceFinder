# Carlytics Pricing v2 — Design

**Date:** 2026-04-09
**Status:** Draft (awaiting user review)
**Context:** 0 paying customers, 6 free subscribers. Clean slate refactor, no migration.

---

## Problème

Le pricing actuel (Starter 49€ / Pro 89€ / Agence 149€) souffre de plusieurs défauts :

1. **Padding bullshit** — les différences entre plans reposent sur "Export CSV / Historique complet / Support prioritaire / Multi-utilisateurs". Personne ne paye 89€ pour un export CSV.
2. **Quotas incohérents** — Starter à "3 alertes prix" est ridicule. Un marchand VO qui chasse 5 modèles différents est déjà bloqué. Et "200 analyses/mois" est crevé en 2 jours à cause du scroll auto d'Auto1/BCA.
3. **Agence opaque** — "Multi-utilisateurs" à 149€ ne veut rien dire pour un prospect, et techniquement rien n'est implémenté.
4. **Décision paralysante** — 3 plans × 5 features chacun = 15 cases à comparer pour un prospect qui voulait juste essayer un outil.
5. **Rien n'est enforced** — côté code, `isPaid === true` = tout débloqué. Les quotas sont uniquement marketing. Donc toute la mécanique de tiers est du vent.

## Décision

**Un seul plan payant. Zéro padding.**

| | Free | **Pro** |
|---|---|---|
| Prix | 0€ | **89€/mois** |
| Carte bancaire requise | Non | Oui |
| Emojis 🟢🟡🔴 sur Auto1 + BCA | ✅ à vie, illimité | ✅ |
| Chiffres (prix LBC ajusté, marge €) | ❌ sauf **première voiture offerte** | ✅ illimité |
| Alertes push | ❌ | ✅ illimité |
| Sessions simultanées autorisées | — | **1** (single-session anti-sharing) |

## Justifications

### Pourquoi 1 seul plan payant

- **YAGNI** : sans data réelle sur le comportement des marchands (solo vs équipe, 10 vs 1000 analyses/mois), on ne conçoit pas pour un fantôme.
- **Friction checkout** : 1 plan = 0 décision. "Tu payes ou tu payes pas." Conversion maximale.
- **Migration future** : si un prospect demande explicitement "c'est pour mon équipe de 5", on ajoute un plan Agence à ce moment-là, pas avant.
- **Anti-sharing déjà couvert** : la rotation d'apiKey implémentée dans cette session rend le partage de compte inutilisable (le 2e device dégage le 1er).

### Pourquoi 89€

- Cohérence avec le discours que les prospects LinkedIn/cold email sont en train de découvrir cette semaine. Changer de prix = signal de faiblesse ("ils ont baissé donc ça marche pas").
- Permet de lâcher un coupon -30% sur les 10 premiers clients sans se cramer.
- ROI évident pour un marchand : 1 marge détectée sur 1 mois = l'abonnement est largement rentabilisé.

### Pourquoi le "first reveal" gratuit (per install)

Le problème du freemium actuel "emojis only forever" : l'utilisateur voit 🟢 mais ne sait jamais ce que vaut réellement le produit. Il peut rationaliser "l'emoji me suffit" et ne jamais passer Pro.

Le first reveal résout ça :
- Sur la toute première voiture qu'il consulte après install, les chiffres s'affichent en clair — prix LBC ajusté et marge estimée.
- Message discret : "Voilà ce que tu verras sur chaque voiture en Pro."
- Ensuite les chiffres repassent floutés, emojis continuent à vie.

**Per install, pas per email** : pas besoin de demander un email pour le wow moment. L'email friction tue le hook. Gameable par réinstallation, mais OSEF — chaque reveal nous coûte ~0 et personne ne réinstalle pour gratter 1 reveal.

Implémentation : flag `firstRevealUsed` en `chrome.storage.local`. Zéro backend, zéro API, zéro compteur mensuel à reset.

### Pourquoi arracher Starter / Agence / padding

- Starter 49€ n'attire que les pingres qui vont churner. Mieux vaut un Free généreux + un Pro sérieux que 3 plans médiocres.
- Agence 149€ sans vraie fonctionnalité multi-user = mensonge commercial + dette technique.
- "Export CSV", "Historique complet", "Support prioritaire" : ces features existent/existeront mais elles ne vendent rien. Les garder dans le discours dilue le vrai pitch (chiffres + alertes).

## Modifications techniques

### 1. Landing (`landing/`)

- `index.html` : section pricing refondue → 1 seule carte "Pro 89€ / mois"
- Supprimer toute mention de Starter, Agence, quotas "200 analyses", "3 alertes", "Export CSV", "Support prioritaire"
- Garder le bouton CTA qui pointe vers `app.carlytics.fr/signup`
- Déploiement : bind mount Docker → `git pull` suffit

### 2. Dashboard (`dashboard/`)

- Page `/upgrade` (ou équivalente) : 1 seul bouton "Passer Pro 89€", plus de comparateur de plans
- Page `/signup` : inchangée (flow 3 étapes déjà en place)
- Supprimer toute UI qui montre le nom du plan actuel ("Starter" / "Pro" / "Agence") — on affiche juste "Free" ou "Pro"
- Rebuild Docker nécessaire

### 3. Extension (`intercept.js` + `bca-intercept.js`)

Logique first reveal :

```js
// Au début de renderCarAnalysis (ou équivalent BCA)
const storage = await chrome.storage.local.get(['firstRevealUsed']);
let effectiveIsPaid = data.isPaid === true;

if (!effectiveIsPaid && !storage.firstRevealUsed) {
  // Premier reveal gratuit → afficher comme si l'utilisateur était Pro
  effectiveIsPaid = true;
  await chrome.storage.local.set({ firstRevealUsed: true });
  // Afficher un petit badge discret : "🎁 Aperçu offert — passe Pro pour débloquer toutes les voitures"
}

renderCarAnalysis(card, carDataForAI, data, euros, effectiveIsPaid);
```

**Edge cases à gérer** :
- Si l'utilisateur devient Pro plus tard, on laisse `firstRevealUsed = true` (pas de conflit, `isPaid` override).
- Le CTA d'upgrade sur les voitures suivantes doit expliquer brièvement : "Tu as vu ta voiture offerte — passe Pro pour voir les chiffres sur toutes les suivantes."
- Le reveal s'applique à la **première voiture visible**, pas à la première carte scrollée. Si 10 cartes s'affichent en même temps au chargement, il faut en choisir une (la première dans l'ordre DOM ou la première dont l'analyse revient du serveur).
  - **Choix** : la première dont l'analyse revient du serveur. Ça garantit que l'utilisateur voit un reveal complet, pas un truc à moitié affiché.

### 4. Serveur (`server/lbcScraper.js` + `db.js`)

- `/api/check-subscription` : déjà OK. Retourne `{ active, isPaid, status, email }`. On considère `isPaid === true` ⇔ status dans `['pro', 'active']`. Le reste est `free`.
- **Pas de migration DB** : les 6 users existants sont déjà `free`, aucun changement nécessaire.
- **Nettoyer le code mort** : toute logique qui référence `'starter'` ou `'agency'` comme subscription_status doit être purgée. Grep requis.
- `/api/estimation` : déjà renvoie `isPaid` (fait dans cette session). Pas de changement.

### 5. Stripe

- Garder uniquement `STRIPE_PRICE_ID_PRO` en env var.
- `STRIPE_PRICE_ID_STARTER` et `STRIPE_PRICE_ID_AGENCY` : peuvent rester dans le `.env` pour ne pas casser si on les réutilise, mais **aucun code ne doit les référencer**. Grep `STRIPE_PRICE_ID_STARTER` et `STRIPE_PRICE_ID_AGENCY` dans le repo et supprimer les usages.
- Côté Stripe Dashboard : pas besoin de supprimer les produits Starter/Agence. On les archive juste (ou on les laisse, ils ne sont plus référencés).

### 6. Extension popup (`popup.html` + `popup.js`)

- Si la popup affiche des infos de plan ("Tu es en Starter" etc.), simplifier à "Free" ou "Pro" uniquement.

## Ce qui est explicitement HORS scope

- ❌ **Refonte des quotas** (200 analyses, cache cross-users, click-to-reveal) : tracé en backlog mémoire, à reprendre quand on aura 10+ clients payants pour calibrer.
- ❌ **Plan Agence / multi-seats** : ajouté réactivement quand un prospect le demande. Pas avant.
- ❌ **Page "Historique" / "Export CSV"** dans le dashboard : ces features peuvent exister mais ne sont plus mises en avant. Aucune modif nécessaire.
- ❌ **Codes promo** : déjà activés sur Stripe Checkout, on ne touche pas.
- ❌ **Solution au scroll-burn** : avec un plan illimité, le scroll-burn devient un problème de coût serveur / ban DataDome, pas un problème utilisateur. Le cache 7 jours en place limite déjà l'impact. À monitorer, pas à refactorer maintenant.
- ❌ **"Détection d'options premium" dans le pitch commercial** : l'algo (`aiOptionDetector.js` + `PREMIUM_OPTIONS`) reste actif côté serveur — il enrichit la recherche LBC et influence `adjustedPrice`, donc il améliore la précision de la marge affichée. Mais rien n'est jamais rendu visuellement dans la carte ("M-Sport ✅" n'existe nulle part). On arrête de le vendre comme une feature. Si un jour on veut le rendre réel, ce sera un spec séparé qui ajoutera l'affichage dans `renderCarAnalysis`.

## Plan de déploiement

1. **Local** — modifier landing + dashboard + extension
2. **Test E2E local** :
   - Install extension fresh → visite Auto1 → première voiture a ses chiffres visibles ✅
   - Voiture suivante → chiffres floutés + CTA upgrade ✅
   - Signup via dashboard → paiement Pro → retour Auto1 → chiffres visibles partout ✅
   - Logout dashboard → retour Auto1 → chiffres re-floutés (sauf firstRevealUsed déjà consommé) ✅
3. **Deploy prod** :
   - `git push`
   - Landing : immédiat via bind mount
   - API + dashboard : `docker compose build api dashboard && docker compose up -d api dashboard`
4. **Extension** : rebuild zip v2.3 + upload Chrome Web Store
5. **Communication** : envoyer cold emails + DMs LinkedIn avec le nouveau pitch "Essaie gratuitement — 89€/mois pour tout débloquer"

## Success criteria

- Un utilisateur qui arrive sur Auto1 pour la première fois doit voir les chiffres sur 1 voiture **sans avoir créé de compte**.
- Aucun utilisateur (ni la landing, ni le dashboard, ni l'extension) ne doit voir "Starter", "Agence", "200 analyses", "Export CSV", "3 alertes" après deploy.
- Le flow signup → paiement → Pro fonctionne de bout en bout et débloque les chiffres sur toutes les voitures.
- La rotation apiKey continue de dégager les sessions concurrentes (déjà testé, on vérifie juste que ça n'a pas régressé).

## Risques / points d'attention

- **Prospects LinkedIn/cold email en cours de cycle** : si certains ont déjà lu une version de la landing qui montrait 3 plans, le pitch de rappel doit être clair ("on a simplifié : 1 plan, tout inclus, 89€"). Pas de honte à simplifier, c'est vendable comme amélioration.
- **Le "first reveal" doit être visuellement évident** : sinon l'utilisateur ne réalise pas qu'il a eu un cadeau et ne comprend pas pourquoi la 2e voiture est floutée. Un petit badge "🎁 Aperçu offert" sur la première carte règle ça.
- **Réinstallation pour gratter des reveals** : marginal et assumé. Si ça devient un problème, on bascule sur un fingerprint basique (localStorage domain-scoped côté Auto1). Pas maintenant.
- **Coût serveur** : plan illimité = potentiellement beaucoup d'analyses par user. Le cache 7 jours + le scraping LBC batché limitent déjà l'impact. À monitorer via les logs API après deploy.
