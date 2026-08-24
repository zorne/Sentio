-- LADY-K — une ligne sans entreprise peut en acquérir une. Elle ne peut toujours pas en changer.
--
-- ══ CE QUE LE VERROU CONFONDAIT ══
--
-- `reject_tenant_change` (`20260729120034`) refuse tout écart entre l'ancienne et la nouvelle
-- entreprise d'une ligne. C'est juste — et trop large d'un cas : il refusait aussi
-- **`NULL → entreprise`**.
--
-- Or c'est précisément le cycle de vie prévu pour `diagnostic_session` : « tenant_id est nul tant
-- que le visiteur n'est pas devenu client » (`20260729120026`). Le rattachement au moment du
-- recrutement (RECRUT-10) était donc interdit par un garde-fou censé protéger autre chose.
--
-- Deux gestes très différents étaient traités pareil :
--
--   · **acquérir une entreprise** — `NULL → X`. Une ligne qui n'appartenait à personne trouve son
--     propriétaire. Aucune donnée ne traverse : il n'y avait pas d'autre côté.
--   · **changer d'entreprise** — `X → Y`, et `X → NULL`. C'est là que se joue la fuite, et ça
--     reste interdit, sans exception, y compris pour le rôle de service.
--
-- Le second est le danger que le verrou existe pour fermer. Le premier ne l'a jamais été.
--
-- ⚠️ Ce n'est pas un assouplissement de confort : c'était ça, ou écrire le rattachement par un
-- chemin qui contourne le déclencheur — c'est-à-dire ouvrir une porte bien plus large, et
-- ailleurs que sous les yeux de qui relit cette table.
--
-- Réalise : RECRUT-10

create or replace function public.reject_tenant_change()
returns trigger
language plpgsql
as $$
begin
  -- Une ligne orpheline qui trouve son entreprise : rien ne traverse, rien ne fuit.
  if old.tenant_id is null and new.tenant_id is not null then
    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id then
    raise exception
      'Une ligne ne change jamais d''entreprise (%.% : % → %).',
      tg_table_schema, tg_table_name, old.tenant_id, new.tenant_id;
  end if;

  return new;
end;
$$;
