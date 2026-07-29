import adapter from "@sveltejs/adapter-static";

/**
 * Sortie **statique** aujourd'hui, sortie Node le jour de la migration
 * ([`adr/0022`](../../docs/adr/0022-interface-sveltekit.md)). C'est le seul fichier de l'interface
 * que ce changement touchera : le code des pages, lui, ne bouge pas.
 *
 * `fallback` sert l'espace privé, qui n'est pas prérendu et n'a aucune raison de l'être — il n'est
 * ni public ni référencé. Il s'exécute dans le navigateur et parle aux fonctions serveur en UE.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "200.html",
      precompress: false,
      strict: true,
    }),
    prerender: {
      // Un lien mort n'est pas un détail sur une vitrine : il fait échouer la construction.
      handleHttpError: "fail",
      handleMissingId: "fail",
    },
  },
};

export default config;
