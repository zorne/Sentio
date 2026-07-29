<script lang="ts">
  /**
   * L'enveloppe de la vitrine. Elle affiche, elle ne décide rien — et elle ne contient aucun texte
   * en dur : tout vient de `$lib/labels.ts`, seul endroit où un texte visible peut vivre.
   */
  import { LIBELLES } from "$lib/labels";

  let { children } = $props();
</script>

<div class="page">
  <header>
    <a class="marque" href="/">{LIBELLES.marque}</a>
    <nav>
      <a href="/">{LIBELLES.navigation.accueil}</a>
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
  /* Sobre, sans emphase : le registre est celui d'un cabinet (docs/17-lexique.md, « Ton »). */
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    line-height: 1.5;
    color: #1a1a1a;
    background: #ffffff;
  }

  .page {
    max-width: 46rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 2rem;
  }

  .marque {
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  nav a:hover {
    text-decoration: underline;
  }

  footer {
    margin-top: 4rem;
    color: #6b6b6b;
  }
</style>
