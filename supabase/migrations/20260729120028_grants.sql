-- Droits explicites sur le schéma public.
--
-- ⚠️ POURQUOI CETTE MIGRATION EXISTE.
--
-- Une politique RLS ne donne aucun droit : elle en retire. Le droit de base vient d'un GRANT.
-- Sur Supabase, la plateforme accorde par défaut de larges droits aux rôles `anon` et
-- `authenticated` sur le schéma public — ce qui signifie qu'une table créée sans RLS y est
-- ouverte à tous, et que la protection repose entièrement sur le fait de ne jamais l'oublier.
--
-- S'appuyer sur ce défaut serait doublement fautif :
--   1. l'architecture impose de rester INDÉPENDANT DE L'HÉBERGEUR (docs/02-architecture.md) ;
--      un schéma dont la sécurité dépend d'un réglage de plateforme ne l'est pas ;
--   2. la migration de vérification (0029) contrôle RLS et politiques, pas les droits — sans
--      ce fichier, les deux filets laissent passer une erreur de droits.
--
-- On repart donc de zéro : on retire tout, puis on accorde exactement ce que chaque politique
-- suppose. Une table absente de ce fichier est inaccessible à tout rôle client — c'est la
-- posture par défaut voulue, et elle est ici EXPLICITE.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Le catalogue des formules : la vitrine l'affiche, donc visible même sans compte.
grant select on public.plan, public.plan_quota to anon, authenticated;

-- Entreprise et droits — lecture seule. La création d'entreprise et l'ajout de membres passent
-- par le serveur au moment du recrutement (lot 5), jamais par le client.
grant select on public.tenant, public.tenant_member to authenticated;
grant select on public.subscription, public.usage_counter to authenticated;

-- Référentiels sans donnée client : lecture seule pour un membre connecté.
grant select on public.employee_definition, public.sector_profile, public.capability to authenticated;

-- Les employés de l'entreprise et leur périmètre.
grant select on public.employee, public.employee_capability to authenticated;

-- Le travail : le client constate, il ne pilote pas la file.
grant select on public.task, public.strategy_change to authenticated;

-- L'objectif appartient au dirigeant : il le fixe et le corrige.
grant select, insert, update on public.objective to authenticated;

-- Le droit d'intervention humaine sur une décision automatisée (docs/10-securite-rgpd.md).
grant select, update on public.approval, public.standing_approval to authenticated;

-- Le client déclare ses ventes lui-même — c'est le modèle d'attribution.
grant select, insert on public.outcome to authenticated;

-- Les notifications : lues, et marquées comme lues.
grant select, update on public.notification to authenticated;

-- La mémoire d'entreprise : le client conserve le droit d'écriture et de retrait sur
-- l'INTÉGRALITÉ des deux tables (docs/04-contextes-memoire.md). Aucun delete : le retrait est un
-- changement de statut, sinon on ne peut plus expliquer ce que l'employé croyait en agissant.
grant select, insert, update on public.company_profile, public.learned_fact to authenticated;

-- Fonction d'appartenance, appelée par chaque politique.
grant execute on function public.is_tenant_member(uuid) to authenticated;

-- Volontairement absentes — réservées au serveur :
--   identity, capability_binding, job, execution_event,
--   provider_credential, provider_quota, diagnostic_session, recommendation.
-- Ce sont la mécanique et le réservoir, que le client ne voit jamais.
