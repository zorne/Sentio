import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const ICI = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Les suites d'intégration importent le code applicatif tel qu'il est écrit, avec son alias
  // `@/`. Sans cette résolution, elles ne pourraient tester que du code recopié — c'est-à-dire
  // pas le code qui tourne.
  resolve: { alias: { "@": resolve(ICI, "src") } },
  test: {
    // Les suites d'intégration reconstruisent le schéma de la MÊME base jetable. En parallèle,
    // l'une effacerait le `public` que l'autre est en train d'utiliser — un échec intermittent,
    // le pire genre. En série, elles sont simplement lentes.
    fileParallelism: false,
  },
});
