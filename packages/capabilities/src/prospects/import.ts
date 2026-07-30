/**
 * METIER-05 — l'import de la liste du client.
 *
 * ⚠️ **C'est la porte d'entrée de la première cause d'échec du marché** : une donnée sale
 * transformée en mauvais messages à grande échelle ([`docs/21-concurrence.md`]). Ce module est
 * donc écrit pour **rejeter ligne par ligne** plutôt que pour tout accepter et trier plus tard :
 * ce qui entre est propre, ou n'entre pas.
 *
 * Il ne fait aucune entrée/sortie : il prend du texte et rend des lignes valides et des lignes
 * refusées, chacune avec sa raison. C'est ce qui permet de rendre au client un compte-rendu utile
 * — « 43 importés, 7 refusés, voici pourquoi » — au lieu d'un « erreur d'import ».
 *
 * Réalise : METIER-05
 */

/** Ce qu'une ligne d'import doit fournir pour devenir un prospect. */
export interface ImportedLead {
  readonly companyName: string;
  readonly email: string | null;
  readonly contactName: string | null;
  readonly roleTitle: string | null;
  readonly sector: string | null;
  /** D5 : d'où vient cette donnée. Obligatoire — sans elle, le prospect n'existe pas. */
  readonly source: string;
}

export interface RejectedRow {
  /** Numéro de ligne dans le fichier, en-tête comprise : ce que le client voit dans son tableur. */
  readonly line: number;
  readonly reason: string;
}

export interface ImportReport {
  readonly leads: readonly ImportedLead[];
  readonly rejected: readonly RejectedRow[];
}

/**
 * Découpe une ligne de fichier séparé par des virgules ou des points-virgules, en respectant les
 * guillemets. Écrit à la main plutôt qu'emprunté : le besoin tient en vingt lignes, et une
 * dépendance de plus se paie en surface de mise à jour pour un produit à budget zéro.
 */
export function splitRow(row: string, separator: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === '"') {
      // Deux guillemets consécutifs à l'intérieur d'une cellule = un guillemet littéral.
      if (inQuotes && row[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === separator && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** Le séparateur le plus probable : celui qui découpe l'en-tête en le plus de colonnes. */
function detectSeparator(header: string): string {
  return splitRow(header, ";").length >= splitRow(header, ",").length ? ";" : ",";
}

const HEADER_ALIASES: Readonly<Record<string, keyof ImportedLead>> = {
  entreprise: "companyName",
  société: "companyName",
  societe: "companyName",
  company: "companyName",
  email: "email",
  "e-mail": "email",
  courriel: "email",
  contact: "contactName",
  nom: "contactName",
  prénom: "contactName",
  prenom: "contactName",
  fonction: "roleTitle",
  poste: "roleTitle",
  secteur: "sector",
};

/** Une adresse plausible. On ne vérifie pas l'existence : on refuse ce qui ne peut pas en être une. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(value);
}

/**
 * Les adresses qu'on n'écrit jamais en prospection : boîtes automatiques, listes de diffusion.
 * Écrire là dessus ne produit aucune réponse et attire les plaintes — donc abîme la réputation
 * du client pour rien (`docs/adr/0017`).
 */
const NEVER_CONTACT = ["noreply", "no-reply", "postmaster", "abuse", "mailer-daemon", "unsubscribe"];

export function parseProspectImport(content: string, options: { source: string }): ImportReport {
  if (options.source.trim() === "") {
    throw new Error(
      "Import sans origine : impossible de savoir d'où vient la donnée, donc de contacter " +
        "qui que ce soit régulièrement (docs/adr/0016).",
    );
  }

  const rows = content.split(/\r?\n/).filter((row) => row.trim() !== "");
  const header = rows[0];
  if (header === undefined) return { leads: [], rejected: [] };

  const separator = detectSeparator(header);
  const columns = splitRow(header, separator).map(
    (name) => HEADER_ALIASES[name.toLowerCase().replace(/^"|"$/g, "")],
  );

  if (!columns.includes("companyName")) {
    throw new Error(
      "Colonne « entreprise » introuvable. Un prospect sans entreprise n'est pas exploitable, " +
        "et deviner la colonne serait pire que refuser le fichier.",
    );
  }

  const leads: ImportedLead[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Set<string>();

  for (let index = 1; index < rows.length; index += 1) {
    const line = index + 1;
    const cells = splitRow(rows[index] as string, separator);
    const value = (field: keyof ImportedLead): string =>
      (cells[columns.indexOf(field)] ?? "").replace(/^"|"$/g, "").trim();

    const companyName = value("companyName");
    if (companyName === "") {
      rejected.push({ line, reason: "entreprise manquante" });
      continue;
    }

    const rawEmail = value("email").toLowerCase();
    if (rawEmail !== "" && !looksLikeEmail(rawEmail)) {
      rejected.push({ line, reason: `adresse invalide : « ${rawEmail} »` });
      continue;
    }
    if (rawEmail !== "" && NEVER_CONTACT.some((needle) => rawEmail.startsWith(needle))) {
      rejected.push({ line, reason: "adresse automatique, jamais démarchée" });
      continue;
    }
    if (rawEmail !== "" && seen.has(rawEmail)) {
      // Un doublon dans le fichier, c'est deux messages à la même personne. Il se refuse ici,
      // avant même la contrainte d'unicité de la base.
      rejected.push({ line, reason: "doublon dans le fichier" });
      continue;
    }
    if (rawEmail !== "") seen.add(rawEmail);

    const optional = (field: keyof ImportedLead): string | null => {
      const raw = value(field);
      return raw === "" ? null : raw;
    };

    leads.push({
      companyName,
      email: rawEmail === "" ? null : rawEmail,
      contactName: optional("contactName"),
      roleTitle: optional("roleTitle"),
      sector: optional("sector"),
      source: options.source.trim(),
    });
  }

  return { leads, rejected };
}
