-- LADY-Q — une ligne peut perdre son entreprise, mais seulement quand l'entreprise n'est plus là.
--
-- ══ LE DÉFAUT, TROUVÉ PAR LA RÉPÉTITION GÉNÉRALE ══
--
-- `20260815120010` a séparé deux gestes que le verrou confondait : acquérir une entreprise
-- (permis) et en changer (interdit). Il en restait un troisième, traité comme le second à tort :
-- **la perdre**.
--
-- `diagnostic_session.tenant_id` est déclarée `on delete set null` depuis `20260729120026` — c'est
-- délibéré : la session d'un visiteur survit à la disparition de l'entreprise qu'elle a fait
-- naître. Mais le verrou refusait `X → NULL`, donc **supprimer une entreprise devenait
-- impossible** dès qu'un diagnostic lui était rattaché — c'est-à-dire dès qu'elle avait été
-- recrutée par le chemin normal.
--
-- La clé étrangère et le verrou se contredisaient. La clé est plus ancienne, et elle a raison.
--
-- ══ LA DISTINCTION QUI MANQUAIT ══
--
--   · `X → NULL` **alors que l'entreprise existe encore** — c'est une évasion : la ligne
--     échapperait à toute portée tout en restant lisible. Interdit.
--   · `X → NULL` **alors que l'entreprise a disparu** — c'est une cascade. Il n'y a plus rien à
--     quoi appartenir, et rien ne traverse : il n'y a pas d'autre côté.
--
-- Aucun invariant ne l'avait vu, et pour une raison instructive : les suites qui suppriment une
-- entreprise n'en avaient jamais rattaché de diagnostic. Le parcours complet, lui, en rattache un.
--
-- Réalise : LADY-Q

create or replace function public.reject_tenant_change()
returns trigger
language plpgsql
as $$
begin
  -- Une ligne orpheline qui trouve son entreprise : rien ne traverse, rien ne fuit.
  if old.tenant_id is null and new.tenant_id is not null then
    return new;
  end if;

  -- Une ligne qui perd son entreprise PARCE QU'ELLE A DISPARU : c'est une cascade, pas une
  -- évasion. Tant que l'entreprise existe, s'en détacher reste interdit.
  if old.tenant_id is not null and new.tenant_id is null
     and not exists (select 1 from public.tenant t where t.id = old.tenant_id) then
    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id then
    raise exception
      'Une ligne ne change jamais d''entreprise (%.% : % → %).',
      tg_table_schema, tg_table_name, old.tenant_id, new.tenant_id;
  end if;

  return new;
end;
$$;
