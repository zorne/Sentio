-- ACQUIS-16 — la liste d'attente des besoins hors périmètre.
-- Réalise : ACQUIS-16
--
-- Quand le diagnostic détecte un besoin que Sentio ne sait pas traiter, il le DIT
-- (`packages/domain/src/recommendation.ts`, statut `hors_perimetre`). Cette migration ajoute ce
-- qui manquait derrière : de quoi compter ces besoins, et rappeler les gens qui l'ont demandé.
--
-- ══ CE QUE CETTE TABLE EST, ET CE QU'ELLE N'EST PAS ══
--
-- Ce n'est pas un fichier de prospection. Un visiteur à qui l'on vient de dire « nous ne savons
-- pas faire cela » et dont on garderait l'adresse pour lui écrire autre chose aurait été trompé
-- par la réponse honnête elle-même. L'adresse ne sert qu'à le prévenir SI le besoin qu'il a
-- exprimé devient disponible, et à rien d'autre.
--
-- ══ LA CONTRAINTE QUI PORTE TOUT ══
--
-- `email` et `consenti_le` vivent ou meurent ensemble. Une adresse sans consentement daté est une
-- adresse qu'on n'a pas le droit de garder — et la seule façon de ne jamais en avoir une est de
-- rendre la ligne impossible à écrire, pas de compter sur le code appelant.
--
-- Le besoin, lui, s'enregistre TOUJOURS, avec ou sans adresse : savoir que douze visiteurs ont
-- demandé du support client est un signal produit qui ne coûte aucune donnée personnelle.

create table public.waiting_list_entry (
  id            uuid primary key default gen_random_uuid(),
  /**
   * Le besoin détecté, dans le vocabulaire de `OUT_OF_SCOPE_NEEDS`. Non contraint à une liste
   * fermée en base : la liste vit dans le domaine et s'allonge quand Sentio reconnaît un nouveau
   * besoin. Une contrainte ici obligerait à une migration à chaque ajout, et une migration
   * oubliée ferait perdre des demandes en silence.
   */
  besoin        text not null check (length(trim(besoin)) > 0),
  /** Le métier déclaré, s'il l'a été. Sert à savoir QUI demande quoi. */
  secteur       text,
  /** Nul tant que le visiteur n'a pas demandé à être prévenu. */
  email         text,
  consenti_le   timestamptz,
  created_at    timestamptz not null default now(),

  -- Une adresse sans consentement daté ne peut pas exister. Ni l'inverse : un consentement sans
  -- adresse est une trace sans objet, qui laisserait croire qu'on a promis quelque chose.
  constraint waiting_list_email_exige_consentement
    check ((email is null and consenti_le is null) or (email is not null and consenti_le is not null))
);

create index waiting_list_besoin_idx on public.waiting_list_entry (besoin, created_at desc);

alter table public.waiting_list_entry enable row level security;

-- AUCUNE politique de lecture. Ce n'est pas un oubli : la table ne porte aucune donnée
-- d'entreprise cliente, et personne n'a de raison de l'interroger depuis l'interface. Elle se
-- lit sous le rôle de service, par Sentio, pour compter des besoins. RLS active sans politique
-- ferme la table à tout rôle applicatif — c'est le comportement voulu (migration 0030 :
-- « une table ajoutée demain naît fermée »).

/**
 * Effacement sur demande — le pendant obligatoire du consentement.
 *
 * On ne supprime pas la ligne : on en retire l'adresse et le consentement. Le besoin exprimé
 * reste compté, parce qu'il n'identifie personne une fois l'adresse partie, et parce qu'effacer
 * la ligne entière ferait disparaître un signal produit sans que ce soit demandé.
 */
create or replace function public.oublier_une_adresse_de_liste_attente(p_email text)
returns integer
language plpgsql
as $$
declare
  effacees integer;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Effacement refusé : une adresse est attendue.';
  end if;

  update public.waiting_list_entry
     set email = null, consenti_le = null
   where lower(email) = lower(btrim(p_email));

  get diagnostics effacees = row_count;
  return effacees;
end;
$$;

comment on function public.oublier_une_adresse_de_liste_attente(text) is
  'Retire l''adresse et son consentement, conserve le besoin anonyme (ACQUIS-16).';

do $$
begin
  raise notice 'OK  liste d''attente — besoin toujours compté, adresse jamais sans consentement.';
end;
$$;
