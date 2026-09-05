-- LADY-AJ — ce qu'il faut savoir avant un rendez-vous, et RIEN QUE ce qu'on sait vraiment.
--
-- ══ LA DEMANDE ══
--
-- Pour les entreprises qui ont donné un rendez-vous, le dirigeant veut « les infos qui sont
-- apparues dans leur réponse ou dans le message, et qui peuvent être importantes lors du
-- rendez-vous ». Autrement dit : de quoi ne pas arriver les mains vides.
--
-- ══ ⚠️ CE QU'ON N'A PAS, ET QU'ON NE FERA PAS SEMBLANT D'AVOIR ══
--
-- **Le texte des réponses reçues n'est stocké nulle part.** Sentio enregistre ce qu'il ENVOIE
-- (`outbound_message`) et ce que le client DÉCLARE (`outcome`), pas le contenu de ce qui arrive.
-- Prétendre citer une réponse serait inventer — et devant un client qui a le message sous les
-- yeux, le mensonge se voit en une seconde.
--
-- Ce qu'on a réellement, et qui est utile :
--
--   1. **la note consignée sur la fiche** — ce que l'employée a retenu de l'échange, écrit par
--      elle au moment où ça s'est passé (`execution_event`, `fiche_mise_a_jour`). C'est la pièce
--      la plus précieuse, et la seule qui porte des mots venus de l'échange lui-même ;
--   2. **l'objet du dernier message envoyé** — ce à quoi l'interlocuteur s'attend ;
--   3. **pourquoi cette entreprise a été retenue** — l'angle qui a fonctionné ;
--   4. le contact, sa fonction, le secteur, et depuis combien de temps ça dure.
--
-- ⚠️ Chaque élément voyage avec sa PROVENANCE. Un briefing dont on ne sait pas d'où vient chaque
-- ligne est un briefing qu'on ne peut pas vérifier — donc qu'on ne peut pas défendre en réunion.
--
-- Réalise : LADY-AJ

create function public.avant_le_rendez_vous(p_tenant uuid, p_jours integer default 60)
returns table (
  lead_id           uuid,
  entreprise        text,
  contact           text,
  fonction          text,
  secteur           text,
  pourquoi_retenue  text,
  dernier_objet     text,
  dernier_envoi     timestamptz,
  messages_envoyes  integer,
  premier_contact   timestamptz,
  rendez_vous_le    timestamptz,
  notes             jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with rdv as (
    select t.subject_id as lead_id, max(o.recorded_at) as quand
      from public.outcome o
      join public.task t on t.tenant_id = o.tenant_id and t.id = o.task_id
     where o.tenant_id = p_tenant
       and o.kind = 'meeting'
       and t.subject_kind = 'lead'
       and o.recorded_at >= (current_date - (greatest(least(p_jours, 365), 1) - 1))::timestamptz
       -- Une entreprise qui a déjà signé n'attend plus de rendez-vous : la sortir d'ici évite de
       -- préparer une réunion qui a déjà eu lieu et abouti.
       and not exists (
         select 1 from public.outcome v
          where v.tenant_id = o.tenant_id and v.task_id = o.task_id and v.kind = 'sale')
     group by t.subject_id
  )
  select l.id,
         l.company_name,
         l.contact_name,
         l.role_title,
         l.sector,
         coalesce(nullif(trim(l.selection_reason), ''), nullif(trim(l.qualification_reason), '')),
         (select m.subject from public.outbound_message m
           where m.tenant_id = p_tenant and m.lead_id = l.id
           order by m.sent_at desc limit 1),
         (select max(m.sent_at) from public.outbound_message m
           where m.tenant_id = p_tenant and m.lead_id = l.id),
         (select count(*)::integer from public.outbound_message m
           where m.tenant_id = p_tenant and m.lead_id = l.id),
         (select min(m.sent_at) from public.outbound_message m
           where m.tenant_id = p_tenant and m.lead_id = l.id),
         r.quand,
         -- Les notes consignées, de la plus récente à la plus ancienne. Elles sont écrites par
         -- l'employée pendant le travail : c'est la seule matière qui porte des mots venus de
         -- l'échange, et elle est datée.
         coalesce(
           (select jsonb_agg(jsonb_build_object('note', e.payload ->> 'note', 'quand', e.created_at)
                             order by e.created_at desc)
              from public.execution_event e
             where e.tenant_id = p_tenant
               and e.kind = 'fiche_mise_a_jour'
               and e.payload ->> 'leadId' = l.id::text
               and coalesce(trim(e.payload ->> 'note'), '') <> ''),
           '[]'::jsonb)
    from rdv r
    join public.lead l on l.tenant_id = p_tenant and l.id = r.lead_id
   order by r.quand desc
   limit 20;
$$;

comment on function public.avant_le_rendez_vous(uuid, integer) is
  'De quoi préparer un rendez-vous, avec la PROVENANCE de chaque élément. ⚠️ Le texte des réponses '
  'reçues n''est stocké nulle part : ce qui porte des mots venus de l''échange, ce sont les notes '
  'consignées par l''employée. Ne jamais faire semblant de citer une réponse.';

revoke execute on function public.avant_le_rendez_vous(uuid, integer) from public, authenticated, anon;
