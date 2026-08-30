import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listSports } from "@kyboxscore/db";
import { SiteHeader } from "../components/site-header";
import { getCurrentUser } from "../../lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Coach and administrator sign in for KY BOXSCORE.",
  // Nothing behind the login is public, so keep it out of the index.
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const dest = typeof next === "string" ? next : "";

  const [user, sports] = await Promise.all([getCurrentUser(), listSports()]);
  if (user) redirect(dest.startsWith("/") && !dest.startsWith("//") ? dest : "/coach");

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Sign in</h1>
        <p className="mt-2 text-sm text-fg-muted">
          For coaches and athletic directors entering statistics. Accounts are
          issued by KY BOXSCORE staff — there is no public sign up.
        </p>

        <LoginForm next={dest} />

        <p className="mt-6 text-sm text-fg-muted">
          Need an account, or locked out? Email{" "}
          <a className="text-link underline" href="mailto:help@kyboxscore.com">
            help@kyboxscore.com
          </a>
          .
        </p>
      </main>
    </>
  );
}
