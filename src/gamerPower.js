const GAMERPOWER_BASE = "https://www.gamerpower.com/api";

function extractSteamAppId(url) {
  if (!url) return null;
  const match = url.match(/steampowered\.com\/app\/(\d+)/);
  return match ? Number(match[1]) : null;
}

// GamerPower agrega giveaways de multiples plataformas/tiendas. Filtramos a
// juegos completos (no DLC/beta/loot) disponibles en Steam. No requiere
// API key. Atribucion requerida por sus terminos: enlazamos a gamerpower.com
// en cada giveaway y en el pie del correo.
export async function fetchSteamGiveaways() {
  const url = `${GAMERPOWER_BASE}/giveaways?platform=steam&type=game`;
  const res = await fetch(url, {
    headers: { "User-Agent": "steam-free-tracker (contacto via github.com/FeloSP8)" },
  });
  if (!res.ok) return [];

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((g) => ({
    gamerPowerId: g.id,
    title: g.title?.replace(/\s*\(.*(giveaway|steam key|dlc).*\)\s*$/i, "").trim() ?? g.title,
    worth: g.worth,
    endDate: g.end_date,
    openUrl: g.open_giveaway_url,
    gamerPowerUrl: g.gamerpower_url,
    appid: extractSteamAppId(g.open_giveaway_url),
    source: "gamerpower",
  }));
}
