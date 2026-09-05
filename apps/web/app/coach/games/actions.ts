"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createScorekeeperLink,
  deleteGame,
  restoreGame,
  setGameStatus,
  GAME_STATUSES,
  normalizeClock,
  resetGameScoring,
  updateScoringPlay,
  getScoringGame,
  playByKey,
  recordScoringPlay,
  revokeScorekeeper,
  setFinalScore,
  startScoring,
  voidLastPlay,
} from "@kyboxscore/db";
import { getCurrentUser, isAdmin } from "../../../lib/auth";
import { resolveScorer } from "../../../lib/scoring-auth";

export type ScoreState = {
  error?: string;
  ok?: boolean;
  link?: string;
  note?: string;
};

/**
 * Every action re-resolves the game from its short code and re-checks who is
 * asking. The client is a phone in a press box on bad signal: it is a display,
 * never the authority on what is allowed.
 */
async function authorize(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const game = await getScoringGame(code);
  if (!game) return { error: "That game no longer exists." as const };

  const scorer = await resolveScorer(game.id);
  if (!scorer) return { error: "You are not signed in to score this game." as const };

  return { game, scorer };
}

function revalidate(code: string, sportSlug: string, urlYear: number) {
  revalidatePath(`/coach/games/${code}`);
  revalidatePath(`/score/${code}`);
  revalidatePath(`/${sportSlug}/${urlYear}/games/${code}`);
  revalidatePath(`/${sportSlug}/scores`);
  revalidatePath("/");
}

export async function startGameAction(
  _prev: ScoreState,
  formData: FormData
): Promise<ScoreState> {
  const auth = await authorize(formData);
  if ("error" in auth) return auth;

  await startScoring(auth.game.id);
  revalidate(auth.game.shortCode, auth.game.sportSlug, auth.game.urlYear);
  return { ok: true };
}

export async function addPlayAction(
  _prev: ScoreState,
  formData: FormData
): Promise<ScoreState> {
  const auth = await authorize(formData);
  if ("error" in auth) return auth;
  const { game, scorer } = auth;

  // The button posts a key. Points come from the table on the server, so a
  // crafted request cannot invent a 40-point touchdown.
  const play = playByKey(String(formData.get("play") ?? ""));
  if (!play) return { error: "Unknown play." };

  const side = String(formData.get("side") ?? "");
  const participantId =
    side === "home" ? game.home.participantId : side === "away" ? game.away.participantId : 0;
  if (!participantId) return { error: "Choose which team scored." };

  const period = Number(formData.get("period") ?? 0);
  if (!Number.isInteger(period) || period < 1 || period > 10) {
    return { error: "Choose a quarter." };
  }

  // The clock rides along with the tap when there is one. A bad clock must
  // never cost somebody the score itself, so it is dropped rather than
  // refused: the play still lands, and the time can be fixed underneath.
  const clock = normalizeClock(String(formData.get("clock") ?? ""));

  // Scoring a game that has not been started should just start it, rather than
  // making somebody find the right button while a kick is in the air.
  if (game.status === "scheduled" || game.status === "postponed") {
    await startScoring(game.id);
  }

  const result = await recordScoringPlay({
    gameId: game.id,
    participantId,
    periodNumber: period,
    points: play.points,
    description: play.description,
    playKey: play.key,
    clock,
    actor: scorer.actor,
  });
  if (!result.ok) return { error: result.reason ?? "That did not save." };

  revalidate(game.shortCode, game.sportSlug, game.urlYear);
  return { ok: true };
}

export async function undoPlayAction(
  _prev: ScoreState,
  formData: FormData
): Promise<ScoreState> {
  const auth = await authorize(formData);
  if ("error" in auth) return auth;

  const result = await voidLastPlay(auth.game.id);
  if (!result.ok) return { error: result.reason ?? "Nothing to undo." };

  revalidate(auth.game.shortCode, auth.game.sportSlug, auth.game.urlYear);
  return { ok: true };
}

export async function finalScoreAction(
  _prev: ScoreState,
  formData: FormData
): Promise<ScoreState> {
  const auth = await authorize(formData);
  if ("error" in auth) return auth;
  const { game } = auth;

  const num = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    if (!/^\d{1,3}$/.test(raw)) return null;
    return Number(raw);
  };
  const home = num("homeScore");
  const away = num("awayScore");
  if (home === null || away === null) {
    return { error: "Enter both scores as whole numbers." };
  }

  const periodsRaw = String(formData.get("periodsPlayed") ?? "").trim();
  const periods = periodsRaw === "" ? null : Number(periodsRaw);
  if (periods !== null && (!Number.isInteger(periods) || periods < 1 || periods > 10)) {
    return { error: "Quarters played must be a whole number." };
  }

  const result = await setFinalScore({
    gameId: game.id,
    homeScore: home,
    awayScore: away,
    periodsPlayed: periods,
    final: String(formData.get("final") ?? "") === "yes",
  });
  if (!result.ok) return { error: result.reason ?? "That did not save." };

  revalidate(game.shortCode, game.sportSlug, game.urlYear);
  return { ok: true };
}

/**
 * Who scored it and how, added after the fact.
 *
 * Detail is never a condition of scoring. The tap has to land while the crowd
 * is still reacting; the name, the method and the clock can be filled in at
 * the next timeout, after the game, or never.
 */
export async function updatePlayAction(
  _prev: ScoreState,
  formData: FormData
): Promise<ScoreState> {
  const auth = await authorize(formData);
  if ("error" in auth) return auth;
  const { game } = auth;

  const playId = Number(formData.get("playId"));
  if (!Number.isInteger(playId)) return { error: "Unknown play." };

  const optionalId = (name: string) => {
    const raw = String(formData.get(name) ?? "");
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  const clockRaw = String(formData.get("clock") ?? "");
  const clock = normalizeClock(clockRaw);
  if (clockRaw.trim() !== "" && clock === null) {
    return {
      error: "Digits are enough for the clock: 054 for 0:54, 412 for 4:12.",
    };
  }

  const periodRaw = String(formData.get("period") ?? "").trim();
  const period = periodRaw === "" ? null : Number(periodRaw);
  if (period !== null && (!Number.isInteger(period) || period < 1 || period > 10)) {
    return { error: "Choose a quarter." };
  }

  const method = String(formData.get("method") ?? "") || null;

  const result = await updateScoringPlay({
    gameId: game.id,
    playId,
    playerId: optionalId("playerId"),
    assistPlayerId: optionalId("assistPlayerId"),
    method,
    clock,
    periodNumber: period,
  });
  if (!result.ok) return { error: result.reason ?? "That did not save." };

  revalidate(game.shortCode, game.sportSlug, game.urlYear);
  return { ok: true, note: "Play updated." };
}

/**
 * Change a game's status by hand.
 *
 * A schedule is a forecast. A game called off gets played anyway, and one that
 * was on gets rained out. Anybody who can score a game can correct this,
 * because the person who knows is the person who was there.
 */
export async function setStatusAction(
  _prev: ScoreState,
  formData: FormData
): Promise<ScoreState> {
  const auth = await authorize(formData);
  if ("error" in auth) return auth;
  const { game } = auth;

  const status = String(formData.get("status") ?? "");
  const result = await setGameStatus(game.id, status);
  if (!result.ok) return { error: result.reason ?? "That did not save." };

  revalidate(game.shortCode, game.sportSlug, game.urlYear);
  const label =
    GAME_STATUSES.find((s) => s.value === status)?.label ?? status;
  return { ok: true, note: `Marked ${label.toLowerCase()}.` };
}

/* ------------------------------------------------------------ delegation */

export async function createLinkAction(
  _prev: ScoreState,
  formData: FormData
): Promise<ScoreState> {
  const auth = await authorize(formData);
  if ("error" in auth) return auth;
  const { game, scorer } = auth;

  // A keeper cannot mint another keeper. Delegation stops at the account.
  if (!scorer.canDelegate || scorer.userId === null) {
    return { error: "Only a signed-in coach can create a scoring link." };
  }

  const label = String(formData.get("label") ?? "").trim().slice(0, 60);
  if (label.length < 2) return { error: "Give the link a name, so you know whose it is." };

  const teamId = Number(formData.get("teamId"));
  if (teamId !== game.home.teamId && teamId !== game.away.teamId) {
    return { error: "That team is not in this game." };
  }

  const { token } = await createScorekeeperLink({
    gameId: game.id,
    teamId,
    label,
    createdByUserId: scorer.userId,
  });

  revalidatePath(`/coach/games/${game.shortCode}`);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kyboxscore.com";
  return { ok: true, link: `${base}/score/link/${token}` };
}

export async function revokeLinkAction(formData: FormData) {
  const auth = await authorize(formData);
  if ("error" in auth) return;
  const { game, scorer } = auth;
  if (!scorer.canDelegate) return;

  const id = Number(formData.get("keeperId"));
  const teamId = Number(formData.get("teamId"));
  if (!Number.isInteger(id) || !Number.isInteger(teamId)) return;

  await revokeScorekeeper(id, teamId);
  revalidatePath(`/coach/games/${game.shortCode}`);
}

/**
 * Put a game back to unplayed.
 *
 * Admins only, and not because a coach cannot be trusted - because this
 * destroys a game's scoring history, and the person who needs it is whoever is
 * testing the system on a real fixture rather than whoever is keeping it.
 *
 * Confirmation is typing the game's own short code. A checkbox is too easy to
 * hit by accident on the phone this page is designed for, and this is the one
 * button here that cannot be undone.
 */
export async function resetGameAction(
  _prev: ScoreState,
  formData: FormData
): Promise<ScoreState> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return { error: "Only an administrator can reset a game." };
  }

  const code = String(formData.get("code") ?? "");
  const game = await getScoringGame(code);
  if (!game) return { error: "That game no longer exists." };

  const typed = String(formData.get("confirm") ?? "").trim();
  if (typed.toLowerCase() !== game.shortCode.toLowerCase()) {
    return { error: `Type ${game.shortCode} to confirm.` };
  }

  const result = await resetGameScoring(game.id);
  if (!result.ok) return { error: result.reason };

  revalidate(game.shortCode, game.sportSlug, game.urlYear);
  const bits = [
    `${result.plays} ${result.plays === 1 ? "play" : "plays"}`,
    `${result.periods} quarter ${result.periods === 1 ? "row" : "rows"}`,
  ];
  if (result.links > 0) {
    bits.push(`${result.links} scoring ${result.links === 1 ? "link" : "links"} revoked`);
  }
  return {
    ok: true,
    note: `Back to scheduled, from ${result.wasStatus.replace("_", " ")}. Cleared ${bits.join(", ")}.`,
  };
}

/**
 * Remove a game that should not be on the schedule at all.
 *
 * Different from reset, and the difference matters: reset says "this game has
 * not been played yet", delete says "this game does not exist". A schedule
 * import can invent a fixture that nobody ever arranged, and leaving it there
 * means a parent turns up to a field where nothing is happening.
 *
 * Admin only, and confirmed by typing the game's own short code, because
 * unlike reset there is nothing to put back.
 */
export async function deleteGameAction(
  _prev: ScoreState,
  formData: FormData
): Promise<ScoreState> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return { error: "Only an administrator can delete a game." };
  }

  const code = String(formData.get("code") ?? "");
  const game = await getScoringGame(code);
  if (!game) return { error: "That game no longer exists." };

  const typed = String(formData.get("confirm") ?? "").trim();
  if (typed.toLowerCase() !== game.shortCode.toLowerCase()) {
    return { error: `Type ${game.shortCode} to confirm.` };
  }

  // deleteGame refuses a game with statistics or one a published RPI run was
  // computed from. Say which, rather than leaving the row sitting there with
  // no explanation.
  const result = await deleteGame(game.id, user.id);
  if (!result.ok) return { error: result.reason ?? "That game could not be deleted." };

  revalidate(game.shortCode, game.sportSlug, game.urlYear);
  // The page we were standing on is hidden now, so there is nowhere to stay.
  // The undo travels in the URL, because the moment somebody realises they
  // were wrong is the moment they are looking at this screen.
  redirect(`/coach/games?undo=${game.id}&undone=${game.shortCode}`);
}

/** Put a deleted game back. Same permission as deleting it. */
export async function restoreGameAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;

  const gameId = Number(formData.get("gameId"));
  if (!Number.isInteger(gameId)) return;

  await restoreGame(gameId);
  revalidatePath("/coach/games");
  revalidatePath("/admin/deleted-games");
  revalidatePath("/");
}
