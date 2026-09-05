-- Une capacité déclare si elle peut RÉELLEMENT s'exécuter.
--
-- ══ LE CONSTAT P0-3 DE `docs/35` ══
--
-- Cinq capacités sont déclarées, composables dans une configuration, et **présentées au client**.
-- Deux seulement ont un moteur monté :
--
--   · `qualifier.prospect`     — moteur interne, effet en base            ✅
--   · `mettre_a_jour.prospect` — moteur interne, effet en base            ✅
--   · `envoyer.prospect`       — moteur NON monté, délibérément           ❌
--   · `relancer.prospect`      — moteur NON monté, délibérément           ❌
--   · `rechercher.prospect`    — ni attelage ni moteur : jamais écrite    ❌
--
-- Le refus du runtime est excellent et documenté (`composition.ts`) : un moteur qui écrit à une
-- vraie entreprise ne se monte pas par défaut. **Ce n'est pas la décision qui est fautive, c'est
-- l'interface qui ne la reflète pas.** Le dirigeant lit « Écrire à un prospect » dans les capacités
-- de son employée, et le runtime répondra `CapabilityUnavailable`.
--
-- ⚠️ POURQUOI EN BASE ET NON DANS LE CODE DE L'INTERFACE.
--
-- L'interface, le diagnostic et le runtime posent tous les trois la question « cette capacité
-- est-elle utilisable ? ». Trois réponses écrites à trois endroits divergent au premier moteur
-- monté — et la divergence est SILENCIEUSE : elle se voit le jour où un client s'étonne. La
-- réponse est donc une donnée, lue par les trois.
--
-- ⚠️ ET UN TEST INTERDIT LA DIVERGENCE. `composition.integration.test.ts` compare cette colonne
-- aux moteurs réellement montés dans le code. Monter un moteur sans le déclarer ici — ou
-- l'inverse — fait échouer `pnpm run verify`. Sans cette garde, cette colonne deviendrait à son
-- tour un commentaire qui ment.

alter table public.capability
  add column disponible boolean not null default false;

comment on column public.capability.disponible is
  'Cette capacité a-t-elle un moteur monté qui l''exécute vraiment ? Faux = le runtime la '
  'refusera (CapabilityUnavailable), donc ni l''espace client ni le diagnostic ne doivent la '
  'présenter comme acquise. Tenu synchrone avec le code par un test d''intégration.';

-- ⚠️ PAR CLÉ, ET NON PAR IDENTIFIANT. Les identifiants sont engendrés au hasard à l'installation :
-- les nommer ici marcherait sur cette base et sur aucune autre.
update public.capability set disponible = true
 where key in ('qualifier.prospect', 'mettre_a_jour.prospect');

do $$
declare
  n integer;
begin
  select count(*) into n from public.capability where disponible;
  if n <> 2 then
    raise exception
      'Deux capacités exactement ont un moteur monté (qualifier.prospect, mettre_a_jour.prospect) ; % trouvée(s). Si un moteur a été monté depuis, mets à jour CETTE migration et le test qui la garde.', n;
  end if;
  raise notice 'OK  la base sait lesquelles des % capacités s''exécutent vraiment.',
    (select count(*) from public.capability);
end;
$$;
