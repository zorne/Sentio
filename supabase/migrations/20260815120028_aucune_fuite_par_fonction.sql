-- LADY-AD — cinq fonctions répondaient sur l'entreprise du voisin.
--
-- ══ CE QUE L'AUDIT A TROUVÉ, ET IL FAUT LE DIRE SANS L'ADOUCIR ══
--
-- `avancement_vers_l_objectif(entreprise)` était appelable par **n'importe quel compte
-- authentifié**, sur **n'importe quelle entreprise**. Elle rend le chiffre d'affaires réalisé et
-- la cible. Un client qui connaissait — ou devinait — l'identifiant d'une autre entreprise lisait
-- son chiffre d'affaires. C'est une fuite de données, pas une imprécision de droits.
--
-- Quatre autres fonctions répondaient de la même façon, sur des informations moins graves mais
-- qui n'appartiennent pas davantage à celui qui demande : quota restant, verdict d'ouverture de
-- mission, verdict d'envoi, cadence de relance.
--
-- ══ POURQUOI ELLES SONT PASSÉES ══
--
-- Une par une, pour la même raison : **le `revoke` a été oublié dans leur migration**. Le dépôt
-- l'écrit partout ailleurs — c'est justement ce qui a rendu l'oubli invisible, puisque le
-- réflexe existait et qu'on ne vérifiait pas qu'il avait été appliqué.
--
-- ⚠️ Deux d'entre elles ont été introduites par des migrations récentes qui ont **fait perdre un
-- verrou existant** : `peut_envoyer` était révoquée, elle a été renommée en
-- `peut_envoyer_hors_arret` et remplacée par une nouvelle fonction du même nom — qui, elle,
-- naissait ouverte. Renommer une fonction déplace son verrou avec elle ; la remplacer, non.
--
-- La correction durable n'est pas ici : c'est le contrôle `AUDIT-02` de la suite d'invariants,
-- qui échoue désormais sur toute fonction `security definer` prenant une entreprise en argument
-- et restée appelable par un client.
--
-- Réalise : LADY-AD

-- ⚠️ `from public, authenticated, anon` — et pas seulement `from public`.
--
-- Sur la plateforme, les rôles clients reçoivent des droits par défaut sur tout ce qui est créé
-- dans `public` (voir `supabase/tests/supabase-stub.sql`, qui reproduit ce défaut exprès). Ces
-- droits sont accordés DIRECTEMENT à `authenticated` et `anon` : un `revoke from public` ne les
-- retire pas, parce que `PUBLIC` est un autre bénéficiaire. Les migrations plus anciennes s'en
-- sortent parce que la migration 030 repasse derrière ; on ne compte plus dessus.

revoke execute on function public.avancement_vers_l_objectif(uuid) from public, authenticated, anon;
revoke execute on function public.missions_restantes_sur_la_periode(uuid) from public, authenticated, anon;
revoke execute on function public.peut_ouvrir_une_mission(uuid, uuid) from public, authenticated, anon;
revoke execute on function public.peut_envoyer(uuid, uuid, uuid, integer, integer) from public, authenticated, anon;
revoke execute on function public.peut_envoyer_hors_arret(uuid, uuid, uuid, integer, integer) from public, authenticated, anon;
revoke execute on function public.cadence_de_relance(uuid, uuid, integer) from public, authenticated, anon;
revoke execute on function public.peut_relancer(uuid, uuid, uuid, integer, integer) from public, authenticated, anon;

-- `is_tenant_member` reste appelable, et c'est délibéré : elle ne répond que sur le compte qui
-- appelle (`auth.uid()`), donc elle n'apprend rien à personne sur personne d'autre. Les
-- politiques d'accès s'en servent à chaque lecture.

comment on function public.avancement_vers_l_objectif(uuid) is
  'Où en est l''entreprise de sa cible. RÉSERVÉE AU SERVEUR : elle rend un chiffre d''affaires, '
  'et elle a été appelable par n''importe quel client sur n''importe quelle entreprise jusqu''à '
  'LADY-AD. L''appelant vérifie l''appartenance AVANT (isAuthorizedForTenant).';
