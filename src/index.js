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

// Como es gratis un juego ahora mismo. Antes se descartaba cualquier
// candidato al que Steam siguiera poniendo precio, y eso borraba justo los
// dos casos mas interesantes: las promociones "free to keep" (donde el precio
// del paquete no cambia) y los giveaways de key externa. Ahora se etiqueta en
// vez de descartarse, que es lo que permite decidir con criterio.
function classifyAvailability(appDetails) {
  const price = appDetails.priceOverview;

  if (appDetails.freeToKeep) {
    return {
      kind: "steam-free-to-keep",
      label: "Regalo de Steam: pulsa «Añadir a la cuenta» y es tuyo para siempre",
    };
  }

  if (price?.discount_percent === 100 || price?.final === 0) {
    return { kind: "steam-discount", label: "Gratis en Steam ahora mismo (-100%)" };
  }

  if (appDetails.isFree) {
    return { kind: "free-to-play", label: "Free to play (no es una promocion temporal)" };
  }

  if (price) {
    const amount = (price.final / 100).toFixed(2);
    return {
      kind: "external-key",
      label: `Key de giveaway externo — en Steam sigue costando ${amount} ${price.currency}`,
    };
  }

  return { kind: "unknown", label: "Steam no informa del precio de este juego" };
}

async function collectCandidates(config) {
  const [featured, searchResults, giveaways] = await Promise.all([
    fetchFeaturedFreeGames(config.countryCode, config.language),
    fetchSearchFreeGames(config.countryCode, config.language, config.search),
    fetchSteamGiveaways(),
  ]);

  console.log(
    `Fuentes — portada: ${featured.length}, busqueda: ${searchResults.length}, ` +
      `GamerPower: ${giveaways.length}`
  );

  const resolved = await Promise.all(
    giveaways.map(async (g) => {
      if (g.appid) return g;
      const appid = await resolveAppIdByTitle(g.title, config.countryCode, config.language);
      return { ...g, appid };
    })
  );

  const merged = new Map();
  for (const item of [...featured, ...searchResults, ...resolved]) {
    const key = stateKey(item);
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
      seen.add(stateKey(candidate));
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

    // Sin ficha de Steam no se puede ni clasificar ni puntuar. Es un fallo
    // temporal (429, corte de red), no una decision: no se marca como visto
    // para que la siguiente ejecucion lo reintente en vez de silenciarlo.
    if (!appDetails) {
      console.warn(
        `Sin ficha de Steam para ${candidate.title ?? candidate.name} ` +
          `(appid ${candidate.appid}); se reintentara en la proxima ejecucion.`
      );
      continue;
    }

    seen.add(stateKey(candidate));

    if (appDetails.type !== "game") {
      console.log(`Descartado por tipo "${appDetails.type}": ${appDetails.name}`);
      continue; // DLC, software, OST...
    }

    const availability = classifyAvailability(appDetails);
    console.log(`${appDetails.name}: ${availability.label}`);

    const name = appDetails.name ?? candidate.title ?? candidate.name;
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
      headerImage: appDetails.headerImage ?? null,
      // En un regalo de Steam el sitio donde se reclama es la propia ficha,
      // no el enlace del agregador: es donde esta el boton "Añadir a la cuenta".
      claimUrl:
        availability.kind.startsWith("steam-")
          ? `https://store.steampowered.com/app/${candidate.appid}`
          : candidate.claimUrl ?? candidate.openUrl ?? `https://store.steampowered.com/app/${candidate.appid}`,
      availability,
      endDate: candidate.endDate ?? null,
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
