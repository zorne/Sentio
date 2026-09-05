-- LADY-AK — « une action attend votre accord » ne veut rien dire, et c'est inacceptable.
--
-- ══ CE QUE LE DIRIGEANT VOYAIT ══
--
--     « Une action attend votre accord. Depuis le 24 août. »   [Autoriser] [Refuser]
--
-- On lui demandait d'autoriser quelque chose **qu'il ne pouvait pas voir**. C'est le pire écran
-- possible pour ce produit : c'est exactement le moment où il donne son accord pour une action
-- irréversible, et c'est le seul moment où il n'avait aucune information.
--
-- Les deux issues sont mauvaises. Soit il clique « Autoriser » sans savoir — et la garde qui
-- l'arrête ne sert plus à rien, elle est devenue une case à cocher. Soit il n'ose pas cliquer, et
-- son employée reste bloquée sans qu'il comprenne pourquoi.
--
-- ══ POURQUOI L'INFORMATION MANQUAIT ══
--
-- La table `approval` ne porte que l'entreprise, la mission, l'état et la date. **Le contenu de
-- ce qui est proposé n'y est pas** — il vit au journal, dans l'événement `proposition_recue` qui
-- précède la suspension : la capacité, l'entrée (l'objet et le corps du message), et la raison
-- que l'employée a donnée.
--
-- Cette fonction va le chercher. Rien n'est ajouté au schéma : tout était déjà écrit, personne
-- n'allait le lire.
--
-- Réalise : LADY-AK

create function public.ce_qui_attend_votre_accord(p_tenant uuid)
returns table (
  approval_id   uuid,
  demande_le    timestamptz,
  capacite_cle  text,
  capacite_nom  text,
  entreprise    text,
  contact       text,
  objet         text,
  corps         text,
  pourquoi      text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id,
         a.requested_at,
         p.payload -> 'proposition' ->> 'capabilityKey',
         c.name,
         l.company_name,
         l.contact_name,
         p.payload -> 'proposition' -> 'input' ->> 'objet',
         p.payload -> 'proposition' -> 'input' ->> 'corps',
         p.payload -> 'proposition' ->> 'rationale'
    from public.approval a
    join public.task t on t.tenant_id = a.tenant_id and t.id = a.task_id
    -- La dernière proposition reçue pour cette mission : c'est celle que la politique a suspendue.
    -- `left join lateral` et non `join` : une approbation dont on ne retrouverait pas la
    -- proposition doit quand même apparaître — mieux vaut une ligne incomplète, qui se voit,
    -- qu'une décision qui disparaît de l'écran.
    left join lateral (
      select e.payload
        from public.execution_event e
       where e.tenant_id = a.tenant_id
         and e.task_id = a.task_id
         and e.kind = 'proposition_recue'
       order by e.created_at desc
       limit 1
    ) p on true
    left join public.capability c
      on c.key = p.payload -> 'proposition' ->> 'capabilityKey'
    left join public.lead l
      on l.tenant_id = t.tenant_id and l.id = t.subject_id and t.subject_kind = 'lead'
   where a.tenant_id = p_tenant
     and a.state = 'requested'
   order by a.requested_at;
$$;

comment on function public.ce_qui_attend_votre_accord(uuid) is
  'Ce que l''employée demande d''autoriser, EN TOUTES LETTRES : quelle action, sur quelle '
  'entreprise, avec quel message, et pourquoi. Tout était déjà au journal — personne n''allait le '
  'lire, et le dirigeant devait autoriser à l''aveugle.';

revoke execute on function public.ce_qui_attend_votre_accord(uuid) from public, authenticated, anon;
