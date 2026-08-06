-- EXEC-05 — d'où vient le niveau d'autonomie, et ce qu'un accord permanent couvre exactement.
--
-- ══ DÉFAUT 1 — L'AUTONOMIE N'ÉTAIT STOCKÉE NULLE PART ══
--
-- `PolicyEngine.decide()` prend un niveau d'autonomie en paramètre. Aucune colonne du schéma ne
-- le portait : l'appelant le fournissait, et rien ne disait d'où il le tenait. Or c'est un
-- réglage du CLIENT (`docs/05-runtime-employe.md`) — s'il peut être décidé au bord, il peut être
-- décidé par ce qui remonte du bord, y compris par ce qu'un modèle a répondu.
--
-- Il vit désormais sur l'employé, avec un défaut PRUDENT. Le défaut n'est pas neutre : c'est le
-- comportement de tout employé recruté avant que son client ait réglé quoi que ce soit.
-- `confirm` = chaque action irréversible demande un accord. Un défaut permissif ferait de
-- l'oubli de réglage une autorisation.
--
-- ══ DÉFAUT 2 — UN ACCORD PERMANENT AUTORISAIT TOUT UN GENRE D'ACTIONS ══
--
-- `standing_approval` portait `unique (employee_id, effect_class)`. Une seule ligne accordée sur
-- `external_irreversible` signifiait donc : « cet employé peut faire TOUTES les actions
-- irréversibles, pour toujours ». Le client croyait autoriser un envoi ; il autorisait la classe
-- entière, sans limite de durée.
--
-- Trois changements, et chacun ferme une porte :
--   · `capability_key` — l'accord porte sur UNE capacité nommée. Accorder « écrire à un
--     prospect » n'accorde pas « supprimer des données ».
--   · `expires_at` — un accord peut être borné dans le temps. Nul = sans échéance, ce qui reste
--     un choix, pas un défaut subi.
--   · la contrainte de non-vacuité — une clé vide recréerait exactement l'autorisation globale
--     qu'on vient de retirer, et le ferait sans que personne ne le voie.
--
-- La révocation ne change pas : c'est une mise à jour, jamais une suppression. On doit pouvoir
-- prouver qu'un accord existait au moment où une action a été menée.
--
-- Réalise : EXEC-05

-- ── 1. Le niveau d'autonomie, sur l'employé, avec un défaut prudent ──────────

alter table public.employee
  add column autonomy text not null default 'confirm'
    check (autonomy in ('auto', 'notify', 'confirm', 'confirm_once'));

comment on column public.employee.autonomy is
  'Réglage du CLIENT, jamais déduit de l''exécution ni de ce qu''un modèle a répondu. '
  'Défaut « confirm » : sans réglage explicite, chaque action irréversible demande un accord.';

-- ── 2. L'accord permanent, borné à une capacité et à une durée ───────────────

-- La table est vide dans tous les environnements (aucun code n'y écrit encore) ; le défaut
-- temporaire n'existe que pour rendre l'ajout de colonne légal, et il est retiré aussitôt.
alter table public.standing_approval
  add column capability_key text not null default '',
  add column expires_at timestamptz;

alter table public.standing_approval alter column capability_key drop default;

-- Une clé vide serait l'autorisation globale déguisée. Refusée par la base, pas par le code.
alter table public.standing_approval
  add constraint standing_approval_capacite_nommee
    check (length(trim(capability_key)) > 0);

-- Une échéance dans le passé au moment de l'octroi n'accorde rien : c'est une erreur de saisie
-- qui se lit comme un accord.
alter table public.standing_approval
  add constraint standing_approval_echeance_utile
    check (expires_at is null or expires_at > granted_at);

alter table public.standing_approval
  drop constraint standing_approval_employee_id_effect_class_key;

-- Un accord par employé ET par capacité. Deux capacités = deux accords, révocables séparément.
alter table public.standing_approval
  add constraint standing_approval_par_capacite unique (employee_id, capability_key);

comment on column public.standing_approval.capability_key is
  'La capacité NOMMÉE que cet accord couvre. Jamais une classe entière : accorder « écrire à un '
  'prospect » n''accorde pas « supprimer des données ».';
comment on column public.standing_approval.expires_at is
  'Échéance facultative. Nul = sans échéance, ce qui doit rester un choix explicite du client.';
