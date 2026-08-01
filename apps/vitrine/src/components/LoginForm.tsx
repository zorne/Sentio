"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <p style={{ color: "var(--green)", fontSize: 13.5 }}>
        Lien envoyé à <strong>{email}</strong>. Ouvrez votre boîte mail pour vous connecter.
      </p>
    );
  }

  return (
    <form className="form-inline" onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="votre@email.fr"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <button className="btn btn-primary" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Envoi…" : "Envoyer le lien"}
      </button>
      {error && (
        <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8, width: "100%" }}>{error}</p>
      )}
    </form>
  );
}
