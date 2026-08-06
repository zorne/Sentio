// ════════════════════════════════════════════════════════════════════
// L'écriture du profil en base — isolée ici, et non dans la Server
// Action, pour être vérifiable par un vrai Postgres sans démarrer
// Next.js (voir store.integration.test.ts).
//
// Ce que fait la requête, et pourquoi :
//   · `companyProfile` est FUSIONNÉ, jamais remplacé — le formulaire à
//     deux champs (ProspectingConfig) doit pouvoir corriger la cible
//     sans effacer les objections, le ton et les interdits recueillis
//     par le briefing. Un remplacement perdrait silencieusement tout
//     ce que le client a pris le temps de dire.
//   · `prospectingCriteria` / `prospectingOffer` restent écrites en
//     doublon : la route cron (`api/cron/prospect`) sélectionne les
//     employés sur `config ? 'prospectingCriteria'`, et le dashboard
//     décide sur ces mêmes clés s'il affiche le chat ou le formulaire.
//     Les retirer débrancherait la prospection automatique.
// ════════════════════════════════════════════════════════════════════

import type { CompanyProfile } from "./profile.js";

/** Le strict nécessaire d'un client `pg` — évite d'imposer `Client` ou `Pool` à l'appelant. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/**
 * Enregistre le profil et rend l'employé actif. Idempotent : réécrire le même profil ne change
 * rien, et un profil partiel n'écrase que les clés qu'il porte.
 */
export async function saveCompanyProfile(
  db: Queryable,
  agentInstanceId: string,
  profile: Partial<CompanyProfile>,
): Promise<void> {
  await db.query(
    `update agent_instance
        set config = config
                  || jsonb_build_object(
                       'companyProfile',
                       coalesce(config -> 'companyProfile', '{}'::jsonb) || $2::jsonb
                     )
                  || case when $3::text is null then '{}'::jsonb
                          else jsonb_build_object('prospectingCriteria', $3::text) end
                  || case when $4::text is null then '{}'::jsonb
                          else jsonb_build_object('prospectingOffer', $4::text) end,
            is_active = true
      where id = $1`,
    [agentInstanceId, JSON.stringify(profile), profile.cible ?? null, profile.offre ?? null],
  );
}
