"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmMagicLink } from "@/lib/auth-actions";

export function ConfirmLoginButton({ code }: { code: string }) {
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
              router.push("/");
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Connexion…" : "Terminer la connexion"}
      </button>
      {error && (
        <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 12 }}>
          {error} — <a href="/login" style={{ color: "inherit" }}>redemander un lien</a>
        </p>
      )}
    </>
  );
}
