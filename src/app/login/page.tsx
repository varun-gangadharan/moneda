// Sign Up / Sign In via Supabase Auth: email+password, magic link, OAuth
// (Google/GitHub). On success, redirect to /onboarding if onboarding is
// incomplete, else to /. See PLAN.md Phase 2.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedInEmail(data.user?.email ?? null));
  }, [supabase]);

  // Decide where to send a freshly-authenticated user (client-side profile read).
  async function go() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_status")
      .eq("supabase_user_id", data.user.id)
      .maybeSingle();
    router.push(profile?.onboarding_status === "complete" ? "/" : "/onboarding");
    router.refresh();
  }

  function reset() {
    setErr(null);
    setMsg(null);
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) await go();
        else setMsg("Account created. Check your email to confirm, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await go();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink() {
    reset();
    if (!email) return setErr("Enter your email first.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMsg("Magic link sent. Check your email.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not send magic link.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    reset();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSignedInEmail(null);
    router.refresh();
  }

  if (signedInEmail) {
    return (
      <main>
        <h1>Signed in</h1>
        <p style={{ color: "var(--muted)" }}>You are signed in as {signedInEmail}.</p>
        <p>
          <button onClick={go} style={btn}>Continue</button>{" "}
          <button onClick={signOut} style={btnGhost}>Sign out</button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>

      <form onSubmit={handlePassword}>
        <label style={lbl}>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />
        </label>
        <label style={lbl}>
          Password
          <input type="password" required minLength={6} value={password}
                 onChange={(e) => setPassword(e.target.value)} style={inp} />
        </label>
        <button type="submit" disabled={busy} style={btn}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>

      <p style={{ marginTop: 12 }}>
        <button onClick={handleMagicLink} disabled={busy} style={btnGhost}>Email me a magic link</button>
      </p>

      <hr style={{ borderColor: "#2a2a33", margin: "16px 0" }} />
      <button onClick={() => handleOAuth("google")} style={btnGhost}>Continue with Google</button>{" "}
      <button onClick={() => handleOAuth("github")} style={btnGhost}>Continue with GitHub</button>

      <p style={{ marginTop: 16, color: "var(--muted)" }}>
        {mode === "signin" ? "No account?" : "Have an account?"}{" "}
        <button onClick={() => { reset(); setMode(mode === "signin" ? "signup" : "signin"); }}
                style={linkBtn}>
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>

      {msg && <p style={{ color: "var(--accent)" }}>{msg}</p>}
      {err && <p style={{ color: "#ff6b6b" }}>{err}</p>}
    </main>
  );
}

const inp: React.CSSProperties = {
  display: "block", width: "100%", padding: "8px 10px", marginTop: 4,
  background: "#15151c", color: "var(--fg)", border: "1px solid #2a2a33", borderRadius: 8,
};
const lbl: React.CSSProperties = { display: "block", marginBottom: 12 };
const btn: React.CSSProperties = {
  padding: "10px 18px", borderRadius: 8, border: "none",
  background: "var(--accent)", color: "white", cursor: "pointer", fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8, border: "1px solid #2a2a33",
  background: "transparent", color: "var(--fg)", cursor: "pointer",
};
const linkBtn: React.CSSProperties = {
  background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0,
};
