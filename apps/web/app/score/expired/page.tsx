import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scoring link expired",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
      <h1 className="text-xl font-bold tracking-tight">
        This scoring link is not valid
      </h1>
      <p className="mt-3 text-fg-muted">
        It has expired, been revoked, or was mistyped. Links cover one game
        and one night, so ask the coach to send a fresh one.
      </p>
    </main>
  );
}
