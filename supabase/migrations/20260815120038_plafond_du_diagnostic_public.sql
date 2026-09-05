-- ACQUIS-17 — le plafond du diagnostic public, porté dans le schéma du cœur.
--
-- ══ POURQUOI CETTE TABLE ARRIVE ICI, ET MAINTENANT ══
--
-- Elle existait déjà, mais dans `apps/vitrine/migrations/0011`, c'est-à-dire dans le schéma de
-- l'ancienne génération. Tant que le site parlait au projet de la vitrine, ça tenait.
--
-- `adr/0030` a tranché : le site parlera au projet du CŒUR. Or le diagnostic public est vivant,
-- il est la première chose qu'un visiteur touche, et il écrit dans cette table à CHAQUE échange.
-- Sans elle, la première question posée sur le site lève une erreur de table absente, et le
-- visiteur reçoit « nous n'avons pas pu vous répondre » pour toujours.
--
-- ⚠️ Ce n'est pas un détail de portage : c'est le genre d'oubli qui ne se voit qu'en production,
-- sur le parcours le plus exposé du produit. Il a été trouvé en retirant l'ancienne génération,
-- pas en relisant le code — la dépendance était invisible depuis le cœur.
--
-- `provider_quota`, l'autre table que le diagnostic écrit, existe déjà ici : seule celle-ci
-- manquait.
--
-- ══ DEUX COMPTEURS, ET LES DEUX SONT NÉCESSAIRES ══
--
-- Par visiteur (cookie), et par adresse. Un plafond par visiteur ne borne rien face à mille
-- visiteurs ; un plafond par adresse ne protège pas des mille requêtes d'un seul. Ils comptent
-- des choses différentes, et l'enveloppe globale d'inférence (ACQUIS-18) en compte une troisième.
--
-- ⚠️ L'ADRESSE EST HACHÉE, ET LE SEL N'A PAS DE VALEUR DE REPLI (`SENTIO_IP_HASH_SALT`). Un sel
-- publié ne sale rien : le SHA-256 des quatre milliards d'adresses IPv4 se retourne en quelques
-- minutes, et la colonne redeviendrait un journal d'adresses en clair, donc de données
-- personnelles conservées sans raison.

create table public.diagnostic_rate_limit (
  id             uuid primary key default gen_random_uuid(),
  visitor_id     uuid not null,
  -- Jamais l'adresse en clair. Elle n'a aucune utilité une fois le plafond appliqué.
  ip_hash        text not null,
  day            date not null default current_date,
  message_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  -- Une ligne par visiteur et par jour : c'est cette contrainte qui rend le comptage atomique,
  -- par un `insert … on conflict do update`, plutôt qu'une lecture suivie d'une écriture entre
  -- lesquelles un autre échange passe.
  unique (visitor_id, day)
);

create index diagnostic_rate_limit_ip_day_idx on public.diagnostic_rate_limit (ip_hash, day);

comment on table public.diagnostic_rate_limit is
  'Le plafond du diagnostic public, par visiteur et par adresse. La base fait foi, jamais la '
  'mémoire du serveur : elle ne survit pas à un redémarrage, et le diagnostic tourne sur un '
  'hébergement sans état.';

-- ══ AUCUNE ENTREPRISE, DONC AUCUNE POLITIQUE, DONC TOUT EST REFUSÉ ══
--
-- Cette table ne porte pas de `tenant_id` : elle compte des VISITEURS, qui par définition
-- n'appartiennent à aucune entreprise. Elle est écrite uniquement par le serveur.
--
-- RLS est activée sans qu'aucune politique ne l'accompagne : c'est ce qui la ferme complètement
-- aux rôles du client. Une table sans politique et RLS active ne rend AUCUNE ligne, et c'est
-- exactement le comportement voulu.
--
-- ⚠️ Piège 6 de `docs/31` : droit ≠ politique. On retire aussi les droits, sinon le refus
-- viendrait de la permission et non de RLS, avec un message que personne ne relie à la bonne
-- cause. Et `from public` seul ne suffit pas : la plateforme accorde directement à
-- `authenticated` et `anon` (piège 7).
alter table public.diagnostic_rate_limit enable row level security;
revoke all on public.diagnostic_rate_limit from public, authenticated, anon;

-- ⚠️ CETTE TABLE SE PURGE, contrairement à presque tout le reste du schéma.
--
-- Une fenêtre glissante ne sert à rien passé son jour : garder des adresses hachées de l'an
-- dernier, c'est conserver de la donnée personnelle sans finalité, ce que l'article 5.1.e
-- interdit. La fonction existe pour que la purge soit un geste nommé et daté, et non un `delete`
-- improvisé un soir.
create function public.purger_les_plafonds_du_diagnostic(jours_conserves integer default 7)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  supprimees integer;
begin
  if jours_conserves < 0 then
    raise exception 'Rétention négative (%) : refusé.', jours_conserves;
  end if;

  delete from public.diagnostic_rate_limit
   where day < current_date - jours_conserves;

  get diagnostics supprimees = row_count;
  return supprimees;
end;
$$;

revoke execute on function public.purger_les_plafonds_du_diagnostic(integer)
  from public, authenticated, anon;

comment on function public.purger_les_plafonds_du_diagnostic(integer) is
  'Efface les fenêtres de comptage passées. Une adresse hachée conservée au-delà de sa fenêtre '
  'est une donnée personnelle sans finalité (art. 5.1.e).';

do $$
begin
  raise notice 'OK  plafond du diagnostic public : table fermée, adresses hachées, purge nommée.';
end;
$$;
