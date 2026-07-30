<script lang="ts">
  /**
   * L'accueil de la vitrine : ouverture, engagements, déroulement.
   *
   * Cette page **assemble**, elle ne rédige pas. Chaque section est un composant qui affiche des
   * libellés ; aucune n'accède à une donnée, et la page entière est prérendue — elle ne peut donc
   * pas, par construction, toucher une donnée client (adr/0021, règle 1).
   *
   * Restent à écrire dans ce lot : la démonstration scriptée, la section tarifs — en attente du
   * prix, non tranché — et les pages légales.
   */
  import Deroulement from "$lib/sections/Deroulement.svelte";
  import Hero from "$lib/sections/Hero.svelte";
  import Mission from "$lib/sections/Mission.svelte";
  import { LIBELLES } from "$lib/labels";
</script>

<svelte:head>
  <title>{LIBELLES.marque} — {LIBELLES.baseline}</title>
  <meta name="description" content={LIBELLES.hero.sousTitre} />
</svelte:head>

<Hero />
<Mission />
<Deroulement />
