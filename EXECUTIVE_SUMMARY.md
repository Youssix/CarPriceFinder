# 🚀 CarPriceFinder - Executive Summary

**Date**: 2025-10-02 | **Version**: 1.0 | **Statut**: Prêt pour exécution

---

## 🎯 VISION PRODUIT

**Extension Chrome → Plateforme SaaS d'analyse automatisée de rentabilité automobile**

**Proposition de valeur** :
- 💰 **Gain financier** : +500 à 1000€ de marge par véhicule
- ⏱️ **Gain de temps** : 10h/semaine économisées
- 🛡️ **Réduction risque** : Éviter 500-1500€ de perte par achat mal évalué

---

## 👥 MARCHÉ CIBLE

### Utilisateurs Prioritaires
1. **Dealers professionnels** (15k France) - 29€/mois
2. **Particuliers investisseurs** (50k actifs) - 19€/mois
3. **Garages avec VO** (8k France) - 59€/mois

### Taille de Marché
- **TAM France** : 25M€/an
- **TAM Europe** : 120M€/an (expansion M12+)

---

## 💰 BUSINESS MODEL

| Phase | Offre | Prix | Cible Revenus |
|-------|-------|------|---------------|
| **M1-3 MVP** | Pro | 29€/mois | 2.9k€ MRR (100 users) |
| **M4-6 Growth** | Free + Pro | 0€ / 49€/mois | 15k€ MRR (250 Pro) |
| **M7-12 Scale** | Free/Pro/Business/Enterprise | 0€ / 49€ / 99€ / 299€ | 63k€ MRR |

**Projection 12 mois** : 760k€ ARR | Marge brute 95%+

**ROI Client** :
- Abonnement : 29€/mois
- Gain moyen : +750€/véhicule × 10/mois = +7,500€/mois
- **ROI = 25,900%** (1 voiture = 25 mois d'abonnement)

---

## 🛠️ ROADMAP PRODUIT

### PHASE 1 - MVP (Mois 1-3) | Budget: 6k€
✅ **Existant à conserver** :
- Extension Chrome Auto1
- Analyse IA options premium
- Comparaison LeBonCoin + marge

🔨 **Développements critiques** :
- Dashboard web centralisé (historique 30j, export CSV)
- Système alertes email (bonnes affaires auto)
- Score rentabilité A-F
- Paiement Stripe + trial 7j

**Délai** : 4-5 semaines

---

### PHASE 2 - Growth (Mois 4-6) | Budget: 25k€
- Historique prix 30/60/90j + graphiques
- Alertes push navigateur + SMS
- Listes surveillance personnalisées
- Multi-plateformes (Mobile.de, AutoScout24)
- App mobile iOS/Android (React Native)

**Délai** : 8-12 semaines

---

### PHASE 3 - Enterprise (Mois 7-12) | Budget: 24k€
- API REST public + webhooks
- Intégration CRM garages (Salesforce, Pipedrive)
- Reporting comptable avancé
- Multi-utilisateurs + permissions
- White-label concessions

**Délai** : 13-16 semaines

---

## 📈 GO-TO-MARKET

### Phase 1 - MVP Launch (M1-3) : Founder-Led
- **Validation terrain** : 10 beta users payants (50% réduction lifetime)
- **Content marketing SEO** : 1 article/semaine (calcul marge, erreurs dealers)
- **Paid ads** : 500€/mois Google + Facebook
- **KPI** : 100 users payants = 2.9k€ MRR

### Phase 2 - Scaling (M4-6) : Product-Led
- **Freemium launch** : 500 free → 75 conversions Pro (15%)
- **Partnerships** : Écoles commerce auto (300 étudiants/an)
- **Affiliate program** : Influenceurs YouTube auto (30% commission)
- **KPI** : 500 users Pro = 24.5k€ MRR

### Phase 3 - Enterprise (M7-12) : Sales-Led
- **Outbound sales** : SDR dédié, top 100 garages France
- **Salons pro** : Equip Auto Paris (3k€/salon)
- **Intégrations marketplace** : Zapier, Make.com
- **KPI** : 1,000 Pro + 100 Business + 15 Enterprise = 63.4k€ MRR

---

## 🔧 STACK TECHNIQUE

### Frontend
- Next.js 14 (dashboard web)
- Chrome Extension (existant)
- React Native (mobile M4+)

### Backend
- Node.js + Express (existant) + tRPC
- PostgreSQL (Supabase)
- Redis (Upstash)
- BullMQ (scraping async)

### Infrastructure
- Vercel (frontend 0€)
- Railway (backend 20€/mois)
- Supabase (DB 25€/mois)
- **Coût total 100 users** : 70€/mois (marge 98.6%)

---

## ⚠️ RISQUES & MITIGATION

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Scraping bloqué LBC | ⚠️ Haute | Proxies rotatifs + API partenaires |
| Coûts OpenAI explosifs | ⚠️ Moyenne | Cache 7j + modèle local Llama 3 |
| Concurrence (AutoUncle) | ⚠️ Haute | Focus niche dealers <20 voitures |
| Légalité scraping | ⚠️ Moyenne | Disclaimer usage pro + conseil juridique |
| Adoption lente | ⚠️ Basse | MVP lean 4-6 sem + pivot rapide si <50 users M3 |

---

## 📊 SUCCESS METRICS

### North Star Metric
**"Nombre de voitures rentables achetées/mois"** (impact réel argent gagné clients)

### KPIs Principaux
- **CAC** : <50€ (target), <80€ (max)
- **Conversion Free→Pro** : >15%
- **Churn mensuel** : <5% (M6), <3% (M12)
- **NPS** : >50
- **LTV/CAC** : >8x

### Progression MRR
- **M3** : 2,900€ (100 Pro)
- **M6** : 15,000€ (250 Pro + 30 Business)
- **M12** : 63,400€ (500 Pro + 80 Business + 10 Enterprise)
- **ARR M12** : 760k€

---

## 💰 FINANCEMENT

### Budget Total 12 mois : 73k€
| Poste | Montant |
|-------|---------|
| Développement (MVP + Phase 2+3) | 55k€ |
| Infrastructure (12 mois) | 3k€ |
| Marketing & Ads | 12k€ |
| Juridique & Compta | 3k€ |

### Stratégie Levée
- **0-20k€** : Bootstrapping (MVP + validation)
- **20-50k€** : Love Money (scaling initial)
- **50-150k€** : Business Angels (scaling France)
- **300-500k€** : Seed Round (expansion Europe)

---

## ✅ PROCHAINES ACTIONS CRITIQUES

### Action Immédiate (AVANT dev dashboard)
**👉 Valider willingness to pay**

**Plan 7 jours** :
1. **Jour 1** : Créer landing page MVP (no-code Carrd/Webflow)
2. **Jour 2-5** : Campagne pre-sales LinkedIn (100 dealers contactés)
3. **Jour 6-7** : Objectif 10 pré-commandes 14€/mois (early bird 50%)

**Décision** :
- ✅ Si >10 pré-commandes → GO développement dashboard
- ❌ Si <5 pré-commandes → Pivoter pricing ou proposition valeur

### Semaines 1-4 (si validation OK)
- **Semaine 1** : Setup stack technique + design mockups
- **Semaine 2** : Sprint 1 Auth + Dashboard basique
- **Semaine 3** : Sprint 2 Historique + Alertes
- **Semaine 4** : Sprint 3 Stripe + Beta tests

---

## 🎯 OBJECTIF 90 JOURS

**100 utilisateurs payants = 2,900€ MRR**

**Conditions de succès** :
- CAC <50€
- Churn <8%
- NPS >40
- ROI client prouvé (+5,000€ gain moyen/mois)

---

**Document prêt pour pitch investisseurs + roadmap exécution**

🔨 **Synthèse terminée !**
