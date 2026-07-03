export function evaluateGame({ reviews, steamspy, appDetails, quality }) {
  const reasons = [];
  let passes = true;

  const totalReviews = reviews?.totalReviews ?? 0;
  const positivePercent = reviews?.positivePercent ?? 0;
  const avgPlaytimeMinutes = steamspy?.averageForeverMinutes ?? null;
  const metacritic = appDetails?.metacritic ?? null;

  if (totalReviews < quality.minTotalReviews) {
    passes = false;
    reasons.push(`Menos de ${quality.minTotalReviews} reseñas (tiene ${totalReviews})`);
  }

  if (totalReviews > 0 && positivePercent < quality.minPositivePercent) {
    passes = false;
    reasons.push(`Solo ${positivePercent}% de reseñas positivas`);
  }

  if (avgPlaytimeMinutes !== null && avgPlaytimeMinutes < quality.minAvgPlaytimeMinutes) {
    passes = false;
    reasons.push(
      `Media de horas jugadas baja (${(avgPlaytimeMinutes / 60).toFixed(1)}h)`
    );
  }

  if (!passes && metacritic !== null && metacritic >= quality.metacriticOverride) {
    passes = true;
    reasons.push(`Aceptado igualmente por Metacritic alto (${metacritic})`);
  }

  return {
    passes,
    totalReviews,
    positivePercent,
    avgPlaytimeMinutes,
    metacritic,
    reviewScoreDesc: reviews?.reviewScoreDesc ?? null,
    reasons,
  };
}
