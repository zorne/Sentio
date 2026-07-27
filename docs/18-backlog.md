# 18 — Backlog : les tâches axiomes de la V1

> À lire si tu travailles sur : n'importe quoi. C'est la liste d'exécution qui découle de
> toute la documentation précédente ([`12-roadmap.md`](12-roadmap.md) donne les lots,
> ce fichier donne les tâches à l'intérieur de chaque lot).

Fichier source : [`backlog-v1.csv`](backlog-v1.csv) — 163 tâches, colonnes `ID ; Nom de la
tâche ; Catégorie ; Temps de réalisation (IA) ; Priorité`.

---

## Ce qu'est une « tâche axiome »

Une tâche qui ne se découpe plus utilement en sous-tâches intermédiaires pour une IA qui
l'implémente : un fichier, une fonction, une migration, un composant. Descendre plus bas
fragmenterait un fichier unique sans produire d'étape d'implémentation réellement distincte.

**Exemple :** la boucle d'exécution d'un run ([`05-runtime-employe.md`](05-runtime-employe.md))
n'est pas une seule tâche « implémenter le runtime », mais huit tâches `EXEC-02` à `EXEC-08` —
charger l'état, assembler le contexte, appeler le Gateway, soumettre à la politique, exécuter,
journaliser, replanifier.

---

## Répartition

| Catégorie | Tâches | Lot | Doc de référence |
|---|---|---|---|
| Fondations | 37 | Lot 0 | [`03-modele-de-donnees.md`](03-modele-de-donnees.md) |
| Noyau | 22 | Lot 1 | [`05-runtime-employe.md`](05-runtime-employe.md) |
| Métier Commercial | 15 | Lot 2 | [`04-contextes-memoire.md`](04-contextes-memoire.md), [`adr/0008`](adr/0008-perimetre-v1-commercial-seul.md) |
| Exécution autonome | 15 | Lot 3 | [`05-runtime-employe.md`](05-runtime-employe.md) |
| Acquisition | 20 | Lot 4 | [`07-parcours-produit.md`](07-parcours-produit.md) |
| Recrutement & Paiement | 10 | Lot 5 | [`07-parcours-produit.md`](07-parcours-produit.md) |
| Dashboard | 17 | Lot 6 | [`09-metriques-roi.md`](09-metriques-roi.md) |
| Évolution | 8 | Lot 7 | [`08-evolution-apprentissage.md`](08-evolution-apprentissage.md) |
| Conformité & Lancement | 10 | Lot 8 | [`10-securite-rgpd.md`](10-securite-rgpd.md), [`11-exploitation.md`](11-exploitation.md) |
| Vérification (transverse) | 9 | — | [`13-verification.md`](13-verification.md), une tâche par critère d'acceptation |

**Priorité :** P0 = 127 tâches (chemin critique de la V1, rien après ne peut sauter ça),
P1 = 31 (nécessaire avant le lancement mais pas bloquant en interne), P2 = 5 (améliore
l'expérience, peut glisser après le premier client).

---

## Comment l'utiliser

- L'ordre à l'intérieur d'une catégorie suit globalement les dépendances (une migration avant
  le repository qui l'utilise, un contrat de capacité avant son moteur).
- Ne jamais commencer une tâche `EXEC-*`, `ACQUIS-*` ou `RECRUT-*` avant que les tâches `FOND-*`
  et `NOYAU-*` dont elle dépend soient terminées — voir [`12-roadmap.md`](12-roadmap.md) pour
  l'ordonnancement des lots.
- Les tâches `TEST-*` correspondent une à une aux critères de
  [`13-verification.md`](13-verification.md) : une tâche `TEST-*` sans son critère qui passe
  n'est pas terminée.
- Ce backlog n'est pas figé : une décision encore ouverte
  ([`15-decisions-ouvertes.md`](15-decisions-ouvertes.md)) peut en faire apparaître de
  nouvelles ou en invalider — mettre à jour le CSV dans le même commit que la décision tranchée.
