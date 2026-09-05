-- LADY-C — la configuration de Lady : ce qu'elle fait pour CETTE entreprise, et pourquoi.
--
-- ══ CE QUI EXISTAIT, ET POURQUOI ÇA NE SUFFISAIT PAS ══
--
-- La configuration existait déjà — éparpillée, et sans mémoire :
--
--   · `employee.autonomy`      : le niveau d'autonomie, mais seul et sans justification ;
--   · `employee_capability`    : les capacités ouvertes, mais sans dire QUI a décidé de les ouvrir ;
--   · `company_profile`        : le contexte, qui n'est pas une décision ;
--   · `Calibration` (domaine)  : rôle, priorités, ton, exclusions — **produit par le moteur de
--                                recommandation et jamais écrit nulle part** ;
--   · `strategy_change`        : une phrase libre, sans lien vers ce qui a changé.
--
-- Trois questions restaient donc sans réponse, et ce sont exactement celles que le produit promet :
-- **pourquoi Lady a changé, quand, et ce qu'il y avait avant.**
--
-- ══ CE QUE CETTE MIGRATION POSE ══
--
-- Une configuration est **une version**, pas un réglage. On ne modifie jamais un rôle en place :
-- on publie une version suivante, qui porte son déclencheur, sa raison, le diagnostic qui l'a
-- produite et la version qu'elle remplace. C'est la même forme que l'ADN (`20260729120006`), et
-- pour la même raison — ce qui a été décidé doit rester relisible après coup.
--
-- ⚠️ LE RÔLE EST UNE SORTIE, JAMAIS UNE ENTRÉE (`docs/adr/0029`). `role` n'est pas un métier
-- choisi dans un catalogue : c'est ce que le diagnostic a conclu. Deux entreprises du même
-- secteur peuvent recevoir deux rôles différents ; c'est le but.
--
-- ══ CE QUE LA BASE GARANTIT, PLUTÔT QUE LE CODE ══
--
--   1. une seule configuration active par employé — sinon « laquelle s'applique » redevient flou ;
--   2. les versions se suivent : la v1 n'a pas de précédente, toute autre en a une, et elle
--      appartient au même employé ;
--   3. une configuration publiée est IMMUABLE — on en publie une neuve, on ne réécrit pas
--      l'histoire ;
--   4. une capacité ne peut être activée que si un moteur la sert pour la formule de
--      l'entreprise. Une configuration peut RETRANCHER au périmètre, jamais l'étendre.
--
-- ══ CE QUE CETTE MIGRATION NE FAIT PAS ENCORE ══
--
-- La borne du point 4 est celle d'aujourd'hui : `capability_binding`, c'est-à-dire « existe-t-il
-- un moteur pour cette capacité dans cette formule ». La borne par les capacités du **Lady Core**
-- lui-même viendra à l'étape 5 du plan, quand `employee_definition` cessera d'être un métier pour
-- devenir le noyau et portera enfin la liste de ce qui est concevable. L'ADN v1 est en prose : il
-- ne peut pas encore servir de borne mécanique, et le dire vaut mieux que le simuler.
--
-- Réalise : LADY-C

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1. La configuration, versionnée
-- ═════════════════════════════════════════════════════════════════════════════════════════════

create table public.lady_configuration (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete cascade,
  employee_id  uuid not null,
  version      integer not null check (version > 0),

  -- ── Ce que la configuration fixe ──────────────────────────────────────────────────────────
  -- SORTIE du diagnostic. Jamais un métier choisi par le client.
  role         text not null check (length(trim(role)) > 0),
  -- L'ordre de travail, tel qu'un dirigeant le lirait. Tableau JSON de chaînes.
  priorites    jsonb not null default '[]'::jsonb,
  -- Ce que Lady ne fera pas pour CE client, en plus des limites du noyau. Retranche, n'ajoute pas.
  limites      jsonb not null default '[]'::jsonb,
  -- Même échelle que `employee.autonomy` : la configuration en est la source, l'employé le reflet.
  autonomie    text not null check (autonomie in ('confirm', 'confirm_once', 'auto')),

  -- ── Pourquoi elle existe ──────────────────────────────────────────────────────────────────
  declencheur  text not null
                 check (declencheur in ('recrutement', 'diagnostic', 'resultats', 'demande_client')),
  -- Lisible par le dirigeant, dans son vocabulaire. Une raison vide est un changement inexpliqué.
  raison       text not null check (length(trim(raison)) > 0),
  -- Le diagnostic qui l'a produite, quand il y en a un. Nul au recrutement initial.
  --
  -- ⚠️ PAS de clé étrangère, et c'est délibéré. `diagnostic_session` appartient à la zone
  -- VITRINE, étanche à la zone client (`docs/02-architecture.md`) : la vitrine n'a aucun accès
  -- aux données d'entreprise, et une clé étrangère coudrait les deux zones ensemble. On garde
  -- donc la référence comme une trace, vérifiable côté serveur, pas comme un lien de schéma.
  diagnostic_session_id uuid,
  -- La version qu'elle remplace. Nulle pour la v1, obligatoire ensuite (contrainte plus bas).
  precedente_id uuid,

  active       boolean not null default true,
  created_at   timestamptz not null default now(),

  constraint lady_configuration_tenant_id_key unique (tenant_id, id),
  constraint lady_configuration_employee_id_fkey
    foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade,
  constraint lady_configuration_version_unique unique (employee_id, version),
  -- La clé porte l'entreprise : une chaîne de versions ne peut pas traverser deux entreprises
  -- (`20260729120033`). `restrict` : on ne supprime pas une version dont une autre descend.
  constraint lady_configuration_precedente_id_fkey
    foreign key (tenant_id, precedente_id)
    references public.lady_configuration (tenant_id, id) on delete restrict,

  -- Les tableaux doivent être des tableaux : un objet passerait, et se lirait mal six mois après.
  constraint lady_configuration_priorites_tableau check (jsonb_typeof(priorites) = 'array'),
  constraint lady_configuration_limites_tableau   check (jsonb_typeof(limites) = 'array'),

  -- La v1 naît sans passé ; toute version suivante en a un. Sans ça, la chaîne se casse en
  -- silence et « ce qu'il y avait avant » devient irrécupérable.
  constraint lady_configuration_chaine
    check ((version = 1) = (precedente_id is null))
);

create index lady_configuration_tenant_idx on public.lady_configuration (tenant_id);
create index lady_configuration_employe_idx
  on public.lady_configuration (employee_id, version desc);

-- Une seule configuration active par employé. C'est ce qui rend « laquelle s'applique »
-- décidable sans convention de tri — même raisonnement que l'objectif actif (`20260815120002`).
create unique index lady_configuration_une_seule_active
  on public.lady_configuration (employee_id)
  where active;

comment on table public.lady_configuration is
  'Ce que Lady fait pour une entreprise donnée, et pourquoi. Une configuration est une VERSION : '
  'on ne modifie jamais un rôle en place, on en publie une suivante.';
comment on column public.lady_configuration.role is
  'SORTIE du diagnostic (adr/0029). Jamais un métier choisi dans un catalogue.';

-- Toute table portant `tenant_id` porte le verrou : une ligne ne change jamais d'entreprise
-- (`20260729120034`). Le filet structurel des invariants le vérifie sur tout le schéma.
create trigger lady_configuration_tenant_immutable
  before update on public.lady_configuration
  for each row execute function public.reject_tenant_change();

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2. La chaîne des versions ne peut pas traverser deux employés
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- Une clé étrangère simple sur `precedente_id` laisserait une configuration pointer la version
-- d'un employé d'une AUTRE entreprise. Le lien porte donc l'employé, comme toute clé étrangère
-- du dépôt porte l'entreprise (`20260729120033`).

create function public.configuration_suit_le_meme_employe()
returns trigger
language plpgsql
as $$
declare
  employe_precedent uuid;
  version_precedente integer;
begin
  if new.precedente_id is null then
    return new;
  end if;

  select employee_id, version into employe_precedent, version_precedente
    from public.lady_configuration where id = new.precedente_id;

  -- Version précédente introuvable : ce n'est pas à ce déclencheur de le dire. La clé étrangère
  -- composite et la contrainte de chaîne rendent alors le message juste ; parler ici les
  -- masquerait derrière un diagnostic faux (« un autre employé » alors qu'il n'y en a aucun).
  if not found then
    return new;
  end if;

  if employe_precedent is distinct from new.employee_id then
    raise exception
      'Configuration refusée : sa version précédente appartient à un autre employé. '
      'Une chaîne de versions décrit UNE Lady, pas deux.';
  end if;

  if version_precedente <> new.version - 1 then
    raise exception
      'Configuration refusée : v% succède à v%, il manque une version. La chaîne doit être '
      'continue, sinon « ce qu''il y avait avant » devient faux.', new.version, version_precedente;
  end if;

  return new;
end;
$$;

create trigger lady_configuration_chaine_coherente
  before insert on public.lady_configuration
  for each row execute function public.configuration_suit_le_meme_employe();

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Une configuration publiée est immuable
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- Même invariant que l'ADN (`20260729120006`), et pour la même raison : une décision qu'on peut
-- réécrire après coup n'est plus une décision, c'est une opinion courante. Seul `active` bouge —
-- c'est ce qui permet de désactiver une version quand la suivante prend le relais.

create function public.configuration_est_immuable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Une configuration ne se supprime pas : elle est remplacée par une version suivante. '
      'Sans elle, on ne peut plus dire ce qu''il y avait avant.';
  end if;

  if (new.role, new.priorites, new.limites, new.autonomie, new.declencheur, new.raison,
      new.version, new.employee_id, new.precedente_id)
     is distinct from
     (old.role, old.priorites, old.limites, old.autonomie, old.declencheur, old.raison,
      old.version, old.employee_id, old.precedente_id) then
    raise exception
      'Une configuration publiée ne se réécrit pas. Publier une version suivante, avec sa raison.';
  end if;

  return new;
end;
$$;

create trigger lady_configuration_immuable
  before update or delete on public.lady_configuration
  for each row execute function public.configuration_est_immuable();

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Les capacités activées par une version — et la borne qu'elles ne peuvent pas franchir
-- ═════════════════════════════════════════════════════════════════════════════════════════════

create table public.lady_configuration_capability (
  configuration_id uuid not null references public.lady_configuration (id) on delete cascade,
  capability_id    uuid not null references public.capability (id),
  primary key (configuration_id, capability_id)
);

-- ⚠️ LA garantie du §11 de la vision : une configuration RETRANCHE, elle n'étend jamais.
--
-- Aujourd'hui la borne est `capability_binding` : une capacité qu'aucun moteur ne sert pour la
-- formule de l'entreprise ne peut pas être activée. Sans ce refus, une configuration pourrait
-- promettre un geste que rien n'exécute — et le client l'apprendrait à l'usage.
create function public.capacite_dans_le_perimetre()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  entreprise uuid;
  formule    uuid;
  cle        text;
begin
  select c.tenant_id into entreprise
    from public.lady_configuration c where c.id = new.configuration_id;

  select p.id into formule
    from public.subscription s
    join public.plan p on p.id = s.plan_id
   where s.tenant_id = entreprise and s.status = 'active'
   limit 1;

  -- Sans abonnement actif, aucun périmètre n'est défini : on ne devine pas, on refuse.
  if formule is null then
    raise exception
      'Capacité refusée : cette entreprise n''a aucun abonnement actif, donc aucun périmètre. '
      'Une configuration ne se construit pas sur un périmètre supposé.';
  end if;

  if not exists (
    select 1 from public.capability_binding b
     where b.capability_id = new.capability_id and b.plan_id = formule
  ) then
    select key into cle from public.capability where id = new.capability_id;
    raise exception
      'Capacité « % » hors périmètre : aucun moteur ne la sert pour la formule de cette '
      'entreprise. Une configuration peut retrancher au périmètre, jamais l''étendre.', cle;
  end if;

  return new;
end;
$$;

create trigger lady_configuration_capability_perimetre
  before insert on public.lady_configuration_capability
  for each row execute function public.capacite_dans_le_perimetre();

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Lecture
-- ═════════════════════════════════════════════════════════════════════════════════════════════

alter table public.lady_configuration enable row level security;
alter table public.lady_configuration_capability enable row level security;

-- Le dirigeant doit pouvoir lire pourquoi sa Lady a changé : c'est la contrepartie de
-- l'autonomie (`docs/adr/0015`, transparence).
create policy lady_configuration_select on public.lady_configuration
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy lady_configuration_capability_select on public.lady_configuration_capability
  for select to authenticated
  using (exists (
    select 1 from public.lady_configuration c
     where c.id = configuration_id and public.is_tenant_member(c.tenant_id)
  ));

-- Aucune politique d'écriture : une configuration est publiée côté serveur, à l'issue d'un
-- diagnostic. Le client n'est pas l'architecte de sa Lady (`docs/adr/0029`, §13 de la vision).
