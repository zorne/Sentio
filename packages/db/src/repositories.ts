import type {
  Approval,
  Capability,
  CompanyProfileEntry,
  Employee,
  EmployeeDefinition,
  LearnedFact,
  Notification,
  Objective,
  Outcome,
  Plan,
  SectorProfile,
  StrategyChange,
  Subscription,
  Task,
} from "@sentio/domain";

import type { SqlClient } from "./client.js";
import { ExecutionJournal } from "./journal.js";
import { GlobalReadRepository, TenantScopedRepository } from "./repository.js";
import type { TenantScope } from "./tenant-scope.js";

/**
 * FOND-32 — les repositories par table.
 *
 * Le regroupement en deux ensembles n'est pas cosmétique : il rend la frontière visible. Ce qui
 * porte une donnée client est derrière `forTenant()` et ne s'obtient qu'avec une portée ; ce qui
 * est global est ailleurs, en lecture seule. On ne peut pas se tromper d'ensemble sans que le
 * type le refuse (`docs/adr/0013`).
 */

/** Tables globales : aucune donnée client, aucune portée, lecture seule. */
export interface GlobalRepositories {
  readonly plan: GlobalReadRepository<Plan>;
  readonly capability: GlobalReadRepository<Capability>;
  /** L'ADN. Immuable — publier une version, jamais modifier (`docs/04-contextes-memoire.md`). */
  readonly employeeDefinition: GlobalReadRepository<EmployeeDefinition>;
  /** Rédigés par Sentio, jamais dérivés des données d'un client (`docs/adr/0011`). */
  readonly sectorProfile: GlobalReadRepository<SectorProfile>;
}

export function globalRepositories(sql: SqlClient): GlobalRepositories {
  return {
    plan: new GlobalReadRepository<Plan>(sql, "plan"),
    capability: new GlobalReadRepository<Capability>(sql, "capability"),
    employeeDefinition: new GlobalReadRepository<EmployeeDefinition>(sql, "employee_definition"),
    sectorProfile: new GlobalReadRepository<SectorProfile>(sql, "sector_profile"),
  };
}

/** Tables portant une donnée client. Chacune est liée à une entreprise et à une seule. */
export interface TenantRepositories {
  readonly subscription: TenantScopedRepository<Subscription>;
  readonly employee: TenantScopedRepository<Employee>;
  readonly objective: TenantScopedRepository<Objective>;
  readonly task: TenantScopedRepository<Task>;
  readonly approval: TenantScopedRepository<Approval>;
  readonly outcome: TenantScopedRepository<Outcome>;
  readonly notification: TenantScopedRepository<Notification>;
  readonly strategyChange: TenantScopedRepository<StrategyChange>;
  /** Contexte Entreprise, couche 2 — modifiable par le client et par l'apprentissage. */
  readonly companyProfile: TenantScopedRepository<CompanyProfileEntry>;
  readonly learnedFact: TenantScopedRepository<LearnedFact>;
  /** Le journal : ajout et lecture seulement. */
  readonly journal: ExecutionJournal;
}

/**
 * Le point d'entrée unique aux données d'une entreprise.
 *
 * ⚠️ Il n'existe volontairement **aucune** fonction équivalente sans portée. Obtenir un
 * repository de table client passe forcément par ici, donc par un `TenantScope`.
 *
 * `employee_definition` n'y figure pas : l'ADN est global et immuable. Aucun chemin ne mène de
 * l'apprentissage vers lui — c'est le verrou d'écriture, et son absence de cette liste en fait
 * partie (`docs/04-contextes-memoire.md`).
 */
export function forTenant(sql: SqlClient, scope: TenantScope): TenantRepositories {
  const scoped = <Row>(table: string) => new TenantScopedRepository<Row>(sql, table, scope);

  return {
    subscription: scoped<Subscription>("subscription"),
    employee: scoped<Employee>("employee"),
    objective: scoped<Objective>("objective"),
    task: scoped<Task>("task"),
    approval: scoped<Approval>("approval"),
    outcome: scoped<Outcome>("outcome"),
    notification: scoped<Notification>("notification"),
    strategyChange: scoped<StrategyChange>("strategy_change"),
    companyProfile: scoped<CompanyProfileEntry>("company_profile"),
    learnedFact: scoped<LearnedFact>("learned_fact"),
    journal: new ExecutionJournal(sql, scope),
  };
}
