-- LADY-M — un client voit le nom de SON employé, et rien du réservoir.
--
-- ══ LE MANQUE ══
--
-- `identity` naît fermée : RLS activée, **aucune politique**. C'était juste — c'est un réservoir
-- GLOBAL de plusieurs centaines de noms, dont ceux déjà attribués à d'autres entreprises. L'ouvrir
-- en lecture laisserait un client énumérer les identités de tout le monde, et déduire combien
-- d'employés Sentio a vendus.
--
-- Mais fermée à ce point, elle empêche aussi le dirigeant de voir **qui** travaille pour lui. La
-- notification de recrutement lui annonce un prénom ; sa fiche d'employé ne pouvait pas l'afficher.
--
-- ══ CE QU'ON OUVRE, ET SEULEMENT ÇA ══
--
-- Une identité est visible si — et seulement si — elle est celle d'un employé de l'entreprise du
-- demandeur. Le réservoir libre reste invisible, et les identités des autres entreprises aussi.
--
-- ⚠️ La condition passe par `employee`, qui porte l'entreprise. Elle hérite donc du même verrou
-- que tout le reste : `is_tenant_member` (`20260729120002`). Écrire ici une condition parallèle
-- créerait une seconde définition de « mon entreprise », et c'est toujours la seconde qui dérive.
--
-- Réalise : DASH-02

-- Les droits naissent fermés (`20260729120030`) : une politique sans droit ne s'applique à rien.
-- Les deux sont nécessaires, et dans cet ordre de lecture — le droit ouvre la porte, la politique
-- dit qui passe.
grant select on public.identity to authenticated;

create policy identity_select on public.identity
  for select to authenticated
  using (
    exists (
      select 1
        from public.employee e
       where e.identity_id = identity.id
         and public.is_tenant_member(e.tenant_id)
    )
  );

comment on table public.identity is
  'Le réservoir d''identités. Fermé par défaut : un client ne voit que celles de SES employés — '
  'ni le réservoir libre, ni celles des autres entreprises.';
