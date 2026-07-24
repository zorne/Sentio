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

## ADR-007 — Phase 1 : premier agent = Sales, première tâche = fiche de RDV via Google Sheet
**Date :** 2026-07-24
**Décision :** premier outil réel = `sheets.read_leads` (lecture seule, Google Sheets API v4 + clé API gratuite). Première tâche démontrée : préparer une fiche de brief avant un rendez-vous commercial, à partir d'un lead lu dans un Sheet.
**Pourquoi Google Sheet :** €0, aucune inscription tierce (pas d'OAuth CRM à intégrer en Phase 1), et c'est l'outil que la cible (Ch.9) utilise déjà avant d'avoir un vrai CRM. Remplaçable par un vrai CRM en Phase 3 : même contrat `Tool`, zéro impact sur le runtime.
**Pourquoi la fiche de RDV plutôt que qualification/relance :** effet `read` uniquement → autonomie automatique par défaut, aucune validation humaine à construire pour la première démo, zéro action irréversible. Prouve toute la boucle (lecture réelle → raisonnement → sortie structurée → traçage complet) sans risque.
**Un seul outil, pas deux :** la rédaction de la fiche est la réponse finale du modèle (texte), pas un outil séparé — inutile d'ajouter une abstraction pour ça (principe « refuser la complexité qui n'apporte aucune valeur »).

## ADR-008 — Lecture du Sheet via publication CSV, pas via l'API Sheets
**Date :** 2026-07-24
**Contexte :** l'API Google Sheets exige une clé créée dans Google Cloud Console, qui exige désormais la MFA sur le compte Google (bloquant, chronophage pour une démo).
**Décision :** l'outil `sheets.read_leads` lit un CSV public obtenu via « Fichier → Partager → Publier sur le Web → CSV » du Sheet — un simple `fetch()` HTTP, aucune clé, aucun compte Cloud à configurer.
**Compromis assumé :** le Sheet doit être publié publiquement en lecture (pas de contrôle d'accès Google). Acceptable en Phase 1 (données de test uniquement, ADR-003). À revisiter en Phase 3 quand on migrera vers un vrai CRM avec OAuth propre par tenant.
**Conséquence code :** `createReadLeadsTool()` ne prend plus de `SheetsCredentialResolver` — l'URL CSV est fournie directement en paramètre d'outil (résolue depuis la config de l'agent_instance).
**Statut :** remplacé par ADR-009 avant mise en œuvre — conservé ici pour l'historique de la décision.

## ADR-009 — Abandon de Google Sheets : leads stockés dans notre propre base (mini-CRM interne)
**Date :** 2026-07-24
**Contexte :** même la publication CSV (ADR-008) demande des clics dans les menus Google. Le fondateur demande une solution encore plus simple, sans aucune dépendance Google.
**Décision :** les leads sont stockés dans une table `lead` de notre propre base Supabase (migration 0003), rattachée au tenant, RLS activée comme le reste du schéma. L'outil devient `crm.read_leads` (remplace `sheets.read_leads`) et lit directement via un `LeadRepository`, sans appel réseau externe ni clé d'aucune sorte.
**Pourquoi c'est mieux, pas juste plus simple :** zéro friction ET zéro dépendance tierce ET isolation multi-tenant native (contrairement à un Sheet public partagé par tout le monde). C'est aussi le premier pas concret vers le vrai CRM interne visé par la Project Bible (Ch.24), pas un contournement de démo.
**Conséquence :** `sheets.read_leads` (ADR-007/008) est retiré du code. `agent_definition.default_tools` pour l'agent Sales pointera vers `crm.read_leads`.
**Migration future (Phase 3+) :** si un client utilise déjà un vrai CRM externe (HubSpot, Salesforce...), un nouvel outil `crm.read_leads` alternatif sera ajouté avec le même contrat `Tool` — zéro changement au runtime.

## ADR-010 — Autonomie à trois valeurs : auto / confirm / confirm_once
**Date :** 2026-07-24
**Décision :** `AutonomySetting` accepte désormais `confirm_once`, en plus de `auto`/`notify`/`confirm`/`deny`. En mode `confirm_once`, la première action d'une classe d'effet demande validation ; une fois accordée (table `standing_approval`, migration 0006), les actions suivantes de cette classe s'exécutent seules — jusqu'à révocation.
**Portée choisie :** la validation vaut pour TOUTES les actions futures de cette classe d'effet sur cet agent (pas seulement le même destinataire, pas seulement la tâche en cours) — parcours de mise en confiance le plus lisible pour un client non technique.
**Sécurité :** révocable à tout moment (suppression de la ligne `standing_approval`) ; sans implémentation de `StandingApprovalStore` fournie, `confirm_once` se dégrade en `confirm` (prudent par défaut, jamais l'inverse).

## ADR-011 — Function-calling multi-tours : encodage natif, pas de texte narratif
**Date :** 2026-07-24
**Incident réel observé :** en testant `confirm_once` sur 3 outils enchaînés (lecture → écriture → email), l'agent a écrit en texte final `[Appel outil mail.send] input={...}` SANS jamais réellement appeler l'outil. Cause : `ContextAssembler` encodait l'historique des appels d'outils en texte libre imitant un appel plutôt qu'en tours structurés — au 3ᵉ outil, Gemini a fini par imiter ce motif textuel en prose au lieu d'émettre un vrai appel de fonction structuré.
**Conséquence observée :** aucune action dangereuse (rien n'est exécuté sans vrai appel d'outil — le Policy Engine n'a rien eu à bloquer), mais le test de `confirm_once` était invalide et un utilisateur lisant le texte final aurait pu croire l'email envoyé alors qu'il ne l'était pas.
**Correctif :** `GenerateRequest.messages` devient `ConversationTurn[]` — union structurée (`text` / `tool_call` / `tool_result`), plus fidèle et provider-agnostique. `GeminiProvider` encode nativement : tour `model` avec `functionCall` suivi d'un tour `user` avec `functionResponse`, conformément au contrat multi-tours de l'API Gemini (functionResponse doit suivre IMMÉDIATEMENT le functionCall correspondant).
**Principe retenu :** ne jamais reconstituer un événement structuré (appel d'outil, décision) en texte libre dans le contexte envoyé au modèle — un LLM imite les motifs qu'on lui montre, y compris ceux qu'on voulait qu'il lise passivement.

## ADR-012 — Chaîne de modèles de secours : jamais à court de tokens
**Date :** 2026-07-24
**Contrainte fondateur :** ne jamais être bloqué par un quota gratuit épuisé.
**Décision :** `GeminiProvider` essaie une CHAÎNE de variantes gratuites (`gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.5-flash-lite`), chacune ayant son propre quota côté Google. Sur erreur 429 (quota), il passe au modèle suivant ; si toute la chaîne est épuisée, il attend le délai suggéré par Google (ou 5s par défaut) puis reboucle sur toute la chaîne, jusqu'à 3 cycles avant d'abandonner avec une erreur claire.
**Pourquoi pas un autre provider (Cloudflare) tout de suite :** aurait nécessité un nouveau compte/clé (friction déjà vécue avec Google Cloud Console/MFA). Cette solution est €0, zéro compte supplémentaire, et couvre la cause réelle observée en test (quota épuisé après usage intensif en développement).
**Limite assumée :** les erreurs NON liées au quota (4xx logique, 5xx serveur) ne sont jamais rebouclées — seul un 429 déclenche le fallback, pour ne pas masquer un vrai bug derrière des tentatives silencieuses.
**Évolution prévue :** le même mécanisme (boucle sur une liste ordonnée, filtrage strict sur l'erreur de quota) s'étendra naturellement à un vrai multi-provider (Cloudflare, ADR-006) quand le besoin de résilience dépassera ce qu'une seule chaîne Gemini peut couvrir — sans changer le contrat `ModelProvider`.
