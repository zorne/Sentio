-- LADY-AB — deux pièges nommés, pour qu'ils ne se referment sur personne.
--
-- Ni l'un ni l'autre n'est un défaut aujourd'hui. Les deux sont des **endroits où la prochaine
-- personne qui passera fera naturellement la mauvaise chose**, et où rien ne l'arrêterait.
--
-- Réalise : LADY-AB

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. La vue globale des variantes n'est PAS celle qu'on lit pour un client
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- `strategy_variant_resultats` agrège les résultats de **toutes** les entreprises. Elle a été
-- écrite avant qu'EVOL-04 existe, et son commentaire disait « c'est EVOL-04 » qui choisira la
-- gagnante — ce qui se lit aujourd'hui comme une invitation à s'en servir pour décider.
--
-- Or décider POUR UN CLIENT à partir de cette vue ferait exactement ce que l'invariant LADY-V
-- interdit : faire converger tous les employés vers ce qui plaît au client médian, et laisser
-- fuiter par la bande ce qui marche chez un concurrent. La fonction à lire est
-- `resultats_par_variante(entreprise)`.

comment on view public.strategy_variant_resultats is
  '⚠️ VUE GLOBALE, POUR L''EXPLOITATION SEULEMENT — elle agrège TOUTES les entreprises. Ne jamais '
  's''en servir pour décider quoi que ce soit pour UN client : ce serait faire converger tous les '
  'employés vers ce qui plaît au client médian, et faire fuiter ce qui marche chez un concurrent '
  '(invariant LADY-V). Pour un client : resultats_par_variante(tenant).';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. La couche sectorielle est VIDE, et ce n'est pas une panne
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- `sector_profile` ne contient aucune ligne, et aucune migration n'en sème : le savoir sectoriel
-- est du CONTENU, rédigé par Sentio, publié par `publier_profil_sectoriel()`. Tant qu'il n'y en a
-- pas, l'assemblage du contexte déclare simplement la couche « secteur » absente — ce qui est le
-- comportement voulu (`docs/adr/0011` : on n'invente jamais un secteur, et on ne remplace jamais
-- une couche manquante par du générique).
--
-- ⚠️ Le piège est là : quelqu'un qui découvre une couche systématiquement absente peut croire à
-- un branchement oublié et « réparer » en injectant du générique. Ce serait faire dire à un
-- employé qu'il connaît un métier qu'il ne connaît pas — devant le client de ce métier.

comment on table public.sector_profile is
  'Le savoir SECTORIEL, rédigé par Sentio et publié par publier_profil_sectoriel(). ⚠️ Table vide '
  'tant qu''aucun profil n''est publié, et c''est normal : la couche « secteur » se déclare alors '
  'absente. Ne JAMAIS la remplacer par du générique — ce serait faire dire à un employé qu''il '
  'connaît un métier qu''il ne connaît pas, devant le client de ce métier (adr/0011).';
