// ════════════════════════════════════════════════════════════════════
// LA CLASSE DE DONNÉES DES CHEMINS PUBLICS — et pourquoi elle se teste.
//
// ══ CE QUE CE FICHIER EMPÊCHE DE REVENIR ══
//
// Le diagnostic public et le conseiller envoyaient au modèle le nom de l'entreprise du visiteur,
// son secteur, son effectif, ses difficultés et son objectif — sous l'étiquette `dataClass:
// "test"`. Or la règle d'or ne filtre que sur `"real"` (`gateway/index.ts:142` et `:197`) : sous
// cette étiquette, elle ne se déclenchait **jamais**. Un fournisseur `free` — qui s'autorise à
// entraîner sur ce qu'il reçoit — recevait des données réelles, et aucune ligne ne s'y opposait.
//
// Ce n'était pas un risque futur : c'était une fuite écrite dans le code présent, et invisible,
// parce que `pnpm run verify` restait vert.
//
// ⚠️ CE QUE CE TEST NE FAIT PAS : appeler un fournisseur. Le refus intervient AVANT l'appel — la
// règle d'or filtre les identifiants, puis la boucle sort sans avoir rien envoyé. Aucun octet ne
// part sur le réseau, aucune clé n'est nécessaire, aucun quota n'est consommé.
// ════════════════════════════════════════════════════════════════════

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildAdvisorGateway } from "../advisor/index.js";
import { buildDiagnosticGateway } from "../diagnostic/index.js";
import type { InferenceEnvelopeLedger } from "./envelope.js";

/** Un compteur d'enveloppe qui ne borne rien : ce test porte sur la classe de données, pas sur le
 *  plafond — que `envelope.test.ts` couvre déjà. */
const LEDGER_SANS_BORNE: InferenceEnvelopeLedger = {
  async consumed() {
    return 0;
  },
  async record() {
    /* rien à compter : aucun appel ne part */
  },
};

const CLE_ORIGINE = process.env["GROQ_API_KEY"];

beforeEach(() => {
  // Une clé de paille SUFFIT : elle sert seulement à ce que le résolveur rende une credential
  // Groq. Le refus tombe avant qu'elle ne serve à quoi que ce soit.
  process.env["GROQ_API_KEY"] = "cle-de-paille-jamais-utilisee";
});

afterEach(() => {
  if (CLE_ORIGINE === undefined) delete process.env["GROQ_API_KEY"];
  else process.env["GROQ_API_KEY"] = CLE_ORIGINE;
});

/** Ce que le visiteur tape réellement — pas un « bonjour » de test. */
const CE_QUE_TAPE_LE_VISITEUR = [
  {
    kind: "text" as const,
    role: "user" as const,
    content:
      "Nous sommes une menuiserie de 6 personnes à Lille, nos prospects ne sont jamais relancés " +
      "et on vise 10 rendez-vous ce mois-ci.",
  },
];

describe("les chemins publics déclarent des données réelles", () => {
  it("le diagnostic refuse d'envoyer chez un fournisseur « free », au lieu de le faire en silence", async () => {
    const gateway = buildDiagnosticGateway(LEDGER_SANS_BORNE);

    await expect(
      gateway.generate({
        tenantId: "platform-diagnostic",
        dataClass: "real",
        system: "peu importe",
        messages: CE_QUE_TAPE_LE_VISITEUR,
        maxTokens: 100,
      }),
    ).rejects.toThrow(/free\/train incompatible avec données réelles/);
  });

  it("le conseiller refuse de la même façon", async () => {
    const gateway = buildAdvisorGateway();

    const flux = gateway.stream({
      tenantId: "platform-advisor",
      dataClass: "real",
      system: "peu importe",
      messages: CE_QUE_TAPE_LE_VISITEUR,
      maxTokens: 100,
    });

    await expect(
      (async () => {
        for await (const _ of flux) {
          /* on n'attend rien : le refus doit tomber avant le premier morceau */
        }
      })(),
    ).rejects.toThrow(/free\/train incompatible avec données réelles/);
  });

  // ⚠️ PAS DE TROISIÈME TEST « et sous l'étiquette test, ça passerait ». Il aurait fallu laisser
  // la requête atteindre le fournisseur pour prouver que la porte était ouverte — c'est-à-dire
  // envoyer, sur le réseau, le texte d'un visiteur avec une clé de paille. Un test qui doit sortir
  // pour démontrer une fuite reproduit la fuite. Ce que l'étiquette coûtait est écrit en tête de
  // ce fichier ; ça n'a pas besoin d'un appel pour être vrai.
});
