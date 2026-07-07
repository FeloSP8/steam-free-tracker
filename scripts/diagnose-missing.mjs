// Script de diagnostico TEMPORAL: investiga por que unos juegos concretos
// (reportados como gratis en una noticia) no fueron detectados por el
// tracker. Solo hace peticiones de lectura, no envia email ni toca estado.
import { fetchSteamGiveaways } from "../src/gamerPower.js";
import { resolveAppIdByTitle, fetchAppDetails } from "../src/steamApi.js";

const TITLES = [
  "The Queen's Gondola",
  "Leap of Legends",
  "EVEN OR ODD 1",
  "The Tartarus Loop",
];

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function main() {
  console.log("Descargando lista de giveaways de GamerPower (platform=steam&type=game)...");
  const giveaways = await fetchSteamGiveaways();
  console.log(`GamerPower devolvio ${giveaways.length} giveaways de tipo "game" para Steam.\n`);

  for (const title of TITLES) {
    console.log(`=== ${title} ===`);

    const inGamerPower = giveaways.find((g) => normalize(g.title).includes(normalize(title)));
    if (inGamerPower) {
      console.log(`  GamerPower: SI aparece -> appid resuelto=${inGamerPower.appid}, openUrl=${inGamerPower.openUrl}`);
    } else {
      console.log("  GamerPower: NO aparece en la lista de giveaways type=game para Steam.");
    }

    const appid = inGamerPower?.appid ?? (await resolveAppIdByTitle(title, "us", "spanish"));
    if (!appid) {
      console.log("  Steam storesearch: no se encontro ningun appid para este titulo.\n");
      continue;
    }

    const details = await fetchAppDetails(appid, "us", "spanish");
    if (!details) {
      console.log(`  appid=${appid} pero appdetails no devolvio datos (quiza no es un 'game' o esta restringido por region).\n`);
      continue;
    }

    console.log(`  appid=${appid} | nombre real="${details.name}" | tipo=${details.type} | is_free=${details.isFree}`);
    if (details.priceOverview) {
      console.log(
        `  price_overview: final=${details.priceOverview.final / 100}${details.priceOverview.currency} ` +
          `discount_percent=${details.priceOverview.discount_percent}%`
      );
    } else {
      console.log("  price_overview: ausente (esto es tipico de un juego marcado como Free permanente, no una oferta temporal)");
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
