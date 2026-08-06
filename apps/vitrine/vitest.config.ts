import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les suites d'intégration reconstruisent le schéma de la MÊME base jetable. En parallèle,
    // l'une effacerait le `public` que l'autre est en train d'utiliser — un échec intermittent,
    // le pire genre. En série, elles sont simplement lentes.
    fileParallelism: false,
  },
});
