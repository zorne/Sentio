-- LADY-AE — l'effacement RGPD échouait. Sur un vrai client, il aurait échoué aussi.
--
-- ══ CE QUE LE PARCOURS COMPLET A RÉVÉLÉ ══
--
-- `erase_tenant()` — le droit à l'effacement, article 17 — s'arrêtait sur :
--
--     « Un constat d'audit ne se modifie pas : DELETE refusé. »
--
-- L'effacement supprime la session de diagnostic ; les constats en dépendent en cascade ; et le
-- verrou d'immuabilité des constats refuse toute suppression, y compris celle-là. Un client qui
-- demandait l'effacement de ses données recevait une erreur — et, en l'état, **il n'existait
-- aucun moyen de le satisfaire**.
--
-- ⚠️ C'est la **deuxième fois** que ce piège se referme : `configuration_est_immuable` avait
-- exactement le même défaut, corrigé par `20260815120007`. Le motif est le même à chaque fois —
-- « ne jamais réécrire l'histoire » et « effacer un client sur sa demande » se ressemblent, et
-- un verrou écrit pour le premier bloque le second sans qu'on y pense.
--
-- La différence entre les deux n'est pas l'opération, c'est **qui la demande et pourquoi** :
-- réécrire l'histoire est un geste de Sentio, effacer est un droit du client. Le drapeau
-- `sentio.retention_purge` est ce qui les distingue — et il n'est posé que par l'effacement.
--
-- Réalise : LADY-AE

create or replace function public.constat_est_immuable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    -- Le seul chemin autorisé : l'effacement, qui pose ce drapeau. Une suppression ordinaire
    -- reste refusée — un audit dont on retire les constats après coup n'est plus un audit.
    if current_setting('sentio.retention_purge', true) = 'on' then
      return old;
    end if;
    raise exception
      'Un constat d''audit ne se supprime pas : il est daté, et un audit dont on retire les '
      'constats après coup ne prouve plus rien. (L''effacement d''un client, lui, est autorisé.)';
  end if;

  raise exception
    'Un constat d''audit ne se modifie pas : % refusé. Poser un nouveau constat, daté.', tg_op;
end;
$$;

comment on function public.constat_est_immuable() is
  'Deux gestes qui se ressemblent et n''ont rien à voir : RÉÉCRIRE l''histoire (interdit, '
  'toujours) et EFFACER un client à sa demande (un droit, article 17). Seul le second pose '
  'sentio.retention_purge.';
