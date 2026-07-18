// Script de prueba TEMPORAL: usa juegos de pago reales (no gratis) para
// verificar que el correo llega a todos los destinatarios de EMAIL_TO
// (incluidos los que se hayan añadido recientemente), sin depender de que
// exista un giveaway activo hoy. No toca data/seen.json.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchAppDetails } from "../src/steamApi.js";
import {
  fetchReviewSummary,
  fetchRecentReviewSummary,
  fetchSteamSpy,
  fetchCurrentPlayerCount,
} from "../src/reviews.js";
import { evaluateGame } from "../src/scoring.js";
import { buildEmailHtml, sendEmail } from "../src/email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function loadConfig() {
  const raw = await readFile(path.join(ROOT, "config.json"), "utf-8");
  return JSON.parse(raw);
}

// Hades: reseñas extremadamente positivas, ejemplo de "qualifying".
// Battlefield 2042: reseñas mixtas/negativas, ejemplo de "rejected".
const TEST_GAMES = [
  { appid: 1145360, label: "Hades" },
  { appid: 1517290, label: "Battlefield 2042" },
];

async function evaluateTestGame(appid, config) {
  const [appDetails, reviews, recentReviews, steamspy, currentPlayers] = await Promise.all([
    fetchAppDetails(appid, config.countryCode, config.language),
    fetchReviewSummary(appid, config.language),
    fetchRecentReviewSummary(appid, config.language),
    fetchSteamSpy(appid),
    fetchCurrentPlayerCount(appid),
  ]);

  const evaluation = evaluateGame({
    reviews,
    recentReviews,
    steamspy,
    appDetails,
    currentPlayers,
    quality: config.quality,
  });

  return {
    appid,
    name: appDetails?.name ?? `appid ${appid}`,
    headerImage: appDetails?.headerImage ?? null,
    claimUrl: `https://store.steampowered.com/app/${appid}`,
    ...evaluation,
  };
}

async function main() {
  const config = await loadConfig();

  const qualifying = [];
  const rejected = [];

  for (const { appid, label } of TEST_GAMES) {
    console.log(`Evaluando ${label} (appid ${appid})...`);
    const game = await evaluateTestGame(appid, config);
    console.log(
      `  -> ${game.passes ? "PASA" : "NO PASA"} (${game.positivePercent}% positivas, ` +
        `${game.totalReviews} reseñas)`
    );
    (game.passes ? qualifying : rejected).push(game);
  }

  const unverified = [
    {
      name: "[Ejemplo] Steam Key Giveaway vía partner",
      claimUrl: "https://www.gamerpower.com",
      worth: "$9.99",
      endDate: "N/A",
      headerImage: null,
    },
  ];

  const dateLabel = new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const html = buildEmailHtml({
    qualifying,
    rejected,
    unverified,
    dateLabel,
    banner:
      "⚠️ Correo de PRUEBA generado manualmente con juegos de pago reales " +
      "(no gratis) para confirmar que llega a todos los destinatarios de EMAIL_TO. " +
      "No indica ningún giveaway real.",
  });

  console.log(`Enviando a EMAIL_TO=${process.env.EMAIL_TO}`);

  await sendEmail({
    subject: `[PRUEBA] Confirmación de destinatarios — ${dateLabel}`,
    html,
  });

  console.log("Email de prueba enviado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
