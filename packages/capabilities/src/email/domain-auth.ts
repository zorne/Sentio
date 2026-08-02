/**
 * METIER-18 — vérifier l'authentification du domaine d'envoi (SPF, DKIM, DMARC), à l'onboarding.
 *
 * `peut_envoyer()` (migration `20260729120038_prospection.sql`) refuse déjà tout envoi tant que
 * les trois colonnes `spf_verified_at` / `dkim_verified_at` / `dmarc_verified_at` de
 * `sending_domain` ne sont pas toutes renseignées. Ce fichier est ce qui les renseigne : trois
 * lectures DNS, trois vérifications syntaxiques, une écriture.
 *
 * ⚠️ **Une vérification qui échoue DÉ-vérifie**, elle ne laisse jamais une ancienne réussite
 * intacte. Un enregistrement SPF peut disparaître après coup — un fournisseur DNS mal configuré,
 * un changement d'hébergeur — et la garde d'envoi doit s'en apercevoir à la vérification
 * suivante, pas seulement à la première. `markVerified` écrit donc l'état constaté maintenant,
 * jamais un OU logique avec l'état précédent.
 *
 * Ce que ce fichier ne fait pas : décider QUAND vérifier. « À l'onboarding » désigne le moment
 * du parcours, pas un mécanisme — l'appel (bouton client, tâche planifiée) dépend de l'interface
 * (lot 6, pas encore construite), même séparation que `send-message.ts` pour `optOutUrl`
 * (METIER-11).
 *
 * Réalise : METIER-18
 */

export interface DnsTxtLookup {
  /** Les enregistrements TXT trouvés, `[]` si aucun — jamais une exception pour une absence,
   *  qui est le résultat normal d'un domaine mal configuré, pas une panne. */
  lookup(hostname: string): Promise<readonly string[]>;
}

export type AuthCheck =
  | { readonly verified: true }
  | { readonly verified: false; readonly reason: string };

/** Un `~all`/`-all` manquant n'invalide pas la syntaxe SPF, mais un enregistrement qui ne referme
 *  jamais la liste des expéditeurs autorisés ne protège personne : Sentio le refuse quand même,
 *  plutôt que de certifier une protection qui n'en est pas une. */
function checkSpf(records: readonly string[]): AuthCheck {
  const spf = records.find((r) => r.trim().toLowerCase().startsWith("v=spf1"));
  if (!spf) return { verified: false, reason: "aucun enregistrement SPF (v=spf1) sur le domaine" };
  if (!/[-~]all\b/i.test(spf)) {
    return {
      verified: false,
      reason: "l'enregistrement SPF ne referme pas la liste des expéditeurs (ni ~all ni -all)",
    };
  }
  return { verified: true };
}

function checkDkim(records: readonly string[]): AuthCheck {
  const dkim = records.find((r) => r.trim().toLowerCase().startsWith("v=dkim1"));
  if (!dkim) {
    return { verified: false, reason: "aucune clé DKIM (v=DKIM1) pour ce sélecteur" };
  }
  if (!/p=[a-z0-9+/]+/i.test(dkim)) {
    return { verified: false, reason: "l'enregistrement DKIM ne porte aucune clé publique (p=)" };
  }
  return { verified: true };
}

function checkDmarc(records: readonly string[]): AuthCheck {
  const dmarc = records.find((r) => r.trim().toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) return { verified: false, reason: "aucune politique DMARC (v=DMARC1) sur le domaine" };
  if (!/p=(none|quarantine|reject)\b/i.test(dmarc)) {
    return { verified: false, reason: "la politique DMARC ne déclare aucun mode (p=)" };
  }
  return { verified: true };
}

export interface SendingDomainAuthStore {
  /** Écrit l'état constaté MAINTENANT pour les trois preuves — jamais un OU avec l'ancien état
   *  (voir l'avertissement en tête de fichier). */
  markVerified(input: {
    tenantId: string;
    sendingDomainId: string;
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
  }): Promise<void>;
}

export interface VerifyDomainAuthInput {
  readonly tenantId: string;
  readonly sendingDomainId: string;
  readonly domain: string;
  /** Le sélecteur DKIM du service d'expédition (`resend._domainkey`, par exemple) — propre au
   *  fournisseur, jamais deviné (`docs/adr/0018`). */
  readonly dkimSelector: string;
}

export interface VerifyDomainAuthResult {
  readonly spf: AuthCheck;
  readonly dkim: AuthCheck;
  readonly dmarc: AuthCheck;
  readonly allVerified: boolean;
}

export class VerifyDomainAuthCapability {
  constructor(
    private readonly dns: DnsTxtLookup,
    private readonly store: SendingDomainAuthStore,
  ) {}

  async execute(input: VerifyDomainAuthInput): Promise<VerifyDomainAuthResult> {
    const [domainRecords, dkimRecords, dmarcRecords] = await Promise.all([
      this.dns.lookup(input.domain),
      this.dns.lookup(`${input.dkimSelector}._domainkey.${input.domain}`),
      this.dns.lookup(`_dmarc.${input.domain}`),
    ]);

    const spf = checkSpf(domainRecords);
    const dkim = checkDkim(dkimRecords);
    const dmarc = checkDmarc(dmarcRecords);

    await this.store.markVerified({
      tenantId: input.tenantId,
      sendingDomainId: input.sendingDomainId,
      spf: spf.verified,
      dkim: dkim.verified,
      dmarc: dmarc.verified,
    });

    return { spf, dkim, dmarc, allVerified: spf.verified && dkim.verified && dmarc.verified };
  }
}
