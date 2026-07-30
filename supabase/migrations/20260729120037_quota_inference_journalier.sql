-- NOYAU-07 — le plafond d'inférence journalier, en données.
-- Réalise : NOYAU-07
--
-- ⚠️ POURQUOI CE QUOTA EXISTE EN PLUS DE CELUI DE LA PÉRIODE.
--
-- `inference_tokens_per_period` borne le mois. Il ne borne pas la journée : une entreprise peut
-- consommer son mois entier en quelques heures. Ce serait sans conséquence si chacun avait son
-- propre fournisseur — mais le quota du fournisseur est UNIQUE ET PARTAGÉ
-- (`docs/11-exploitation.md`). Une entreprise qui s'emballe un mardi matin empêche donc toutes
-- les autres de travailler ce jour-là, sans avoir dépassé aucun de ses droits.
--
-- Le plafond journalier est fixé à ~10 % du quota de période : assez pour absorber une journée
-- chargée — un rattrapage, une campagne — sans permettre de vider le mois d'un coup. C'est un
-- réglage, pas une règle : il se change ici, par une modification de données, sans déploiement.
--
-- Comme tous les quotas, il est LU par le code, jamais testé en dur : aucune condition
-- « si formule = Start » n'existe nulle part (`docs/03-modele-de-donnees.md`).

insert into public.plan_quota (plan_id, metric, quota_limit)
select p.id, 'inference_tokens_per_day', v.quota_limit
from (values
  ('start',    200000),
  ('growth',  1000000),
  ('scale',   4000000)
) as v(tier, quota_limit)
join public.plan p on p.tier = v.tier;

do $$
declare
  manquants text;
begin
  -- Une formule sans plafond journalier laisserait le Gateway sans borne pour elle : il lit un
  -- quota, il n'en invente pas. Mieux vaut échouer au déploiement que découvrir le trou en
  -- production.
  select string_agg(p.tier, ', ' order by p.tier)
  into manquants
  from public.plan p
  where not exists (
    select 1 from public.plan_quota q
    where q.plan_id = p.id and q.metric = 'inference_tokens_per_day'
  );

  if manquants is not null then
    raise exception 'Formule(s) sans plafond d''inférence journalier : %.', manquants;
  end if;

  raise notice 'OK  plafond journalier d''inférence semé pour les trois formules.';
end;
$$;
