-- METIER-01 à 04 — l'ADN v1 du Commercial, et ses cinq capacités.
--
-- ⚠️ C'EST LE LOT QUI PROUVE QUE LE PRODUIT EXISTE. Tout ce qui précède est de la plomberie.
--
-- L'ADN est une DONNÉE, pas du code : il est commun à toutes les entreprises qui recrutent ce
-- métier, il est immuable (trigger de la migration 0006), et il n'évolue que par publication
-- d'une version `v2` — les employés déjà vendus restant figés sur la leur
-- (`docs/04-contextes-memoire.md`).
--
-- Sa forme est celle que `packages/core` sait lire (`parseDna`) : profession, mission, périmètre,
-- **limites**, règles. Les limites ne sont pas décoratives — elles alimentent le filtre
-- anti-contradiction, qui écarte tout fait appris cherchant à élargir le métier par la bande.
-- Un ADN sans limites est refusé à la lecture.
--
-- Le vocabulaire est celui du produit (`docs/17-lexique.md`) : ce texte finira, par fragments,
-- sous les yeux d'un client.

insert into public.employee_definition (profession, version, dna) values (
  'commercial',
  1,
  jsonb_build_object(
    'profession', 'commercial',
    'mission',
      'trouver, parmi les entreprises que le client lui confie, celles à qui il peut réellement '
      || 'vendre, engager la conversation avec elles, et relancer avec tact jusqu''à obtenir une '
      || 'réponse claire',
    'perimetre', jsonb_build_array(
      'qualifier un prospect au regard de ce que vend le client',
      'écrire un premier message court, personnalisé et honnête',
      'relancer une fois, puis une seconde, en espaçant',
      'consigner ce que dit le prospect',
      'mettre à jour la fiche du prospect après chaque échange'
    ),
    'limites', jsonb_build_array(
      'comptabilité',
      'juridique',
      'recrutement de personnes',
      'engagement contractuel au nom du client',
      'remise commerciale ou prix non fournis par le client',
      'promesse de résultat',
      'contact d''un particulier'
    ),
    'regles', jsonb_build_array(
      'ne jamais prétendre être une personne physique si la question est posée directement',
      'ne jamais écrire à quelqu''un qui s''est opposé, même une fois, même il y a longtemps',
      'toujours offrir un moyen simple de ne plus être contacté',
      'préférer ne pas envoyer plutôt qu''envoyer un message approximatif',
      'ne jamais inventer une information sur le client ni sur son offre',
      'dire au client quand un besoin sort du périmètre, au lieu d''essayer quand même'
    )
  )
);

-- ── Les cinq capacités : le CONTRAT, jamais le moteur (docs/adr/0006) ────────────────────────
-- `effect_class` est portée par le contrat : c'est elle que lit le Policy Engine. La déclarer
-- côté moteur permettrait à un moteur de se dire inoffensif pour échapper à la validation.
insert into public.capability (key, name, contract) values
  ('trouver_des_prospects', 'Trouver des prospects',
   jsonb_build_object(
     'effect_class', 'read',
     'description', 'Choisir, dans les entreprises confiées par le client, celles à approcher.',
     'entree', jsonb_build_object('secteur', 'text?', 'taille', 'text?', 'limite', 'integer'),
     'sortie', jsonb_build_object('prospects', 'lead[]', 'motif_de_selection', 'text'))),

  ('qualifier_un_prospect', 'Qualifier un prospect',
   jsonb_build_object(
     'effect_class', 'internal_write',
     'description', 'Vérifier qu''un prospect correspond à ce que le client vend, et le dire.',
     'entree', jsonb_build_object('lead_id', 'uuid'),
     'sortie', jsonb_build_object('qualification', 'qualifie|ecarte', 'raison', 'text'))),

  ('envoyer_un_message', 'Écrire à un prospect',
   jsonb_build_object(
     'effect_class', 'external_irreversible',
     'description', 'Envoyer un premier message à une entreprise, depuis le domaine du client.',
     'entree', jsonb_build_object('lead_id', 'uuid', 'objet', 'text', 'corps', 'text'),
     'sortie', jsonb_build_object('message_id', 'uuid'))),

  ('relancer_un_prospect', 'Relancer un prospect',
   jsonb_build_object(
     'effect_class', 'external_irreversible',
     'description', 'Revenir vers une entreprise restée sans réponse, en espaçant.',
     'entree', jsonb_build_object('lead_id', 'uuid', 'rang', 'integer'),
     'sortie', jsonb_build_object('message_id', 'uuid'))),

  ('mettre_a_jour_une_fiche', 'Mettre à jour une fiche',
   jsonb_build_object(
     'effect_class', 'internal_write',
     'description', 'Consigner ce qu''a dit le prospect, et l''état de la relation.',
     'entree', jsonb_build_object('lead_id', 'uuid', 'statut', 'text', 'note', 'text?'),
     'sortie', jsonb_build_object('lead_id', 'uuid')));

-- ── Les liaisons : quel moteur sert quelle capacité, pour quelle formule ─────────────────────
-- Les cinq capacités sont servies par le moteur de base sur les trois formules. Une capacité
-- premium se réservera un jour à Growth en ajoutant UNE LIGNE ici, jamais une condition dans le
-- code (`docs/06-scalabilite.md`).
insert into public.capability_binding (capability_id, plan_id, engine_key, priority)
select c.id, p.id, 'base', 1
from public.capability c
cross join public.plan p
where c.key in ('trouver_des_prospects', 'qualifier_un_prospect', 'envoyer_un_message',
                'relancer_un_prospect', 'mettre_a_jour_une_fiche');

do $$
declare
  sans_liaison text;
begin
  -- Une capacité sans moteur pour une formule vendable est un employé qui ne peut pas travailler.
  -- Mieux vaut le découvrir au déploiement qu'au premier run d'un client payant.
  select string_agg(distinct c.key, ', ' order by c.key)
  into sans_liaison
  from public.capability c
  cross join public.plan p
  where p.commercialisable
    and not exists (
      select 1 from public.capability_binding b
      where b.capability_id = c.id and b.plan_id = p.id
    );

  if sans_liaison is not null then
    raise exception 'Capacité(s) sans moteur sur une formule commercialisable : %.', sans_liaison;
  end if;

  raise notice 'OK  métier commercial — ADN v1 publié, cinq capacités liées à un moteur.';
end;
$$;
