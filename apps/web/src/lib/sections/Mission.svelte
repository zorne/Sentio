<script lang="ts">
  /**
   * Les trois engagements. Chacun est adossé à une contrainte réelle du dépôt
   * (`docs/23-proposition-de-valeur.md`) — une promesse sans preuve technique est un slogan, et un
   * slogan se copie.
   *
   * Réalise : ACQUIS-03
   */
  import { LIBELLES } from "$lib/labels";
</script>

<section id="mission">
  <h2>{LIBELLES.mission.titre}</h2>
  <p class="intro">{LIBELLES.mission.intro}</p>

  <ul>
    {#each LIBELLES.mission.engagements as engagement (engagement.titre)}
      <li>
        <h3>{engagement.titre}</h3>
        <p>{engagement.texte}</p>
      </li>
    {/each}
  </ul>
</section>

<style>
  section {
    padding: 3rem 0;
    border-top: 1px solid var(--trait);
  }

  h2 {
    font-size: 1.375rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
  }

  .intro {
    color: var(--gris);
    max-width: 60ch;
    margin: 0 0 2rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1.75rem;
  }

  h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.375rem;
  }

  li p {
    margin: 0;
    max-width: 66ch;
  }
</style>
