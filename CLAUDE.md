# SENTIA — État du projet (dernière session : 27/07/2026)

## Projet
SaaS d'employés numériques (agents IA autonomes). Renommé "Employés IA" →
**SENTIA** en cours de route (code + UI). Monorepo `employes-ia`, TS partout.
Fondateur solo, budget €0, mode caveman actif (réponses terses demandées).

## Stack
- `packages/core` — noyau : ModelGateway (Gemini+Groq, BYOK), Tool Registry,
  Policy Engine (autonomie réglable), Memory, Advisor.
- `apps/web` — Next.js 15 App Router : landing (`/`), onboarding
  (`/onboarding`), tarifs (`/plans`, `/checkout`), dashboard (`/dashboard`),
  pages légales (`/legal/*`).
- Supabase (Postgres+RLS+Auth, EU), Vercel (déploiement, prod OK).
- Groq = conseiller IA public landing (dataClass="test" only). Gemini =
  agents clients réels (no-train EEA).

## Parcours client actuel (tout commité/poussé)
1. **Landing → `/onboarding?agent=<slug>`** : 5 métiers cliquables sous
   "Un seul moteur...". Seul **Commercial** a un vrai backend
   (`OnboardingChat.tsx`, Gemini, crée un vrai tenant). Les 4 autres
   (Support/Comptabilité/Marketing/RH) passent par `RoleAwaitingChat.tsx`
   (chat simulé, aucun appel serveur) → `ComingSoonActions.tsx` (message
   honnête "pas encore actif", jamais un faux test). Registre centralisé :
   `lib/agent-roles.ts` (texte de chat + compétences par métier).
2. **Page onboarding** : hologramme buste filaire central
   (`AgentHologram3D.tsx`, maillage triangulé, lumière stable sans
   scintillement, pas de rotation pilotée par le client), cartes de
   compétences (`AgentSkillCards.tsx`) qui s'allument selon le texte tapé,
   chat en petit sur le côté. Transition en fondu sur tous les CTA
   "Recruter" (`RecruitLink.tsx`).
3. **Fin d'onboarding → `/plans?tenant=&agent=`** (`AgentActions.tsx`,
   bouton "Recruter mon agent") : 3 formules (`lib/plans.ts`, grille
   officielle, ne pas modifier prix/fonctionnalités sans redemander) —
   Standard 499€, Professionnel 1999€ (mis en avant), Entreprise
   9999€/mois. Même grille sur la landing (`PlanCard.tsx` partagé).
4. **`/checkout?plan=`** : récap + paiement. **Aucun compte Stripe
   connecté** — "Procéder au paiement" (`CheckoutAction.tsx`) affiche un
   état honnête, puis propose de **recevoir l'agent par email** (vrai lien
   magique Supabase, préempli avec l'email de l'onboarding). Pour UN
   premier client : envisager un Stripe Payment Link manuel plutôt que
   l'intégration complète.
5. **Connexion → dashboard** : `claimTenantsForCurrentUser()`
   (`auth-actions.ts`) rattache automatiquement l'utilisateur au tenant
   créé avec son email pendant l'onboarding — aucun compte séparé.
   Dashboard = tâches + section "Vos prospects" (`AddLeadForm.tsx`,
   `leads-actions.ts`) pour nourrir l'agent manuellement.

## Sécurité tenant (ADR-018 partiellement refermé)
`lib/tenant-access.ts` (`isAuthorizedForTenant`/`requireTenantAccess`) : le
tenant démo reste public (aucune vraie donnée), tout autre tenant exige une
session Supabase + ligne dans `tenant_member`. Branché dans
`dashboard/page.tsx`, `tasks/[id]/page.tsx`, `agent-actions.ts`
(`launchSalesRun`, `decideOnTask`). Migration 0008 (lecture realtime
publique bornée au tenant démo) volontairement laissée en place — narrow,
pas de vraie faille.

## Ce qui reste simulé / bloqué sur un compte externe
- **Email de relance** : `NoopMailTransport` (wiring.ts) — l'agent n'envoie
  aucun vrai email de prospection. Besoin d'un compte Resend/Postmark.
- **Paiement** : pas de Stripe (voir plus haut).
- **Prospection Apollo** : outil `prospecting.find_leads`
  (`packages/core/src/tools/impl/prospecting-find-leads.ts` +
  `ApolloSearchProvider` dans wiring.ts) cherche de vrais prospects et les
  ajoute au CRM (dédoublonnage par email). `APOLLO_API_KEY` ajoutée en
  local (`apps/web/.env.local`, gitignored) — **manque encore dans les env
  vars Vercel** (je n'y ai pas accès). Dégradation propre si absente (outil
  simplement pas enregistré, comme Groq).
- **Email de connexion** : toujours le gabarit générique Supabase
  (anglais) — template français proposé, pas encore fait.

## Décisions clés (ADR complètes dans `docs/DECISIONS.md`, 19 entrées)
- Monolithe modulaire, pas microservices (ADR-002).
- BYOK mais fallback Gemini/Groq en dur pour démo (ADR-005/016).
- Auth différée à l'origine (ADR-018) — réactivée le 27/07 pour tout
  tenant non-démo (voir Sécurité tenant ci-dessus).
- Agent d'accueil = conversation simple, pas AgentRuntime complet (ADR-019).
- SUPABASE_DB_URL sur Vercel = **Transaction pooler (port 6543)**, jamais
  connexion directe (5432) → ENOTFOUND sinon (IPv6 non supporté Vercel).

## Landing (`apps/web/src/app/page.tsx`)
4 actes : Hero → Mission (scroll=temps) → Seuil (interactif) → Conseiller →
Métiers → Tarifs → Fin. Noyau 3D (`Core3D.tsx`) réutilisé partout. Design :
sérif éditorial (voix humaine) + mono (voix machine), accent **cyan
#2ee6f5** (changé depuis le mint d'origine, partout dans l'app).

## Migrations DB (Supabase SQL Editor, manuel, pas de CI)
0001 à 0009 appliquées. 0009 = table `rgpd_request`.

## Pages légales
`/legal/{confidentialite,cgu,mentions,cookies,rgpd}` — mentions légales
= **placeholders** (pas d'entreprise immatriculée). CGU à faire relire par
un juriste avant clients réels. Registre RGPD art.30 dans
`docs/RGPD-REGISTRE.md`.

## À faire (priorité)
1. Ajouter `APOLLO_API_KEY` dans les env vars Vercel (production)
2. Brancher un vrai transport mail (Resend/Postmark) à la place du Noop
3. Ouvrir un compte Stripe (ou Payment Link manuel pour le 1er client)
4. Immatriculer l'entreprise → remplacer placeholders mentions légales
5. Signer DPA avec Supabase/Vercel/Google/Groq
6. AIPD (analyse d'impact RGPD) — obligatoire, traitement décisionnel auto

## Style de travail utilisateur
Mode caveman actif (réponses courtes). Fondateur non-technique par endroits,
demande souvent clarification avant d'agir — mais autorise volontiers une
fois le compromis expliqué (ex: "recréer l'agent" → interprété comme
simplifier l'usage/CRM, confirmé). Budget tokens serré — éviter relecture
inutile d'historique, vérifier le code directement. Pour toute intégration
externe (Stripe, Resend, Apollo...) : demander explicitement s'il a un
compte/clé avant de coder, ne jamais créer de compte à sa place.

## Skill installé
`~/.claude/skills/runtime-optimizer` — mémoire projet compacte, extraction
gros collages, raisonnement multi-expert. Utiliser en début de session.
