import nodemailer from "nodemailer";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function steamClientUrl(appid) {
  return `steam://store/${appid}`;
}

function gameCardHtml(game) {
  const hours =
    game.avgPlaytimeMinutes !== null
      ? `${(game.avgPlaytimeMinutes / 60).toFixed(1)}h de media jugadas`
      : "sin datos de horas jugadas";

  return `
  <tr>
    <td style="padding:16px 0;border-bottom:1px solid #333;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="184" valign="top">
            ${
              game.headerImage
                ? `<img src="${escapeHtml(game.headerImage)}" width="184" style="border-radius:6px;display:block;" />`
                : ""
            }
          </td>
          <td style="padding-left:16px;" valign="top">
            <h3 style="margin:0 0 6px 0;font-size:17px;">${escapeHtml(game.name)}</h3>
            <p style="margin:0 0 4px 0;font-size:13px;color:#ccc;">
              ${escapeHtml(game.reviewScoreDesc ?? "Sin valoración")} · ${game.positivePercent}% positivas
              · ${game.totalReviews.toLocaleString("es-ES")} reseñas
            </p>
            <p style="margin:0 0 4px 0;font-size:13px;color:#ccc;">${hours}</p>
            ${
              game.metacritic
                ? `<p style="margin:0 0 4px 0;font-size:13px;color:#ccc;">Metacritic: ${game.metacritic}</p>`
                : ""
            }
            <p style="margin:8px 0 0 0;">
              <a href="${escapeHtml(game.claimUrl)}"
                 style="background:#1a9fff;color:#fff;text-decoration:none;padding:8px 14px;border-radius:4px;font-size:13px;display:inline-block;">
                 Reclamar
              </a>
              ${
                game.appid
                  ? `<a href="${escapeHtml(steamClientUrl(game.appid))}"
                       style="margin-left:8px;color:#1a9fff;text-decoration:none;font-size:13px;">
                       Abrir en app de Steam
                     </a>`
                  : ""
              }
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function rejectedRowHtml(game) {
  return `
  <tr>
    <td style="padding:6px 0;font-size:13px;color:#999;border-bottom:1px solid #222;">
      <strong style="color:#ccc;">${escapeHtml(game.name)}</strong> —
      <a href="${escapeHtml(game.claimUrl)}" style="color:#1a9fff;">ver</a>
      · ${escapeHtml(game.reasons.join(", "))}
    </td>
  </tr>`;
}

function unverifiedRowHtml(game) {
  const worth = game.worth && game.worth !== "N/A" ? ` · valorado en ${escapeHtml(game.worth)}` : "";
  const end = game.endDate && game.endDate !== "N/A" ? ` · hasta ${escapeHtml(game.endDate)}` : "";
  return `
  <tr>
    <td style="padding:6px 0;font-size:13px;color:#999;border-bottom:1px solid #222;">
      <strong style="color:#ccc;">${escapeHtml(game.name)}</strong> —
      <a href="${escapeHtml(game.claimUrl)}" style="color:#1a9fff;">reclamar</a>
      ${worth}${end}
    </td>
  </tr>`;
}

export function buildEmailHtml({ qualifying, rejected, unverified, dateLabel }) {
  const qualifyingHtml =
    qualifying.length > 0
      ? qualifying.map(gameCardHtml).join("")
      : `<tr><td style="padding:12px 0;color:#999;">Ningún juego nuevo gratis ha superado el filtro de calidad hoy.</td></tr>`;

  const rejectedHtml =
    rejected.length > 0
      ? `
      <h4 style="margin:24px 0 8px 0;font-size:14px;color:#999;">
        También se han vuelto gratis, pero no cumplen el criterio de calidad
      </h4>
      <table cellpadding="0" cellspacing="0" width="100%">${rejected
        .map(rejectedRowHtml)
        .join("")}</table>`
      : "";

  const unverifiedHtml =
    unverified && unverified.length > 0
      ? `
      <h4 style="margin:24px 0 8px 0;font-size:14px;color:#999;">
        Giveaways de Steam sin datos de reseñas para verificar calidad
      </h4>
      <table cellpadding="0" cellspacing="0" width="100%">${unverified
        .map(unverifiedRowHtml)
        .join("")}</table>`
      : "";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#1b2838;color:#fff;padding:24px;max-width:640px;margin:0 auto;">
    <h2 style="margin:0 0 4px 0;">Juegos gratis en Steam — ${escapeHtml(dateLabel)}</h2>
    <p style="margin:0 0 16px 0;color:#999;font-size:13px;">
      Resumen diario automático. Solo se destacan los que cumplen el filtro de calidad
      (reseñas, % positivas, horas medias jugadas).
    </p>
    <table cellpadding="0" cellspacing="0" width="100%">${qualifyingHtml}</table>
    ${rejectedHtml}
    ${unverifiedHtml}
    <p style="margin:24px 0 0 0;color:#666;font-size:11px;">
      Datos de giveaways cortesía de <a href="https://www.gamerpower.com" style="color:#666;">GamerPower.com</a>.
    </p>
  </div>`;
}

export async function sendEmail({ subject, html }) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_TO } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !EMAIL_TO) {
    throw new Error(
      "Faltan variables de entorno GMAIL_USER, GMAIL_APP_PASSWORD o EMAIL_TO"
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"Steam Free Tracker" <${GMAIL_USER}>`,
    to: EMAIL_TO,
    subject,
    html,
  });
}
