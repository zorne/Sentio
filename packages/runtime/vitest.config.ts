import { defineConfig } from "vitest/config";

export default defineConfig({
  // Ce paquet ne connaît aucun runtime : ses tests sont unitaires et parallélisables. Les suites
  // d'intégration, qui partagent une base, vivent dans `apps/worker` — elles ont besoin d'un
  // pilote, et un pilote est un choix d'hôte.
  test: {},
});
