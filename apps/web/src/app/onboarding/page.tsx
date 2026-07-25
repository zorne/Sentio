import Link from "next/link";
import { Logomark } from "@/components/Logomark";
import { OnboardingChat } from "@/components/OnboardingChat";

export default function OnboardingPage() {
  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/dashboard" className="brand">
            <Logomark />
            SENTIA
          </Link>
        </div>
      </nav>

      <section>
        <div className="container" style={{ maxWidth: 640 }}>
          <h1>Recrutez votre Employé IA</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 32 }}>
            Répondez à quelques questions, votre assistant configure votre premier
            Employé IA en fonction de votre activité.
          </p>
          <OnboardingChat />
        </div>
      </section>
    </>
  );
}
