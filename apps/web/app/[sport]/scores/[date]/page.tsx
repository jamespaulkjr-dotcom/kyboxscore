import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScoresView } from "../../../components/scores-view";
import { formatSlateDate } from "../../../../lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[sport]/scores/[date]">
): Promise<Metadata> {
  const { sport, date } = await props.params;
  const name = sport.charAt(0).toUpperCase() + sport.slice(1);
  return {
    title: `${name} scores, ${formatSlateDate(date)}`,
    description: `Kentucky high school ${sport} scores for ${formatSlateDate(date)}.`,
  };
}

export default async function Page(props: PageProps<"/[sport]/scores/[date]">) {
  const { sport, date } = await props.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  return <ScoresView sportSlug={sport} date={date} />;
}
