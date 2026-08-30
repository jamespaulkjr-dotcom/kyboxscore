"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg " +
  "placeholder:text-fg-muted focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-link";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {}
  );

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />

      {state.error && (
        // Announced to screen readers when it appears, not only on focus.
        <p
          role="alert"
          className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss"
        >
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoCapitalize="none"
          spellCheck={false}
          className={`mt-1 ${FIELD}`}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`mt-1 ${FIELD}`}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
