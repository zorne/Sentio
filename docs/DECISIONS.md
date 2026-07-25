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
**Extension (même jour) :** un 503 réel observé en test ("high demand, temporary") a montré que le quota n'est pas la seule panne transitoire. `isRetryableError` couvre désormais 429 ET tout 5xx (panne serveur passagère) — jamais les 4xx logiques (requête invalide, clé refusée), qui doivent remonter immédiatement pour ne pas masquer un vrai bug.

## ADR-013 — Reprise après validation humaine (HITL, moitié manquante)
**Date :** 2026-07-24
**Contexte :** une tâche suspendue en `waiting_human` (ADR-010) n'avait aucun moyen d'être débloquée — fonctionnalité à moitié construite.
**Décision :** `AgentRuntime.resume(params, decision, approvals?)` reconstruit la trace d'outils et l'action en attente depuis le journal (`reconstructTrace`, lecture pure d'`execution_event` — aucun état en mémoire requis, donc résiste à un redémarrage du process). Sur "approve", exécute l'outil suspendu directement (sans repasser par le Policy Engine, qui redemanderait indéfiniment) puis continue la boucle normalement. Sur "reject", termine la tâche sans exécuter.
**`trustFuture` :** un "approve" peut aussi accorder une validation permanente (`confirm_once`, ADR-010) en un seul geste — le propriétaire n'a pas à faire deux actions séparées pour dire "oui, et ne me redemande plus".
**Script :** `approve-real.ts`, point d'entrée CLI (préfigure l'endpoint API réel de Phase 2) : `node dist/approve-real.js <taskId> approve|reject [--trust]`.
**Factorisation :** le câblage Postgres partagé entre `demo-real.ts` et `approve-real.ts` a été extrait dans `wiring.ts` pour ne pas dupliquer les implémentations de repository/policy/gateway.

## ADR-014 — Mémoire long terme : faits structurés + réflexion post-run tolérante
**Date :** 2026-07-24
**Décision :** table `agent_memory` (migration 0007) — 1 ligne = 1 fait court en texte, rattaché à un `agent_instance` et à la tâche source. Lue avant chaque run (`memoryFacts` injectés dans le Context Assembler), écrite après via une fonction `reflect()` qui résume le journal du run en 0-3 faits.
**Pas de vectoriel maintenant :** archi §5 — les faits structurés couvrent 80% du besoin utile (« Marc a été relancé le 14 mai », « Julie préfère le matin »). Un moteur sémantique/embeddings sera envisagé en Phase 4+, uniquement si un vrai besoin de non-structuré apparaît.
**Pas de fine-tuning, ADR non renversé :** l'apprentissage passe par ce que le modèle LIT au prochain run, pas par ses poids (archi §8).
**Tolérance à l'échec de la réflexion (correctif suite à un incident) :** un premier test a échoué avec quota Gemini épuisé PENDANT la réflexion post-run — la tâche réelle était pourtant accomplie, mais le programme sortait en erreur. Correctif : `reflectAndRemember` intercepte toute erreur, la loggue en warning, et retourne `[]`. Principe : **la mémoire est un bonus, jamais une contrainte sur le succès de la tâche.**

## ADR-015 — Retry Gemini : plafond de délai + plus de cycles
**Date :** 2026-07-24
**Contexte :** en test intensif, les 3 modèles de la chaîne peuvent se retrouver épuisés en même temps, Google renvoyant un "retry in 59s" — le paramètre `MAX_LOOPS = 3` × délai réel finissait par abandonner avant que Google débloque.
**Décision :** `MAX_LOOPS` passe à 5, et chaque cycle d'attente est plafonné à `MAX_BACKOFF_MS = 30s` — quel que soit le délai suggéré par Google, on ne fige jamais un run plus de ~2 minutes au total, quitte à retester plus tôt qu'annoncé.
**Pourquoi pas plus :** au-delà, le vrai correctif n'est plus le retry mais un second provider (Cloudflare, ADR-006) — on refuse de bloquer un client 5 minutes en le laissant croire que "ça va reprendre".

## ADR-016 — Multi-provider avec fallback : Gemini + Groq
**Date :** 2026-07-24
**Constat clé :** ajouter plus de MODÈLES à la chaîne Gemini n'aide pas — tous partagent la même limite globale par jour du compte Google (RPD partagé). La vraie résilience vient de comptes SÉPARÉS.
**Décision :** `CredentialResolver.resolve()` renvoie désormais une LISTE ordonnée de credentials, pas une seule. Le `ModelGateway` essaie chaque provider dans l'ordre, tombant sur le suivant en cas d'échec. Groq est ajouté comme provider secondaire — quota gratuit ~14 400 req/j indépendant, très rapide (<1s), aucun compte Cloud Console/MFA à traverser (une clé sur console.groq.com, comme AI Studio).
**Règle d'or ADR-004 renforcée, pas contournée :** Groq est marqué `data_policy: 'free'` (tier gratuit non contractuellement no-train). Le gateway SAUTE silencieusement un provider incompatible avec la `dataClass` de la requête au lieu d'échouer — un provider 'free' ne verra donc jamais de données réelles, par construction. Test réel du principe qui n'était que théorique jusqu'ici.
**Retry Gemini réduit :** `MAX_LOOPS` de Gemini abaissé de 5 à 2 (backoff plafonné à 10s) — avec un fallback multi-provider derrière, mieux vaut passer à Groq (<1s) que d'attendre Gemini plusieurs cycles.
**Dégradation propre :** `GROQ_API_KEY` optionnel. Si absent, seul Gemini est utilisé — le système reste fonctionnel, juste sans le filet.
**Extension future :** ajouter un provider = un fichier `providers/*.ts` + une ligne dans `credentialResolver.resolve()`. Aucun changement au runtime, aux agents, ni au gateway. Cerebras (~14 400 req/j) ou un vrai provider payant no-train pour la prod suivront le même chemin.

## ADR-017 — App web : Next.js (App Router) sur Vercel
**Date :** 2026-07-25
**Décision :** l'app cliente (`apps/web`) est une Next.js 15 App Router en TypeScript, déployée sur Vercel free. Auth par Supabase Auth (déjà en base, RLS active). Temps réel via Supabase Realtime (WebSocket sur `execution_event`).
**Pourquoi Next.js et pas SvelteKit ou HTML pur :** (1) même langage que le back → types partagés end-to-end (ADR-001). (2) Server Components + Server Actions donnent le server-side sans construire d'API dédiée maintenant. (3) Écosystème le plus dense pour recruter demain. (4) Vercel free tier généreux, déploiement automatique depuis GitHub.
**Frontière stricte :** l'app web n'appelle JAMAIS le `AgentRuntime` directement — elle passe par des Server Actions ou routes API qui, elles, utilisent le noyau. La landing statique existante (`apps/landing/index.html`) peut être migrée telle quelle en `page.tsx` de la racine plus tard, sans urgence.
**€0 confirmé :** Vercel Hobby (déploiement + preview branches), Supabase Auth (inclus dans le free tier déjà utilisé). Aucune nouvelle dépense.

## ADR-018 — Authentification différée (décision explicite du fondateur)
**Date :** 2026-07-25
**Décision fondateur :** pas de page de connexion pour l'instant — priorité aux agents, à la landing et au dashboard. L'auth (déjà codée : magic link, callback anti-scanner Apple Mail) sera branchée à la fin, une fois le reste terminé.
**Ce qui change :**
- Les Server Components (`page.tsx`, `tasks/[id]/page.tsx`) lisent directement via un pool Postgres de confiance (`apps/web/src/lib/db.ts`), scopé en dur au `DEMO_TENANT_ID` — plus de dépendance à la session Supabase Auth.
- Les Server Actions (`agent-actions.ts`) n'ont plus de vérification d'appartenance — un seul tenant existe, aucune vraie donnée client encore.
- Le temps réel (Supabase Realtime, `TaskLive.tsx`, clé anon côté navigateur) a besoin d'une policy RLS explicite puisqu'aucune session n'authentifie l'abonné : migration 0008 ouvre une lecture publique sur `execution_event`, strictement bornée à `tenant_id = DEMO_TENANT_ID`. Aucune autre table, aucun autre tenant.
**Ce qui reste en place, prêt à rebrancher :** `/login`, `/auth/callback` (avec la protection anti-prefetch Apple Mail), `supabase-server.ts`. Rien n'est supprimé, juste débranché du chemin critique.
**Obligation avant un vrai second client :** réintroduire la vérification de session dans `agent-actions.ts` et `page.tsx`/`tasks/[id]/page.tsx`, et supprimer la policy `demo_anon_read` (migration 0008). Le code d'avant cette décision est dans l'historique git (`requireMembership`), à restaurer plutôt qu'à réécrire.

## ADR-019 — Agent d'accueil : une IA qui interviewe et configure l'agent client
**Date :** 2026-07-25
**Vision fondateur :** sur la landing, une IA pose des questions au visiteur, puis configure elle-même l'agent en fonction de ses réponses — pas un formulaire de configuration technique.
**Décision architecturale clé :** l'agent d'accueil n'est PAS un agent client (archi §3a, boucle autonome en arrière-plan) — c'est une conversation interactive en aller-retour avec un humain. Plutôt que de contorsionner `AgentRuntime`/`Task`/journal (conçus pour l'exécution autonome), un chemin dédié appelle `ModelGateway.generate()` directement, un tour à la fois, sans Task ni journal — le noyau reste inchangé, ce n'est qu'un nouveau consommateur du Gateway.
**Outil `platform.create_tenant_agent` :** appelé par l'agent d'accueil une fois l'interview terminée — crée le tenant, l'agent_instance, et **personnalise son system prompt** à partir des réponses (secteur, profil de bon prospect, ton, niveau d'autonomie). C'est ça, « l'IA qui configure l'agent » : la config vit dans `agent_instance.config.systemPrompt`, lue par `agent-actions.ts` à chaque run (surcharge le prompt par défaut).
**Aucun fallback Groq pour cet agent :** contrairement à la démo, l'interview contient de VRAIES informations d'un VRAI prospect (nom d'entreprise, email) → uniquement Gemini no-train, jamais de repli vers un tier gratuit qui pourrait entraîner dessus (ADR-004 appliqué strictement ici, pas juste en théorie).
**Autonomie par défaut prudente :** même en niveau "autonomous" choisi par le client, l'irréversible reste en `confirm_once` — jamais d'auto total dès la première interview (archi §2 principe 5).
**Dashboard multi-tenant minimal :** `page.tsx` accepte `?tenant=<id>` pour afficher n'importe quel tenant (pas seulement la démo) — nécessaire pour que l'onboarding redirige vers le bon tableau de bord. Reste sans authentification (ADR-018) : l'URL fait office d'identifiant, à sécuriser avant tout vrai lancement public.
