-- METIER-05, 16, 18 à 22 — les tables de la prospection.
--
-- ⚠️ CE QUE CETTE MIGRATION REND IMPOSSIBLE.
--
-- La contrainte du fondateur ([`docs/adr/0017`]) est : *ne jamais délivrer un message qui
-- pourrait brûler la réputation du client*. Une consigne de ce genre, laissée au code appelant,
-- tient tant que personne n'est pressé. Elle est donc posée ici, dans le schéma :
--
--   • un prospect sans ORIGINE renseignée ne peut pas exister — donc ne peut pas être contacté ;
--   • un message sortant ne peut pas être enregistré sans se rattacher à un domaine d'envoi ;
--   • un domaine non authentifié (SPF + DKIM + DMARC) ne peut pas porter d'envoi ;
--   • un domaine suspendu porte toujours la raison de sa suspension — une suspension muette ne
--     se lève jamais correctement.
--
-- Ce que la base ne peut pas faire seule — vérifier une liste d'exclusion, comparer un compteur
-- au plafond du jour — est fait par une fonction de garde (`public.peut_envoyer`), appelée par le
-- noyau avant chaque message, et vérifiée par les tests d'invariants.

-- ── Le domaine d'envoi du client ─────────────────────────────────────────────────────────────
create table public.sending_domain (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenant (id) on delete cascade,
  domain            text not null check (length(trim(domain)) > 0),
  -- Les trois preuves d'authentification. Nulles = non vérifié = aucun envoi possible.
  spf_verified_at   timestamptz,
  dkim_verified_at  timestamptz,
  dmarc_verified_at timestamptz,
  -- Montée en charge : le plafond du jour dépend de l'ÂGE d'envoi du domaine, pas de la formule.
  -- Trois à quatre semaines, seuils dans docs/10-securite-rgpd.md.
  warmup_started_on date,
  -- Suspension automatique sur rebonds ou plaintes. Elle ne se lève jamais toute seule.
  suspended_at      timestamptz,
  suspension_reason text,
  created_at        timestamptz not null default now(),
  unique (tenant_id, domain),
  unique (tenant_id, id),
  constraint sending_domain_suspension_says_why
    check ((suspended_at is null) = (suspension_reason is null))
);

create index sending_domain_tenant_idx on public.sending_domain (tenant_id);

alter table public.sending_domain enable row level security;

-- Le client voit l'état de son domaine — c'est ce qui lui explique pourquoi rien ne part encore.
create policy sending_domain_select on public.sending_domain
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
-- Aucune écriture cliente : l'authentification se constate, elle ne se déclare pas.

-- ── Les prospects ────────────────────────────────────────────────────────────────────────────
create table public.lead (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenant (id) on delete cascade,
  company_name          text not null check (length(trim(company_name)) > 0),
  contact_name          text,
  email                 text,
  role_title            text,
  sector                text,
  -- ⚠️ D5 : l'ORIGINE est obligatoire. Sans elle, impossible de savoir si la personne a été
  -- informée à la collecte — donc impossible de la contacter régulièrement
  -- (docs/25-conformite-legale.md §3). C'est une contrainte, pas une colonne d'information.
  source                text not null check (length(trim(source)) > 0),
  source_detail         jsonb not null default '{}'::jsonb,
  collected_at          timestamptz,
  -- Date à laquelle la personne a reçu l'information de l'article 14. Nulle = premier message dû.
  informed_at           timestamptz,
  qualification         text not null default 'nouveau'
                          check (qualification in ('nouveau', 'qualifie', 'ecarte')),
  qualification_reason  text,
  -- METIER-22 : pourquoi CE prospect a été retenu. Produit toujours ; affiché selon D14.
  selection_reason      text,
  status                text not null default 'nouveau'
                          check (status in ('nouveau', 'contacte', 'repondu', 'exclu')),
  created_at            timestamptz not null default now(),
  unique (tenant_id, id),
  -- Deux fois le même contact dans la même entreprise, c'est un doublon de messages.
  unique (tenant_id, email),
  -- Un prospect écarté dit pourquoi : sinon la qualification devient une boîte noire, et le
  -- client ne peut pas la corriger.
  constraint lead_ecarte_says_why
    check (qualification <> 'ecarte' or qualification_reason is not null)
);

create index lead_tenant_idx on public.lead (tenant_id, status);
create index lead_qualified_idx on public.lead (tenant_id) where qualification = 'qualifie';

alter table public.lead enable row level security;

create policy lead_select on public.lead
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Le client importe et corrige ses propres prospects : c'est SA donnée, il en est responsable
-- (docs/adr/0016). Aucune suppression : un prospect retiré passe en `exclu`, sinon on perd la
-- trace de ce qui lui a été envoyé.
create policy lead_insert on public.lead
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy lead_update on public.lead
  for update to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ── Exclusions et désinscriptions ────────────────────────────────────────────────────────────
-- METIER-16/17. La désinscription est RÉACTIVE, l'exclusion est PRÉVENTIVE : les deux sont
-- nécessaires, et les deux se vérifient AVANT l'envoi, jamais après.
create table public.suppression (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  -- Une adresse complète, ou un domaine entier (« @concurrent.fr »).
  pattern     text not null check (length(trim(pattern)) > 0),
  kind        text not null check (kind in ('desinscription', 'exclusion', 'plainte', 'rebond')),
  reason      text,
  created_at  timestamptz not null default now(),
  unique (tenant_id, pattern)
);

create index suppression_tenant_idx on public.suppression (tenant_id);

alter table public.suppression enable row level security;

create policy suppression_select on public.suppression
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Le client ajoute ses propres exclusions — clients existants, concurrents, comptes sensibles.
create policy suppression_insert on public.suppression
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id));
-- Aucune suppression de ligne : on ne « désexclut » pas quelqu'un par accident, et une
-- désinscription est définitive (docs/10-securite-rgpd.md).

-- ── Les messages sortants ────────────────────────────────────────────────────────────────────
create table public.outbound_message (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenant (id) on delete cascade,
  lead_id           uuid not null,
  employee_id       uuid not null,
  sending_domain_id uuid not null,
  subject           text not null check (length(trim(subject)) > 0),
  -- Preuve que le message portait bien ce qu'il devait porter. Vérifié avant envoi, conservé
  -- après : c'est ce qui permet de répondre à une réclamation six mois plus tard.
  carried_optout    boolean not null,
  carried_notice    boolean not null,
  status            text not null default 'envoye'
                      check (status in ('envoye', 'rebond', 'plainte', 'repondu')),
  sent_at           timestamptz not null default now(),
  -- Clé d'idempotence : le même message ne part jamais deux fois (AGENTS.md, invariant 3).
  idempotency_key   text not null,
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, lead_id) references public.lead (tenant_id, id) on delete cascade,
  foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade,
  foreign key (tenant_id, sending_domain_id)
    references public.sending_domain (tenant_id, id) on delete restrict,
  -- ⚠️ Un message sans moyen d'opposition ni information due ne peut pas être enregistré, donc
  -- l'envoi ne peut pas être considéré comme fait. La règle n'est pas rédactionnelle.
  constraint outbound_message_carries_its_duties
    check (carried_optout and carried_notice)
);

create index outbound_message_tenant_idx on public.outbound_message (tenant_id, sent_at desc);
create index outbound_message_lead_idx on public.outbound_message (tenant_id, lead_id);

alter table public.outbound_message enable row level security;

create policy outbound_message_select on public.outbound_message
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
-- Aucune écriture cliente : c'est l'employé qui envoie, le client qui constate.

-- ── Le verrou d'entreprise sur les quatre nouvelles tables ───────────────────────────────────
-- Migration 0034 : aucune ligne ne change d'entreprise. Les tables créées après elle doivent
-- poser le déclencheur elles-mêmes — le filet de `supabase/tests/invariants.sql` le vérifie sur
-- le schéma final, et fera échouer la suite si on l'oublie.
create trigger sending_domain_tenant_immutable
  before update on public.sending_domain
  for each row execute function public.reject_tenant_change();
create trigger lead_tenant_immutable
  before update on public.lead
  for each row execute function public.reject_tenant_change();
create trigger suppression_tenant_immutable
  before update on public.suppression
  for each row execute function public.reject_tenant_change();
create trigger outbound_message_tenant_immutable
  before update on public.outbound_message
  for each row execute function public.reject_tenant_change();

-- ── Les droits, explicites comme en 0028 ─────────────────────────────────────────────────────
grant select, insert, update on public.lead to authenticated;
grant select, insert on public.suppression to authenticated;
grant select on public.sending_domain, public.outbound_message to authenticated;

-- ── La garde d'envoi ─────────────────────────────────────────────────────────────────────────
-- Sept conditions, toutes obligatoires (docs/adr/0017). La fonction rend la RAISON du refus, pas
-- un booléen : un employé qui n'envoie pas doit pouvoir dire pourquoi, et le client le lire.
--
-- Elle vit en base plutôt que dans le code appelant pour la même raison que le reste : le seul
-- garde qui tienne des mois sans surveillance est celui qu'on ne peut pas oublier d'appeler.
-- Le noyau l'appelle avant chaque message ; les tests d'invariants la vérifient condition par
-- condition.
create function public.peut_envoyer(
  p_tenant uuid,
  p_lead uuid,
  p_domain uuid,
  p_envoyes_aujourdhui integer,
  p_plafond_formule integer
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sending_domain;
  l public.lead;
  jours integer;
  plafond_domaine integer;
begin
  select * into d from public.sending_domain where id = p_domain and tenant_id = p_tenant;
  if not found then return 'domaine_inconnu'; end if;

  if d.suspended_at is not null then return 'domaine_suspendu'; end if;

  if d.spf_verified_at is null or d.dkim_verified_at is null or d.dmarc_verified_at is null then
    return 'domaine_non_authentifie';
  end if;

  if d.warmup_started_on is null then return 'montee_en_charge_non_commencee'; end if;

  -- Montée en charge : 5 messages par jour la première semaine, puis 15, 30, et 50 au-delà de
  -- trois semaines. Le plus bas des deux plafonds gagne, toujours.
  jours := (current_date - d.warmup_started_on);
  plafond_domaine := case
    when jours < 7  then 5
    when jours < 14 then 15
    when jours < 21 then 30
    else 50
  end;

  if p_envoyes_aujourdhui >= least(plafond_domaine, p_plafond_formule) then
    return 'plafond_du_jour_atteint';
  end if;

  select * into l from public.lead where id = p_lead and tenant_id = p_tenant;
  if not found then return 'prospect_inconnu'; end if;
  if l.email is null then return 'prospect_sans_adresse'; end if;
  if l.qualification <> 'qualifie' then return 'prospect_non_qualifie'; end if;
  if l.status = 'exclu' then return 'prospect_exclu'; end if;

  -- Exclusions et désinscriptions : par adresse exacte, ou par domaine entier.
  if exists (
    select 1 from public.suppression s
    where s.tenant_id = p_tenant
      and (lower(s.pattern) = lower(l.email)
        or (s.pattern like '@%' and lower(l.email) like '%' || lower(s.pattern)))
  ) then
    return 'destinataire_sur_liste_d_exclusion';
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.peut_envoyer(uuid, uuid, uuid, integer, integer) from public;

do $$
begin
  raise notice 'OK  prospection — origine obligatoire, domaine prouvé, garde d''envoi en place.';
end;
$$;
