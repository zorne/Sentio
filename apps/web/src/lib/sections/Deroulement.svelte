<script lang="ts">
  /**
   * Le parcours, dans son ordre réel (`docs/07-parcours-produit.md`).
   *
   * La dernière ligne dit l'état du produit : le diagnostic n'est pas ouvert. Annoncer un parcours
   * qu'on ne peut pas suivre ferait mentir la première page — et un visiteur qui découvre un
   * bouton mort ne revient pas.
   *
   * Réalise : ACQUIS-05
   */
  import { LIBELLES } from "$lib/labels";
</script>

<section id="deroulement">
  <h2>{LIBELLES.deroulement.titre}</h2>

  <ol>
    {#each LIBELLES.deroulement.etapes as etape (etape.titre)}
      <li>
        <h3>{etape.titre}</h3>
        <p>{etape.texte}</p>
      </li>
    {/each}
  </ol>

  <p class="chantier">{LIBELLES.chantier.diagnosticFerme}</p>
</section>

<style>
  section {
    padding: 3rem 0;
    border-top: 1px solid var(--trait);
  }

  h2 {
    font-size: 1.375rem;
    font-weight: 600;
    margin: 0 0 2rem;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    counter-reset: etape;
    display: grid;
    gap: 1.5rem;
  }

  li {
    counter-increment: etape;
    display: grid;
    grid-template-columns: 2rem 1fr;
    align-items: baseline;
  }

  li::before {
    content: counter(etape);
    color: var(--gris);
    font-variant-numeric: tabular-nums;
  }

  h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.25rem;
  }

  li p {
    margin: 0;
    color: var(--gris);
    max-width: 60ch;
  }

  .chantier {
    margin: 2.5rem 0 0;
    padding: 0.75rem 1rem;
    border-left: 2px solid var(--trait);
    color: var(--gris);
  }
</style>
