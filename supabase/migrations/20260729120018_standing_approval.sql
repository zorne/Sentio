-- FOND-29 — table standing_approval : « confirmer une fois », révocable.
-- Réalise : FOND-29
--
-- Porte le niveau d'autonomie recommandé par D7 : confirmer une fois sur l'irréversible.
-- Révocable à tout moment — une autorisation permanente qu'on ne peut pas retirer n'en est pas
-- une.

create table public.standing_approval (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenant (id) on delete cascade,
  employee_id    uuid not null references public.employee (id) on delete cascade,
  -- Classe d'effet couverte par l'accord permanent (docs/05-runtime-employe.md).
  effect_class   text not null,
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  unique (employee_id, effect_class)
);

create index standing_approval_tenant_idx on public.standing_approval (tenant_id);

alter table public.standing_approval enable row level security;

create policy standing_approval_select on public.standing_approval
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Le client peut révoquer. La révocation est une mise à jour, jamais une suppression : on doit
-- pouvoir prouver qu'un accord a existé au moment où une action a été menée.
create policy standing_approval_update on public.standing_approval
  for update to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
