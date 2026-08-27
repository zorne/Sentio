"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimTenantsForCurrentUser, confirmMagicLink } from "@/lib/auth-actions";

export function ConfirmLoginButton({
  code,
  destination,
}: {
  code: string;
  destination: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <button
        className="btn btn-primary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const { error } = await confirmMagicLink(code);
            if (error) {
              setError(error);
            } else {
              await claimTenantsForCurrentUser();
              // ⚠️ PAS « /dashboard ». Sans paramètre, cette page affiche le tenant de
              // DÉMONSTRATION : le client qui venait de payer voyait des prospects qui
              // n'étaient pas les siens (constat B2 de `docs/32`). Son espace, c'est `/espace`.
              router.push(destination);
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Connexion…" : "Terminer la connexion"}
      </button>
      {error && (
        <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 12 }}>
          {error} <a href="/login" style={{ color: "inherit" }}>Redemander un lien</a>
        </p>
      )}
    </>
  );
}
