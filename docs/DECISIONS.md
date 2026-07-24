# Décisions d'architecture (ADR)

Journal des décisions structurantes. On n'en revient pas sans une nouvelle entrée qui explique pourquoi.

---

## ADR-001 — Stack : TypeScript partout
**Date :** 2026-07-24
**Décision :** Un seul langage (TypeScript) pour le back, l'app web et la landing.
**Pourquoi :** Fondateur solo → un seul cerveau, un seul toolchain, types partagés back/front. Le SDK des modèles IA en TS est de première classe ; on orchestre des modèles, on ne fait pas de ML maison (donc Python non requis).
**Compromis :** On renonce à l'écosystème ML Python. Assumé : hors périmètre (voir ADR-004, pas de fine-tuning).

## ADR-002 — Monolithe modulaire d'abord (pas microservices)
**Date :** 2026-07-24
**Décision :** Un seul dépôt, modules = « moteurs » avec frontières explicites. On NE découpe PAS en microservices maintenant.
**Contexte bible :** Ch.30/63 imposent des microservices. Ch.61 impose « un module par moteur, interfaces explicites ».
**Réconciliation :** La bible décrit la *destination* (10 ans), pas l'*ordre de construction*. On respecte Ch.61 (modules à frontières nettes) ; on diffère Ch.30/63 (services séparés) jusqu'à ce que l'échelle l'exige. Des frontières propres = découpage futur en services SANS réécriture.
**Pourquoi maintenant :** €0 impose le monolithe (microservices = plusieurs hébergements = coût + ops). Fondateur solo sans client.
**Quand revisiter :** Quand un module subit une contrainte de charge propre (typiquement le worker d'exécution en premier).

## ADR-003 — Objectif €0, données de test uniquement
**Date :** 2026-07-24
**Décision :** Toute l'infra sur des tiers gratuits (GitHub, Vercel/Cloudflare, Supabase). IA sur tier gratuit. On développe et démontre avec de FAUSSES données.
**Vérité assumée :** « Gratuit à l'infini avec de vrais clients » n'existe pas. On sépare la phase dev (€0, faux) de la phase prod (payant, réel).

## ADR-004 — Model Gateway swappable ; free en dev, no-train en prod
**Date :** 2026-07-24
**Décision :** Tous les appels IA passent par un `ModelGateway` unique. Fournisseur = config, jamais en dur dans un agent.
**Défaut dev :** Gemini Flash (tier gratuit). Pas d'inférence locale (Ollama) — écarté pour ne pas faire chauffer la machine.
**Règle d'or (sécurité) :** AUCUNE vraie donnée client ne transite par un tier gratuit (les tiers gratuits peuvent entraîner sur tes données). Le gateway refuse par design d'envoyer des données marquées « réelles » vers un provider marqué « free/entraîne ».
**Prod :** bascule vers un provider payant contractuellement sans-entraînement (Anthropic, Google payant) → changement d'une ligne de config, zéro réécriture des agents.
**Pas de fine-tuning :** l'« apprentissage » passe par la mémoire et le contexte, pas par les poids. (Voir doc archi §8.)

## ADR-005 — €0 même avec de vrais clients → BYOK natif dès la Phase 0
**Date :** 2026-07-24
**Contrainte fondateur :** rester à €0 de dépense y compris quand il y aura de vrais clients payants.
**Vérité assumée :** €0-de-dépense + aucune fuite de données + pas d'inférence locale + tenir la charge de vrais clients = système sur-contraint SANS solution si le fondateur paie l'inférence.
**Décision :** **Bring Your Own Key (BYOK).** Chaque tenant fournit sa propre clé de provider IA. L'inférence est facturée au client sur son propre compte → €0 pour la plateforme, données sous la gouvernance du client, cloud (pas de chauffe), quota par client (scale).
**Alternative documentée :** pass-through pricing (le prix client couvre l'IA) = €0 *net* mais pas €0 de dépense ; écartée tant que BYOK suffit.
**Conséquence Phase 0 (structurante) :** le schéma de données inclut dès maintenant une table `tenant_ai_credentials` (clé chiffrée par tenant, provider, mode train/no-train). Le `ModelGateway` résout le provider et la clé PAR TENANT, jamais une clé globale en dur.
**Règle d'or (rappel ADR-004) :** le gateway refuse d'envoyer des données marquées « réelles » vers un provider marqué « entraîne sur les données ».
**Friction assumée :** à l'onboarding, le client doit fournir une clé. Compromis accepté comme prix du €0 réel.

## ADR-006 — Fournisseur IA €0 : Gemini free tier sous clause EEA (no-train) + fallback Cloudflare
**Date :** 2026-07-24
**Recherche vérifiée aux sources officielles (conditions Gemini API) :** en EEA/Suisse/UK, la politique de données des Services PAYANTS s'applique à TOUS les services, y compris le quota gratuit de la Gemini API → **pas d'entraînement sur les données, même en gratuit, pour les utilisateurs européens.**
**Décision :** provider par défaut = Gemini Flash free tier (1 500 req/jour, sans CB), utilisateurs/clients européens → politique no-train contractuelle. Fallback gratuit : Cloudflare Workers AI (10 000 neurons/jour, pas de logging par défaut).
**Écartés après vérification :** Mistral Experiment (exige l'opt-in à l'entraînement), GitHub Models (entraîne depuis 04/2026), Groq (engagement no-train flou).
**Réserve n°1 (usage commercial) :** le free tier Gemini est réservé au développement. Résolu par BYOK (ADR-005) : chaque client utilise SA clé Google dans SON cadre ; la plateforme orchestre, elle ne revend pas d'inférence. Le client passe sur SON tier payant quand son volume grossit — toujours €0 pour la plateforme.
**Réserve n°2 (quotas mouvants) :** Google a déjà réduit les quotas fin 2025. Mitigé par le ModelGateway (changement de provider = config) + fallback Cloudflare.
**Conséquence dans le code :** en base, `data_policy` d'une credential Gemini EEA = 'no_train' (c'est contractuel) ; la règle d'or du gateway laisse donc passer les données réelles pour les tenants européens sur Gemini free.
