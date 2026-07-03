import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchNewlyFreeGames, fetchAppDetails } from "./steamApi.js";
import { fetchReviewSummary, fetchSteamSpy } from "./reviews.js";
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

async function main() {
  const config = await loadConfig();
  const seen = await readSeen(SEEN_PATH);

  console.log("Buscando juegos que han pasado a ser gratis...");
  const candidates = await fetchNewlyFreeGames(
    config.countryCode,
    config.language,
    config.search
  );

  const unseen = candidates.filter((c) => !seen.has(c.appid));
  console.log(
    `${candidates.length} juegos gratis detectados, ${unseen.length} son nuevos.`
  );

  const qualifying = [];
  const rejected = [];

  for (const candidate of unseen) {
    // Ritmo suave para no golpear las APIs publicas de Steam/SteamSpy de golpe.
    await sleep(300);

    const [appDetails, reviews, steamspy] = await Promise.all([
      fetchAppDetails(candidate.appid, config.countryCode, config.language),
      fetchReviewSummary(candidate.appid, config.language),
      fetchSteamSpy(candidate.appid),
    ]);

    // Descarta DLC, software, bandas sonoras, etc. Solo nos interesan juegos.
    if (appDetails && appDetails.type !== "game") continue;

    // Segunda verificacion independiente del descuento del 100%, usando la
    // API oficial de detalles (fiable) en vez del scraping de busqueda.
    // Si no coincide, se descarta como falso positivo y NO se marca como
    // visto, para poder reevaluarlo si vuelve a aparecer con datos correctos.
    const priceOverview = appDetails?.priceOverview;
    if (priceOverview && priceOverview.discount_percent !== 100) {
      console.log(
        `Descartado falso positivo: ${appDetails?.name ?? candidate.appid} ` +
          `(descuento real: ${priceOverview.discount_percent}%)`
      );
      continue;
    }

    const name = appDetails?.name ?? candidate.name;
    const evaluation = evaluateGame({ reviews, steamspy, appDetails, quality: config.quality });

    const game = {
      appid: candidate.appid,
      name,
      headerImage: appDetails?.headerImage ?? null,
      ...evaluation,
    };

    if (evaluation.passes) {
      qualifying.push(game);
    } else {
      rejected.push(game);
    }

    seen.add(candidate.appid);
  }

  if (qualifying.length > 0 || rejected.length > 0) {
    const dateLabel = new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const html = buildEmailHtml({ qualifying, rejected, dateLabel });
    const subject =
      qualifying.length > 0
        ? `🎮 ${qualifying.length} juego(s) gratis que merecen la pena — ${dateLabel}`
        : `Steam gratis hoy: nada que destaque — ${dateLabel}`;

    await sendEmail({ subject, html });
    console.log("Email enviado.");
  } else {
    console.log("No hay juegos nuevos, no se envía email.");
  }

  await writeSeen(SEEN_PATH, seen);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
