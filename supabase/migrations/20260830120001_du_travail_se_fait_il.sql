-- Le compteur — « du travail se fait-il ? », et à qui le dire quand la réponse est non.
--
-- ══ CE QUI A RENDU CE COMPTEUR NÉCESSAIRE ══
--
-- Le battement rendait `{traites:10, echoues:0}` avec dix missions REPORTÉES. Un rapport
-- rassurant et faux, et c'était le comportement nominal de la production. Si le cron avait été
-- armé, ce rapport serait parti 144 fois par jour pendant que rien ne se faisait.
--
-- L'étape précédente a fermé le rapport ; celle-ci ferme le silence. Deux surveillances, jamais
-- fusionnées :
--
--   · le **guetteur** répond « le battement tourne-t-il ? » — c'est le planificateur ;
--   · le **compteur** répond « du travail se fait-il ? » — c'est ce qui suit.
--
-- ══ LE MODÈLE : `garde_du_silence` (20260815120031) ══
--
-- Même forme, et pour les mêmes raisons : un seuil EN BASE et par entreprise, un état qui évite
-- de prévenir deux fois d'une même série, une remise à zéro dès que quelque chose aboutit.
--
-- ⚠️ **UNE DIFFÉRENCE, ÉCRITE POUR QU'ON NE LA DEVINE PAS.** Là-bas, `passe_outre_le` est posé
-- par le DIRIGEANT : il a vu l'alerte, il demande de continuer malgré tout, et la garde cesse de
-- bloquer les envois. Ici, rien n'est bloqué — la mission est déjà arrêtée, et aucun geste du
-- dirigeant ne la fait repartir sans que la cause disparaisse. Le seul risque est de nous
-- répéter. La colonne s'appelle donc `prevenu_le` et ne dit que ça : c'est déjà dit.
--
-- ══ POURQUOI LE COMPTEUR EST PAR EMPLOYÉ, ET PAS PAR BATTEMENT ══
--
-- Dix entreprises qui travaillent et une onzième totalement bloquée rendent des compteurs de
-- battement rassurants. La question « du travail se fait-il ? » n'a de sens que rapportée à
-- quelqu'un — et le destinataire d'une alerte est toujours un dirigeant, jamais « la flotte ».

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Le seuil, en données
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- En base et non en dur, comme la garde du silence : le jour où l'on constate qu'il est trop bas
-- ou trop haut, on le change sans redéploiement — et on peut le desserrer pour une entreprise
-- dont on sait le rythme lent.
--
-- ⚠️ **LE PLAFOND DE DIX N'EST PAS DÉCORATIF, C'EST UN VERROU.** Le motif d'un arrêt ne vit que
-- dans le journal d'exécution, purgé à 30 JOURS (`reprise.ts` le documente) : passé ce délai, la
-- mission perd son motif et n'est PLUS JAMAIS reprise, son prospect perdu avec elle. Un seuil
-- desserré au-delà d'une dizaine de jours ferait donc partir l'alerte trop tard pour servir. La
-- contrainte le rend impossible plutôt que de compter sur quelqu'un pour y penser — un garde-fou
-- tenu par la mémoire est un garde-fou déjà perdu (`adr/0024`).

create table public.garde_du_travail (
  tenant_id       uuid primary key references public.tenant (id) on delete cascade,
  cycles_toleres  integer not null default 3 check (cycles_toleres between 1 and 10)
);

alter table public.garde_du_travail enable row level security;

create policy garde_du_travail_select on public.garde_du_travail
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

grant select on public.garde_du_travail to authenticated;

create trigger garde_du_travail_tenant_locked
  before update on public.garde_du_travail
  for each row execute function public.reject_tenant_change();

comment on table public.garde_du_travail is
  'Après combien de journées de travail SANS RIEN QUI ABOUTISSE le dirigeant est prévenu. Le '
  'seuil reste très en deçà de la purge du journal (30 jours) : au-delà, le motif de l''arrêt '
  'aurait disparu avant l''alerte, et la mission ne serait plus jamais reprise.';

-- ⚠️ Le défaut vit ICI et nulle part ailleurs. Recopié dans un `coalesce` côté TypeScript, il
-- divergerait le jour où on le change — et c'est la copie, jamais relue, qui déciderait alors
-- quand on alerte.
create function public.cycles_muets_toleres(p_tenant uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select g.cycles_toleres from public.garde_du_travail g where g.tenant_id = p_tenant),
    3);
$$;

revoke execute on function public.cycles_muets_toleres(uuid) from public, authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Le compteur
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ **IL COMPTE DES JOURS, PAS DES CYCLES.** Le battement passe toutes les dix minutes : compter
-- les passages ferait franchir un seuil de trois en une demi-heure, sur une panne de fournisseur
-- qui se résout seule avant midi. `dernier_jour` est le verrou qui rend muets les cycles suivants
-- de la même journée — c'est la même raison qui fait qu'un lot d'approvisionnement est journalier.
--
-- ⚠️ La clé étrangère porte l'entreprise (`(tenant_id, employee_id)`), invariant 2 d'`AGENTS.md` :
-- un lien ne traverse jamais une entreprise, quel que soit le code qui l'écrit.

create table public.travail_muet (
  tenant_id      uuid not null references public.tenant (id) on delete cascade,
  employee_id    uuid not null,
  -- Le nombre de JOURNÉES consécutives où du travail était dû et où rien n'a abouti.
  cycles         integer not null default 0 check (cycles >= 0),
  -- Le jour de la dernière incrémentation. Un deuxième battement du même jour ne compte pas.
  dernier_jour   date    not null,
  depuis         timestamptz not null default now(),
  -- Ce qui bloquait au dernier passage. Jamais de donnée du client : un motif et une cause, tous
  -- deux issus d'une liste fermée du code.
  dernier_motif  text,
  derniere_cause text,
  -- Le dirigeant a été prévenu de CETTE série. On ne le prévient pas deux fois : une alerte qui
  -- se répète devient un bruit, et il finit par ne plus la lire.
  prevenu_le     timestamptz,
  primary key (tenant_id, employee_id),
  constraint travail_muet_employee_fkey
    foreign key (tenant_id, employee_id) references public.employee (tenant_id, id) on delete cascade
);

alter table public.travail_muet enable row level security;

-- Aucune politique, aucun droit : c'est de la mécanique de surveillance, comme la file et le lot
-- du jour. Le dirigeant ne lit pas un compteur, il reçoit une notification.

-- Une ligne ne change jamais d'entreprise (invariant 2), y compris une ligne de mécanique : un
-- compteur qui changerait de main attribuerait le silence d'une entreprise à une autre.
create trigger travail_muet_tenant_locked
  before update on public.travail_muet
  for each row execute function public.reject_tenant_change();

comment on table public.travail_muet is
  'Depuis combien de journées le travail d''une employée n''aboutit à rien. Mécanique interne : '
  'ce que le dirigeant en voit est une notification, jamais ce compteur.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Constater
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Deux gestes, et le second est le plus important : **une remise à zéro au premier cycle qui
-- aboutit**. Sans elle, une entreprise prévenue une fois resterait marquée pour toujours, et la
-- deuxième panne — la vraie — ne dirait plus rien.

-- ⚠️ **TROIS VALEURS RENDUES D'UN COUP, ET C'EST VOULU.** Le compte, le seuil de l'entreprise et
-- « l'a-t-on déjà prévenu » se lisent en une seule fois : trois allers-retours donneraient trois
-- instants différents, et l'alerte se déciderait sur un état qui n'a jamais existé ensemble.
--
-- La COMPARAISON, elle, n'est pas faite ici : `cycles >= seuil` est une décision, et les décisions
-- de ce lot vivent en TypeScript, avec leurs tests (`travail-muet.ts`). La base rend des faits.
create function public.constater_un_cycle_muet(
  p_tenant   uuid,
  p_employee uuid,
  p_jour     date,
  p_motif    text,
  p_cause    text
)
-- ⚠️ Les colonnes rendues ne portent PAS les noms des colonnes de la table (`compte`, et non
-- `cycles`) : dans une fonction SQL, un nom de sortie identique à un nom de colonne rend la
-- clause `returning` ambiguë, et l'erreur ne se voit qu'à l'exécution.
returns table (compte integer, seuil integer, deja_prevenu boolean)
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.travail_muet
    (tenant_id, employee_id, cycles, dernier_jour, dernier_motif, derniere_cause)
  values (p_tenant, p_employee, 1, p_jour, p_motif, p_cause)
  on conflict (tenant_id, employee_id) do update
    -- ⚠️ Le `case` est le verrou du jour : un deuxième battement de la même journée met à jour le
    -- motif — l'information la plus fraîche est la plus utile — sans faire avancer le compte.
    set cycles         = case when public.travail_muet.dernier_jour < excluded.dernier_jour
                              then public.travail_muet.cycles + 1
                              else public.travail_muet.cycles end,
        dernier_jour   = greatest(public.travail_muet.dernier_jour, excluded.dernier_jour),
        dernier_motif  = excluded.dernier_motif,
        derniere_cause = excluded.derniere_cause
  returning cycles, public.cycles_muets_toleres(p_tenant), prevenu_le is not null;
$$;

revoke execute on function public.constater_un_cycle_muet(uuid, uuid, date, text, text)
  from public, authenticated, anon;

comment on function public.constater_un_cycle_muet(uuid, uuid, date, text, text) is
  'Une journée de plus sans que rien n''aboutisse. Compte des JOURS et non des battements : le '
  'battement passe toutes les dix minutes, et compter les passages franchirait un seuil de trois '
  'en une demi-heure.';

-- La remise à zéro efface la ligne — donc aussi `prevenu_le`. Un travail qui aboutit referme la
-- série entière : la prochaine alerte sera une nouvelle histoire, et elle sera dite.
create function public.constater_un_cycle_abouti(p_tenant uuid, p_employee uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  refermees integer;
begin
  delete from public.travail_muet
   where tenant_id = p_tenant and employee_id = p_employee;
  get diagnostics refermees = row_count;
  -- Rend vrai quand une série s'est réellement refermée : c'est un fait à rapporter, pas le cas
  -- ordinaire d'une employée qui travaille et n'a jamais rien eu à taire.
  return refermees > 0;
end;
$$;

revoke execute on function public.constater_un_cycle_abouti(uuid, uuid)
  from public, authenticated, anon;

create function public.marquer_le_dirigeant_prevenu(p_tenant uuid, p_employee uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.travail_muet
     set prevenu_le = now()
   where tenant_id = p_tenant and employee_id = p_employee;
$$;

revoke execute on function public.marquer_le_dirigeant_prevenu(uuid, uuid)
  from public, authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Ce que le dirigeant a le DROIT d'activer
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ══ POURQUOI CETTE LECTURE EXISTE, ET POURQUOI ELLE EST ICI ══
--
-- Formuler « il vous manque tel outil, activez-le » exige de savoir ce qu'il peut activer. Deux
-- bornes, et ce sont exactement celles que `capacite_dans_le_perimetre` impose à l'écriture
-- (`20260815120004`) — lues ici plutôt que devinées, pour qu'on ne puisse pas proposer d'activer
-- ce que la base refusera :
--
--   1. **le noyau** — `employee_definition.capacites` : ce que cette Lady peut concevoir de faire ;
--   2. **la formule** — `capability_binding` : ce qu'un moteur sert pour son abonnement.
--
-- Moins ce qui est DÉJÀ activé : proposer d'activer une capacité active serait envoyer le
-- dirigeant appuyer sur un bouton déjà enfoncé, et lui apprendre que le canal se trompe.
--
-- ⚠️ **UNE FOIS, AU MOMENT DE LA NOTIFICATION — JAMAIS À CHAQUE PAS.** Deux lectures par pas
-- n'apprendraient rien tant que rien n'est envoyé : le pas sait déjà qu'il est bloqué, et il
-- s'arrête. C'est seulement quand on ouvre la bouche qu'il faut savoir quoi dire.
--
-- ⚠️ **CETTE FONCTION NE SAIT PAS À QUEL SUJET LA CAPACITÉ S'APPLIQUE**, et c'est délibéré. La
-- correspondance « quelle capacité pour quelle nature de sujet » est déclarée UNE FOIS, dans le
-- domaine (`SUJET_EXIGE_PAR_CAPACITE`). La recopier en SQL en ferait une deuxième vérité, et le
-- jour où elles divergeraient, on annoncerait un outil qui ne servirait à rien.

create function public.capacites_activables(p_tenant uuid, p_employee uuid)
returns table (cle text, nom text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.key, c.name
    from public.capability c
   where exists (
           select 1
             from public.employee e
             join public.employee_definition d on d.id = e.employee_definition_id
            where e.tenant_id = p_tenant and e.id = p_employee
              and d.capacites ? c.key)
     and exists (
           select 1
             from public.capability_binding b
             join public.subscription s on s.plan_id = b.plan_id
            where b.capability_id = c.id
              and s.tenant_id = p_tenant
              and s.status = 'active')
     and not exists (
           select 1
             from public.employee_capability ec
            where ec.tenant_id = p_tenant
              and ec.employee_id = p_employee
              and ec.capability_id = c.id
              and ec.enabled)
   order by c.key;
$$;

revoke execute on function public.capacites_activables(uuid, uuid) from public, authenticated, anon;

comment on function public.capacites_activables(uuid, uuid) is
  'Ce que le dirigeant a le DROIT d''activer et n''a pas activé : dans le noyau de son employée, '
  'servi par un moteur pour sa formule. Les deux mêmes bornes que capacite_dans_le_perimetre, '
  'lues au lieu d''être devinées.';
