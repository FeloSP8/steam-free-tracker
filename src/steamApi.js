import { fetchJson } from "./http.js";

const STORE_BASE = "https://store.steampowered.com";
const STEAM_API_BASE = "https://api.steampowered.com";

/**
 * Ofertas destacadas en portada de Steam (JSON oficial, sin scraping).
 * Suele incluir los "juegos gratis" mas relevantes, pero no es exhaustiva:
 * por eso se combina con GamerPower en index.js.
 *
 * Ojo con su punto ciego: "specials" son descuentos, asi que aqui solo
 * aparecen los juegos a -100%. Las promociones "free to keep" de Steam no
 * son un descuento (ver detectFreeToKeep) y NUNCA salen por esta via.
 */
export async function fetchFeaturedFreeGames(cc, language) {
  const url = `${STORE_BASE}/api/featuredcategories?cc=${cc}&l=${language}`;
  const data = await fetchJson(url, { label: "featuredcategories" });
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

// IStoreQueryService e IStoreBrowseService son los servicios que usa la
// propia tienda de Steam. No estan documentados, pero responden sin key y
// reciben los parametros como JSON en `input_json`.
function storeServiceUrl(service, method, input) {
  return (
    `${STEAM_API_BASE}/${service}/${method}/v1/?input_json=` +
    encodeURIComponent(JSON.stringify(input))
  );
}

function storeContext(cc, language) {
  return { language, country_code: cc.toUpperCase(), steam_realm: 1 };
}

function unixToIso(seconds) {
  return Number(seconds) > 0 ? new Date(Number(seconds) * 1000).toISOString() : null;
}

// La opcion de compra que hace gratis un juego: el paquete promocional de un
// regalo "free to keep" (va aparte del paquete normal, ver detectFreeToKeep)
// o el paquete de siempre rebajado al 100%.
function freePurchaseOption(item) {
  const options = [item.best_purchase_option, ...(item.purchase_options ?? [])].filter(Boolean);
  return (
    options.find((o) => o.is_free_to_keep) ??
    options.find((o) => o.discount_pct === 100 && Number(o.final_price_in_cents) === 0) ??
    null
  );
}

// Hasta cuando es gratis. Los regalos traen free_to_keep_ends; un descuento
// normal solo trae la fecha de fin de cada rebaja aplicada, y deja de ser
// gratis en cuanto acaba la primera.
function freeUntil(option) {
  if (option.free_to_keep_ends) return unixToIso(option.free_to_keep_ends);
  const ends = (option.active_discounts ?? [])
    .map((d) => Number(d.discount_end_date))
    .filter((t) => t > 0);
  return ends.length > 0 ? unixToIso(Math.min(...ends)) : null;
}

/**
 * Juegos gratis por rebaja o regalo segun la consulta de la propia tienda
 * (IStoreQueryService/Query), en JSON y sin key.
 *
 * Sustituye al raspado del HTML de la busqueda (`search/results`), que dejo
 * de funcionar en octubre de 2026: Steam cambio la respuesta de `json=1` y
 * la fuente devolvia 0 resultados en cada pasada sin que nada fallara.
 *
 * Y cubre lo que aquella busqueda no veia: un regalo "free to keep" sale aqui
 * como opcion de compra con is_free_to_keep, asi que ya no dependemos solo de
 * GamerPower para enterarnos de los regalos de Steam (comprobado con
 * Hexologic el 30/10/2026).
 */
export async function fetchStoreQueryFreeGames(cc, language, { maxSearchPages, resultsPerPage }) {
  const found = new Map();

  for (let page = 0; page < maxSearchPages; page++) {
    const start = page * resultsPerPage;
    const url = storeServiceUrl("IStoreQueryService", "Query", {
      query_name: "steam-free-tracker",
      query: {
        start,
        count: resultsPerPage,
        filters: {
          released_only: true,
          type_filters: { include_games: true },
          // 99 y no 100 a proposito: con 100 Steam ignora el filtro y
          // devuelve el catalogo entero. Con 99 solo salen los juegos a 0
          // (probado el 30/10/2026); el 99% real se descarta abajo.
          price_filters: { min_discount_percent: 99 },
        },
      },
      context: storeContext(cc, language),
      data_request: { include_all_purchase_options: true },
    });

    const data = await fetchJson(url, { label: `consulta de la tienda (pagina ${page})` });
    const items = data?.response?.store_items ?? [];
    const total = Number(data?.response?.metadata?.total_matching_records ?? 0);

    // Si Steam deja de respetar el filtro no hay falsos positivos (cada juego
    // se comprueba abajo), pero se veria solo un trozo del catalogo. Mejor
    // enterarse que quedarse a ciegas como paso con la busqueda HTML.
    if (page === 0 && total > 1000) {
      console.warn(
        `La consulta de la tienda devuelve ${total} juegos: parece que Steam ignora el ` +
          `filtro de descuento; esta fuente puede perderse juegos gratis`
      );
    }

    for (const item of items) {
      const option = freePurchaseOption(item);
      if (!item.appid || !option) continue;
      found.set(item.appid, {
        appid: item.appid,
        name: item.name,
        claimUrl: `${STORE_BASE}/app/${item.appid}`,
        endDate: freeUntil(option),
        source: "steam-query",
      });
    }

    if (items.length === 0 || total <= start + resultsPerPage) break;
  }

  return Array.from(found.values());
}

/**
 * Ficha de un juego segun IStoreBrowseService/GetItems. Complementa a
 * appdetails en dos cosas que esta no da bien:
 *
 *  - Confirma un regalo "free to keep" con un campo explicito
 *    (is_free_to_keep) en vez de deducirlo de package_groups, y dice hasta
 *    cuando dura (free_to_keep_ends). Antes esa fecha solo llegaba si el
 *    regalo venia de GamerPower.
 *  - Trae el resumen de reseñas. Con Hexologic (30/10/2026) el endpoint de
 *    reseñas redirigia a la portada pasada tras pasada y el juego acababa
 *    "sin verificar"; GetItems si tenia sus 690 reseñas.
 */
export async function fetchStoreItem(appid, cc, language) {
  const url = storeServiceUrl("IStoreBrowseService", "GetItems", {
    ids: [{ appid }],
    context: storeContext(cc, language),
    data_request: { include_all_purchase_options: true, include_reviews: true },
  });
  const data = await fetchJson(url, { label: `GetItems ${appid}` });
  const item = data?.response?.store_items?.[0];
  if (!item || item.success !== 1) return null;

  const option = freePurchaseOption(item);
  const summary = item.reviews?.summary_filtered;
  const reviewCount = Number(summary?.review_count ?? 0);
  const positivePercent = Number(summary?.percent_positive ?? 0);
  const totalPositive = Math.round((reviewCount * positivePercent) / 100);

  return {
    freeToKeep: option?.is_free_to_keep
      ? { packageId: option.packageid ?? null, optionText: option.purchase_option_name ?? null }
      : null,
    freeUntil: option ? freeUntil(option) : null,
    // Mismo formato que fetchReviewSummary, para poder usarlo de repuesto.
    reviews:
      reviewCount > 0
        ? {
            totalReviews: reviewCount,
            totalPositive,
            totalNegative: reviewCount - totalPositive,
            positivePercent,
            reviewScoreDesc: summary.review_score_label ?? null,
          }
        : null,
  };
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
  const data = await fetchJson(url, { label: `storesearch "${title}"` });
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = normalize(title);
  const exact = items.find((i) => normalize(i.name) === target);
  return (exact ?? items[0]).id;
}

/**
 * Steam tiene dos formas muy distintas de poner un juego a cero, y solo una
 * de ellas se ve en price_overview:
 *
 *  1. Descuento del 100%: el paquete de siempre baja a 0. Sale en specials y
 *     en price_overview con discount_percent = 100.
 *  2. Promocion "free to keep" (la que uso Moonlighter en agosto de 2026):
 *     el precio del paquete NO cambia, Steam añade un paquete gratuito
 *     temporal y la ficha muestra "Añadir a la cuenta". price_overview sigue
 *     diciendo el precio normal e is_free sigue siendo false.
 *
 * La forma (2) es la habitual en los regalos permanentes de Steam y en
 * appdetails solo se puede detectar mirando package_groups en busca de un sub
 * con licencia gratuita (GetItems lo dice directamente, ver fetchStoreItem).
 * Sin esto, un juego regalado por Steam es indistinguible de uno que sigue
 * costando dinero.
 */
function detectFreeToKeep(d) {
  const subs = (d.package_groups ?? []).flatMap((g) => g.subs ?? []);
  const freeSub = subs.find(
    (s) => s.is_free_license === true || Number(s.price_in_cents_with_discount) === 0
  );
  if (!freeSub) return null;
  return {
    packageId: freeSub.packageid ?? null,
    optionText: freeSub.option_text ?? null,
  };
}

export async function fetchAppDetails(appid, cc, language) {
  const url = `${STORE_BASE}/api/appdetails?appids=${appid}&cc=${cc}&l=${language}`;
  const data = await fetchJson(url, { label: `appdetails ${appid}` });
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
    freeToKeep: detectFreeToKeep(d),
    achievementsTotal: d.achievements?.total ?? 0,
    dlcCount: Array.isArray(d.dlc) ? d.dlc.length : 0,
    hasTrailer: Array.isArray(d.movies) && d.movies.length > 0,
  };
}
