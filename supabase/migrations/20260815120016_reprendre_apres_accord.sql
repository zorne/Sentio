-- LADY-R — quand le client tranche, le travail repart.
--
-- ══ LE DÉFAUT, TROUVÉ PAR LA RÉPÉTITION GÉNÉRALE ══
--
-- Quand Lady s'arrête pour demander un accord, `mettreDeCote()` marque la mission
-- `waiting_approval` et **la sort de la file** (`20260729120015`, `file-de-travaux.ts`). C'est
-- juste : un travail qui attend une personne ne doit pas occuper un exécutant ni se rejouer en
-- boucle.
--
-- Mais **rien ne l'y remettait**. Le dirigeant accordait depuis son espace… et il ne se passait
-- rien. Jamais. Lady paraissait ignorer sa réponse, et le seul recours aurait été d'attendre —
-- indéfiniment.
--
-- Le journal de la répétition générale s'arrêtait exactement là :
--
--     approvisionnement_ouverture → run_demarre → contexte_assemble
--       → proposition_recue → politique_suspend → (plus rien)
--
-- Aucun test ne pouvait le voir : chacun vérifiait une pièce, et la pièce manquante était le
-- **lien** entre l'espace client et la file.
--
-- ══ POURQUOI EN BASE, ET PAS DANS LE CODE ══
--
-- Le client tranche en écrivant directement dans `approval`, sous RLS (`20260729120017`). **Aucun
-- code serveur ne s'exécute sur ce chemin.** Un réveil écrit dans une action applicative ne
-- couvrirait donc pas le geste réel du client — seulement celui d'une interface particulière.
--
-- ══ CE QUE LE DÉCLENCHEUR NE DÉCIDE PAS ══
--
-- Il **réveille**, il ne conclut pas. Accordé ou refusé, la mission retourne en file et c'est le
-- runtime qui lit le journal et l'état de l'accord pour décider de la suite. Trancher ici
-- mettrait la logique de décision à deux endroits — et c'est toujours le second qui dérive.
--
-- Réalise : EXEC-11

create function public.reprendre_apres_accord()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  priorite integer;
begin
  -- Seule la RÉSOLUTION réveille. Une révocation, ou une écriture qui ne change pas l'état, ne
  -- doit pas remettre en file un travail que personne n'attend.
  if old.state <> 'requested' or new.state not in ('granted', 'refused') then
    return new;
  end if;

  -- La priorité vient de la formule, en données, jamais d'une condition sur son nom.
  select coalesce(p.job_priority, 0) into priorite
    from public.subscription s
    join public.plan p on p.id = s.plan_id
   where s.tenant_id = new.tenant_id and s.status = 'active'
   limit 1;

  -- ⚠️ Déjà en file : un accord tranché deux fois ne crée pas deux travaux. La table n'a pas
  -- d'unicité sur (entreprise, mission) — c'est voulu, un même sujet peut être repris — donc la
  -- garde est ici. Mais elle ne borne QUE l'insertion : sortir de la fonction à ce point sauterait
  -- la remise en état de la mission, qui resterait `waiting_approval` et donc imprenable. C'est le
  -- défaut que la répétition générale a trouvé dans ce déclencheur même.
  if not exists (
    select 1 from public.job j
     where j.tenant_id = new.tenant_id and j.task_id = new.task_id
  ) then
    insert into public.job (tenant_id, task_id, priority)
    values (new.tenant_id, new.task_id, coalesce(priorite, 0));
  end if;

  -- ⚠️ Le journal fait foi, et la machine à états l'attendait déjà : `accord_accorde` relance le
  -- run, `accord_refuse` le referme sans exécuter (`run-state.ts`). Ces deux natures existaient
  -- dans le vocabulaire depuis le début — **personne ne les écrivait**. Remettre en file sans
  -- écrire l'événement ferait reprendre un run que le journal croit toujours suspendu.
  insert into public.execution_event (tenant_id, task_id, employee_id, kind, payload)
  select new.tenant_id, new.task_id, t.employee_id,
         case when new.state = 'granted' then 'accord_accorde' else 'accord_refuse' end,
         jsonb_build_object('approval_id', new.id, 'resolu_le', new.resolved_at)
    from public.task t
   where t.tenant_id = new.tenant_id and t.id = new.task_id;

  -- La mission redevient prenable. Elle restait `waiting_approval`, donc invisible pour tout ce
  -- qui compte le travail en cours.
  update public.task
     set state = 'pending', updated_at = now()
   where tenant_id = new.tenant_id and id = new.task_id and state = 'waiting_approval';

  return new;
end;
$$;

create trigger approval_reprend_le_travail
  after update on public.approval
  for each row execute function public.reprendre_apres_accord();

comment on function public.reprendre_apres_accord() is
  'Quand le client tranche, la mission retourne en file. Le déclencheur réveille, il ne conclut '
  'pas : c''est le runtime qui décide de la suite, en lisant le journal et l''état de l''accord.';
