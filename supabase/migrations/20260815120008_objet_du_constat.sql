-- LADY-I — un constat porte son OBJET, pas seulement son domaine.
--
-- ══ POURQUOI ══
--
-- `20260815120005` typait les constats par domaine. C'était insuffisant, et l'étape 8 l'a montré :
-- « les relances ne suivent pas » n'a pas le même sens selon qu'il s'agit de **prospects** ou de
-- **factures impayées**, et ce ne sont pas les mêmes actes qui y répondent.
--
-- Sans l'objet, le moteur de composition recollait ce que `20260815120001` avait séparé : il
-- savait qu'un acte s'applique à un objet, mais il raisonnait encore en domaines seuls. Un besoin
-- sur `communication_sortante × facture` aurait donc été servi par les actes du prospect.
--
-- ⚠️ C'est aussi ce qui rend le refus honnête **exact**. La bibliothèque sait relancer, et elle
-- ne sait pas relancer une facture. Sans l'objet, elle aurait répondu « oui » à la mauvaise
-- question.
--
-- Réalise : LADY-I

alter table public.audit_finding add column objet text;

-- Les constats déjà posés portent tous sur le prospect : c'est le seul objet que la bibliothèque
-- servait quand ils ont été écrits. On l'inscrit plutôt que de le laisser deviner.
update public.audit_finding set objet = 'prospect' where objet is null;

alter table public.audit_finding alter column objet set not null;

-- Fermé, comme les autres axes. Un objet inventé introduirait un besoin que rien ne peut servir
-- et que personne n'aurait décidé de nommer.
alter table public.audit_finding
  add constraint audit_finding_objet_connu
    check (objet in ('prospect', 'demande', 'facture', 'candidature', 'document'));

-- L'unicité porte désormais sur le couple : le même libellé sur deux objets décrit deux choses.
alter table public.audit_finding drop constraint audit_finding_unique;
alter table public.audit_finding
  add constraint audit_finding_unique unique (diagnostic_session_id, genre, domaine, objet, libelle);

drop index if exists public.audit_finding_session_idx;
create index audit_finding_session_idx
  on public.audit_finding (diagnostic_session_id, domaine, objet);

comment on column public.audit_finding.objet is
  'Sur QUOI porte le constat. C''est ici que vit la spécificité métier, jamais dans le domaine : '
  'relancer un prospect et relancer une facture sont deux besoins distincts.';
