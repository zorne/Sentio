import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les suites d'intégration partagent UNE base : elles consomment le même réservoir
    // d'identités (`reserve_identity`), écrivent dans les mêmes tables globales et créent des
    // versions d'ADN qui doivent rester uniques. En parallèle, elles se contredisent — et le
    // font par intermittence, ce qui est pire qu'un échec franc : on finit par relancer jusqu'à
    // ce que ce soit vert. En série, elles sont simplement plus lentes.
    fileParallelism: false,
  },
});
