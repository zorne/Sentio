# 13 — Vérification : critères d'acceptation

> À lire si tu travailles sur : les tests, une revue, ou avant d'annoncer qu'un lot est fini.

Chaque critère est **testable**. Un lot n'est pas terminé tant que ses critères ne passent pas.

---

## Isolation entre entreprises *(lot 0)*

Depuis la session de l'entreprise A, aucune donnée de l'entreprise B n'est accessible :
- ni par l'interface,
- ni par un appel direct au serveur,
- ni par un identifiant deviné dans une adresse,
- ni par un abonnement temps réel.

**Comment le tester :** créer deux entreprises, tenter chaque accès depuis la mauvaise session.
À automatiser — c'est le test qui doit tourner à chaque modification du schéma.
**Automatisé** dans [`supabase/tests/invariants.sql`](../supabase/tests/invariants.sql).

### Et sous les deux formes d'entreprise, pas seulement une

Un test qui ne connaît que des entreprises à un membre ne voit qu'une moitié du produit. Les deux
parcours suivants sont joués avec le rôle `authenticated`, par le chemin de l'interface :

| Forme | Ce qu'elle éprouve, et qu'aucune autre ne montre |
|---|---|
| **Individuel** — un dirigeant seul | tout ce qu'un membre unique doit pouvoir faire (objectif, vente déclarée, mémoire, validation humaine) **et** tout ce qu'il ne doit pas : écrire chez autrui, supprimer, signer « sentio » un résultat, réécrire un fait appris |
| **Groupe** — plusieurs membres, dont un consultant présent chez deux clients | la donnée appartient à l'**entreprise**, pas au membre qui l'a créée ; le retrait d'un membre coupe l'accès immédiatement sans rien lui emporter ; et la double appartenance ne permet pas de faire passer une ligne d'un client à l'autre |

### Trois garanties que le filtrage des lectures ne donne pas

Découvertes en jouant ces parcours, et fermées par les migrations `0033`, `0034` et `0035` :

1. **Une clé étrangère ne relie jamais deux entreprises.** Sans `tenant_id` dans la clé, une vente
   pouvait être rattachée à la tâche d'un autre client, et un fait appris pointer l'employé d'un
   autre client.
2. **Une ligne ne change jamais d'entreprise.** `with check (is_tenant_member(tenant_id))` valide
   la valeur d'arrivée, jamais celle de départ : un compte membre de deux entreprises pouvait
   déplacer ses données de l'une à l'autre.
3. **La provenance d'une ligne de mémoire ne se réécrit pas** — voir
   [`04-contextes-memoire.md`](04-contextes-memoire.md).

**Comment le vérifier :** retirer la migration concernée et rejouer la suite. Chacune des trois
fait tomber un test précis, et un seul — sinon le test ne prouve pas ce qu'il prétend prouver.

---

## Verrou de métier *(lot 2)*

Le client demande explicitement à son employé commercial de faire de la comptabilité.

**Attendu :** refus, dans le vocabulaire du métier, **et trace du refus dans le journal**.
L'employé ne doit pas « essayer quand même » ni improviser une réponse comptable.

---

## Verrou d'apprentissage *(lot 7, à vérifier dès le lot 2)*

Après plusieurs dizaines de runs : `employee_definition` est **identique bit pour bit**.
Seuls `learned_fact`, `company_profile` et le journal ont changé.

**Comment le tester :** empreinte de la table avant/après une campagne de runs.

---

## Classe de données *(lot 1)*

Une requête portant des données réelles ne part **jamais** vers un fournisseur non
contractuellement « sans entraînement ».

**Comment le tester :** journal des appels de modèle — vérifier que le fournisseur de
démonstration n'apparaît sur aucune requête marquée réelle. Tester aussi le cas où le
fournisseur conforme est indisponible : le comportement attendu est **l'échec ou le report**,
jamais le repli vers un fournisseur non conforme.

---

## Idempotence *(lot 3)*

Rejouer deux fois le même pas d'un run n'envoie pas deux emails, ne crée pas deux prospects,
ne facture pas deux fois.

**Comment le tester :** interrompre un run juste après l'action et avant l'écriture d'état,
puis relancer.

---

## Reprise *(lot 3)*

Un run interrompu au milieu reprend au pas suivant après redémarrage complet du système, sans
état conservé en mémoire.

Une tâche suspendue en attente d'accord humain reprend correctement après approbation, et se
termine proprement après refus.

---

## Quotas *(lot 0 + lot 1)*

Une entreprise Start atteignant son plafond :
- voit ses tâches **reportées avec un message clair**,
- ne subit **aucune dégradation silencieuse** (pas de bascule discrète vers un modèle inférieur),
- **n'affecte aucune autre entreprise**.

---

## Honnêteté des chiffres *(lot 6)*

- Chaque chiffre du dashboard est traçable jusqu'à une ligne en base.
- Un dashboard sans activité affiche un état vide soigné, **jamais un chiffre**.
- Aucune notification « Évolution » n'est émise sans ligne `strategy_change` correspondante.

**Comment le tester :** créer une entreprise vierge, ouvrir le dashboard, chercher un seul
chiffre non justifié. Il ne doit pas y en avoir.

---

## Ouverture d'une formule *(lot 0)*

Activer Growth se fait par une **modification de données**, sans déploiement, sans
redémarrage, sans modification de code.

**Comment le tester :** basculer le drapeau, vérifier que la formule devient achetable et que
ses quotas s'appliquent.

---

## Vocabulaire *(transverse)*

Aucun texte visible par un client ne contient « IA », « bot », « agent », « assistant »,
« GPT », « automation ». **À vérifier automatiquement en intégration continue**, pas à l'œil.

---

## Non-régression du diagnostic *(lot 4)*

Un jeu de conversations de référence est rejoué à chaque modification de prompt : pour chaque
conversation, le frein détecté et le métier recommandé doivent rester conformes à l'attendu.

C'est le seul garde-fou contre une régression invisible : une modification de prompt ne casse
rien de façon détectable par un test classique.
