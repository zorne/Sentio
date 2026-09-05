-- LADY-E — les constats d'audit : ce que Sentio observe, séparé de ce que le client déclare.
--
-- ══ CE QUI MANQUAIT ══
--
-- `diagnostic_session` portait `detected_friction` : UN frein, celui que le dirigeant avait
-- énoncé. Le moteur allait directement de ce frein à la configuration. Autrement dit, **la
-- déclaration du client était la décision** — exactement ce que `docs/adr/0029` interdit.
--
-- Un dirigeant décrit ce qu'il ressent, pas toujours ce qui le bloque. Le cas canonique : il
-- demande de la prospection alors que sa prospection fonctionne et que ce sont ses demandes
-- entrantes qui se perdent. Un produit qui prend la déclaration pour un diagnostic vend la
-- solution que le client croyait vouloir.
--
-- Trois choses étaient confondues, elles sont désormais distinctes :
--
--     ce que le client DIT   →   ce qu'on CONSTATE   →   ce qu'on en CONCLUT
--     detected_friction          audit_finding          recommendation.configuration_proposee
--
-- ══ POURQUOI LA SOURCE ET LA CONFIANCE SONT OBLIGATOIRES ══
--
-- Un constat déduit d'une déclaration ne vaut pas un constat mesuré sur des résultats. Sans ces
-- deux colonnes, une impression pèserait autant qu'une observation, et le diagnostic ne serait
-- qu'un écho poli. Le moteur de composition s'en sert pour pondérer
-- (`packages/domain/src/composition.ts`).
--
-- ⚠️ ZONE VITRINE. Les constats naissent pendant le diagnostic, avant qu'une entreprise existe.
-- Ils vivent donc du côté visiteur, comme la session dont ils dépendent — et comme elle, sans
-- aucune politique de lecture : ils sont écrits et relus côté serveur (`docs/02-architecture.md`).
--
-- Réalise : LADY-E

create table public.audit_finding (
  id            uuid primary key default gen_random_uuid(),
  diagnostic_session_id uuid not null
                  references public.diagnostic_session (id) on delete cascade,

  -- Fermés à dessein : ce qui n'est pas dans ces listes ne se constate pas. Une valeur libre
  -- laisserait le modèle inventer un genre de constat, donc un poids que personne n'a décidé.
  genre         text not null
                  check (genre in ('force', 'faiblesse', 'goulot', 'risque', 'opportunite')),
  domaine       text not null
                  check (domaine in ('recherche_selection', 'evaluation', 'communication_sortante',
                                     'communication_entrante', 'donnees_fiches', 'documents',
                                     'temps_echeances', 'analyse_restitution')),
  source        text not null check (source in ('declare', 'deduit', 'mesure')),
  confiance     text not null check (confiance in ('faible', 'moyenne', 'forte')),

  -- Formulé dans le vocabulaire du dirigeant : c'est ce qu'il relira dans sa justification.
  libelle       text not null check (length(trim(libelle)) > 0),
  created_at    timestamptz not null default now(),

  -- Le même constat ne se compte pas deux fois : il pèserait double sans que rien ne le montre.
  constraint audit_finding_unique unique (diagnostic_session_id, genre, domaine, libelle)
);

create index audit_finding_session_idx
  on public.audit_finding (diagnostic_session_id, domaine);

-- Un constat est une observation datée : on ne le réécrit pas, on en pose un autre. Sans ce
-- verrou, l'historique du diagnostic pourrait être ajusté après coup pour justifier une
-- configuration déjà vendue — c'est-à-dire l'inverse d'un audit.
create function public.constat_est_immuable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Un constat d''audit ne se modifie pas : % refusé. Poser un nouveau constat, daté.', tg_op;
end;
$$;

create trigger audit_finding_immuable
  before update or delete on public.audit_finding
  for each row execute function public.constat_est_immuable();

alter table public.audit_finding enable row level security;
-- Aucune politique : comme `diagnostic_session`, la vitrine n'a aucun accès direct. Les constats
-- sont écrits et relus côté serveur.

comment on table public.audit_finding is
  'Ce que Sentio CONSTATE d''une entreprise — distinct de ce que le dirigeant déclare. '
  'Chaque constat porte sa source et sa confiance : une déduction ne pèse pas comme une mesure.';
