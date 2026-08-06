const STORE_BASE = "https://store.steampowered.com";
const STEAMSPY_BASE = "https://steamspy.com/api.php";
const STEAM_API_BASE = "https://api.steampowered.com";

function summarize(summary) {
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

export async function fetchReviewSummary(appid, language) {
  const url =
    `${STORE_BASE}/appreviews/${appid}?json=1&language=all&purchase_type=all` +
    `&num_per_page=0&l=${language}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return summarize(data?.query_summary);
}

// Resumen de solo los ultimos 30 dias. Si el sentimiento reciente es
// notablemente peor que el historico (parches malos, servidores caidos,
// soporte abandonado...) queremos poder rechazar el juego aunque su
// historial general sea bueno.
export async function fetchRecentReviewSummary(appid, language) {
  const url =
    `${STORE_BASE}/appreviews/${appid}?json=1&language=all&purchase_type=all` +
    `&filter=all&day_range=30&num_per_page=0&l=${language}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return summarize(data?.query_summary);
}

// SteamSpy solo aporta la media de horas jugadas (dato que Steam no expone
// publicamente). Si no hay datos (juego muy nuevo o de nicho) devolvemos null
// y el resto del pipeline lo trata como "desconocido", no como rechazo.
//
// Ojo con el cero: desde que Steam hizo privado el tiempo de juego, SteamSpy
// devuelve average_forever = 0 para muchisimos juegos, y eso significa "no
// tengo el dato", no "nadie lo ha jugado". Tratarlo como un cero real hacia
// que cualquier juego sin dato suspendiera el minimo de horas y acabara en la
// seccion de descartados (le paso a Moonlighter, con 22.000 reseñas). Un
// juego con reseñas y jugadores activos no puede tener 0 minutos de media.
function playtimeOrNull(minutes) {
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export async function fetchSteamSpy(appid) {
  try {
    const url = `${STEAMSPY_BASE}?request=appdetails&appid=${appid}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "steam-free-tracker (contacto via github.com/FeloSP8)" },
    });
    if (!res.ok) {
      console.warn(`SteamSpy ${appid} respondio ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data || data.average_forever === undefined) return null;

    const averageForeverMinutes = playtimeOrNull(data.average_forever);
    if (averageForeverMinutes === null) {
      console.log(`SteamSpy no tiene horas jugadas de ${appid}; se ignora ese criterio`);
    }

    return {
      averageForeverMinutes,
      medianForeverMinutes: playtimeOrNull(data.median_forever),
      owners: data.owners,
    };
  } catch {
    return null;
  }
}

// Jugadores concurrentes actuales. Endpoint oficial de Steam (no SteamDB:
// SteamDB no ofrece API publica y raspar su web incumpliria sus terminos).
// No da el pico de 24h que si tiene SteamDB, pero sirve como señal de
// actividad real sin depender de scraping fragil.
export async function fetchCurrentPlayerCount(appid) {
  try {
    const url = `${STEAM_API_BASE}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.response?.result !== 1) return null;
    return data.response.player_count ?? null;
  } catch {
    return null;
  }
}
