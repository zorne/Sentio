<script lang="ts">
  /**
   * La section d'ouverture de la vitrine.
   *
   * Elle affiche, elle ne décide rien, et elle ne contient aucun texte : tout vient de
   * `$lib/labels.ts` (adr/0022, règles 1 et 3).
   *
   * Réalise : ACQUIS-02
   */
  import { LIBELLES } from "$lib/labels";
</script>

<section class="hero">
  <h1>{LIBELLES.hero.titre}</h1>
  <p class="sous-titre">{LIBELLES.hero.sousTitre}</p>
  <p class="precision">{LIBELLES.hero.precision}</p>
</section>

<style>
  .hero {
    padding: 1rem 0 3rem;
  }

  h1 {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.01em;
    margin: 0 0 1.25rem;
    max-width: 30ch;
  }

  .sous-titre {
    font-size: 1.125rem;
    max-width: 54ch;
    margin: 0 0 0.75rem;
  }

  .precision {
    color: var(--gris);
    margin: 0;
  }
</style>
