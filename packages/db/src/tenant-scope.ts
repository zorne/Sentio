import type { TenantId } from "@sentio/domain";

import { DataAccessError } from "./client.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La portée d'entreprise d'un accès aux données (`docs/adr/0013`).
 *
 * Elle existe comme **type** pour une raison précise : un repository de table client ne peut pas
 * être construit sans elle, donc la condition d'isolation ne peut pas être oubliée. Une chaîne
 * de caractères passée en argument optionnel n'aurait offert aucune de ces deux garanties.
 *
 * Un identifiant vide ou malformé est refusé à la construction. Sans cela, une portée vide
 * produirait une requête qui ne remonte rien : un silence, là où il faut une erreur bruyante.
 */
export class TenantScope {
  private constructor(readonly tenantId: TenantId) {}

  static of(tenantId: string): TenantScope {
    if (!UUID.test(tenantId)) {
      throw new DataAccessError(
        "Portée d'entreprise invalide : un identifiant d'entreprise est attendu. " +
          "Une portée vide ne remonterait rien au lieu d'échouer, ce qui est pire.",
      );
    }
    return new TenantScope(tenantId as TenantId);
  }
}
