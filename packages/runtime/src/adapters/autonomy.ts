/**
 * EXEC-05 — d'où vient le niveau d'autonomie d'un employé.
 *
 * ⚠️ **D'ici, et de nulle part ailleurs.** C'est un réglage du CLIENT
 * (`docs/05-runtime-employe.md`), lu dans sa configuration, à chaque pas. Il ne se déduit pas de
 * ce qu'un modèle a répondu, ne se transmet pas dans une proposition d'action, et ne se déclare
 * pas au bord.
 *
 * Pourquoi c'est un adaptateur et pas un paramètre : tant que le niveau arrivait « par
 * l'appelant », rien ne disait d'où l'appelant le tenait. Une valeur qui remonte du bord peut
 * remonter de ce que le bord a lu — y compris d'une réponse de modèle. Le faire venir de la base
 * supprime la question au lieu d'y répondre.
 *
 * Relu à chaque pas, jamais mis en cache : un client qui abaisse l'autonomie de son employé doit
 * être obéi au pas suivant, pas au prochain redémarrage.
 */

import type { AutonomyLevel } from "@sentio/core";
import { TenantScope, forTenant, type SqlClient } from "@sentio/db";
import type { EmployeeId, TenantId } from "@sentio/domain";

const NIVEAUX: ReadonlySet<string> = new Set(["auto", "notify", "confirm", "confirm_once"]);

/**
 * Le niveau appliqué quand la configuration est illisible ou absente.
 *
 * `confirm` — chaque action irréversible demande un accord. Ce n'est pas une valeur neutre, c'est
 * la plus prudente : une valeur permissive ferait d'une panne de lecture une autorisation, et
 * personne ne s'en apercevrait avant le premier message parti tout seul.
 */
export const AUTONOMIE_PRUDENTE: AutonomyLevel = "confirm";

export class PostgresAutonomyResolver {
  constructor(private readonly sql: SqlClient) {}

  /**
   * L'autonomie de CET employé, dans CETTE entreprise.
   *
   * La lecture passe par `forTenant` : un employé d'une autre entreprise est introuvable, et son
   * réglage — plus permissif, peut-être — ne peut donc pas être appliqué ici par accident.
   */
  async resolve(tenantId: TenantId, employeeId: EmployeeId): Promise<AutonomyLevel> {
    const repos = forTenant(this.sql, TenantScope.of(tenantId));
    const employe = (await repos.employee.findById(employeeId)) as { autonomy?: unknown } | null;

    if (employe === null) return AUTONOMIE_PRUDENTE;

    const niveau = employe.autonomy;
    // Une valeur inconnue n'est pas interprétée « au mieux » : elle retombe sur le plus prudent.
    // La base porte déjà une contrainte ; ce garde couvre le jour où elle serait desserrée.
    return typeof niveau === "string" && NIVEAUX.has(niveau)
      ? (niveau as AutonomyLevel)
      : AUTONOMIE_PRUDENTE;
  }
}
