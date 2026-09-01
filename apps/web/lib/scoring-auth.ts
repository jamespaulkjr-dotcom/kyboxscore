import { cookies } from "next/headers";
import {
  findScorekeeper,
  hashToken,
  touchScorekeeper,
  userCanScore,
  type ScoringActor,
} from "@kyboxscore/db";
import { getCurrentUser, isAdmin } from "./auth";

export const KEEPER_COOKIE = "kbs_keeper";

/**
 * Who, if anyone, may move the score on this game.
 *
 * Two routes in. A signed-in coach or AD with a grant on either side, or
 * somebody holding a per-game keeper link. The link is a bearer token, so it
 * is checked against the game it was minted for on every single call - a link
 * for Friday's game cannot score Saturday's.
 */
export type Scorer = {
  actor: ScoringActor;
  /** Shown on the console so the keeper can see which capacity they are in. */
  label: string;
  /** Only an account holder may mint or revoke keeper links. */
  canDelegate: boolean;
  userId: number | null;
};

export async function resolveScorer(gameId: number): Promise<Scorer | null> {
  const user = await getCurrentUser();
  if (user && (isAdmin(user) || (await userCanScore(user.id, gameId)))) {
    return {
      actor: { kind: "user", userId: user.id },
      label: user.name,
      canDelegate: true,
      userId: user.id,
    };
  }

  const token = (await cookies()).get(KEEPER_COOKIE)?.value;
  if (!token) return null;

  const keeper = await findScorekeeper(hashToken(token));
  // A live link for a different game is not a credential for this one.
  if (!keeper || keeper.gameId !== gameId) return null;

  void touchScorekeeper(keeper.id).catch(() => {});
  return {
    actor: { kind: "keeper", scorekeeperId: keeper.id },
    label: keeper.label,
    canDelegate: false,
    userId: null,
  };
}
