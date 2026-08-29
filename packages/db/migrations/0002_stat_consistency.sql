-- Restores the box score consistency check that the first draft of the schema
-- had as basketball_stat_anomaly, rebuilt for the data-driven stat model.
--
-- Scraped and hand-entered prep box scores routinely do not add up. The
-- official score on game_participant stays authoritative; this view surfaces
-- lines whose reported points disagree with their own shot line so a human can
-- look. Nothing is auto-corrected.

CREATE VIEW stat_line_anomaly AS
WITH pivoted AS (
  SELECT sl.id AS stat_line_id, sl.game_id, sl.player_id, sp.slug AS sport,
         max(sv.value) FILTER (WHERE sd.key = 'pts') AS pts,
         max(sv.value) FILTER (WHERE sd.key = 'fgm') AS fgm,
         max(sv.value) FILTER (WHERE sd.key = 'tpm') AS tpm,
         max(sv.value) FILTER (WHERE sd.key = 'ftm') AS ftm
  FROM stat_line sl
  JOIN stat_value sv ON sv.stat_line_id = sl.id
  JOIN stat_definition sd ON sd.id = sv.stat_definition_id
  JOIN sport sp ON sp.id = sd.sport_id
  WHERE sp.slug = 'basketball'
  GROUP BY sl.id, sl.game_id, sl.player_id, sp.slug
)
SELECT stat_line_id, game_id, player_id, sport,
       pts AS reported_points,
       (2 * (fgm - tpm) + 3 * tpm + ftm) AS computed_points,
       pts - (2 * (fgm - tpm) + 3 * tpm + ftm) AS delta
FROM pivoted
WHERE pts IS DISTINCT FROM (2 * (fgm - tpm) + 3 * tpm + ftm);

COMMENT ON VIEW stat_line_anomaly IS
  'Box score lines whose reported points disagree with their shot line. For review, never auto-correction.';
