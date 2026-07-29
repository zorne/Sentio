# supabase/functions/

**Les adaptateurs d'entrée.** Tout ce qui lit ou écrit une donnée personnelle passe par ici, et
s'exécute en **région UE**, dans le même projet que la base
([`adr/0021`](../../docs/adr/0021-execution-serveur-en-ue.md)).

```
supabase/functions/
  deno.json          la carte des imports et les options de rigueur (versionné)
  _shared/           le transport, écrit à la main (versionné)
  _generated/        les paquets partagés, recopiés — jamais versionné, jamais modifié à la main
  diagnostic/        index.ts (branchement) · handler.ts (traitement) · index.test.ts
```

---

## La règle, et elle seule

> Une fonction **valide** l'entrée, **appelle** le domaine, **répond**. Elle ne contient aucune
> règle métier.

C'est ce qui rend l'hébergement remplaçable : migrer, c'est réécrire des adaptateurs, jamais le
cœur. Le jour du départ vers un hébergeur européen classique, le travail est borné à **deux
endroits nommés d'avance** — l'adaptateur de sortie du cadre applicatif, et ces fonctions portées en
routes serveur. **Aucun fichier de `packages/` ne doit avoir à bouger.**

À relire à chaque revue, avec une question unique : *si je supprimais ce dossier, perdrais-je une
règle du produit ?* Si la réponse est oui, la règle est au mauvais endroit.

Concrètement, dans `diagnostic/handler.ts` : aucune ligne ne dit quel employé recommander, ce qui
est hors périmètre, ni ce qui manque pour décider. Tout cela est dans
[`packages/domain`](../../packages/domain/src/recommendation.ts), testé sans infrastructure.

---

## Le code partagé avec le domaine

Les fonctions écrivent `import { recommend } from "@sentio/domain"`, comme partout ailleurs. Ce que
cela suppose : une recopie générée, parce que Deno ne connaît ni l'espace de travail pnpm ni nos
extensions d'import ([`adr/0023`](../../docs/adr/0023-code-partage-vers-les-fonctions.md)).

```bash
pnpm run functions:sync
```

À relancer **après toute modification de `packages/domain` ou `packages/config`**, et avant tout
déploiement. Le dossier `_generated/` est effacé et reconstruit à chaque exécution : il n'existe
jamais d'état à moitié à jour, mais un dossier vieux d'hier reste un dossier vieux d'hier.

Seuls `domain` et `config` sont partagés : ils ne dépendent de rien et ne font aucune entrée/sortie.
Le script s'arrête si l'un d'eux se met à dépendre de quelque chose.

---

## Vérifier avant de déployer

```bash
pnpm run functions:sync
deno check --config supabase/functions/deno.json supabase/functions/diagnostic/index.ts
deno test  --config supabase/functions/deno.json --allow-env supabase/functions/diagnostic/
```

Les tests tournent **sous Deno**, comme la fonction : vérifier ce code dans un autre runtime que
celui de production reviendrait à vérifier autre chose. Ils construisent une `Request`, lisent la
`Response`, et n'ouvrent aucun port — d'où la séparation entre `index.ts` (le branchement) et
`handler.ts` (le traitement).

---

## Configuration

Chaque fonction est déclarée dans [`../config.toml`](../config.toml), une par une : une fonction qui
apparaîtrait sans décision serait une porte ouverte sans décision.

| Variable | Rôle | Défaut |
|---|---|---|
| `SENTIO_PUBLIC_DIAGNOSTIC_ENABLED` | ouvre le diagnostic public. `"true"` et rien d'autre l'ouvre | **fermé** |
| `SENTIO_ALLOWED_ORIGINS` | origines autorisées à appeler depuis un navigateur, séparées par des virgules | **aucune** |

Tout est **fermé par défaut** : un réglage oublié doit refuser, jamais ouvrir. Aucun secret ne vit
ici — ni dans le dépôt, ni dans un exemple (`AGENTS.md`, invariant 7).

---

## État

| Fonction | Ce qu'elle fait | Ce qui manque avant de l'ouvrir |
|---|---|---|
| `diagnostic` | rend la décision du moteur de recommandation pour un profil validé | `ACQUIS-17` limitation par visiteur et par adresse · `ACQUIS-22` écriture du calibrage · `ACQUIS-15` justification rédigée |

Tant que `ACQUIS-17` n'existe pas, le drapeau reste fermé et la fonction est inerte : une adresse
publique sans limitation de débit est une facture d'inférence offerte au premier robot qui passe.
La fonction n'appelle aujourd'hui **aucun fournisseur de modèle** et **ne conserve rien**.
