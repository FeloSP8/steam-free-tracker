import * as cheerio from "cheerio";
import { fetchText } from "./http.js";

// Feeds que anuncian juegos gratis, como respaldo de GamerPower: antes era
// la unica fuente que veia los regalos "free to keep" de Steam, y si se caia
// no nos enterabamos de ninguno. Los dos grupos de Steam Community los
// escriben personas (Pony Island y Fireside Feelings salieron en octubre de
// 2026); LootScraper es un agregador automatico que publica un feed solo de
// Steam. Comprobados en vivo el 30/10/2026; otros grupos que aparecian en las
// busquedas (FreeSteamKeyGames, freegamecodes...) llevan años sin publicar.
const FEEDS = [
  {
    label: "GrabFreeGames",
    url: "https://steamcommunity.com/groups/GrabFreeGames/rss/",
    // Los grupos mezclan Steam con Epic, GOG, etc., y en los anuncios de
    // otras tiendas tambien enlazan la ficha de Steam como referencia. Solo
    // cuentan los que dicen "Steam" en el titulo ("Hexologic | Steam",
    // "Pony Island free in the Steam Store", "... Steam key free from ...").
    steamOnlyTitles: true,
  },
  {
    label: "Free Games Finders",
    url: "https://steamcommunity.com/groups/freegamesfinders/rss/",
    steamOnlyTitles: true,
  },
  {
    label: "LootScraper",
    url: "https://feed.phenx.de/lootscraper_steam_game.xml",
    steamOnlyTitles: false,
  },
];

// \b evita colar "SteamWorld ... free from Epic".
const STEAM_TITLE = /\bsteam\b/i;

// Los grupos de Steam publican RSS y LootScraper publica Atom; se leen los
// dos formatos para no depender de cual use cada uno. Devuelve null si la
// respuesta no es un feed (p.ej. una pagina de error en HTML); un feed vacio
// es normal: el de LootScraper solo lista las ofertas en curso.
function parseFeed(xml) {
  const $ = cheerio.load(xml, { xml: true });
  if ($("rss, feed").length === 0) return null;

  const rssItems = $("item")
    .map((_, el) => {
      const $el = $(el);
      return {
        title: $el.children("title").text().trim(),
        link: $el.children("link").text().trim(),
        date: $el.children("pubDate").text().trim(),
        body: $el.children("description").text(),
      };
    })
    .get();

  const atomEntries = $("entry")
    .map((_, el) => {
      const $el = $(el);
      return {
        title: $el.children("title").text().trim(),
        link: $el.children("link").attr("href") ?? "",
        date: ($el.children("published").text() || $el.children("updated").text()).trim(),
        // .html() y no .text(): el contenido es XHTML y los enlaces a la
        // ficha de Steam van en los href.
        body: $el.children("content").html() ?? "",
      };
    })
    .get();

  return [...rssItems, ...atomEntries];
}

function extractSteamAppIds(text) {
  const ids = [...text.matchAll(/store\.steampowered\.com\/app\/(\d+)/g)].map((m) => Number(m[1]));
  return [...new Set(ids)];
}

export async function fetchFeedGiveaways({ maxAgeDays }) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const found = new Map();

  for (const feed of FEEDS) {
    const xml = await fetchText(feed.url, {
      label: `feed ${feed.label}`,
      headers: { "User-Agent": "steam-free-tracker (contacto via github.com/FeloSP8)" },
    });
    if (xml === null) continue;

    const items = parseFeed(xml);
    if (items === null) {
      console.warn(`feed ${feed.label}: la respuesta no es un feed RSS/Atom; ¿ha cambiado de formato?`);
      continue;
    }

    let count = 0;
    for (const item of items) {
      // Un anuncio viejo puede ser de un regalo que ya acabo: sin fecha
      // fiable no se puede saber, asi que tambien se descarta.
      const published = Date.parse(item.date);
      if (!Number.isFinite(published) || published < cutoff) continue;
      if (feed.steamOnlyTitles && !STEAM_TITLE.test(item.title)) continue;

      for (const appid of extractSteamAppIds(`${item.link} ${item.body}`)) {
        count++;
        if (found.has(appid)) continue;
        found.set(appid, {
          appid,
          title: item.title,
          // El enlace del anuncio explica como se reclama una key externa;
          // si Steam confirma que es un regalo, index.js usa la ficha.
          openUrl: item.link || `https://store.steampowered.com/app/${appid}`,
          source: `feed:${feed.label}`,
        });
      }
    }

    console.log(`feed ${feed.label}: ${count} juego(s) de Steam en los ultimos ${maxAgeDays} dias`);
  }

  return Array.from(found.values());
}
