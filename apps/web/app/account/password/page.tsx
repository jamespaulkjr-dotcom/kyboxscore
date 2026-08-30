import type { Metadata } from "next";
import Link from "next/link";
import { listSports } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireUser } from "../../../lib/auth";
import { PasswordForm } from "./password-form";

// Reads the session and the database; the image builds without one.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Change password",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const [user, sports] = await Promise.all([
    requireUser("/account/password"),
    listSports(),
  ]);

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-8">
        <Link href="/coach" className="text-sm text-link underline">
          ← Back to your teams
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Change password
        </h1>
        <p className="mt-2 text-sm text-fg-muted">Signed in as {user.email}.</p>
        <PasswordForm />
      </main>
    </>
  );
}
