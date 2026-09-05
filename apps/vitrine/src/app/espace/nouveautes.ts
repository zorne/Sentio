"use client";

// ════════════════════════════════════════════════════════════════════════════════════════════
// CE QUE LE DIRIGEANT N'A PAS ENCORE VU.
//
// ══ LA DEMANDE, ET LA TENSION QU'ELLE PORTE ══
//
// Demande du fondateur : *« je veux un petit point rouge comme une notification dès qu'elle fait
// quelque chose, pour forcer le client à regarder. »*
//
// ⚠️ PRIS AU PIED DE LA LETTRE, CE POINT ROUGE S'ÉTEINDRAIT TOUT SEUL EN DEUX JOURS.
//
// Le fondateur a lui-même tranché, le 2026-08-26 : *« une lumière permanente cesse d'être un
// signal, elle devient un décor »*. Et il vient de demander que l'employée travaille en
// permanence. Un point allumé sur « elle fait quelque chose » serait donc allumé TOUJOURS, donc
// invisible au bout de deux jours, donc inutile exactement le jour où il aurait compté.
//
// Ce qui garde sa force, c'est **ce qu'il n'a pas encore vu**. Le point s'allume à la première
// action nouvelle et s'éteint quand il a regardé. Il appelle donc pour une raison, et il a raison
// d'appeler.
//
// ══ POURQUOI DANS LE NAVIGATEUR, ET NON EN BASE ══
//
// « Vu » n'est pas un fait de l'entreprise : c'est un fait de la PERSONNE devant l'écran, et de
// cet écran-là. Le stocker en base créerait une table, une écriture à chaque ouverture de tiroir,
// et une question sans réponse le jour où deux personnes partagent un compte.
//
// Le pire qui puisse arriver ici est qu'un dirigeant qui change de navigateur revoie un point
// rouge une fois. Ça ne casse rien, et ça ne mérite pas une table.
//
// ⚠️ AUCUNE DONNÉE D'ENTREPRISE N'EST ÉCRITE. Uniquement un horodatage, sous une clé qui ne dit
// rien de plus que « la dernière fois que ce navigateur a regardé cette liste ».
// ════════════════════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";

/** Une par liste surveillée : ce qu'elle a fait, et ce qui attend une réponse. */
export type ListeSurveillee = "ce-quelle-a-fait" | "a-decider";

function cle(liste: ListeSurveillee, tenantId: string): string {
  return `sentio.vu.${liste}.${tenantId}`;
}

/**
 * Y a-t-il du nouveau depuis la dernière fois ?
 *
 * `empreinte` est ce qui identifie l'état courant de la liste : l'horodatage de l'élément le plus
 * récent, ou son nombre. Quand elle change, il y a du nouveau.
 *
 * ⚠️ Rend `false` au premier rendu, toujours. Le stockage du navigateur n'existe pas côté serveur,
 * et allumer le point avant de savoir s'il a déjà vu ferait clignoter la page au chargement, ce
 * qui est précisément l'effet qu'on veut éviter.
 */
export function useNouveaute(
  liste: ListeSurveillee,
  tenantId: string,
  empreinte: string | null,
): { readonly nouveau: boolean; readonly marquerVu: () => void } {
  const [vu, setVu] = useState<string | null>(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    try {
      setVu(window.localStorage.getItem(cle(liste, tenantId)));
    } catch {
      // Navigation privée, stockage refusé : on ne signale simplement rien. Un point rouge n'est
      // pas une fonctionnalité qui doit faire échouer une page.
    }
    setPret(true);
  }, [liste, tenantId]);

  const marquerVu = useCallback(() => {
    if (empreinte === null) return;
    setVu(empreinte);
    try {
      window.localStorage.setItem(cle(liste, tenantId), empreinte);
    } catch {
      // Idem : ne rien mémoriser vaut mieux qu'une erreur à l'écran.
    }
  }, [liste, tenantId, empreinte]);

  return { nouveau: pret && empreinte !== null && empreinte !== vu, marquerVu };
}
