-- LADY-AC — une politique sans droit est une porte verrouillée à laquelle on a retiré la poignée.
--
-- ══ CE QUE L'AUDIT A TROUVÉ ══
--
-- Quatre tables portaient une politique de lecture `to authenticated` **sans aucun GRANT**. Sous
-- Postgres, les deux sont indépendants : le droit décide si l'on peut regarder la table, la
-- politique décide quelles lignes. Sans droit, le client est refusé **avant** que RLS n'ait son
-- mot à dire — et le message parle de permission, pas d'isolation, donc personne ne fait le lien.
--
-- Conséquence, en production, sur le seul écran que le client paie :
--
--   · `lady_configuration`            → l'espace ne peut lire ni la configuration active, ni la
--     PROPOSITION en attente. Le dirigeant lit « sa configuration n'est pas encore établie »
--     alors qu'elle existe, et la boucle de réévaluation entière lui reste invisible ;
--   · `lady_configuration_capability` → la couronne de capacités est vide.
--
-- Ce n'était pas une fuite : c'était l'inverse — une fermeture invisible. Mais le défaut est de
-- la même famille, et il vient du même angle mort : **personne ne vérifiait que les deux moitiés
-- d'un accès sont d'accord.**
--
-- ══ CE QU'ON OUVRE, ET CE QU'ON FERME ══
--
-- On n'ouvre que ce que l'espace lit réellement. Les deux autres tables perdent leur politique :
--
--   · `strategy_variant` — le catalogue des façons de travailler est **notre méthode**, pas la
--     donnée du client. Sa politique disait `using (true)` : elle exposait le catalogue entier à
--     n'importe quel compte authentifié. Le client lit sa PRÉFÉRENCE
--     (`tenant_variant_preference`), pas notre livre de recettes ;
--   · `task_variant` — quelle variante a servi sur quelle mission est de la mécanique de mesure.
--     Rien ne la lit côté client, et une politique qui promet un accès dont personne ne se sert
--     est une surface offerte pour rien.
--
-- Réalise : LADY-AC

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Ce que l'espace lit vraiment
-- ─────────────────────────────────────────────────────────────────────────────────────────────

grant select on public.lady_configuration to authenticated;
grant select on public.lady_configuration_capability to authenticated;

-- ⚠️ `select` seulement, et jamais plus. Une configuration est PUBLIÉE par une fonction du
-- serveur (`regler_l_autonomie`, `accepter_la_configuration`) : laisser le navigateur écrire ici
-- rendrait le rôle d'un employé modifiable sans trace, sans raison et sans version précédente —
-- c'est-à-dire l'inverse exact de ce que `20260815120003` existe pour garantir.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Ce qui redevient réservé au serveur
-- ─────────────────────────────────────────────────────────────────────────────────────────────

drop policy strategy_variant_select on public.strategy_variant;
drop policy task_variant_select on public.task_variant;

revoke all on public.strategy_variant from authenticated, anon;
revoke all on public.task_variant from authenticated, anon;

comment on table public.strategy_variant is
  'Les façons de travailler, rédigées par Sentio. RÉSERVÉ AU SERVEUR : c''est notre méthode, pas '
  'la donnée d''un client. Le dirigeant lit sa préférence (tenant_variant_preference), jamais le '
  'catalogue.';
comment on table public.task_variant is
  'Quelle variante a servi sur quelle mission. RÉSERVÉ AU SERVEUR : mécanique de mesure. Une '
  'politique qui promet un accès dont personne ne se sert est une surface offerte pour rien.';
