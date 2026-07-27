# SENTIA — État du projet (dernière session : 26/07/2026)

## Projet
SaaS d'employés numériques (agents IA autonomes). Renommé "Employés IA" →
**SENTIA** en cours de route (code + UI). Monorepo `employes-ia`, TS partout.
Fondateur solo, budget €0, mode caveman actif (réponses terses demandées).

## Stack
- `packages/core` — noyau : ModelGateway (Gemini+Groq interchangeables, BYOK),
  Tool Registry, Policy Engine (autonomie réglable), Memory, Advisor (conseiller IA)
- `apps/web` — Next.js 15 App Router : landing (`/`), dashboard (`/dashboard`),
  onboarding (`/onboarding`), pages légales (`/legal/*`)
- Supabase (Postgres+RLS+Auth, EU), Vercel (déploiement, prod OK)
- Groq = conseiller IA public landing (dataClass="test" only, jamais de vraies
  données). Gemini = agents clients réels (no-train EEA).

## Historique récent (tout commité/poussé sauf mention contraire)
- Conflit git remote/local résolu : gardé l'approche GitHub/Vercel (backup de
  l'ancien commit local dans la branche `backup/onboarding-reveal-local`).
- `/onboarding` = page vitrine : hologramme buste filaire central
  (`AgentHologram3D.tsx`, maillage triangulé tête/cou/épaules, lumière stable
  sans scintillement, pas de rotation pilotée par le client), cartes de
  compétences autour (`AgentSkillCards.tsx`) qui s'allument selon le texte
  tapé, chat repositionné en petit sur le côté (jamais plus gros que
  l'hologramme). Transition en fondu sur tous les CTA "Recruter"
  (`RecruitLink.tsx`).
- Sélecteur de métier : 5 rôles cliquables sous "Un seul moteur..." sur la
  landing → `/onboarding?agent=<slug>` (`lib/agent-roles.ts` centralise texte
  de chat + compétences par métier). Seul **Commercial** a un vrai backend
  (`OnboardingChat.tsx`, Gemini, tenant réel). Les 4 autres passent par
  `RoleAwaitingChat.tsx` (chat simulé, aucun appel serveur) et terminent sur
  `ComingSoonActions.tsx` — message honnête "pas encore actif", jamais un faux
  test qui ferait tourner la démo Commercial sous une autre étiquette.
- Accent couleur : mint (#6ee7a8) → cyan (#2ee6f5) partout (landing, hero
  Core3D inchangé structurellement, dashboard, hologramme).

## Tarifs & paiement (27/07/2026)
"Recruter mon agent" (`AgentActions.tsx`) → `/plans?tenant=&agent=` (3
formules) → `/checkout?plan=` (récap + paiement). Grille (`lib/plans.ts`,
officielle, ne pas modifier prix/fonctionnalités sans redemander) : Standard
499€, Professionnel 1999€ (mis en avant), Entreprise 9999€/mois. Remplace
aussi les tarifs de la landing (`PlanCard.tsx` partagé). **Aucun compte
Stripe connecté** : "Procéder au paiement" (`CheckoutAction.tsx`) affiche un
état honnête "pas encore actif". Pour UN premier client, envisager un Stripe
Payment Link créé à la main (zéro code) plutôt que l'intégration complète.

**Accès en attendant Stripe (27/07/2026) :** après "Procéder au paiement",
`CheckoutAction.tsx` propose un champ email → envoie un vrai lien magique
Supabase ("Recevoir mon agent"), préempli avec le contactEmail de l'onboarding
si `?agent=` est présent (lookup dans `checkout/page.tsx`). C'est un email
RÉEL (contrairement à l'agent lui-même) — juste le template par défaut
Supabase (anglais, générique) tant qu'il n'est pas personnalisé (proposé,
pas encore fait).

## Sécurité tenant + CRM minimal (27/07/2026) — NON COMMITÉ
ADR-018 partiellement refermé : la lecture directe (`pool.query`, sans
session) restait un vrai trou pour un tenant non-démo. Ajouté :
- `lib/tenant-access.ts` — `isAuthorizedForTenant`/`requireTenantAccess` :
  le tenant démo reste public (aucune vraie donnée), tout autre tenant exige
  une session Supabase + ligne dans `tenant_member`. Branché dans
  `dashboard/page.tsx`, `tasks/[id]/page.tsx`, `agent-actions.ts`
  (`launchSalesRun`, `decideOnTask`).
- `auth-actions.ts` : `claimTenantsForCurrentUser()` — après connexion par
  lien magique, rattache automatiquement l'utilisateur à tout tenant créé
  avec son email (via `agent_instance.config.contactEmail`) et pas encore
  réclamé. Appelé depuis `ConfirmLoginButton`. Aucun compte séparé à créer
  côté onboarding.
- `lib/leads-actions.ts` + `AddLeadForm.tsx` : formulaire "+ Ajouter un
  prospect" dans le dashboard (section "Vos prospects") — sans ça, un vrai
  client n'avait aucun moyen de nourrir son agent (seul le tenant démo avait
  des leads seedés).
Migration 0008 (lecture publique realtime bornée au tenant démo) volontairement
**laissée en place** : narrow (juste le tenant démo), pas de vraie faille.
**Toujours simulé (`NoopMailTransport`, wiring.ts)** : l'agent ne envoie
aucun vrai email — besoin d'un compte Resend/Postmark pour brancher un vrai
transport, pas encore fourni.

## Prospection réelle — Apollo.io (27/07/2026) — NON COMMITÉ
Nouvel outil `prospecting.find_leads` (`packages/core/src/tools/impl/
prospecting-find-leads.ts`) : cherche de vrais prospects via l'API Apollo.io
(People Search) selon intitulés de poste/mots-clés, et les ajoute au CRM du
tenant (dédoublonnage par email). `ApolloSearchProvider` (wiring.ts) fait
l'appel HTTP réel ; `PgLeadRepository.insertMany` écrit en base. Ajouté à
`SALES_AGENT_TASK.toolKeys` — le prompt lui dit de l'utiliser si peu/pas de
leads pertinents avant de continuer.
**`APOLLO_API_KEY`** : ajoutée à `apps/web/.env.local` (gitignored). Optionnelle
comme `GROQ_API_KEY` — absente, l'outil n'est simplement pas enregistré (pas
de crash). **Reste à faire : ajouter la même clé dans les variables
d'environnement Vercel (Settings → Environment Variables)** pour que ça
marche aussi en production — je n'ai pas accès à ce tableau de bord.
Testé : build + run démo complet sans régression (le LLM n'a pas jugé
nécessaire d'appeler le nouvel outil avec 3 leads déjà en base — comportement
normal, pas encore testé en conditions réelles avec 0 lead).

## Décisions validées (ADR dans `docs/DECISIONS.md`, 19 entrées)
- Monolithe modulaire, pas microservices (ADR-002)
- BYOK mais fallback Gemini/Groq configuré en dur pour démo (ADR-005/016)
- Auth différée à l'origine (ADR-018) — partiellement réactivée le 27/07 pour
  tout tenant non-démo (voir section Sécurité tenant + CRM)
- Agent d'accueil = conversation simple, pas AgentRuntime complet (ADR-019)
- SUPABASE_DB_URL sur Vercel = **Transaction pooler (port 6543)**, jamais
  connexion directe (5432) → ENOTFOUND sinon (IPv6 non supporté Vercel)

## Architecture landing (`apps/web/src/app/page.tsx`)
4 actes : Hero(#hero) → Mission(#mission, scroll=temps) → Threshold(#seuil,
interactif) → Conseiller(#conseiller) → Métiers → Tarifs → Fin. Noyau 3D
(`Core3D.tsx`, react-three-fiber) réutilisé partout. ScrollNav = navigation
latérale par points. Design : sérif éditorial (voix humaine) + mono (voix
machine), accent mint unique.

## Migrations DB appliquées (Supabase SQL Editor, manuel)
0001 à 0009 appliquées. 0009 = table `rgpd_request`. Prochaine migration à
créer : appliquer aussi manuellement (pas de CI auto).

## Pages légales faites
`/legal/{confidentialite,cgu,mentions,cookies,rgpd}` — contenu réaliste mais
mentions légales = **placeholders** (pas d'entreprise immatriculée). CGU à
faire relire par juriste avant clients réels. Registre RGPD art.30 dans
`docs/RGPD-REGISTRE.md`.

## À faire (priorité)
1. Commit + push (sécurité tenant + CRM + prospection Apollo)
2. Ajouter APOLLO_API_KEY dans les env vars Vercel (production)
3. Brancher un vrai transport mail (Resend/Postmark) à la place du Noop
4. Ouvrir un compte Stripe (ou Payment Link manuel pour le 1er client)
5. Immatriculer l'entreprise → remplacer placeholders mentions légales
6. Signer DPA avec Supabase/Vercel/Google/Groq
7. AIPD (analyse d'impact RGPD) — obligatoire, traitement décisionnel auto

## Skill installé
`~/.claude/skills/runtime-optimizer` — mémoire projet compacte, extraction
gros collages, raisonnement multi-expert. Utiliser en début de session.

## Style de travail utilisateur
Mode caveman actif (réponses courtes). Fondateur non-technique par endroits,
demande souvent clarification avant d'agir. Budget tokens serré — éviter
relecture inutile d'historique, préférer vérifier le code directement.
