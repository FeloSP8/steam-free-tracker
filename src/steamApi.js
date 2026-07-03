import * as cheerio from "cheerio";

const STORE_BASE = "https://store.steampowered.com";

/**
 * Fuente 1: featuredcategories. Devuelve las ofertas destacadas en portada de Steam.
 * Es la lista curada que Steam muestra en su home, suele incluir los "juegos gratis"
 * mas relevantes (los que de verdad interesan) pero no es exhaustiva.
 */
async function fetchFeaturedSpecials(cc, language) {
  const url = `${STORE_BASE}/api/featuredcategories?cc=${cc}&l=${language}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.specials?.items ?? [];
  return items.map((item) => ({
    appid: item.id,
    name: item.name,
    discountPercent: item.discount_percent,
    finalPrice: item.final_price,
    originalPrice: item.original_price,
    source: "featured",
  }));
}

/**
 * Fuente 2: pagina de busqueda de la tienda filtrando por ofertas con precio final 0.
 * Steam no expone esto como JSON limpio, así que se parsea el fragmento HTML que
 * devuelve la propia pagina de busqueda (misma que usa store.steampowered.com/search).
 */
async function fetchSearchSpecials(cc, language, { maxSearchPages, resultsPerPage }) {
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

      found.set(appid, {
        appid,
        name,
        discountPercent,
        finalPrice: 0,
        originalPrice: null,
        source: "search",
      });
    });

    if (Number(data.total_count) <= start + resultsPerPage) break;
  }

  return Array.from(found.values());
}

/**
 * Combina ambas fuentes y se queda solo con juegos que ANTES tenian precio
 * y ahora cuestan 0: eso es lo que consideramos "pasa a ser gratis"
 * (se excluyen los free-to-play de toda la vida, que nunca tuvieron precio).
 */
export async function fetchNewlyFreeGames(cc, language, searchConfig) {
  const [featured, search] = await Promise.all([
    fetchFeaturedSpecials(cc, language),
    fetchSearchSpecials(cc, language, searchConfig),
  ]);

  const merged = new Map();
  for (const item of [...featured, ...search]) {
    if (!merged.has(item.appid)) merged.set(item.appid, item);
  }

  // Solo nos quedamos con descuentos confirmados al 100%. Si no se pudo
  // determinar el descuento (p.ej. Steam cambia el HTML de busqueda y el
  // parseo falla), se descarta en vez de arriesgarnos a colar un juego
  // free-to-play de toda la vida como si "hubiera pasado a ser gratis".
  return Array.from(merged.values()).filter((item) => item.discountPercent === 100);
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
  };
}
