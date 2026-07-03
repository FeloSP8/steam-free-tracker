const STORE_BASE = "https://store.steampowered.com";
const STEAMSPY_BASE = "https://steamspy.com/api.php";

export async function fetchReviewSummary(appid, language) {
  const url =
    `${STORE_BASE}/appreviews/${appid}?json=1&language=all&purchase_type=all` +
    `&num_per_page=0&l=${language}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const summary = data?.query_summary;
  if (!summary) return null;

  const totalReviews = summary.total_reviews ?? 0;
  const totalPositive = summary.total_positive ?? 0;
  const positivePercent =
    totalReviews > 0 ? Math.round((totalPositive / totalReviews) * 100) : 0;

  return {
    totalReviews,
    totalPositive,
    totalNegative: summary.total_negative ?? 0,
    positivePercent,
    reviewScoreDesc: summary.review_score_desc ?? null,
  };
}

// SteamSpy solo aporta la media de horas jugadas (dato que Steam no expone
// publicamente). Si no hay datos (juego muy nuevo o de nicho) devolvemos null
// y el resto del pipeline lo trata como "desconocido", no como rechazo.
export async function fetchSteamSpy(appid) {
  try {
    const url = `${STEAMSPY_BASE}?request=appdetails&appid=${appid}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.average_forever === undefined) return null;
    return {
      averageForeverMinutes: data.average_forever,
      medianForeverMinutes: data.median_forever,
      owners: data.owners,
    };
  } catch {
    return null;
  }
}
