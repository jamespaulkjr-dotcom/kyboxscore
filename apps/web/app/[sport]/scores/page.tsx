import type { Metadata } from "next";
import { ScoresView } from "../../components/scores-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[sport]/scores">
): Promise<Metadata> {
  const { sport } = await props.params;
  const name = sport.charAt(0).toUpperCase() + sport.slice(1);
  return {
    title: `${name} scores`,
    description: `Statewide Kentucky high school ${sport} scores, updated live.`,
  };
}

export default async function Page(props: PageProps<"/[sport]/scores">) {
  const { sport } = await props.params;
  return <ScoresView sportSlug={sport} />;
}
