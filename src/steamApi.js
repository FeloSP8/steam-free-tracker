const STORE_BASE = "https://store.steampowered.com";

/**
 * Ofertas destacadas en portada de Steam (JSON oficial, sin scraping).
 * Suele incluir los "juegos gratis" mas relevantes, pero no es exhaustiva:
 * por eso se combina con GamerPower en index.js.
 */
export async function fetchFeaturedFreeGames(cc, language) {
  const url = `${STORE_BASE}/api/featuredcategories?cc=${cc}&l=${language}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.specials?.items ?? [];

  return items
    .filter((item) => item.discount_percent === 100)
    .map((item) => ({
      appid: item.id,
      name: item.name,
      claimUrl: `${STORE_BASE}/app/${item.id}`,
      source: "steam-featured",
    }));
}

/**
 * Busca el appid de Steam a partir de un titulo (fallback para giveaways de
 * GamerPower cuyo enlace de canje no apunta directamente a la ficha de Steam,
 * p.ej. keys repartidas a traves de un partner). Sin esto no podriamos
 * consultar reseñas/horas jugadas para aplicar el filtro de calidad.
 */
export async function resolveAppIdByTitle(title, cc, language) {
  if (!title) return null;
  const url = `${STORE_BASE}/api/storesearch/?term=${encodeURIComponent(title)}&cc=${cc}&l=${language}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = normalize(title);
  const exact = items.find((i) => normalize(i.name) === target);
  return (exact ?? items[0]).id;
}

export async function fetchAppDetails(appid, cc, language) {
  const url = `${STORE_BASE}/api/appdetails?appids=${appid}&cc=${cc}&l=${language}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const entry = data?.[appid];
  if (!entry?.success) return null;
  const d = entry.data;
  return {
    name: d.name,
    type: d.type,
    shortDescription: d.short_description,
    headerImage: d.header_image,
    metacritic: d.metacritic?.score ?? null,
    releaseDate: d.release_date?.date ?? null,
    isFree: d.is_free,
    genres: (d.genres ?? []).map((g) => g.description),
    priceOverview: d.price_overview ?? null,
    achievementsTotal: d.achievements?.total ?? 0,
    dlcCount: Array.isArray(d.dlc) ? d.dlc.length : 0,
    hasTrailer: Array.isArray(d.movies) && d.movies.length > 0,
  };
}
