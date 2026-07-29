<script lang="ts">
  /**
   * Accueil de la vitrine — **squelette assumé**. Les sections (Hero, Mission, démonstration
   * scriptée, tarifs) sont les tâches `ACQUIS-01` → `ACQUIS-11` : elles ne sont pas ébauchées ici,
   * parce qu'une ébauche de page de vente finit toujours par être prise pour la page de vente.
   *
   * Ce que cette page prouve aujourd'hui : la vitrine se construit en sortie statique, elle ne
   * touche aucune donnée, et aucun de ses textes n'est écrit dans un composant.
   */
  import { LIBELLES } from "$lib/labels";
</script>

<svelte:head>
  <title>{LIBELLES.marque}</title>
</svelte:head>

<section>
  <h1>{LIBELLES.accueil.titre}</h1>
  <p>{LIBELLES.accueil.sousTitre}</p>
  <p class="chantier">{LIBELLES.accueil.enConstruction}</p>
</section>

<style>
  h1 {
    font-size: 1.75rem;
    font-weight: 600;
    margin: 0 0 1rem;
  }

  .chantier {
    color: #6b6b6b;
  }
</style>
