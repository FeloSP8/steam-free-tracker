// Script de diagnostico TEMPORAL: investiga por que "Against the Storm"
// (gratis temporalmente segun NotebookCheck, hasta el 13 de julio) no fue
// detectado. Solo lectura, no envia email ni toca estado.
import { fetchAppDetails, resolveAppIdByTitle, fetchFeaturedFreeGames } from "../src/steamApi.js";

const STORE_BASE = "https://store.steampowered.com";
const GAMERPOWER_BASE = "https://www.gamerpower.com/api";

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function main() {
  const title = "Against the Storm";

  // 1. Resolver appid real
  const appid = await resolveAppIdByTitle(title, "us", "spanish");
  console.log(`appid resuelto: ${appid}`);

  // 2. appdetails -> price_overview real ahora mismo
  const details = await fetchAppDetails(appid, "us", "spanish");
  console.log(`nombre="${details?.name}" tipo=${details?.type} is_free=${details?.isFree}`);
  console.log("price_overview:", JSON.stringify(details?.priceOverview));

  // 3. featuredcategories -> aparece en la lista de specials que ya consultamos?
  const featured = await fetchFeaturedFreeGames("us", "spanish");
  const inFeatured = featured.find((f) => f.appid === appid);
  console.log(`\n¿Aparece en featuredcategories.specials (100% off)?`, inFeatured ? "SI" : "NO");
  console.log(`Total de items con 100% off en featuredcategories ahora mismo: ${featured.length}`);

  // 3b. Cuantos items en TOTAL trae featuredcategories.specials (no solo los de 100%),
  // para ver si Against the Storm esta ahi pero con otro discount_percent o simplemente
  // no esta porque la lista es una rotacion corta de "top deals".
  const rawRes = await fetch(`${STORE_BASE}/api/featuredcategories?cc=us&l=spanish`);
  const rawData = await rawRes.json();
  const allSpecialsItems = rawData?.specials?.items ?? [];
  console.log(`Total de items (cualquier %) en featuredcategories.specials: ${allSpecialsItems.length}`);
  const rawMatch = allSpecialsItems.find((i) => i.id === appid);
  console.log("Entrada cruda para este appid en specials:", JSON.stringify(rawMatch));

  // 4. GamerPower -> aparece con CUALQUIER filtro (sin restringir platform/type)?
  const gpRes = await fetch(`${GAMERPOWER_BASE}/giveaways`);
  const gpData = await gpRes.json();
  console.log(`\nGamerPower TOTAL giveaways (sin filtro): ${gpData.length}`);
  const gpMatch = gpData.find((g) => normalize(g.title).includes(normalize(title)));
  if (gpMatch) {
    console.log("Encontrado en GamerPower (sin filtro):", JSON.stringify(gpMatch, null, 2));
  } else {
    console.log("NO aparece en GamerPower bajo ningun tipo/plataforma.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
