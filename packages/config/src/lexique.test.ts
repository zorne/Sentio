import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { LEXIQUE_DOC_PATH, findForbiddenTerms, parseForbiddenTerms } from "./lexique.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const lexiqueMarkdown = readFileSync(`${repoRoot}${LEXIQUE_DOC_PATH}`, "utf8");

describe("parseForbiddenTerms", () => {
  it("extrait les termes du lexique réel", () => {
    const terms = parseForbiddenTerms(lexiqueMarkdown);

    // On vérifie la présence de termes que le lexique nomme explicitement, sans figer la liste
    // entière ici — ce serait une deuxième copie, exactement ce que la règle interdit.
    expect(terms).toContain("ia");
    expect(terms).toContain("bot");
    expect(terms).toContain("agent");
    expect(terms).toContain("assistant");
  });

  it("ne remonte pas les termes imposés", () => {
    const terms = parseForbiddenTerms(lexiqueMarkdown);

    expect(terms).not.toContain("employé numérique");
    expect(terms).not.toContain("recruter");
  });

  it("échoue si la section attendue a disparu", () => {
    expect(() => parseForbiddenTerms("# Un document sans la bonne section")).toThrow(
      /introuvable/,
    );
  });

  it("échoue plutôt que de renvoyer une liste vide", () => {
    const emptySection = "## Interdit dans tout texte visible par un client\n\n## Imposé\n";
    expect(() => parseForbiddenTerms(emptySection)).toThrow(/vide/);
  });
});

describe("findForbiddenTerms", () => {
  const terms = parseForbiddenTerms(lexiqueMarkdown);

  it("repère un mot interdit dans un texte client", () => {
    const violations = findForbiddenTerms("Notre IA analyse votre demande.", terms);

    expect(violations.map((v) => v.term)).toContain("ia");
  });

  it("ignore la casse", () => {
    expect(findForbiddenTerms("Un Bot.", terms)).not.toHaveLength(0);
  });

  it("ne se déclenche pas sur un mot qui en contient un autre", () => {
    // « agent » est interdit, « agenda » ne l'est pas.
    expect(findForbiddenTerms("Consultez votre agenda.", terms)).toHaveLength(0);
  });

  it("laisse passer un texte conforme au lexique", () => {
    const conforme =
      "Carter Commercial rejoint votre équipe. Sa fiche présente sa mission et ses résultats.";

    expect(findForbiddenTerms(conforme, terms)).toHaveLength(0);
  });
});
