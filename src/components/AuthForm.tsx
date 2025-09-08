"use client";

import * as React from "react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient, Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  LogIn,
  UserPlus,
  LockKeyhole,
  CircleUserRound,
  Check,
  MailCheck,
} from "lucide-react";

type AuthFormProps = {
  className?: string;
  onSuccessRedirectTo?: string;
  initialTab?: "sign-in" | "sign-up";
};

type ProfileRecord = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export default function AuthForm({
  className,
  onSuccessRedirectTo = "/chat",
  initialTab = "sign-in",
}: AuthFormProps) {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      // We don't throw to avoid SSR crashes; we'll surface a UI error later.
      return null;
    }
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }, []);

  const [activeTab, setActiveTab] = useState<"sign-in" | "sign-up">(initialTab);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Sign in form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign up form state
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [suUsername, setSuUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  // Prefill email between tabs for UX continuity
  useEffect(() => {
    if (activeTab === "sign-up" && !suEmail && email) setSuEmail(email);
    if (activeTab === "sign-in" && !email && suEmail) setEmail(suEmail);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // If already authenticated, redirect
  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        router.replace(onSuccessRedirectTo);
      }
    };
    checkSession();
    return () => {
      mounted = false;
    };
  }, [router, onSuccessRedirectTo, supabase]);

  // Basic validators
  const isValidEmail = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  const hasStrongPassword = (val: string) => val.length >= 8;

  const slugify = (name: string) =>
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s_-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 24);

  const generateCandidateUsernames = (base: string, max = 10) => {
    const list: string[] = [];
    const root = slugify(base) || "user";
    list.push(root);
    for (let i = 0; i < max - 1; i++) {
      const suffix = Math.random().toString(36).slice(2, 6);
      list.push(`${root}_${suffix}`);
    }
    return list;
  };

  // Live username availability check (debounced)
  useEffect(() => {
    if (!supabase) return;
    const raw = suUsername;
    const cleaned = slugify(raw);
    if (!raw) {
      setUsernameStatus("idle");
      return;
    }
    if (!cleaned || cleaned.length < 2) {
      setUsernameStatus("invalid");
      return;
    }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleaned)
        .limit(1);
      if (error) {
        // treat as idle to avoid blocking
        setUsernameStatus("idle");
        return;
      }
      setUsernameStatus(!data || data.length === 0 ? "available" : "taken");
    }, 400);
    return () => clearTimeout(t);
  }, [suUsername, supabase]);

  const ensureUniqueUsername = useCallback(
    async (candidateBase: string): Promise<string> => {
      if (!supabase) return slugify(candidateBase) || `user_${Date.now()}`;
      const candidates = generateCandidateUsernames(candidateBase, 12);
      for (const username of candidates) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", username)
          .limit(1);
        if (error) {
          // If read error, fallback to the first candidate to avoid signup blockage
          return candidates[0];
        }
        if (!data || data.length === 0) {
          return username;
        }
      }
      return `${slugify(candidateBase) || "user"}_${Date.now().toString(36)}`;
    },
    [supabase]
  );

  const upsertProfile = useCallback(
    async (userId: string, username: string, name: string) => {
      if (!supabase) return;
      const now = new Date().toISOString();
      const payload: ProfileRecord = {
        id: userId,
        username,
        display_name: name,
        updated_at: now,
      };
      // Prefer upsert to be idempotent
      await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    },
    [supabase]
  );

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    if (!supabase) {
      setGlobalError(
        "Configuration error: Supabase is not initialized. Check environment variables."
      );
      toast("Configuration error", {
        description:
          "Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    if (!isValidEmail(email)) {
      setGlobalError("Please enter a valid email address.");
      return;
    }
    if (!hasStrongPassword(password)) {
      setGlobalError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setGlobalError(error.message);
        toast("Sign in failed", { description: error.message });
        return;
      }
      const session: Session | null = data.session ?? null;
      toast("Welcome back", {
        description: "You have signed in successfully.",
        icon: <Check className="h-4 w-4 text-primary" />,
      });
      if (session?.user) {
        router.replace(onSuccessRedirectTo);
      } else {
        // Fallback: refresh session
        router.refresh();
      }
    } catch (err: any) {
      const msg = err?.message || "Unexpected error during sign in.";
      setGlobalError(msg);
      toast("Sign in error", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    if (!supabase) {
      setGlobalError(
        "Configuration error: Supabase is not initialized. Check environment variables."
      );
      toast("Configuration error", {
        description:
          "Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    const name = displayName.trim();
    if (!name || name.length < 2) {
      setGlobalError("Display name must be at least 2 characters.");
      return;
    }
    if (!isValidEmail(suEmail)) {
      setGlobalError("Please enter a valid email address.");
      return;
    }
    if (!hasStrongPassword(suPassword)) {
      setGlobalError("Password must be at least 8 characters.");
      return;
    }
    if (suPassword !== suConfirm) {
      setGlobalError("Passwords do not match.");
      return;
    }

    const cleanedUsername = slugify(suUsername);
    if (!cleanedUsername || cleanedUsername.length < 2) {
      setGlobalError("Please choose a valid username (letters/numbers/underscores).");
      return;
    }
    // Final availability check just before submission
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanedUsername)
      .limit(1);
    if (existing && existing.length > 0) {
      setGlobalError("Username is already taken. Please choose another.");
      return;
    }

    setLoading(true);
    try {
      const desiredUsername = cleanedUsername;
      const { data, error } = await supabase.auth.signUp({
        email: suEmail.trim(),
        password: suPassword,
        options: {
          data: {
            display_name: name,
            username: desiredUsername,
          },
        },
      });

      if (error) {
        setGlobalError(error.message);
        toast("Sign up failed", { description: error.message });
        setLoading(false);
        return;
      }

      const user = data.user ?? null;
      const session = data.session ?? null;

      if (user) {
        // Create or update profile row. If RLS requires auth, we should have a session.
        try {
          await upsertProfile(user.id, desiredUsername, name);
        } catch {
          // Non-fatal: profile creation can be deferred by a server function if needed
        }
      }

      if (session?.user) {
        toast("Account created", {
          description: "Welcome! Redirecting to your chats...",
          icon: <Check className="h-4 w-4 text-primary" />,
        });
        router.replace(onSuccessRedirectTo);
      } else {
        toast("Check your email", {
          description:
            "We sent you a confirmation link to verify your account.",
          icon: <MailCheck className="h-4 w-4 text-primary" />,
        });
        setActiveTab("sign-in");
      }
    } catch (err: any) {
      const msg = err?.message || "Unexpected error during sign up.";
      setGlobalError(msg);
      toast("Sign up error", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading;

  return (
    <section
      className={[
        "w-full max-w-md",
        "rounded-2xl",
        "bg-card",
        "shadow-sm",
        "border border-border",
        "p-6 sm:p-8",
        "transition-colors",
        className || "",
      ].join(" ")}
      aria-label="Authentication form"
    >
      <header className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold leading-tight truncate">
              Welcome to Whisper
            </h2>
            <p className="text-muted-foreground text-sm">
              Secure, simple messaging for everyone.
            </p>
          </div>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "sign-in" | "sign-up")}
        className="w-full"
      >
        <TabsList className="grid grid-cols-2 w-full bg-muted">
          <TabsTrigger value="sign-in" className="data-[state=active]:bg-card">
            <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
            Sign In
          </TabsTrigger>
          <TabsTrigger value="sign-up" className="data-[state=active]:bg-card">
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Sign Up
          </TabsTrigger>
        </TabsList>

        <div className="mt-6 sm:mt-8 space-y-1">
          {globalError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 text-destructive px-3.5 py-2.5 text-sm"
            >
              {globalError}
            </div>
          ) : null}
        </div>

        <TabsContent value="sign-in" className="mt-4">
          <form onSubmit={handleSignIn} className="space-y-4 sm:space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground"
              >
                Email
              </label>
              <div className="relative">
                <CircleUserRound
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-10 py-2.5 text-sm outline-none ring-0 placeholder:text-muted-foreground/70 focus:border-input focus:ring-2 focus:ring-ring transition-shadow"
                  placeholder="you@example.com"
                  aria-invalid={!!globalError && !isValidEmail(email)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-10 py-2.5 text-sm outline-none ring-0 placeholder:text-muted-foreground/70 focus:border-input focus:ring-2 focus:ring-ring transition-shadow"
                  placeholder="••••••••"
                  aria-invalid={!!globalError && !hasStrongPassword(password)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use at least 8 characters.
              </p>
            </div>

            <button
              type="submit"
              disabled={disabled}
              className={[
                "inline-flex w-full items-center justify-center gap-2",
                "rounded-lg bg-primary text-primary-foreground",
                "px-4 py-2.5 text-sm font-semibold",
                "shadow-sm hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-ring",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                "transition-all",
              ].join(" ")}
              aria-busy={loading}
            >
              {loading ? (
                <span className="relative flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/60 border-t-transparent" />
                  Signing in...
                </span>
              ) : (
                <>
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Sign In
                </>
              )}
            </button>
          </form>
        </TabsContent>

        <TabsContent value="sign-up" className="mt-4">
          <form onSubmit={handleSignUp} className="space-y-4 sm:space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="displayName"
                className="block text-sm font-medium text-foreground"
              >
                Display name
              </label>
              <div className="relative">
                <CircleUserRound
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-10 py-2.5 text-sm outline-none ring-0 placeholder:text-muted-foreground/70 focus:border-input focus:ring-2 focus:ring-ring transition-shadow"
                  placeholder="Your name"
                  aria-invalid={!!globalError && displayName.trim().length < 2}
                />
              </div>
              <p className="text-xs text-muted-foreground">This is your display name shown to others.</p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="suUsername"
                className="block text-sm font-medium text-foreground"
              >
                Username
              </label>
              <div className="relative">
                <CircleUserRound
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="suUsername"
                  name="suUsername"
                  type="text"
                  required
                  value={suUsername}
                  onChange={(e) => setSuUsername(e.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-10 py-2.5 text-sm outline-none ring-0 placeholder:text-muted-foreground/70 focus:border-input focus:ring-2 focus:ring-ring transition-shadow"
                  placeholder="your_username"
                  aria-invalid={usernameStatus === "taken" || usernameStatus === "invalid"}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use 2-24 lowercase letters, numbers or underscores. {usernameStatus === "checking" ? "Checking..." : usernameStatus === "available" ? "Username is available" : usernameStatus === "taken" ? "Username is taken" : usernameStatus === "invalid" ? "Invalid username" : ""}
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="suEmail"
                className="block text-sm font-medium text-foreground"
              >
                Email
              </label>
              <div className="relative">
                <CircleUserRound
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="suEmail"
                  name="suEmail"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={suEmail}
                  onChange={(e) => setSuEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-10 py-2.5 text-sm outline-none ring-0 placeholder:text-muted-foreground/70 focus:border-input focus:ring-2 focus:ring-ring transition-shadow"
                  placeholder="you@example.com"
                  aria-invalid={!!globalError && !isValidEmail(suEmail)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="suPassword"
                  className="block text-sm font-medium text-foreground"
                >
                  Password
                </label>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="suPassword"
                    name="suPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    className="w-full rounded-lg border border-input bg-card px-10 py-2.5 text-sm outline-none ring-0 placeholder:text-muted-foreground/70 focus:border-input focus:ring-2 focus:ring-ring transition-shadow"
                    placeholder="••••••••"
                    aria-invalid={!!globalError && !hasStrongPassword(suPassword)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  At least 8 characters.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="suConfirm"
                  className="block text-sm font-medium text-foreground"
                >
                  Confirm password
                </label>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="suConfirm"
                    name="suConfirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                    className="w-full rounded-lg border border-input bg-card px-10 py-2.5 text-sm outline-none ring-0 placeholder:text-muted-foreground/70 focus:border-input focus:ring-2 focus:ring-ring transition-shadow"
                    placeholder="••••••••"
                    aria-invalid={!!globalError && suConfirm !== suPassword}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={disabled}
              className={[
                "inline-flex w-full items-center justify-center gap-2",
                "rounded-lg bg-primary text-primary-foreground",
                "px-4 py-2.5 text-sm font-semibold",
                "shadow-sm hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-ring",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                "transition-all",
              ].join(" ")}
              aria-busy={loading}
            >
              {loading ? (
                <span className="relative flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/60 border-t-transparent" />
                  Creating account...
                </span>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Create account
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>Already have an account?</span>
              <button
                type="button"
                onClick={() => setActiveTab("sign-in")}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </button>
            </div>
          </form>
        </TabsContent>
      </Tabs>

      <footer className="mt-6 flex items-center justify-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1">
          <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="text-[11px] font-medium text-foreground">
            End-to-end secured
          </span>
        </div>
      </footer>
    </section>
  );
}