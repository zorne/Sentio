/**
 * Le catalogue des capacités, lu en base à chaque battement.
 *
 * ⚠️ **Relu, jamais mis en cache au démarrage.** C'est la même règle que l'autonomie et les
 * capacités activées (`next-step.ts`) : un contrat corrigé, une capacité retirée, doivent prendre
 * effet au battement suivant — pas au prochain redéploiement. Un catalogue figé au démarrage
 * ferait travailler un employé sur des règles que plus personne n'a sous les yeux.
 *
 * La **classe d'effet** vient du contrat, et de lui seul : c'est elle que lit le Policy Engine.
 * Un moteur qui la porterait pourrait se déclarer inoffensif pour échapper à la validation
 * (`adr/0006`).
 *
 * Réalise : EXEC-18
 */

import { CapabilityRegistry, type CapabilityEngine, type EffectClass } from "@sentio/core";
import type { SqlClient } from "@sentio/db";

const CLASSES: ReadonlySet<string> = new Set<EffectClass>([
  "read",
  "internal_write",
  "external_irreversible",
]);

/**
 * Construit le registre du battement : les contrats depuis la base, les moteurs depuis le code.
 *
 * Une capacité dont la classe d'effet est absente ou inconnue est **écartée**, pas rangée dans
 * une classe par défaut : le seul défaut concevable serait `external_irreversible`, et il ferait
 * suspendre des lectures inoffensives ; n'importe quel autre laisserait passer un envoi réel sans
 * accord. Écarter est le seul choix qui ne se paie pas.
 */
export async function chargerLeRegistre(
  sql: SqlClient,
  moteurs: readonly CapabilityEngine[],
): Promise<{ registre: CapabilityRegistry; ecartees: readonly string[] }> {
  const lignes = await sql.query<{ key: string; effect_class: string | null; description: string | null }>(
    `select key,
            contract->>'effect_class' as effect_class,
            contract->>'description'  as description
       from capability
      order by key`,
    [],
  );

  const registre = new CapabilityRegistry();
  const ecartees: string[] = [];

  for (const ligne of lignes) {
    if (ligne.effect_class === null || !CLASSES.has(ligne.effect_class)) {
      ecartees.push(ligne.key);
      continue;
    }
    registre.registerContract({
      key: ligne.key,
      effectClass: ligne.effect_class as EffectClass,
      description: ligne.description ?? ligne.key,
    });
  }

  // Un moteur dont le contrat n'a pas été chargé est refusé par le registre lui-même — le
  // contrat vient toujours avant le moteur. On laisse lever : un moteur livré pour une capacité
  // absente est une erreur de déploiement, pas un cas à absorber.
  for (const moteur of moteurs) registre.registerEngine(moteur);

  return { registre, ecartees };
}
