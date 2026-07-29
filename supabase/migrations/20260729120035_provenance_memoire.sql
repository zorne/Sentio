-- FOND-13/14 (suite) — la provenance d'une ligne de mémoire ne se réécrit pas.
--
-- ⚠️ POURQUOI CETTE MIGRATION EXISTE.
--
-- Point 4 des « huit points qu'on ne rattrape jamais » : les deux contextes de mémoire, avec
-- L'AUTEUR TRACÉ PAR LIGNE. C'est ce qui permet de répondre à « pourquoi mon employé croit
-- ça ? », et c'est ce sur quoi repose le droit de contester une décision automatisée
-- (docs/10-securite-rgpd.md).
--
-- Les politiques d'insertion imposent bien `author = 'client'` quand c'est le client qui écrit.
-- Les politiques de mise à jour, elles, ne disaient rien de l'auteur. Vérifié sur une vraie base
-- avant cette migration : un client pouvait prendre un fait appris par son employé, en réécrire
-- le texte, et laisser l'auteur `apprentissage`. La ligne affirmait alors que l'employé avait
-- appris tout seul une phrase écrite par le client. Dans l'autre sens, il pouvait signer
-- `sentio` ses propres consignes.
--
-- Deux règles, posées au niveau de la base, donc valables pour tous les chemins d'écriture :
--
--   1. `author` est IMMUABLE, pour tout le monde, y compris le serveur. Une ligne appartient à
--      qui l'a écrite ; corriger un fait, c'est en écrire un autre, pas changer de signature.
--
--   2. Quand c'est le CLIENT qui parle, une ligne qu'il n'a pas écrite ne peut être que retirée
--      ou réactivée — son `status` change, rien d'autre. Ce n'est pas une restriction du droit
--      de contestation : c'en est la forme exacte, déjà décrite dans les migrations 0022 et
--      0023 (« le retrait est un changement de statut, jamais une suppression : on doit pouvoir
--      expliquer ce que l'employé croyait au moment où il a agi »). Une réécriture en place
--      effacerait précisément ce qu'on doit pouvoir expliquer.
--
-- Le client garde donc, sur l'intégralité de sa mémoire : la lecture, l'ajout de ses propres
-- lignes, la modification pleine de ses propres lignes, et le retrait de n'importe laquelle.

create function public.protect_memory_provenance()
returns trigger
language plpgsql
as $$
begin
  if new.author is distinct from old.author then
    raise exception
      'L''auteur d''une ligne de mémoire ne se réécrit pas (%.% : % → %).',
      tg_table_schema, tg_table_name, old.author, new.author;
  end if;

  -- `current_user` vaut `authenticated` sur une requête venue du client ; le serveur travaille
  -- avec le rôle de service, qui n'est pas concerné par cette seconde règle.
  if current_user = 'authenticated'
     and old.author <> 'client'
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception
      'Une ligne de mémoire écrite par « % » ne se réécrit pas : elle se retire (statut). Le contenu doit rester lisible pour expliquer ce que l''employé croyait en agissant.',
      old.author;
  end if;

  return new;
end;
$$;

create trigger company_profile_provenance
  before update on public.company_profile
  for each row execute function public.protect_memory_provenance();

create trigger learned_fact_provenance
  before update on public.learned_fact
  for each row execute function public.protect_memory_provenance();

do $$
begin
  raise notice 'OK  provenance — auteur immuable, contenu d''autrui retirable mais pas réécrivable.';
end;
$$;
