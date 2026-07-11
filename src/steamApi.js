import * as cheerio from "cheerio";

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
 * Barrido de la busqueda de la tienda filtrando por ofertas con precio final
 * 0. Cubre un hueco real que ni GamerPower ni featuredcategories detectan:
 * un editor que pone su propio juego a $0 directamente en su ficha de Steam
 * durante unos dias, sin key externa ni giveaway formal (featuredcategories
 * solo trae el top-10 rotativo de portada; GamerPower solo cubre giveaways
 * con reclamo externo). Steam no expone esto como JSON limpio, asi que se
 * parsea el fragmento HTML que devuelve la propia pagina de busqueda.
 *
 * Es la parte mas fragil del sistema: si Steam cambia las clases del HTML
 * de busqueda, esta funcion puede dejar de encontrar resultados (fallara en
 * silencio, devolviendo menos o cero items, nunca falsos positivos).
 */
export async function fetchSearchFreeGames(cc, language, { maxSearchPages, resultsPerPage }) {
  const found = new Map();

  for (let page = 0; page < maxSearchPages; page++) {
    const start = page * resultsPerPage;
    const url =
      `${STORE_BASE}/search/results/?query&start=${start}&count=${resultsPerPage}` +
      `&specials=1&maxprice=free&category1=998&cc=${cc}&l=${language}&json=1`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (steam-free-tracker daily job)" },
    });
    if (!res.ok) break;

    const data = await res.json();
    const html = data?.results_html;
    if (!html) break;

    const $ = cheerio.load(html);
    const rows = $("a.search_result_row");
    if (rows.length === 0) break;

    rows.each((_, el) => {
      const appid = Number($(el).attr("data-ds-appid"));
      if (!appid) return;
      const name = $(el).find(".title").text().trim();
      const discountPercentText = $(el).find(".discount_pct").text().trim();
      const discountPercent = discountPercentText
        ? Math.abs(parseInt(discountPercentText.replace(/[^0-9]/g, ""), 10))
        : null;

      // Solo descuentos confirmados al 100%. Si no se pudo parsear el
      // porcentaje, se descarta en vez de arriesgarnos a un falso positivo
      // (p.ej. un F2P de toda la vida coincidiendo con maxprice=free).
      if (discountPercent !== 100) return;

      found.set(appid, {
        appid,
        name,
        claimUrl: `${STORE_BASE}/app/${appid}`,
        source: "steam-search",
      });
    });

    if (Number(data.total_count) <= start + resultsPerPage) break;
  }

  return Array.from(found.values());
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
