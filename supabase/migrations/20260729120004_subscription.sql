-- FOND-07 — table subscription. Source de vérité des droits d'une entreprise.

create table public.subscription (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenant (id) on delete cascade,
  plan_id               uuid not null references public.plan (id),
  status                text not null check (status in ('active', 'past_due', 'canceled')),
  current_period_start  timestamptz not null,
  current_period_end    timestamptz not null,
  -- Référence chez le prestataire de paiement. Jamais de donnée bancaire ici : le paiement est
  -- hébergé, aucune donnée de carte ne touche Sentio (docs/20-plan-action.md, phase 6).
  billing_reference     text,
  created_at            timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

create index subscription_tenant_idx on public.subscription (tenant_id);

-- Un abonnement actif au plus par entreprise. Un changement de formule met à jour la ligne,
-- il ne recrée rien : « aucune donnée n'est perdue, aucun employé n'est recréé » (projet.md §25).
create unique index subscription_one_active_per_tenant
  on public.subscription (tenant_id)
  where status = 'active';

alter table public.subscription enable row level security;

create policy subscription_select on public.subscription
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
