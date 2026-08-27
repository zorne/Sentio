import { describe, expect, it } from "vitest";

import { redigerLaPresentation, type PresentationDeLEmployee } from "./email-presentation.js";

/**
 * L'email de présentation est le document que le client GARDE. Il est donc le seul texte du
 * produit qu'on ne peut pas corriger après coup : une fois parti, il est dans sa boîte pour
 * toujours, et dans celle des gens à qui il l'aura fait suivre.
 *
 * C'est exactement le genre de texte qu'on relit trois fois le jour où on l'écrit, puis plus
 * jamais. Ces tests le relisent à chaque `verify`.
 */

const FAITS: PresentationDeLEmployee = {
  prenom: "Julie",
  entreprise: "Menuiserie Duval",
  role: "prospection",
  priorites: ["relancer ce qui est resté sans réponse", "écarter ce qui ne vous ressemble pas"],
  objectif: "10 rendez-vous qualifiés ce mois",
  lienDAcces: "https://sentio.fr/acces?jeton=abc123",
  adresseDeConnexion: "https://sentio.fr/login",
};

describe("l'email de présentation", () => {
  it("dit qui elle est, pour quelle entreprise, et pour quoi faire", () => {
    const email = redigerLaPresentation(FAITS);

    expect(email.objet).toBe("Julie rejoint Menuiserie Duval");
    for (const version of [email.texte, email.html]) {
      expect(version).toContain("Julie");
      expect(version).toContain("Menuiserie Duval");
      expect(version).toContain("prospection");
      expect(version).toContain("10 rendez-vous qualifiés ce mois");
    }
  });

  it("porte les priorités telles que la configuration les a écrites", () => {
    const email = redigerLaPresentation(FAITS);
    for (const priorite of FAITS.priorites) {
      expect(email.texte).toContain(priorite);
      expect(email.html).toContain(priorite);
    }
  });

  it("⭐⭐ dit ce qu'elle ne fera JAMAIS, dans les deux versions", () => {
    // C'est ce qui rassure, et c'est la raison d'être de ce document. Un email de bienvenue qui
    // ne liste que des capacités se lit comme une brochure ; celui-ci doit se lire comme un
    // contrat de travail.
    const email = redigerLaPresentation(FAITS);

    for (const version of [email.texte, email.html]) {
      expect(version).toContain("sans votre accord");
      expect(version).toContain("vous seul pouvez la rendre plus autonome");
      expect(version).toContain("ne change jamais de métier toute seule");
      expect(version).toContain("Aucune donnée d'une entreprise n'atteint une autre entreprise");
      // Le garde-fou du silence, dit avant que le client ait à s'en inquiéter.
      expect(version).toContain("quarante entreprises sans obtenir la moindre réponse");
    }
  });

  it("⭐⭐ ne contient AUCUN mot de passe, et le dit au client", () => {
    // Un mot de passe envoyé par email reste dans une boîte pour toujours. Le lien proposé sert
    // à en CHOISIR un, et il meurt derrière celui qui le passe.
    const email = redigerLaPresentation(FAITS);

    for (const version of [email.texte, email.html]) {
      expect(version).toContain("Choisis");
      expect(version).toContain("ne fonctionne qu'une fois");
      expect(version).toContain(FAITS.lienDAcces);
      // L'adresse permanente, elle, ne porte aucun secret : c'est celle qu'il gardera.
      expect(version).toContain(FAITS.adresseDeConnexion);
    }
  });

  it("⭐ n'avance aucun chiffre que la base ne connaît pas", () => {
    const email = redigerLaPresentation(FAITS);
    const promesses =
      /\b\d+\s*(?:%|heures? (?:par|gagnées)|fois plus)|\bjusqu'à \d|\béconomis|\bgarantis?\b/i;

    expect(promesses.test(email.texte)).toBe(false);
    // Les seuls nombres admis sont ceux qu'on lui a passés, plus « quarante », qui est le seuil
    // réel du garde-fou du silence (`docs/31` §5).
  });

  it("⭐⭐ tient le lexique de docs/17 : aucun mot technique ne traverse", () => {
    const email = redigerLaPresentation(FAITS);
    const interdits =
      /\b(IA|intelligence artificielle|bots?|assistants?|agents?|automatisations?|automations?|GPT|prompts?|tokens?|workflows?|pipelines?|modèles?)\b/i;

    const trouve = interdits.exec(email.texte);
    expect(trouve?.[0] ?? null, "mot interdit dans la version texte").toBeNull();
    // Le HTML porte des noms de balises et des styles : on ne lit que ce qu'une personne voit.
    const visible = email.html.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, "'");
    expect(interdits.exec(visible)?.[0] ?? null, "mot interdit dans la version HTML").toBeNull();
  });

  it("⭐⭐ aucun tiret visible, dans aucune des deux versions", () => {
    // Demande explicite du fondateur. Elle vaut ici plus qu'ailleurs : c'est le document qu'on
    // fait suivre, donc celui que des gens qui ne connaissent pas Sentio liront en premier.
    const email = redigerLaPresentation(FAITS);
    const visible = email.html.replace(/<[^>]*>/g, " ");

    expect(email.objet).not.toMatch(/[—–]/);
    expect(email.texte).not.toMatch(/[—–]/);
    expect(visible).not.toMatch(/[—–]/);
  });

  it("échappe ce qui vient du client : un nom d'entreprise ne devient pas du balisage", () => {
    const email = redigerLaPresentation({
      ...FAITS,
      entreprise: '<script>alert("x")</script> & Fils',
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&amp; Fils");
  });

  it("se passe de priorités sans laisser une section vide", () => {
    const email = redigerLaPresentation({ ...FAITS, priorites: [] });

    expect(email.html).not.toContain("Ce sur quoi elle se concentre");
    expect(email.texte).not.toContain("Ce sur quoi elle se concentre");
    // Et il reste lisible : l'essentiel n'était pas là.
    expect(email.texte).toContain("Julie rejoint Menuiserie Duval");
  });
});
