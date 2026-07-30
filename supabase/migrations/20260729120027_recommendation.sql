-- FOND-28 — table recommendation : le métier recommandé et sa justification.
-- Réalise : FOND-28
--
-- ⚠️ DEUX RÈGLES À NE JAMAIS RELÂCHER (docs/20-plan-action.md, phase 5) :
--   1. LE MODÈLE NE CHOISIT JAMAIS LE MÉTIER. Le métier sort d'un moteur de règles
--      déterministe frein → métier ; le modèle ne fait que RÉDIGER la justification.
--   2. Le diagnostic reste honnête si le besoin détecté sort du périmètre V1 (Commercial seul,
--      docs/adr/0008) — d'où le statut 'hors_perimetre', qui mène à une liste d'attente et
--      jamais à la vente d'un employé incapable de faire le travail.
--
-- Une seule recommandation par diagnostic : « le client ne choisit jamais un agent »
-- (projet.md §3).

create table public.recommendation (
  id                      uuid primary key default gen_random_uuid(),
  diagnostic_session_id   uuid not null unique
                            references public.diagnostic_session (id) on delete cascade,
  -- Nul quand le besoin détecté sort du périmètre : on ne recommande rien plutôt que mal.
  employee_definition_id  uuid references public.employee_definition (id),
  -- Rédigée par le modèle, à partir d'un métier déjà choisi par les règles.
  justification           text not null check (length(trim(justification)) > 0),
  status                  text not null default 'proposed'
                            check (status in ('proposed', 'purchased', 'refused', 'hors_perimetre')),
  created_at              timestamptz not null default now(),
  -- Hors périmètre : aucun employé recommandé. Sinon : toujours un.
  constraint recommendation_scope_honesty
    check ((status = 'hors_perimetre') = (employee_definition_id is null))
);

alter table public.recommendation enable row level security;
-- Aucune politique : lue et écrite côté serveur, comme le diagnostic dont elle dépend.
