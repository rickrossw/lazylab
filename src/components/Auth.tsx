"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { OAUTH_PROVIDERS, siteUrl, supabase, type OAuthProvider } from "@/lib/supabase";
import { loadProgress, mergeProgress, normalizeProgress, onProgressChange, saveProgress, type Progress } from "@/lib/progress";

type SyncState = "idle" | "syncing" | "synced" | "error";

interface AuthCtx {
  enabled: boolean;
  user: User | null;
  ready: boolean;
  sync: SyncState;
  openSignIn: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ enabled: false, user: null, ready: true, sync: "idle", openSignIn: () => {}, signOut: async () => {} });
export const useAuth = () => useContext(Ctx);

async function pushProgress(userId: string, p: Progress) {
  if (!supabase) return;
  const { error } = await supabase.from("progress").upsert({ user_id: userId, data: p, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function pullAndMerge(userId: string): Promise<Progress> {
  if (!supabase) return loadProgress();
  const { data, error } = await supabase.from("progress").select("data").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const merged = mergeProgress(loadProgress(), normalizeProgress(data?.data as Partial<Progress> | undefined));
  saveProgress(merged);
  return merged;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [sync, setSync] = useState<SyncState>("idle");
  const [modal, setModal] = useState<null | "signin" | "recovery">(null);
  const userRef = useRef<User | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const syncNow = useCallback(async (u: User) => {
    setSync("syncing");
    try {
      const merged = await pullAndMerge(u.id);
      await pushProgress(u.id, merged);
      setSync("synced");
    } catch {
      setSync("error");
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      userRef.current = u;
      setUser(u);
      setReady(true);
      if (u) syncNow(u);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      const changed = u?.id !== userRef.current?.id;
      userRef.current = u;
      setUser(u);
      if (event === "PASSWORD_RECOVERY") setModal("recovery");
      if (u && changed) syncNow(u);
      if (!u) setSync("idle");
    });
    // Mirror every local progress change to the server (debounced).
    const off = onProgressChange((p) => {
      const u = userRef.current;
      if (!u) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setSync("syncing");
        pushProgress(u.id, p).then(() => setSync("synced"), () => setSync("error"));
      }, 1200);
    });
    return () => {
      sub.subscription.unsubscribe();
      off();
    };
  }, [syncNow]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setUser(null);
    setSync("idle");
  }, []);

  return (
    <Ctx.Provider value={{ enabled: !!supabase, user, ready, sync, openSignIn: () => setModal("signin"), signOut }}>
      {children}
      {modal && <AuthModal mode={modal} onClose={() => setModal(null)} />}
    </Ctx.Provider>
  );
}

function AuthModal({ mode: initial, onClose }: { mode: "signin" | "recovery"; onClose: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "recovery">(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: siteUrl() } });
        if (error) throw error;
        if (data.session) onClose();
        else setMsg({ text: "Check your inbox to confirm your email, then sign in. Your guest progress will merge into your account." });
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
        if (error) throw error;
        setMsg({ text: "If that email has an account, a reset link is on its way." });
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMsg({ text: "Password updated. You're signed in." });
        window.setTimeout(onClose, 1200);
      }
    } catch (err) {
      setMsg({ text: (err as Error).message || "Something went wrong. Please try again.", bad: true });
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: OAuthProvider) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: siteUrl() } });
    if (error) setMsg({ text: error.message, bad: true });
  };

  const title = { signin: "Sign in", signup: "Create your account", reset: "Reset your password", recovery: "Choose a new password" }[mode];
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal auth-modal" role="dialog" aria-label={title}>
        <div className="panel-body" style={{ padding: 24 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <h2 style={{ margin: 0, fontSize: "1.6rem" }}>{title}</h2>
            <span className="spacer" />
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          {(mode === "signin" || mode === "signup") && (
            <p className="muted" style={{ fontSize: 14.5 }}>
              Optional. LazyLab is free to play as a guest, and your progress is saved on this device. Sign in to sync it
              across devices.
            </p>
          )}
          {(mode === "signin" || mode === "signup") && OAUTH_PROVIDERS.length > 0 && (
            <div className="stack" style={{ marginBottom: 14 }}>
              {OAUTH_PROVIDERS.map((p) => (
                <button key={p} className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => oauth(p)}>
                  Continue with {p === "github" ? "GitHub" : "Google"}
                </button>
              ))}
              <div className="muted" style={{ textAlign: "center", fontSize: 13 }}>or with email</div>
            </div>
          )}
          <form className="auth-form" onSubmit={submit}>
            {mode !== "recovery" && (
              <label>
                Email
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {msg && (
              <div className={`feedback${msg.bad ? " bad" : ""}`} role="status" style={{ marginTop: 0 }}>
                {msg.text}
              </div>
            )}
            <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
              {busy ? "One moment…" : { signin: "Sign in", signup: "Create account", reset: "Send reset link", recovery: "Save password" }[mode]}
            </button>
          </form>
          <div className="row" style={{ marginTop: 14, fontSize: 14 }}>
            {mode === "signin" && (
              <>
                <button className="linkish" onClick={() => setMode("signup")}>Create an account</button>
                <span className="spacer" />
                <button className="linkish" onClick={() => setMode("reset")}>Forgot password?</button>
              </>
            )}
            {(mode === "signup" || mode === "reset") && (
              <button className="linkish" onClick={() => setMode("signin")}>← Back to sign in</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AccountButton() {
  const { enabled, user, ready, sync, openSignIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (!enabled || !ready) return null;
  if (!user) {
    return (
      <button className="btn small" onClick={openSignIn}>
        Sign in
      </button>
    );
  }
  const label = { idle: "", syncing: "Syncing…", synced: "Progress synced", error: "Sync failed, will retry" }[sync];
  return (
    <div style={{ position: "relative" }}>
      <button className="account-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account menu">
        {(user.email ?? "?")[0].toUpperCase()}
        <span className={`sync-dot ${sync}`} aria-hidden />
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div style={{ fontWeight: 600, wordBreak: "break-all" }}>{user.email}</div>
          <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>{label}</div>
          <button className="btn small" style={{ width: "100%", justifyContent: "center" }} onClick={() => { setOpen(false); signOut(); }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
