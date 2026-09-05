-- LADY-F — appliquer une configuration : le passage de relais, en un seul geste.
--
-- ══ CE QUI MANQUAIT ══
--
-- `lady_configuration` disait ce que Lady DEVAIT faire. `employee_capability` disait ce qu'elle
-- POUVAIT réellement faire. **Rien ne reliait les deux** — aucun chemin de code n'écrivait
-- `employee_capability` en production : les seules insertions vivaient dans des fixtures de test.
--
-- Un employé recruté n'avait donc aucune capacité ouverte, et le moteur d'autorisation refusait
-- tout. La configuration était une intention sans effet.
--
-- ══ POURQUOI EN BASE, ET EN UN SEUL APPEL ══
--
-- Le passage de relais compte quatre écritures qui n'ont aucun sens séparées : désactiver
-- l'ancienne version, activer la neuve, réaligner les capacités ouvertes, reporter l'autonomie.
-- Fait au bord, en quatre requêtes, la moindre interruption laisse un employé dont les pouvoirs
-- ne correspondent à aucune configuration — et personne ne s'en apercevrait, puisque chaque
-- table serait cohérente prise isolément.
--
-- ⚠️ `employee_capability` devient une PROJECTION de la configuration, pas une donnée qu'on
-- modifie à côté. C'est ce qui rend vraie la phrase du §11 de la vision : une configuration
-- retranche au périmètre, et ce qu'elle retranche est effectivement retiré.
--
-- Réalise : LADY-F

create function public.appliquer_la_configuration(p_configuration uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conf public.lady_configuration;
begin
  select * into conf from public.lady_configuration where id = p_configuration;
  if not found then
    raise exception 'Configuration % introuvable : rien à appliquer.', p_configuration;
  end if;

  -- 1. L'ancienne version cède la place AVANT que la neuve ne prenne la sienne. L'index unique
  --    interdit deux configurations actives ; l'ordre évite de se heurter à lui.
  update public.lady_configuration
     set active = false
   where employee_id = conf.employee_id and active and id <> conf.id;

  update public.lady_configuration set active = true where id = conf.id;

  -- 2. Les capacités ouvertes deviennent EXACTEMENT celles de la configuration. Le retrait est
  --    aussi important que l'ajout : une capacité qu'une nouvelle configuration ne reprend pas
  --    doit cesser d'être utilisable, sinon « retrancher » ne veut rien dire.
  delete from public.employee_capability ec
   where ec.employee_id = conf.employee_id
     and not exists (
       select 1 from public.lady_configuration_capability lcc
        where lcc.configuration_id = conf.id and lcc.capability_id = ec.capability_id
     );

  insert into public.employee_capability (tenant_id, employee_id, capability_id, enabled)
  select conf.tenant_id, conf.employee_id, lcc.capability_id, true
    from public.lady_configuration_capability lcc
   where lcc.configuration_id = conf.id
  on conflict (employee_id, capability_id) do update set enabled = true;

  -- 3. L'autonomie de l'employé reflète la configuration, jamais l'inverse. Le client la règle
  --    en publiant une configuration, pas en touchant une colonne au bord.
  update public.employee set autonomy = conf.autonomie where id = conf.employee_id;
end;
$$;

comment on function public.appliquer_la_configuration(uuid) is
  'Le passage de relais d''une version de configuration à la suivante : désactive l''ancienne, '
  'active la neuve, réaligne les capacités ouvertes et reporte l''autonomie — en une transaction. '
  'employee_capability est une PROJECTION de la configuration, jamais une donnée parallèle.';

-- Réservée au serveur : ouvrir ou retirer un pouvoir à un employé n'est pas un geste de client.
revoke execute on function public.appliquer_la_configuration(uuid) from public;
