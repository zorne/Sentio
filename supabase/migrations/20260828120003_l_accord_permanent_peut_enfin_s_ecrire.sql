-- L'accord permanent peut enfin s'écrire.
--
-- ══ LE DÉFAUT, ET POURQUOI PERSONNE NE L'A VU ══
--
-- `accorder_definitivement()` lève systématiquement, pour tout le monde, depuis le 2026-08-06 :
--
--     null value in column "effect_class" of relation "standing_approval"
--     violates not-null constraint
--
-- Le bouton « autoriser une fois pour toutes » de l'espace du dirigeant
-- (`BoutonsDeDecision.tsx`) n'a donc jamais fonctionné. Il rend « Cet accord n'a pas pu être
-- enregistré », quelle que soit la capacité et quel que soit le client.
--
-- Rien ne l'a signalé parce que **l'espace client n'a jamais servi** : zéro entreprise en base.
-- Un défaut sur un chemin que personne n'emprunte est un défaut que personne ne rencontre — et
-- il attendait le premier client payant.
--
-- ══ D'OÙ VIENT LA COLONNE, ET POURQUOI ELLE NE SERT PLUS ══
--
-- `20260806120002_autonomie_et_accords.sql` a fait passer l'accord permanent de la CLASSE
-- D'EFFET à la CAPACITÉ NOMMÉE — c'était la bonne décision, et elle fermait une porte large :
-- un accord sur `external_irreversible` autorisait auparavant la classe entière.
--
-- Cette migration a ajouté `capability_key`, créé `unique (employee_id, capability_key)` et
-- supprimé `unique (employee_id, effect_class)`. Elle a laissé `effect_class` en `not null`.
-- La nouvelle fonction, elle, n'écrit que `capability_key` — ce qui est correct.
--
-- ⚠️ **La colonne est vestigiale, et c'est vérifié, pas supposé.** Aucune des quatre fonctions
-- qui touchent `standing_approval` ne la lit — `accorder_definitivement`, `retirer_l_accord`,
-- `ce_qu_elle_a_fait`, `erase_tenant`. Le runtime ne la lit pas davantage : ce que consulte
-- `hasStandingApproval` (`packages/runtime/src/adapters/approvals.ts`) est
-- `(tenant_id, employee_id, capability_key, revoked_at, expires_at)`, et rien d'autre.
--
-- La notion de classe d'effet n'a pas disparu pour autant — elle vit là où elle a un sens, sur
-- `capability.contract->>'effect_class'`, d'où le Policy Engine la lit. C'est une propriété de
-- la CAPACITÉ, pas de l'accord. La stocker aussi sur l'accord serait recopier une donnée déjà
-- dérivable, et les deux copies finiraient par diverger.
--
-- ══ POURQUOI LEVER LA CONTRAINTE PLUTÔT QUE REMPLIR LA COLONNE ══
--
-- Faire renseigner `effect_class` par `accorder_definitivement()` ferait disparaître l'erreur.
-- Ce serait la mauvaise correction : elle rangerait un accord *par capacité* sous une étiquette
-- *par classe d'effet* — exactement la granularité que `20260806120002` a retirée — et
-- ressusciterait un concept que plus rien ne lit.
--
-- ══ POURQUOI LA COLONNE RESTE, POUR L'INSTANT ══
--
-- `drop column` serait l'état final propre. Décision du fondateur du 2026-08-28 : on lève la
-- contrainte maintenant, on supprimera la colonne plus tard, comme un geste de nettoyage séparé
-- et assumé, après stabilisation. Une suppression de colonne et une réparation de bogue dans la
-- même migration ne se relisent pas, et ne se défont pas séparément.
--
-- ⚠️ Une colonne vestigiale qui survit finit par tromper quelqu'un — c'est le reproche fait à
-- `provider_credential.enabled`. Le nettoyage est donc dû, pas facultatif.
--
-- ══ CE QUE ÇA COÛTE, ET CE QUE ÇA NE TOUCHE PAS ══
--
-- `drop not null` ne réécrit pas la table, ne modifie aucune ligne, et ne touche aucune des six
-- contraintes existantes — les deux CHECK, la clé étrangère composite par entreprise, et
-- l'unicité par capacité restent entières. La table compte 0 ligne en ligne au moment d'écrire.
--
-- Rollback : `alter table public.standing_approval alter column effect_class set not null;`
-- Il n'échouerait que si des accords ont été créés entre-temps — c'est-à-dire si le correctif a
-- servi.

alter table public.standing_approval
  alter column effect_class drop not null;

comment on column public.standing_approval.effect_class is
  'VESTIGE de l''accord par classe d''effet, remplacé par « capability_key » le 2026-08-06 '
  '(20260806120002). Plus aucune fonction ni aucun code ne le lit ni ne l''écrit. Conservé '
  'nullable en attendant une suppression décidée à part ; ne pas s''en servir.';

do $$
declare
  obligatoire boolean;
begin
  select attnotnull into obligatoire
    from pg_attribute
   where attrelid = 'public.standing_approval'::regclass
     and attname = 'effect_class';

  if obligatoire then
    raise exception
      'effect_class est encore obligatoire : accorder_definitivement() continuera d''échouer.';
  end if;

  raise notice
    'OK  l''accord permanent peut s''écrire ; effect_class reste, sans être exigée.';
end;
$$;
