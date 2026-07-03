export function evaluateGame({ reviews, recentReviews, steamspy, appDetails, currentPlayers, quality }) {
  const reasons = [];
  let passes = true;

  const totalReviews = reviews?.totalReviews ?? 0;
  const positivePercent = reviews?.positivePercent ?? 0;
  const avgPlaytimeMinutes = steamspy?.averageForeverMinutes ?? null;
  const metacritic = appDetails?.metacritic ?? null;
  const genres = appDetails?.genres ?? [];

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

  const excludedGenre = (quality.excludeGenres ?? []).find((excluded) =>
    genres.some((g) => g.toLowerCase() === excluded.toLowerCase())
  );
  if (excludedGenre) {
    passes = false;
    reasons.push(`Género excluido por configuración (${excludedGenre})`);
  }

  if (
    quality.minCurrentPlayers > 0 &&
    currentPlayers !== null &&
    currentPlayers < quality.minCurrentPlayers
  ) {
    passes = false;
    reasons.push(`Muy pocos jugadores activos ahora mismo (${currentPlayers})`);
  }

  // El Metacritic alto puede rescatar un juego que no llega a algun umbral
  // anterior (p.ej. pocas reseñas en Steam pero muy aclamado en general).
  if (!passes && metacritic !== null && metacritic >= quality.metacriticOverride) {
    passes = true;
    reasons.push(`Aceptado igualmente por Metacritic alto (${metacritic})`);
  }

  // El deterioro reciente es un veto que el Metacritic NO puede anular:
  // un juego con buena nota historica pero abandonado/roto ahora mismo no
  // deberia recomendarse solo porque fue bueno en el pasado.
  const recentTotal = recentReviews?.totalReviews ?? 0;
  const recentPercent = recentReviews?.positivePercent ?? null;
  if (
    recentTotal >= (quality.recentReviewMinSample ?? 10) &&
    recentPercent !== null &&
    recentPercent < quality.minPositivePercent
  ) {
    passes = false;
    reasons.push(
      `Reseñas recientes han empeorado: ${recentPercent}% en los últimos 30 días ` +
        `(histórico ${positivePercent}%) — posible soporte abandonado o problema activo`
    );
  }

  return {
    passes,
    totalReviews,
    positivePercent,
    avgPlaytimeMinutes,
    metacritic,
    genres,
    currentPlayers,
    achievementsTotal: appDetails?.achievementsTotal ?? 0,
    dlcCount: appDetails?.dlcCount ?? 0,
    hasTrailer: appDetails?.hasTrailer ?? null,
    recentPositivePercent: recentPercent,
    recentTotalReviews: recentTotal,
    reviewScoreDesc: reviews?.reviewScoreDesc ?? null,
    reasons,
  };
}
