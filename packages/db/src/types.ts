export type GameStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "canceled"
  | "forfeit";

export type Side = {
  teamId: number;
  schoolSlug: string;
  schoolName: string;
  shortName: string | null;
  mascot: string | null;
  score: number | null;
};

export type ScoreboardGame = {
  id: number;
  shortCode: string;
  localDate: string;
  status: GameStatus;
  stage: string;
  neutralSite: boolean;
  eventName: string | null;
  periodsPlayed: number | null;
  timeZone: string;
  startsAt: string | null;
  /** Kick-off in the venue's local time, already formatted. */
  localTime: string | null;
  groupName: string | null;
  home: Side;
  away: Side;
};

export type SportSeason = {
  id: number;
  sportId: number;
  sportSlug: string;
  sportName: string;
  periodNoun: string;
  regulationPeriods: number;
  urlYear: number;
  seasonLabel: string;
  startsOn: string;
  endsOn: string;
};

export type TeamScheduleRow = {
  shortCode: string;
  localDate: string;
  status: GameStatus;
  isHome: boolean;
  neutralSite: boolean;
  opponentName: string;
  opponentSlug: string;
  teamScore: number | null;
  opponentScore: number | null;
  result: "W" | "L" | "T" | null;
  stage: string;
  /** Kick-off in the venue's own local time, already formatted. */
  localTime: string | null;
  /** Both teams in the same district this season. Derived, never asserted. */
  isDistrict: boolean;
};

export type RosterRow = {
  playerId: number;
  slug: string;
  name: string;
  jersey: string | null;
  grade: number | null;
  positions: string[] | null;
  heightInches: number | null;
  weightLb: number | null;
};

export type StatCell = { key: string; abbrev: string; value: number };

export type BoxScoreRow = {
  playerId: number;
  slug: string;
  name: string;
  jersey: string | null;
  started: boolean | null;
  stats: Record<string, number>;
};
