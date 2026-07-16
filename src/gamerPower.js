const GAMERPOWER_BASE = "https://www.gamerpower.com/api";

function extractSteamAppId(url) {
  if (!url) return null;
  const match = url.match(/steampowered\.com\/app\/(\d+)/);
  return match ? Number(match[1]) : null;
}

// GamerPower suele meter anotaciones como "(Steam)" en medio del titulo o
// "Giveaway" suelto al final, que rompen la busqueda por titulo en Steam
// (p.ej. "Catch Me! (Steam) Giveaway" no encuentra "Catch Me!"). Se limpian
// antes de intentar resolver el appid.
function cleanTitle(rawTitle) {
  if (!rawTitle) return rawTitle;
  return rawTitle
    .replace(/\(\s*steam\s*\)/gi, "")
    .replace(/\s*\(.*(giveaway|steam key|dlc).*\)\s*$/i, "")
    .replace(/\s+giveaway\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
    title: cleanTitle(g.title),
    worth: g.worth,
    endDate: g.end_date,
    openUrl: g.open_giveaway_url,
    gamerPowerUrl: g.gamerpower_url,
    appid: extractSteamAppId(g.open_giveaway_url),
    // Imagen del propio giveaway (banner/capsula), util cuando no se puede
    // resolver el appid de Steam y por tanto no hay header_image oficial.
    image: g.image || g.thumbnail || null,
    source: "gamerpower",
  }));
}
