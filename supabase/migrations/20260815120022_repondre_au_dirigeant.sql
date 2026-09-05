-- LADY-X — « qu'est-ce que tu as fait aujourd'hui ? »
--
-- ══ CE QU'IL FAUT POUR RÉPONDRE HONNÊTEMENT ══
--
-- Le dirigeant va pouvoir poser des questions à son employée. La tentation évidente est de
-- brancher un modèle sur la base et de le laisser raconter. **On ne le fera pas**, et cette
-- migration est ce qui rend l'alternative possible : des chiffres bruts, comptés en SQL, qu'un
-- gabarit se contente de mettre en phrase (`packages/domain/src/questions.ts`).
--
-- La raison n'est pas de la prudence de principe. Un modèle qui compte lui-même se trompe d'une
-- unité une fois sur cinquante, et cette fois-là il l'affirmera avec le même aplomb que les
-- quarante-neuf autres. Un dirigeant à qui l'on annonce « 12 réponses » alors qu'il y en a 9 ne
-- refait pas confiance aux 49 chiffres suivants. C'est l'invariant 4 du dépôt : aucun chiffre qui
-- ne vienne d'une ligne en base.
--
-- ══ POURQUOI UNE FONCTION PAR JOUR, ALORS QUE `mesures_du_travail` EXISTE ══
--
-- Elles ne répondent pas à la même question. `mesures_du_travail` compte sur tout l'horizon de
-- l'objectif — c'est ce qu'il faut pour décider. Ici on répond à « aujourd'hui », « hier »,
-- « cette semaine » : un dirigeant demande des nouvelles, pas un bilan.
--
-- ⚠️ La fenêtre est un INTERVALLE passé en paramètre, pas une date en dur : « aujourd'hui » se
-- calcule chez l'appelant, qui seul connaît le fuseau du client. Le faire ici imposerait UTC à
-- tout le monde, et un dirigeant qui demande à 8 h du matin ce qui s'est passé « hier » recevrait
-- une réponse décalée d'un jour sans que rien ne le signale.
--
-- Réalise : LADY-X

create function public.travail_sur_la_periode(
  p_tenant uuid,
  p_debut  timestamptz,
  p_fin    timestamptz
)
returns table (
  missions_ouvertes  integer,
  missions_agies     integer,
  messages_envoyes   integer,
  reponses           integer,
  rendez_vous        integer,
  ventes             integer,
  chiffre_affaires   numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::integer from public.task t
      where t.tenant_id = p_tenant and t.created_at >= p_debut and t.created_at < p_fin),

    -- « Agie » : une action a réellement été exécutée. Une mission ouverte et jamais travaillée
    -- ne prouve rien — et l'annoncer comme du travail fait serait le premier mensonge du produit.
    (select count(distinct e.task_id)::integer from public.execution_event e
      where e.tenant_id = p_tenant and e.kind = 'action_executee'
        and e.created_at >= p_debut and e.created_at < p_fin),

    (select count(*)::integer from public.outbound_message m
      where m.tenant_id = p_tenant and m.sent_at >= p_debut and m.sent_at < p_fin),

    -- Les issues sont datées de leur DÉCLARATION (`recorded_at`), pas du travail qui les a
    -- produites : une
    -- réponse arrivée aujourd'hui à un message d'avant-hier est une nouvelle d'aujourd'hui.
    (select count(*)::integer from public.outcome o
      where o.tenant_id = p_tenant and o.kind = 'response'
        and o.recorded_at >= p_debut and o.recorded_at < p_fin),
    (select count(*)::integer from public.outcome o
      where o.tenant_id = p_tenant and o.kind = 'meeting'
        and o.recorded_at >= p_debut and o.recorded_at < p_fin),
    (select count(*)::integer from public.outcome o
      where o.tenant_id = p_tenant and o.kind = 'sale'
        and o.recorded_at >= p_debut and o.recorded_at < p_fin),
    (select coalesce(sum(o.value), 0) from public.outcome o
      where o.tenant_id = p_tenant and o.kind = 'sale'
        and o.recorded_at >= p_debut and o.recorded_at < p_fin);
$$;

comment on function public.travail_sur_la_periode(uuid, timestamptz, timestamptz) is
  'Ce que le travail a produit entre deux instants, en comptes bruts. Sert à répondre au '
  'dirigeant sans qu''aucun chiffre ne soit calculé par un modèle (invariant 4 du dépôt).';

revoke execute on function public.travail_sur_la_periode(uuid, timestamptz, timestamptz) from public;
