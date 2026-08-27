"use client";

// ════════════════════════════════════════════════════════════════════
// ACQUIS-12 — l'expérience de diagnostic. Contrainte produit, aussi
// stricte que la technique : le visiteur ne doit jamais avoir
// l'impression de configurer un logiciel. Il doit avoir l'impression
// que Sentio réfléchit à son entreprise.
//
// Ce que ce composant REFUSE, volontairement :
//   · un formulaire déguisé en chat (aucun champ nommé, aucune étape
//     numérotée, aucun choix de catégorie/secteur imposé en premier) ;
//   · un historique façon SaaS (bulles gauche/droite, avatars,
//     horodatages) — les échanges passés s'estompent en une traînée
//     discrète, pas un journal ;
//   · tout mot technique visible (« IA », « prompt », « modèle »).
//
// Une seule ligne de Sentio est à l'écran à la fois, grande, sérif —
// le même vocabulaire visuel que le Seuil de la landing (lp-th-title).
// La présentation finale rompt délibérément avec tout ce qui précède :
// c'est le moment que toute la conversation prépare.
//
// Réalise : ACQUIS-12
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useTransition } from "react";
import { RecruitLink } from "@/components/landing/RecruitLink";
import { diagnosticTurn, type DiagnosticMessage, type EmployeePresentation } from "@/lib/diagnostic-actions";
import { recruterDepuisLeDiagnostic } from "@/lib/recrutement-actions";

const OUVERTURE = "Parlez-moi de votre entreprise.";

// Un exemple concret vaut mieux qu'une consigne : plutôt que d'expliquer ce qu'on attend, le
// placeholder du tout premier champ montre le format — quelques faits, pas un historique.
const EXEMPLE_PLACEHOLDER =
  "Ex. : une menuiserie de 8 personnes, on perd des devis faute de relance…";

type Exchange = { readonly question: string; readonly answer: string };

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
  const [trail, setTrail] = useState<Exchange[]>([]);
  const [prompt, setPrompt] = useState(OUVERTURE);
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "conversation" });
  const historyRef = useRef<DiagnosticMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [phase]);

  async function submit() {
    const answer = value.trim();
    if (answer === "" || phase.kind === "thinking") return;

    const askedPrompt = prompt;
    const previousHistory = historyRef.current;
    historyRef.current = [...previousHistory, { role: "user", content: answer }];
    setValue("");
    setPhase({ kind: "thinking" });

    const result = await diagnosticTurn(historyRef.current);

    if (result.kind === "message") {
      historyRef.current = [...historyRef.current, { role: "assistant", content: result.reply }];
      setTrail((t) => [...t, { question: askedPrompt, answer }]);
      setPrompt(result.reply);
      setPhase({ kind: "conversation" });
      return;
    }
    if (result.kind === "presentation") {
      setTrail((t) => [...t, { question: askedPrompt, answer }]);
      setPhase({ kind: "presentation", presentation: result.presentation, profil: result.profil });
      return;
    }
    if (result.kind === "hors_perimetre") {
      setTrail((t) => [...t, { question: askedPrompt, answer }]);
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
    setPrompt(result.message);
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
    <div className="diag-stage">
      {trail.length > 0 && (
        <div className="diag-trail" aria-hidden="true">
          {trail.slice(-3).map((ex, i, arr) => (
            <div className="diag-trail-item" key={i} style={{ opacity: 0.28 + (i / arr.length) * 0.3 }}>
              <p className="diag-trail-q">{ex.question}</p>
              <p className="diag-trail-a">{ex.answer}</p>
            </div>
          ))}
        </div>
      )}

      {phase.kind === "thinking" ? (
        <div className="diag-thinking" key="thinking">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <p className="diag-line" key={prompt}>
          {prompt}
        </p>
      )}

      <div className="diag-input-row">
        <textarea
          ref={textareaRef}
          className="diag-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={trail.length === 0 ? EXEMPLE_PLACEHOLDER : "Écrivez votre réponse…"}
          rows={1}
          disabled={phase.kind === "thinking"}
        />
        <button
          className="diag-send"
          onClick={submit}
          disabled={phase.kind === "thinking" || value.trim() === ""}
          aria-label="Envoyer"
        >
          →
        </button>
      </div>
      {trail.length === 0 && phase.kind !== "thinking" && (
        <p className="diag-hint">
          Rien n&apos;est conservé. Ce que vous dites sert uniquement, et tout de suite, à calibrer
          l&apos;employé numérique qu&apos;on va vous présenter.
        </p>
      )}
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
 * Le dernier pas : ce que le dirigeant donne de lui.
 *
 * ⚠️ DEUX CHAMPS, ET PAS UN DE PLUS. Tout le reste est déjà su : la conversation a extrait son
 * secteur, sa cible, son objectif et ce qui le bloque. Redemander ce qu'on sait déjà donne le
 * sentiment de n'avoir pas été écouté, juste après vingt minutes passées à être écouté.
 *
 * ⚠️ Et on ne demande RIEN avant d'avoir montré l'employée. Un formulaire posé plus tôt
 * transformerait le diagnostic en collecte d'adresses, ce qu'il n'est pas.
 */
function Recruter({ prenom, profil }: { prenom: string; profil: unknown }) {
  const [entreprise, setEntreprise] = useState("");
  const [email, setEmail] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [parti, setParti] = useState<{ prenom: string; adresse: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (parti !== null) {
    return (
      <div className="diag-recrute">
        <span className="diag-present-eyebrow">C&apos;est fait</span>
        <p className="diag-recrute-mot">
          {parti.prenom} a rejoint votre entreprise. Nous venons d&apos;écrire à{" "}
          <strong>{parti.adresse}</strong> : ce message vous explique ce qu&apos;elle fera, ce
          qu&apos;elle ne fera jamais, et comment entrer chez vous.
        </p>
        <p className="diag-recrute-note">
          Ouvrez-le et choisissez votre mot de passe. Le lien qu&apos;il contient ne fonctionne
          qu&apos;une fois.
        </p>
      </div>
    );
  }

  return (
    <form
      className="diag-recrute"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        setErreur(null);
        startTransition(async () => {
          const resultat = await recruterDepuisLeDiagnostic({ profil }, { entreprise, email });
          if (resultat.kind === "refus") {
            setErreur(resultat.message);
            return;
          }
          setParti({ prenom: resultat.prenom, adresse: resultat.adresse });
        });
      }}
    >
      <span className="diag-present-eyebrow">Pour lui donner votre entreprise</span>
      <input
        type="text"
        placeholder="Le nom de votre entreprise"
        aria-label="Le nom de votre entreprise"
        value={entreprise}
        onChange={(evenement) => setEntreprise(evenement.target.value)}
        required
        disabled={pending}
      />
      <input
        type="email"
        placeholder="Votre adresse email"
        aria-label="Votre adresse email"
        value={email}
        onChange={(evenement) => setEmail(evenement.target.value)}
        required
        disabled={pending}
      />
      <button className="lp-btn lp-btn--primary diag-present-cta" type="submit" disabled={pending}>
        {pending ? "Un instant…" : `Recruter ${prenom}`}
      </button>
      {erreur !== null && <p className="diag-recrute-erreur">{erreur}</p>}
      <p className="diag-recrute-note">
        Vous recevrez sa présentation par email. Rien ne part vers vos clients tant que vous
        n&apos;avez pas donné votre accord.
      </p>
    </form>
  );
}
