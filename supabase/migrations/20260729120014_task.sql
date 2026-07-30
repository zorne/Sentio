-- FOND-16 — table task : une unité de travail confiée à un employé.
-- Réalise : FOND-16

create table public.task (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete cascade,
  employee_id  uuid not null references public.employee (id) on delete cascade,
  state        text not null default 'pending'
                 check (state in ('pending', 'in_progress', 'waiting_approval', 'done', 'failed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index task_tenant_idx on public.task (tenant_id);
create index task_employee_state_idx on public.task (employee_id, state);

alter table public.task enable row level security;

create policy task_select on public.task
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
