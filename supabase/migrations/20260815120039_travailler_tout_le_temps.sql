-- L'accord donné une fois pour toutes, et ce qui se passe ensuite sans vous déranger.
--
-- ══ LA DEMANDE, ET CE QU'ELLE ÉQUILIBRE ══
--
-- Demande du fondateur, le 2026-08-27 : *« je veux qu'il y ait la possibilité de dire je veux
-- valider cette tâche définitivement, et du coup la tâche qu'il aura validée sera automatique,
-- mais je veux qu'il voie quand même les étapes même si elles sont faites sans son accord, comme
-- ça si ça lui déplaît il pourra décider de ne plus automatiser cette tâche […] je veux vraiment
-- que l'agent travaille tout le temps. »*
--
-- Deux exigences qui se contredisent en apparence : **qu'elle avance sans être bloquée**, et
-- **qu'il garde la main**. Elles se réconcilient par une seule idée, et c'est celle-ci : ce qui
-- est automatisé reste VISIBLE. Un accord permanent n'est pas un chèque en blanc, c'est une
-- confiance qu'on peut retirer en voyant ce qu'elle a produit.
--
-- ══ CE QUI EXISTAIT DÉJÀ, ET QU'ON N'A PAS REFAIT ══
--
-- `standing_approval` porte depuis toujours l'accord permanent PAR CAPACITÉ, avec sa date
-- d'octroi, sa révocation et son échéance. Le moteur le lit déjà avant chaque action
-- (`PostgresApprovalStore`). Rien de tout cela n'est à construire : il manquait seulement les
-- deux gestes du dirigeant, et le moyen de voir.
--
-- ⚠️ AUCUNE TABLE NOUVELLE. Trois fonctions de lecture et d'écriture sur ce qui existe.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Accorder définitivement
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ CE GESTE ÉLARGIT L'AUTONOMIE, DONC SEUL LE DIRIGEANT PEUT LE POSER. C'est le cliquet :
-- n'importe quoi peut rendre l'employé plus prudent, rien ne peut le rendre plus libre à sa
-- place. La fonction est `security definer` et révoquée au public, exactement comme
-- `regler_l_autonomie` : l'appartenance se vérifie AVANT, côté serveur.
--
-- ⚠️ Et l'accord est **par capacité**, jamais global. Autoriser « mettre à jour une fiche » pour
-- toujours n'autorise pas « écrire à un prospect ». C'est ce qui permet au dirigeant d'ouvrir ce
-- qui est réversible et de garder la main sur ce qui sort de chez lui.

create function public.accorder_definitivement(
  p_tenant     uuid,
  p_employee   uuid,
  p_capacite   text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  connue  boolean;
  accorde timestamptz;
begin
  select exists (select 1 from public.capability where key = p_capacite) into connue;
  if not connue then
    raise exception 'Capacité « % » inconnue : on n''accorde rien à l''aveugle.', p_capacite;
  end if;

  -- L'employé doit appartenir à cette entreprise. Sans ce contrôle, un identifiant d'employé
  -- deviné suffirait à élargir l'autonomie de quelqu'un d'autre.
  if not exists (
    select 1 from public.employee e where e.tenant_id = p_tenant and e.id = p_employee
  ) then
    raise exception 'Employé introuvable dans cette entreprise.';
  end if;

  -- Un accord déjà donné se ravive plutôt que de se dupliquer : l'index unique par capacité
  -- l'impose, et un second accord n'aurait aucun sens de toute façon.
  insert into public.standing_approval (tenant_id, employee_id, capability_key, granted_at)
  values (p_tenant, p_employee, p_capacite, now())
  on conflict (employee_id, capability_key)
    do update set granted_at = now(), revoked_at = null, expires_at = null
  returning granted_at into accorde;

  return accorde;
end;
$$;

revoke execute on function public.accorder_definitivement(uuid, uuid, text)
  from public, authenticated, anon;

comment on function public.accorder_definitivement(uuid, uuid, text) is
  'Le dirigeant autorise une capacité une fois pour toutes. Par capacité, jamais globalement, et '
  'révocable à tout instant. C''est le seul chemin qui élargit l''autonomie, et il part de lui.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Retirer l'accord
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ CE GESTE RESTREINT, DONC IL DOIT ÊTRE PLUS FACILE QUE L'AUTRE, JAMAIS PLUS DIFFICILE.
-- Un produit où l'on donne sa confiance en un clic et où on la reprend en trois est un produit
-- qui a choisi son camp. Ici les deux coûtent le même geste.
--
-- Il ne détruit pas la ligne : il la date. Savoir qu'une confiance a été donnée puis retirée, et
-- quand, vaut mieux que de faire disparaître qu'elle a existé.

create function public.retirer_l_accord(
  p_tenant   uuid,
  p_employee uuid,
  p_capacite text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  touche integer;
begin
  update public.standing_approval
     set revoked_at = now()
   where tenant_id = p_tenant
     and employee_id = p_employee
     and capability_key = p_capacite
     and revoked_at is null;

  get diagnostics touche = row_count;
  return touche > 0;
end;
$$;

revoke execute on function public.retirer_l_accord(uuid, uuid, text)
  from public, authenticated, anon;

comment on function public.retirer_l_accord(uuid, uuid, text) is
  'Le dirigeant reprend une autorisation permanente. Date la révocation au lieu d''effacer la '
  'ligne : qu''une confiance ait existé fait partie de l''histoire de cet employé.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Ce qu'elle a fait, et si elle vous l'a demandé
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ C'EST LA CONTREPARTIE DE L'ACCORD PERMANENT, ET ELLE N'EST PAS NÉGOCIABLE.
--
-- Autoriser une fois pour toutes n'a de sens que si l'on voit ce qui passe ensuite. Sans cette
-- lecture, « valider définitivement » reviendrait à fermer les yeux, et le dirigeant n'aurait
-- plus aucun moyen de constater que ça lui déplaît.
--
-- ⚠️ POURQUOI UNE FONCTION ET NON UNE POLITIQUE SUR LE JOURNAL.
--
-- `execution_event` n'a **aucune politique** et aucun droit pour le client : il est fermé, et
-- c'est voulu. Sa charge utile porte les entrées et sorties d'outils, donc des contenus bruts.
-- Ouvrir la table exposerait tout ; une fonction rend exactement ce qui se lit, et rien d'autre.
--
-- ⚠️ COMMENT ON SAIT S'IL A ÉTÉ DEMANDÉ. Le journal relie les maillons d'un même pas par
-- `step_id` : la proposition, la décision de la politique, l'engagement, le résultat. Un pas où
-- la politique a SUSPENDU est un pas qu'on lui a soumis ; un pas où elle a laissé passer est un
-- pas fait sans le déranger. On ne le devine pas, on le lit.

create function public.ce_qu_elle_a_fait(p_tenant uuid, p_jours integer default 14)
returns table (
  quand           timestamptz,
  capacite_cle    text,
  capacite_nom    text,
  entreprise      text,
  sans_vous       boolean,
  accord_en_cours boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.created_at,
         p.payload -> 'proposition' ->> 'capabilityKey',
         c.name,
         l.company_name,
         -- Aucun maillon « suspendu » sur ce pas : la politique a laissé passer, donc le
         -- dirigeant n'a rien eu à répondre.
         not exists (
           select 1 from public.execution_event s
            where s.tenant_id = e.tenant_id
              and s.step_id = e.step_id
              and s.kind = 'politique_suspend'
         ),
         -- L'accord permanent est-il TOUJOURS en vigueur ? C'est ce qui permet au dirigeant de
         -- retirer sa confiance depuis la ligne qui l'a gênée, sans aller la chercher ailleurs.
         exists (
           select 1 from public.standing_approval sa
            where sa.tenant_id = e.tenant_id
              and sa.capability_key = p.payload -> 'proposition' ->> 'capabilityKey'
              and sa.revoked_at is null
              and (sa.expires_at is null or sa.expires_at > now())
         )
    from public.execution_event e
    -- La proposition du même pas porte la capacité. `left join` : une action dont on aurait perdu
    -- la proposition doit rester visible, sans nom plutôt qu'absente.
    left join lateral (
      select ev.payload
        from public.execution_event ev
       where ev.tenant_id = e.tenant_id
         and ev.step_id = e.step_id
         and ev.kind = 'proposition_recue'
       limit 1
    ) p on true
    left join public.capability c on c.key = p.payload -> 'proposition' ->> 'capabilityKey'
    left join public.task t on t.tenant_id = e.tenant_id and t.id = e.task_id
    left join public.lead l
      on l.tenant_id = t.tenant_id and l.id = t.subject_id and t.subject_kind = 'lead'
   where e.tenant_id = p_tenant
     and e.kind = 'action_executee'
     and e.created_at >= now() - make_interval(days => greatest(p_jours, 1))
   order by e.created_at desc
   limit 50;
$$;

revoke execute on function public.ce_qu_elle_a_fait(uuid, integer)
  from public, authenticated, anon;

comment on function public.ce_qu_elle_a_fait(uuid, integer) is
  'Ce que l''employé a réellement fait, et pour chaque action : vous l''a-t-il demandé, et '
  'l''accord permanent est-il encore en vigueur. La contrepartie de « valider définitivement » : '
  'ce qui est automatisé reste visible, sinon la confiance ne peut plus être reprise.';

do $$
begin
  raise notice 'OK  accord permanent : accordable, retirable, et ce qu''il laisse passer est lisible.';
end;
$$;
