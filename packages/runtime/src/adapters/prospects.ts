import type { EntrepriseTrouvee, RegistreDeProspects } from "@sentio/capabilities";
/**
 * Les deux moteurs qui agissent aujourd'hui, branchés sur Postgres.
 *
 * ══ POURQUOI CEUX-LÀ, ET PAS LES AUTRES ══
 *
 * Qualifier un prospect et mettre à jour sa fiche sont des écritures **internes** : réversibles,
 * invisibles hors de l'entreprise, sans coût pour personne si elles se trompent. Écrire ou
 * relancer une entreprise ne l'est pas — ces deux-là attendent un compte d'envoi réel, un domaine
 * en UE et une clé hors dépôt (`docs/adr/0018`).
 *
 * ⚠️ Toute requête ci-dessous porte `tenant_id` dans son `where`, y compris quand l'identifiant
 * de la fiche suffirait. C'est la règle du dépôt (`20260729120033`) : une clé sans entreprise
 * finit un jour par lire la fiche d'un autre client.
 *
 * Réalise : EXEC-19
 */

import type {
  ClientCriteria,
  FichesAQualifier,
  FicheEventJournal,
  LeadStatus,
  LeadStatusStore,
  LeadToQualify,
} from "@sentio/capabilities";
import type { SqlClient } from "@sentio/db";

/** Ce que le client a déclaré vendre, et à qui. Jamais deviné : absent, on ne restreint rien. */
async function criteresDuClient(sql: SqlClient, tenantId: string): Promise<ClientCriteria> {
  const lignes = await sql.query<{ key: string; value: unknown }>(
    `select key, value from company_profile
      where tenant_id = $1 and status = 'actif'
        and key in ('cible', 'secteurs_exclus', 'domaines_exclus')`,
    [tenantId],
  );

  const liste = (cle: string): readonly string[] => {
    const valeur = lignes.find((ligne) => ligne.key === cle)?.value;
    if (typeof valeur === "string") return valeur.trim() === "" ? [] : [valeur];
    if (Array.isArray(valeur)) return valeur.filter((item): item is string => typeof item === "string");
    return [];
  };

  return {
    targetSectors: liste("cible"),
    excludedSectors: liste("secteurs_exclus"),
    excludedDomains: liste("domaines_exclus"),
  };
}

export class PostgresFichesAQualifier implements FichesAQualifier {
  constructor(private readonly sql: SqlClient) {}

  async lire(input: {
    tenantId: string;
    leadId: string;
  }): Promise<{ lead: LeadToQualify; criteria: ClientCriteria } | null> {
    const [fiche] = await this.sql.query<{
      company_name: string;
      email: string | null;
      sector: string | null;
      source: string;
      deja_contacte: boolean;
    }>(
      `select l.company_name, l.email, l.sector, l.source,
              exists (select 1 from outbound_message m
                       where m.tenant_id = l.tenant_id and m.lead_id = l.id) as deja_contacte
         from lead l
        where l.tenant_id = $1 and l.id = $2`,
      [input.tenantId, input.leadId],
    );
    if (fiche === undefined) return null;

    return {
      lead: {
        companyName: fiche.company_name,
        email: fiche.email,
        sector: fiche.sector,
        source: fiche.source,
        alreadyContacted: fiche.deja_contacte,
      },
      criteria: await criteresDuClient(this.sql, input.tenantId),
    };
  }

  async consigner(input: {
    tenantId: string;
    leadId: string;
    qualification: "qualifie" | "ecarte";
    raison: string;
    motifDeSelection: string;
  }): Promise<boolean> {
    // Le verdict et sa raison partent ensemble. Un prospect écarté sans explication est une
    // décision que personne ne peut contester — donc une décision qu'on ne peut pas corriger.
    const lignes = await this.sql.query<{ id: string }>(
      `update lead
          set qualification = $3, qualification_reason = $4, selection_reason = $5
        where tenant_id = $1 and id = $2
        returning id`,
      [input.tenantId, input.leadId, input.qualification, input.raison, input.motifDeSelection],
    );
    return lignes.length > 0;
  }
}

export class PostgresLeadStatusStore implements LeadStatusStore {
  constructor(private readonly sql: SqlClient) {}

  async updateStatus(input: {
    tenantId: string;
    leadId: string;
    status: LeadStatus;
  }): Promise<boolean> {
    const lignes = await this.sql.query<{ id: string }>(
      "update lead set status = $3 where tenant_id = $1 and id = $2 returning id",
      [input.tenantId, input.leadId, input.status],
    );
    return lignes.length > 0;
  }
}

/**
 * Ce qu'a dit le prospect, consigné au journal d'exécution.
 *
 * Pas dans une colonne de `lead` : une note écrase la précédente, un journal les garde toutes.
 * C'est la même raison qui fait qu'une configuration se republie au lieu de se modifier — ce qui
 * a été observé un jour doit rester relisible après coup.
 */
export class JournalDesFiches implements FicheEventJournal {
  constructor(private readonly sql: SqlClient) {}

  async record(input: {
    tenantId: string;
    leadId: string;
    employeeId: string;
    status: LeadStatus;
    note: string | null;
  }): Promise<void> {
    await this.sql.query(
      `insert into execution_event (tenant_id, employee_id, kind, payload)
       values ($1, $2, 'fiche_mise_a_jour', $3::jsonb)`,
      [
        input.tenantId,
        input.employeeId,
        JSON.stringify({ leadId: input.leadId, statut: input.status, note: input.note }),
      ],
    );
  }
}

/**
 * L'inscription des entreprises trouvées dans l'annuaire public.
 *
 * ⚠️ UNE SEULE INSTRUCTION POUR TOUT LE LOT, ET C'EST CE QUI REND LE COMPTE VRAI.
 *
 * `on conflict do nothing` sur `(tenant_id, external_ref)` écarte ce qui est déjà connu, et
 * `returning` ne rend que les lignes RÉELLEMENT insérées. Boucler entreprise par entreprise aurait
 * coûté un aller-retour par ligne, et surtout aurait laissé la porte ouverte à un compte faux : ce
 * qu'on annonce au dirigeant est ce que la base a accepté, jamais ce qu'on lui a proposé.
 *
 * ⚠️ `collected_at` est posé ici, et il n'est pas décoratif : c'est la date de collecte au sens du
 * RGPD, celle qui permettra de dire au prospect quand et d'où sa fiche est venue (`docs/10`,
 * article 14). `informed_at` reste nul : personne n'a encore été informé, parce que personne n'a
 * encore été contacté.
 *
 * ⚠️ Aucune donnée personnelle n'entre ici. L'annuaire rend les dirigeants ; `annuaire.ts` ne les
 * lit même pas, et cette requête n'a pas de colonne où les mettre.
 */
export class RegistreDeProspectsPostgres implements RegistreDeProspects {
  constructor(private readonly sql: SqlClient) {}

  async inscrire(input: {
    tenantId: string;
    entreprises: readonly EntrepriseTrouvee[];
    motifDeSelection: string;
  }): Promise<number> {
    if (input.entreprises.length === 0) return 0;

    const lignes = await this.sql.query<{ id: string }>(
      `insert into lead
         (tenant_id, company_name, sector, external_ref, source, source_detail,
          collected_at, selection_reason)
       select $1, e.nom, nullif(e.secteur, ''), e.reference, 'annuaire_public',
              jsonb_build_object(
                'annuaire', 'recherche-entreprises.api.gouv.fr',
                'siret', e.reference,
                'commune', nullif(e.commune, ''),
                'code_postal', nullif(e.code_postal, '')),
              now(), $6
         from unnest($2::text[], $3::text[], $4::text[], $5::text[], $7::text[])
              as e(nom, secteur, reference, commune, code_postal)
       on conflict (tenant_id, external_ref) where external_ref is not null do nothing
       returning id`,
      [
        input.tenantId,
        input.entreprises.map((e) => e.nom),
        input.entreprises.map((e) => e.secteur ?? ""),
        input.entreprises.map((e) => e.reference),
        input.entreprises.map((e) => e.commune ?? ""),
        input.motifDeSelection,
        input.entreprises.map((e) => e.codePostal ?? ""),
      ],
    );
    return lignes.length;
  }
}
