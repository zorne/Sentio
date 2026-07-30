<script lang="ts">
  /**
   * L'enveloppe de la vitrine : en-tête, navigation, pied de page.
   *
   * Elle affiche, elle ne décide rien — et elle ne contient aucun texte en dur : tout vient de
   * `$lib/labels.ts`, seul endroit où un texte visible peut vivre (`docs/17-lexique.md`).
   *
   * Registre : cabinet, pas plateforme technologique. Sobre, sans emphase commerciale.
   *
   * Réalise : ACQUIS-01
   */
  import { LIBELLES } from "$lib/labels";

  let { children } = $props();
</script>

<div class="page">
  <header>
    <a class="marque" href="/">
      <span class="nom">{LIBELLES.marque}</span>
      <span class="baseline">{LIBELLES.baseline}</span>
    </a>
    <nav>
      <a href="/#mission">{LIBELLES.navigation.mission}</a>
      <a href="/#deroulement">{LIBELLES.navigation.deroulement}</a>
    </nav>
  </header>

  <main>
    {@render children()}
  </main>

  <footer>
    <small>{LIBELLES.pied.droits}</small>
  </footer>
</div>

<style>
  :global(:root) {
    --encre: #17181a;
    --gris: #5f6368;
    --trait: #e3e4e6;
    --fond: #fbfbfa;
  }

  :global(body) {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 1rem;
    line-height: 1.6;
    color: var(--encre);
    background: var(--fond);
    -webkit-font-smoothing: antialiased;
  }

  .page {
    max-width: 48rem;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem;
  }

  header {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 2.5rem;
  }

  .marque {
    display: flex;
    flex-direction: column;
  }

  .nom {
    font-weight: 600;
    font-size: 1.0625rem;
    letter-spacing: 0.01em;
  }

  .baseline {
    color: var(--gris);
    font-size: 0.8125rem;
  }

  nav {
    display: flex;
    gap: 1.25rem;
    font-size: 0.9375rem;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  nav a {
    color: var(--gris);
  }

  nav a:hover,
  nav a:focus-visible {
    color: var(--encre);
    text-decoration: underline;
    text-underline-offset: 0.25em;
  }

  footer {
    margin-top: 4rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--trait);
    color: var(--gris);
  }
</style>
