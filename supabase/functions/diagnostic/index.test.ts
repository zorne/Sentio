/**
 * Tests de l'adaptateur d'entrée du diagnostic.
 *
 * Ils ne rejouent pas les règles du domaine — celles-ci ont leurs propres tests, sous Vitest, dans
 * `packages/domain`. Ils vérifient ce que seul cet endroit peut casser : la méthode, le format, la
 * taille, le drapeau qui tient la porte fermée, les origines autorisées, et le fait que **le
 * domaine soit bien celui qui décide**.
 *
 * Ils tournent sous Deno, comme la fonction : tester le même code dans un autre runtime que celui
 * de production reviendrait à tester autre chose.
 *
 *     deno test --allow-env supabase/functions/diagnostic/
 */

import { handle } from "./handler.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  assert(actual === expected, `${message} — attendu ${String(expected)}, obtenu ${String(actual)}`);
}

const VALID_PROFILE = {
  sector: "menuiserie",
  headcount: 8,
  friction: "pas_assez_de_prospects",
  objective: { metric: "€ de chiffre d'affaires", target: 5000, horizon: "mois" },
  targetCustomers: "architectes et maîtres d'œuvre",
  hasProspectList: true,
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://sentio.test/diagnostic", {
    method: "POST",
    // La longueur est posée à la main : c'est la couche HTTP qui la pose en production, et la
    // fonction la considère comme obligatoire.
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(payload).byteLength),
      ...headers,
    },
    body: payload,
  });
}

/** Ouvre le diagnostic pour un test, et le referme après — l'état fermé est l'état normal. */
async function withDiagnosticOpen(run: () => Promise<void>): Promise<void> {
  Deno.env.set("SENTIO_PUBLIC_DIAGNOSTIC_ENABLED", "true");
  try {
    await run();
  } finally {
    Deno.env.delete("SENTIO_PUBLIC_DIAGNOSTIC_ENABLED");
  }
}

Deno.test("le diagnostic est fermé par défaut : aucun drapeau, aucune réponse", async () => {
  Deno.env.delete("SENTIO_PUBLIC_DIAGNOSTIC_ENABLED");
  const response = await handle(post(VALID_PROFILE));
  assertEquals(response.status, 503, "un drapeau absent doit fermer");
  const body = (await response.json()) as { message: string };
  assert(body.message.length > 0, "le visiteur reçoit une phrase, pas un code");
});

Deno.test("un drapeau à une autre valeur que « true » ne l'ouvre pas", async () => {
  Deno.env.set("SENTIO_PUBLIC_DIAGNOSTIC_ENABLED", "1");
  try {
    const response = await handle(post(VALID_PROFILE));
    assertEquals(response.status, 503, "« 1 » n'est pas « true »");
  } finally {
    Deno.env.delete("SENTIO_PUBLIC_DIAGNOSTIC_ENABLED");
  }
});

Deno.test("seule la méthode d'envoi est acceptée", async () => {
  const response = await handle(new Request("https://sentio.test/diagnostic"));
  assertEquals(response.status, 405, "une lecture ne produit pas de diagnostic");
});

Deno.test("un format non déclaré est refusé avant toute lecture", async () => {
  await withDiagnosticOpen(async () => {
    const response = await handle(
      new Request("https://sentio.test/diagnostic", {
        method: "POST",
        headers: { "content-type": "text/plain", "content-length": "2" },
        body: "{}",
      }),
    );
    assertEquals(response.status, 415, "un corps non JSON est refusé");
  });
});

Deno.test("un corps sans longueur annoncée est refusé", async () => {
  await withDiagnosticOpen(async () => {
    const response = await handle(
      new Request("https://sentio.test/diagnostic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_PROFILE),
      }),
    );
    assertEquals(response.status, 411, "sans longueur, on ne peut pas refuser à l'avance");
  });
});

Deno.test("un corps démesuré est refusé", async () => {
  await withDiagnosticOpen(async () => {
    const response = await handle(post({ sector: "m".repeat(20_000) }));
    assertEquals(response.status, 413, "la borne de taille tient");
  });
});

Deno.test("un corps illisible est refusé sans détail technique", async () => {
  await withDiagnosticOpen(async () => {
    const response = await handle(post("{ceci n'est pas du JSON"));
    assertEquals(response.status, 400, "un JSON invalide est une demande illisible");
    const body = (await response.json()) as Record<string, unknown>;
    assertEquals(body["violations"], undefined, "aucun détail de parsage ne sort");
  });
});

Deno.test("un profil invalide rend les champs fautifs, jamais leurs valeurs", async () => {
  await withDiagnosticOpen(async () => {
    const response = await handle(post({ ...VALID_PROFILE, headcount: 0, secteur: "menuiserie" }));
    assertEquals(response.status, 422, "un profil invalide ne devient pas une recommandation");
    const body = (await response.json()) as {
      violations: { field: string; reason: string }[];
    };
    const fields = body.violations.map((violation) => violation.field).sort();
    assertEquals(fields.join(","), "headcount,secteur", "les deux fautes sont rendues");
  });
});

Deno.test("un profil complet reçoit la décision du domaine", async () => {
  await withDiagnosticOpen(async () => {
    const response = await handle(post(VALID_PROFILE));
    assertEquals(response.status, 200, "un profil complet aboutit");
    const body = (await response.json()) as { status: string; calibration: { profession: string } };
    assertEquals(body.status, "recommande", "le domaine recommande");
    assertEquals(body.calibration.profession, "commercial", "un seul métier en V1");
  });
});

Deno.test("un profil incomplet ne conclut pas : le diagnostic continue", async () => {
  await withDiagnosticOpen(async () => {
    const response = await handle(post({ sector: "menuiserie" }));
    assertEquals(response.status, 200, "un profil incomplet est une réponse, pas une erreur");
    const body = (await response.json()) as { status: string; missing: string[] };
    assertEquals(body.status, "incomplet", "l'issue vient du domaine");
    assert(body.missing.length > 0, "on dit ce qui manque");
  });
});

Deno.test("un besoin hors périmètre est dit, pas contourné", async () => {
  await withDiagnosticOpen(async () => {
    const response = await handle(post({ ...VALID_PROFILE, friction: "comptabilite" }));
    assertEquals(response.status, 200, "l'honnêteté n'est pas une erreur");
    const body = (await response.json()) as { status: string; reason: string };
    assertEquals(body.status, "hors_perimetre", "le domaine refuse de vendre");
    assert(body.reason.length > 0, "on explique au visiteur");
  });
});

Deno.test("aucune origine n'est autorisée sans liste explicite", async () => {
  await withDiagnosticOpen(async () => {
    Deno.env.delete("SENTIO_ALLOWED_ORIGINS");
    const response = await handle(post(VALID_PROFILE, { origin: "https://sentio.fr" }));
    assertEquals(
      response.headers.get("access-control-allow-origin"),
      null,
      "une liste absente ferme",
    );
  });
});

Deno.test("une origine listée est autorisée, une autre ne l'est pas", async () => {
  await withDiagnosticOpen(async () => {
    Deno.env.set("SENTIO_ALLOWED_ORIGINS", "https://sentio.fr, https://www.sentio.fr");
    try {
      const autorisee = await handle(post(VALID_PROFILE, { origin: "https://sentio.fr" }));
      assertEquals(
        autorisee.headers.get("access-control-allow-origin"),
        "https://sentio.fr",
        "l'origine listée passe",
      );

      const refusee = await handle(post(VALID_PROFILE, { origin: "https://sentio.fr.attaque.test" }));
      assertEquals(
        refusee.headers.get("access-control-allow-origin"),
        null,
        "une origine qui commence pareil ne passe pas",
      );
    } finally {
      Deno.env.delete("SENTIO_ALLOWED_ORIGINS");
    }
  });
});

Deno.test("l'identifiant de corrélation du client est repris, sinon créé", async () => {
  await withDiagnosticOpen(async () => {
    const fourni = await handle(post(VALID_PROFILE, { "x-correlation-id": "diag-12345678" }));
    assertEquals(fourni.headers.get("x-correlation-id"), "diag-12345678", "l'identifiant est repris");

    const sansEnTete = await handle(post(VALID_PROFILE));
    const genere = sansEnTete.headers.get("x-correlation-id");
    assert(genere !== null && genere.length >= 8, "un identifiant est toujours rendu");

    const douteux = await handle(post(VALID_PROFILE, { "x-correlation-id": "a b\";drop" }));
    assert(
      douteux.headers.get("x-correlation-id") !== "a b\";drop",
      "un identifiant de forme inattendue est remplacé, pas recopié",
    );
  });
});

Deno.test("une réponse de diagnostic ne se met jamais en cache", async () => {
  await withDiagnosticOpen(async () => {
    const response = await handle(post(VALID_PROFILE));
    assertEquals(response.headers.get("cache-control"), "no-store", "rien ne reste en cache");
    assertEquals(
      response.headers.get("x-content-type-options"),
      "nosniff",
      "le type n'est pas devinable",
    );
  });
});
