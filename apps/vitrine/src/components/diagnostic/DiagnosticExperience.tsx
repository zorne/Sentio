"use client";

// ════════════════════════════════════════════════════════════════════
// ACQUIS-12 — l'expérience de diagnostic. Contrainte produit, aussi
// stricte que la technique : le visiteur ne doit jamais avoir
// l'impression de configurer un logiciel. Il doit avoir l'impression
// que Sentio réfléchit à son entreprise.
//
// ⚠️ 2026-08-28 — C'EST UNE VRAIE DISCUSSION, ET C'EST UN RENVERSEMENT ASSUMÉ.
//
// Ce fichier a longtemps REFUSÉ le fil de discussion : une seule ligne
// de Sentio à l'écran, grande, sérif, et le passé qui s'estompait en
// traînée. L'intention était bonne — ne pas ressembler à un formulaire.
// Elle a échoué à l'usage, pour deux raisons vues à l'écran :
//
//   1. le dirigeant ne pouvait pas RELIRE ce qu'il venait de dire, alors
//      qu'on lui demande de raconter son entreprise en plusieurs fois ;
//   2. la traînée grandissait au-delà de l'écran et passait par-dessus
//      le logo — un centrage vertical ne tient pas une conversation.
//
// Demande du fondateur : *« je veux que ce soit une vraie discussion,
// que l'interface ressemble à la nôtre, à une discussion avec Claude. »*
//
// Donc : un fil qui s'empile, ce qu'il a dit à droite, ce qu'elle
// répond à gauche, la saisie en bas, le fil qui défile. Ce qui est
// GARDÉ de l'ancienne intention : aucun avatar, aucun horodatage,
// aucune étape numérotée, aucun mot technique — la forme est celle
// d'une conversation, pas d'un tableau de bord.
//
// La présentation finale rompt délibérément avec tout ce qui précède :
// c'est le moment que toute la conversation prépare.
//
// Réalise : ACQUIS-12
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useTransition } from "react";
import { RecruitLink } from "@/components/landing/RecruitLink";
import { FormeQuiSePrecise } from "./FormeQuiSePrecise";
import { diagnosticTurn, type DiagnosticMessage, type EmployeePresentation } from "@/lib/diagnostic-actions";
import { enregistrerLeDiagnostic } from "@/lib/recrutement-actions";

const OUVERTURE = "Parlez-moi de votre entreprise.";

// Un exemple concret vaut mieux qu'une consigne : plutôt que d'expliquer ce qu'on attend, le
// placeholder du tout premier champ montre le format — quelques faits, pas un historique.
const EXEMPLE_PLACEHOLDER =
  "Ex. : une menuiserie de 8 personnes, on perd des devis faute de relance…";

/** Un tour de la discussion. « elle » est Lady, « moi » le dirigeant. */
type Message = { readonly de: "elle" | "moi"; readonly texte: string };

type Phase =
  | { readonly kind: "conversation" }
  | { readonly kind: "thinking" }
  | {
      readonly kind: "presentation";
      readonly presentation: EmployeePresentation;
      readonly profil: unknown;
    }
  | { readonly kind: "hors_perimetre"; readonly reason: string }
  | { readonly kind: "limite"; readonly message: string };

export function DiagnosticExperience() {
  const [messages, setMessages] = useState<readonly Message[]>([
    { de: "elle", texte: OUVERTURE },
  ]);
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "conversation" });
  const historyRef = useRef<DiagnosticMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const finRef = useRef<HTMLDivElement>(null);

  /** Combien de fois le dirigeant a répondu. Sert au décor d'ouverture, pas au comptage. */
  const repliques = messages.filter((m) => m.de === "moi").length;

  // Le fil suit toujours sa dernière ligne. Sans ça, la réponse arrive hors de l'écran et
  // l'échange donne l'impression de n'avoir rien produit.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, phase]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [phase]);

  // ⚠️ LE CHAMP GRANDIT AVEC CE QU'ON ÉCRIT, ET ÇA MANQUAIT.
  //
  // Il était figé sur une ligne : au-delà d'une phrase, le dirigeant écrivait dans une fente et
  // ne voyait plus le début de sa réponse. Sur un écran qui lui demande de raconter son
  // entreprise, c'est le contraire de ce qu'on lui demande de faire, et ça se répare en trois
  // lignes.
  //
  // La hauteur est remise à zéro AVANT d'être relue : sans ça, `scrollHeight` garde la hauteur
  // précédente et le champ ne redescend jamais quand on efface.
  useEffect(() => {
    const champ = textareaRef.current;
    if (champ === null) return;
    champ.style.height = "auto";
    champ.style.height = `${champ.scrollHeight}px`;
  }, [value]);

  async function submit() {
    const answer = value.trim();
    if (answer === "" || phase.kind === "thinking") return;

    const previousHistory = historyRef.current;
    historyRef.current = [...previousHistory, { role: "user", content: answer }];
    setValue("");
    // ⚠️ Affiché AVANT l'appel. Dans une discussion, ce qu'on vient d'envoyer doit apparaître
    // immédiatement : attendre la réponse pour montrer sa propre phrase donne l'impression que
    // l'envoi n'a pas marché, et fait recommencer.
    setMessages((m) => [...m, { de: "moi", texte: answer }]);
    setPhase({ kind: "thinking" });

    const result = await diagnosticTurn(historyRef.current);

    if (result.kind === "message") {
      historyRef.current = [...historyRef.current, { role: "assistant", content: result.reply }];
      setMessages((m) => [...m, { de: "elle", texte: result.reply }]);
      setPhase({ kind: "conversation" });
      return;
    }
    if (result.kind === "presentation") {
      setPhase({ kind: "presentation", presentation: result.presentation, profil: result.profil });
      return;
    }
    if (result.kind === "hors_perimetre") {
      setPhase({ kind: "hors_perimetre", reason: result.reason });
      return;
    }
    if (result.kind === "limite") {
      setPhase({ kind: "limite", message: result.message });
      return;
    }

    // "panne" : jamais un écran technique — une ligne de Sentio de plus, qui invite à
    // réessayer. La réponse du visiteur n'est pas perdue, ni son tour compté deux fois : on
    // retire le message qui n'a pas abouti de l'historique et on la remet dans le champ.
    historyRef.current = previousHistory;
    setValue(answer);
    // ⚠️ Le message est RETIRÉ du fil, pas doublé : sa phrase revient dans le champ, donc la
    // laisser aussi à l'écran la lui ferait envoyer deux fois.
    setMessages((m) => [...m.slice(0, -1), { de: "elle", texte: result.message }]);
    setPhase({ kind: "conversation" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  if (phase.kind === "presentation") {
    return <Presentation presentation={phase.presentation} profil={phase.profil} />;
  }

  if (phase.kind === "hors_perimetre") {
    return (
      <div className="diag-stage">
        <p className="diag-line">{phase.reason}</p>
        <RecruitLink href="/" className="diag-back">
          Retour à l&apos;accueil
        </RecruitLink>
      </div>
    );
  }

  if (phase.kind === "limite") {
    return (
      <div className="diag-stage">
        <p className="diag-line">{phase.message}</p>
        <RecruitLink href="/" className="diag-back">
          Retour à l&apos;accueil
        </RecruitLink>
      </div>
    );
  }

  return (
    <div className="dx">
      {/* ⚠️ La figure ne vit QUE sur l'ouverture. Derrière un fil de discussion, elle passerait
          sous les messages et deviendrait une texture sale ; sur l'écran d'accueil, encore vide,
          elle donne un centre à une page qui n'a qu'une phrase. Elle s'efface dès qu'on parle. */}
      {repliques === 0 ? <FormeQuiSePrecise etapes={0} /> : null}

      <div className="dx-fil">
        {messages.map((m, i) => (
          <div key={i} className={`dx-tour dx-tour--${m.de}`}>
            {/* Elle est nommée UNE fois par prise de parole, jamais par bulle : c'est ce qui
                distingue une conversation d'un journal de messagerie. */}
            {m.de === "elle" ? <span className="dx-qui">Lady</span> : null}
            <p className="dx-texte">{m.texte}</p>
          </div>
        ))}

        {/* Elle cherche : trois points, à sa place dans le fil. Une attente muette se lit comme
            une panne, et une attente affichée ailleurs qu'à sa place dans le fil se lit comme un
            chargement de page. */}
        {phase.kind === "thinking" ? (
          <div className="dx-tour dx-tour--elle">
            <span className="dx-qui">Lady</span>
            <span className="dx-cherche" aria-label="Lady réfléchit">
              <i /><i /><i />
            </span>
          </div>
        ) : null}

        <div ref={finRef} />
      </div>

      <div className="dx-bas">
        <div className="dx-saisie">
          <textarea
            ref={textareaRef}
            className="dx-champ"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={repliques === 0 ? EXEMPLE_PLACEHOLDER : "Écrivez votre réponse…"}
            rows={1}
            disabled={phase.kind === "thinking"}
          />
          <button
            className="dx-envoyer"
            onClick={submit}
            disabled={phase.kind === "thinking" || value.trim() === ""}
            aria-label="Envoyer"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                d="M12 19V5m0 0l-6 6m6-6l6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* ⚠️ UNE SEULE PHRASE, ET ELLE RESTE VISIBLE TOUT DU LONG.
            Il y en avait deux : une réassurance générale, et un indice qui disait presque la même
            chose sous une autre forme. Deux textes qui se répètent sous une ligne de saisie ne
            rassurent pas deux fois, ils font douter du premier.

            Celle qui reste est la plus PRÉCISE pour ce moment-là. Et elle ne disparaît pas après
            la première réponse : elle disparaissait exactement au moment où il en disait le plus. */}
        <p className="dx-donnees">
          Rien n&apos;est conservé tant que vous n&apos;avez pas recruté. Ce que vous dites sert
          tout de suite, et uniquement, à composer l&apos;employé qu&apos;on va vous présenter.
        </p>
      </div>
    </div>
  );
}


function Presentation({
  presentation,
  profil,
}: {
  presentation: EmployeePresentation;
  profil: unknown;
}) {
  return (
    <div className="diag-present">
      <span className="diag-present-eyebrow">Le profil recommandé</span>
      <h1 className="diag-present-name">{presentation.firstName}</h1>
      <p className="diag-present-title">{presentation.title}</p>

      <div className="diag-present-block">
        <span className="diag-present-label">Mission</span>
        <p className="diag-present-mission">{presentation.mission}</p>
      </div>

      <div className="diag-present-block">
        <span className="diag-present-label">Ce qu&apos;il ferait</span>
        <ul className="diag-present-list">
          {presentation.whatTheyDo.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>

      <p className="diag-present-why">{presentation.whyRecommended}</p>
      <p className="diag-present-outcome">{presentation.expectedOutcome}</p>

      <Recruter prenom={presentation.firstName} profil={profil} />
    </div>
  );
}

/**
 * Le pas suivant : on enregistre le diagnostic, puis on emmène vers les formules.
 *
 * ⚠️ ON N'ENVOIE PAS LE PROFIL DANS L'ADRESSE. Il est écrit en base d'abord, et seul son
 * identifiant voyage. Un profil qui traverserait deux pages par la barre d'adresse serait long,
 * lisible par-dessus l'épaule, et surtout modifiable entre les deux.
 *
 * ⚠️ Et c'est la forme que prendra le parcours PAYANT : la recommandation existe avant, le
 * paiement la consomme. Le jour où le prestataire est branché, c'est lui qui s'intercale ici, et
 * rien d'autre ne bouge.
 */
function Recruter({ prenom, profil }: { prenom: string; profil: unknown }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="diag-recrute">
      <button
        className="lp-btn lp-btn--primary diag-present-cta"
        disabled={pending}
        onClick={() => {
          setErreur(null);
          startTransition(async () => {
            const resultat = await enregistrerLeDiagnostic({ profil });
            if ("erreur" in resultat) {
              setErreur(resultat.erreur);
              return;
            }
            window.location.href = `/formules?reco=${resultat.recommandation}`;
          });
        }}
      >
        {pending ? "Un instant…" : `Recruter ${prenom}`}
      </button>
      {erreur !== null && <p className="diag-recrute-erreur">{erreur}</p>}
      <p className="diag-recrute-note">
        Vous choisirez ensuite jusqu&apos;où il travaille pour vous. Aucun moyen de paiement ne
        vous sera demandé.
      </p>
    </div>
  );
}
