// ════════════════════════════════════════════════════════════════════
// Le profil d'entreprise — ce que l'employé sait de la société qui l'a
// recruté, et qu'il relit à chaque cycle de travail.
//
// Forme volontairement PLATE (une clé = une chaîne) : c'est celle de
// `company_profile` dans le schéma du cœur (`supabase/migrations/
// 20260729120022_company_profile.sql` — key text, value jsonb,
// author 'client'). Une ligne par clé le jour où les deux schémas
// convergeront ; d'ici là, le même objet vit dans
// `agent_instance.config.companyProfile`. Aucune traduction à écrire
// le moment venu, c'est tout l'intérêt.
//
// Deux champs seulement sont exigés — ceux sans lesquels l'employé ne
// peut pas travailler du tout. Le reste est retenu s'il a été dit, et
// jamais réclamé pour lui-même : c'est ce qui sépare un employé qui
// connaît l'entreprise d'un employé générique, pas un questionnaire.
// ════════════════════════════════════════════════════════════════════

/** Une clé du profil = une future ligne `company_profile`. L'ordre de ce
 *  tableau est celui de la relecture par l'employé (voir
 *  `buildProfileBriefing`) — il est stable, les tests s'y appuient. */
export const PROFILE_FIELDS = [
  {
    key: "activite",
    requis: false,
    /** Introduit la valeur dans le briefing relu par l'employé. */
    intitule: "Ce que fait cette entreprise",
  },
  {
    key: "cible",
    requis: true,
    intitule: "Ce client considère un prospect qualifié si",
  },
  {
    key: "offre",
    requis: true,
    intitule: "Offre(s) à mettre en avant",
  },
  {
    key: "preuves",
    requis: false,
    intitule: "Preuves concrètes utilisables (résultats, références)",
  },
  {
    key: "objections",
    requis: false,
    intitule: "Objections fréquentes, et ce qui y répond",
  },
  {
    key: "exclusions",
    requis: false,
    intitule: "À ne jamais contacter",
  },
  {
    key: "ton",
    requis: false,
    intitule: "Ton à adopter",
  },
  {
    key: "interdits",
    requis: false,
    intitule: "À ne jamais dire ni promettre",
  },
] as const;

export type ProfileKey = (typeof PROFILE_FIELDS)[number]["key"];

export type CompanyProfile = {
  readonly [K in ProfileKey]?: string;
} & {
  readonly cible: string;
  readonly offre: string;
};

/** Les clés exigées, dans l'ordre, pour guider une relance qui manque son but. */
export const REQUIRED_FIELDS = PROFILE_FIELDS.filter((f) => f.requis).map((f) => f.key);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Validation défensive de ce que le modèle a produit — jamais fait confiance à sa forme.
 * Retourne le profil nettoyé, ou la liste des clés exigées encore manquantes.
 *
 * Les champs facultatifs absents restent absents : une clé vide vaudrait affirmation vide
 * dans le briefing relu par l'employé, ce qui est pire que le silence.
 */
export function parseProfile(
  candidate: unknown,
): { profile: CompanyProfile } | { missing: readonly ProfileKey[] } {
  if (typeof candidate !== "object" || candidate === null) {
    return { missing: REQUIRED_FIELDS };
  }
  const brut = candidate as Record<string, unknown>;

  const missing = REQUIRED_FIELDS.filter((key) => !isNonEmptyString(brut[key]));
  if (missing.length > 0) return { missing };

  const profile: Record<string, string> = {};
  for (const { key } of PROFILE_FIELDS) {
    const valeur = brut[key];
    if (isNonEmptyString(valeur)) profile[key] = valeur.trim();
  }
  return { profile: profile as unknown as CompanyProfile };
}

/**
 * Le bloc que l'employé relit avant d'agir, ajouté à son prompt système.
 *
 * Rendu vide (chaîne vide) si le profil ne contient rien d'exploitable — un en-tête suivi de
 * rien apprendrait à l'employé que son client n'a rien à dire, ce qui est faux et nuisible.
 */
export function buildProfileBriefing(profile: Partial<CompanyProfile>): string {
  const lignes = PROFILE_FIELDS.filter(({ key }) => isNonEmptyString(profile[key])).map(
    ({ key, intitule }) => `· ${intitule} : ${profile[key]}`,
  );
  if (lignes.length === 0) return "";

  return [
    "CE QUE VOUS SAVEZ DE L'ENTREPRISE POUR LAQUELLE VOUS TRAVAILLEZ",
    "(dit par le client lui-même — à respecter, jamais à compléter d'invention)",
    ...lignes,
  ].join("\n");
}

/**
 * Relit le profil depuis `agent_instance.config`, quelle que soit la génération qui l'a écrit.
 *
 * Les deux clés historiques (`prospectingCriteria` / `prospectingOffer`, posées par le
 * formulaire à deux champs) sont lues comme `cible` / `offre` : un client configuré avant le
 * briefing conversationnel ne perd rien, et `companyProfile` prime quand les deux coexistent.
 */
export function readProfileFromConfig(config: unknown): Partial<CompanyProfile> {
  if (typeof config !== "object" || config === null) return {};
  const cfg = config as Record<string, unknown>;

  const heritage: Record<string, string> = {};
  if (isNonEmptyString(cfg.prospectingCriteria)) heritage.cible = cfg.prospectingCriteria.trim();
  if (isNonEmptyString(cfg.prospectingOffer)) heritage.offre = cfg.prospectingOffer.trim();

  const stocke = cfg.companyProfile;
  const recent: Record<string, string> = {};
  if (typeof stocke === "object" && stocke !== null) {
    const brut = stocke as Record<string, unknown>;
    for (const { key } of PROFILE_FIELDS) {
      const valeur = brut[key];
      if (isNonEmptyString(valeur)) recent[key] = valeur.trim();
    }
  }

  return { ...heritage, ...recent };
}

/**
 * Le prompt système réel d'un employé, à partir de sa `config`.
 *
 * **Le bloc entreprise s'AJOUTE, il ne remplace pas.** C'est le correctif d'un défaut réel :
 * `loadIdentity` retournait `config.systemPrompt` et s'arrêtait là. Or tout client passé par le
 * chat d'accueil (`platform.create_tenant_agent`) EN A un — donc, pour tous les vrais clients,
 * la configuration issue du briefing était écrite en base puis jamais relue. Un employé
 * configuré qui travaille comme s'il ne l'était pas est pire qu'un employé non configuré :
 * personne ne va chercher la panne.
 */
export function composeSystemPrompt(defaultPrompt: string, config: unknown): string {
  const cfg = (typeof config === "object" && config !== null ? config : {}) as Record<string, unknown>;
  const base = isNonEmptyString(cfg.systemPrompt) ? cfg.systemPrompt.trim() : defaultPrompt;

  const briefing = buildProfileBriefing(readProfileFromConfig(cfg));
  return briefing === "" ? base : `${base}\n\n${briefing}`;
}
