-- FOND-05 — table tenant_member + fondation de l'isolation.
--
-- is_tenant_member() est le point de passage unique de toutes les politiques d'accès du schéma.
-- Elle est SECURITY DEFINER pour deux raisons :
--   1. lire tenant_member sans déclencher la politique de tenant_member elle-même (récursion) ;
--   2. n'exposer qu'une réponse booléenne, jamais la table d'appartenance.
-- search_path est figé : sans cela, un schéma temporaire pourrait détourner la résolution des
-- noms dans une fonction qui s'exécute avec les droits de son propriétaire.

create table public.tenant_member (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index tenant_member_user_idx on public.tenant_member (user_id);

alter table public.tenant_member enable row level security;

create function public.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_member
    where tenant_member.tenant_id = target_tenant
      and tenant_member.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_tenant_member(uuid) from public;
grant execute on function public.is_tenant_member(uuid) to authenticated;

-- Un membre voit l'entreprise à laquelle il appartient, et rien d'autre.
create policy tenant_select on public.tenant
  for select to authenticated
  using (public.is_tenant_member(id));

-- Un membre voit la liste des membres de sa propre entreprise.
create policy tenant_member_select on public.tenant_member
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Aucune politique d'écriture : la création d'entreprise et l'ajout de membres passent par le
-- serveur (recrutement, lot 5), jamais par le client. Une table sans politique d'écriture est
-- en lecture seule pour les rôles soumis à RLS — c'est voulu.
