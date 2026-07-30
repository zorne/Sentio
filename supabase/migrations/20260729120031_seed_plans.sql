-- FOND-33 — les trois formules et leurs quotas, EN DONNÉES.
-- Réalise : FOND-33
--
-- ⚠️ POURQUOI UNE MIGRATION ET NON UN FICHIER DE SEED.
--
-- `supabase/seed.sql` ne s'exécute qu'au `db reset` d'une base locale. Or ces lignes ne sont pas
-- du jeu d'essai : sans elles, aucun abonnement ne peut exister et le produit ne fonctionne pas.
-- Une donnée de référence indispensable en production appartient aux migrations.
--
-- ⚠️ POURQUOI LES VALEURS SONT ICI ET PLUS DANS packages/config.
--
-- Elles y étaient, marquées « utilisées uniquement par le seed ». Les garder aux deux endroits
-- aurait créé deux sources de vérité pour un même chiffre — exactement ce que le lexique nous
-- interdit de faire par ailleurs. La base fait foi ; `packages/config` ne garde que les CLÉS de
-- métriques, dont le code a besoin pour lire un quota.
--
-- Les trois formules existent dès le jour 1 ; seul Start est commercialisable (projet.md §28).
-- Activer Growth est un `update` d'une colonne, jamais un déploiement — c'est TEST-09.
--
-- `on conflict do nothing` : rejouer cette migration ne doit jamais écraser un quota ajusté en
-- production. Un changement de valeur se fait par une modification de données assumée, ou par
-- une nouvelle migration qui dit ce qu'elle change.
--
-- ⚠️ Les valeurs chiffrées sont PROVISOIRES : aucune n'est tranchée dans la documentation, et le
-- prix de Start (D2) ne l'est pas non plus. Elles s'ajustent en base sans redéploiement — c'est
-- précisément ce que cette architecture garantit.

insert into public.plan (tier, commercialisable, job_priority) values
  ('start',  true,  100),
  ('growth', false, 200),
  ('scale',  false, 300)
on conflict (tier) do nothing;

-- Le plafond quotidien d'envoi est un garde-fou de délivrabilité, pas un levier commercial :
-- les messageries basculent en indésirable au-delà de 25-50 messages par boîte et par jour,
-- après une montée progressive (docs/10-securite-rgpd.md). Il protège la réputation d'envoi
-- DU CLIENT, qui se répare en mois.
insert into public.plan_quota (plan_id, metric, quota_limit)
select p.id, v.metric, v.quota_limit
from (values
  ('start',  'active_employees',                    1),
  ('start',  'tasks_per_period',                  300),
  ('start',  'outbound_messages_per_period',      500),
  ('start',  'outbound_messages_per_day',          30),
  ('start',  'inference_tokens_per_period',   2000000),

  ('growth', 'active_employees',                    3),
  ('growth', 'tasks_per_period',                 1500),
  ('growth', 'outbound_messages_per_period',     2500),
  ('growth', 'outbound_messages_per_day',         100),
  ('growth', 'inference_tokens_per_period',  10000000),

  ('scale',  'active_employees',                   10),
  ('scale',  'tasks_per_period',                 6000),
  ('scale',  'outbound_messages_per_period',    10000),
  ('scale',  'outbound_messages_per_day',         400),
  ('scale',  'inference_tokens_per_period',  40000000)
) as v(tier, metric, quota_limit)
join public.plan p on p.tier = v.tier
on conflict (plan_id, metric) do nothing;

-- Filet : les trois formules doivent porter le même jeu de métriques. Une formule à qui il
-- manque un quota laisserait passer un usage sans limite — un plafond absent n'est pas un
-- plafond infini par intention, c'est un oubli.
do $$
declare
  incomplete text;
begin
  select string_agg(tier, ', ' order by tier)
  into incomplete
  from public.plan p
  where (select count(*) from public.plan_quota q where q.plan_id = p.id)
        <> (select count(distinct metric) from public.plan_quota);

  if incomplete is not null then
    raise exception 'Formule(s) sans jeu complet de quotas : %.', incomplete;
  end if;
end;
$$;
