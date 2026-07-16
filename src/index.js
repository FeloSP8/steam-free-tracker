import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchFeaturedFreeGames,
  fetchSearchFreeGames,
  fetchAppDetails,
  resolveAppIdByTitle,
} from "./steamApi.js";
import { fetchSteamGiveaways } from "./gamerPower.js";
import {
  fetchReviewSummary,
  fetchRecentReviewSummary,
  fetchSteamSpy,
  fetchCurrentPlayerCount,
} from "./reviews.js";
import { evaluateGame } from "./scoring.js";
import { readSeen, writeSeen } from "./state.js";
import { buildEmailHtml, sendEmail } from "./email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SEEN_PATH = path.join(ROOT, "data", "seen.json");

async function loadConfig() {
  const raw = await readFile(path.join(ROOT, "config.json"), "utf-8");
  return JSON.parse(raw);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Combina las dos fuentes por appid cuando se conoce. Los giveaways de
// GamerPower sin appid resuelto se identifican por su propio id para no
// perderlos en la deduplicacion ni repetirlos en dias sucesivos.
function stateKey(candidate) {
  return candidate.appid ? `steam:${candidate.appid}` : `gp:${candidate.gamerPowerId}`;
}

async function collectCandidates(config) {
  const [featured, searchResults, giveaways] = await Promise.all([
    fetchFeaturedFreeGames(config.countryCode, config.language),
    fetchSearchFreeGames(config.countryCode, config.language, config.search),
    fetchSteamGiveaways(),
  ]);

  const resolved = await Promise.all(
    giveaways.map(async (g) => {
      if (g.appid) return g;
      const appid = await resolveAppIdByTitle(g.title, config.countryCode, config.language);
      return { ...g, appid };
    })
  );

  const merged = new Map();
  for (const item of [...featured, ...searchResults, ...resolved]) {
    const key = item.appid ? `appid:${item.appid}` : `gp:${item.gamerPowerId}`;
    if (!merged.has(key)) merged.set(key, item);
  }
  return Array.from(merged.values());
}

async function main() {
  const config = await loadConfig();
  const seen = await readSeen(SEEN_PATH);

  console.log("Buscando juegos que han pasado a ser gratis...");
  const candidates = await collectCandidates(config);

  const unseen = candidates.filter((c) => !seen.has(stateKey(c)));
  console.log(`${candidates.length} giveaways detectados, ${unseen.length} son nuevos.`);

  const qualifying = [];
  const rejected = [];
  const unverified = [];

  for (const candidate of unseen) {
    seen.add(stateKey(candidate));

    // Sin appid no hay forma de consultar reseñas/horas jugadas de Steam:
    // se informa igualmente pero marcado como sin verificar, en vez de
    // descartarlo o colarlo como si hubiera pasado el filtro de calidad.
    if (!candidate.appid) {
      unverified.push({
        name: candidate.title,
        claimUrl: candidate.openUrl,
        worth: candidate.worth,
        endDate: candidate.endDate,
        headerImage: candidate.image ?? null,
      });
      continue;
    }

    await sleep(300); // ritmo suave para no saturar las APIs publicas

    const [appDetails, reviews, recentReviews, steamspy, currentPlayers] = await Promise.all([
      fetchAppDetails(candidate.appid, config.countryCode, config.language),
      fetchReviewSummary(candidate.appid, config.language),
      fetchRecentReviewSummary(candidate.appid, config.language),
      fetchSteamSpy(candidate.appid),
      fetchCurrentPlayerCount(candidate.appid),
    ]);

    if (appDetails && appDetails.type !== "game") continue; // DLC, software, OST...

    // El giveaway de featuredcategories ya viene verificado al 100% de
    // descuento. El de GamerPower puede apuntar a un appid resuelto por
    // titulo (aproximado): si Steam confirma que ese appid SI tiene precio
    // normal y no esta a 0, es un falso positivo y se descarta.
    const priceOverview = appDetails?.priceOverview;
    if (priceOverview && priceOverview.discount_percent !== 100 && priceOverview.final !== 0) {
      console.log(
        `Descartado falso positivo: ${appDetails?.name ?? candidate.title} ` +
          `(precio actual: ${priceOverview.final / 100} ${priceOverview.currency})`
      );
      continue;
    }

    const name = appDetails?.name ?? candidate.title ?? candidate.name;
    const evaluation = evaluateGame({
      reviews,
      recentReviews,
      steamspy,
      appDetails,
      currentPlayers,
      quality: config.quality,
    });

    const game = {
      appid: candidate.appid,
      name,
      headerImage: appDetails?.headerImage ?? null,
      claimUrl: candidate.claimUrl ?? candidate.openUrl ?? `https://store.steampowered.com/app/${candidate.appid}`,
      ...evaluation,
    };

    (evaluation.passes ? qualifying : rejected).push(game);
  }

  if (qualifying.length > 0 || rejected.length > 0 || unverified.length > 0) {
    const dateLabel = new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const html = buildEmailHtml({ qualifying, rejected, unverified, dateLabel });
    const others = rejected.length + unverified.length;

    // El asunto solo dice "nada que destaque" cuando el correo esta
    // literalmente vacio de contenido. Si hay algo en "rejected" o
    // "unverified" (aunque no haya pasado el filtro de calidad), el asunto
    // lo refleja para no dar la impresion de que no hay nada que mirar.
    let subject;
    if (qualifying.length > 0) {
      subject = `🎮 ${qualifying.length} juego(s) gratis que merecen la pena — ${dateLabel}`;
    } else if (others > 0) {
      subject = `Steam gratis hoy: ${others} sin destacar, revisa el correo — ${dateLabel}`;
    } else {
      subject = `Steam gratis hoy: nada que destacar — ${dateLabel}`;
    }

    await sendEmail({ subject, html });
    console.log("Email enviado.");
  } else {
    console.log("No hay giveaways nuevos, no se envía email.");
  }

  await writeSeen(SEEN_PATH, seen);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
