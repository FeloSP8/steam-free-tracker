import nodemailer from "nodemailer";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function steamClientUrl(appid) {
  return `steam://store/${appid}`;
}

// Las dos secciones de juegos con appid usan la misma tarjeta. La de los
// descartados va atenuada y con la imagen mas pequeña, pero enseña los mismos
// datos: para decidir si un "no cumple el criterio" te interesa igualmente
// hace falta ver la portada, la nota y el genero, no solo el motivo del veto.
const CARD_VARIANTS = {
  destacado: {
    imageWidth: 184,
    titleTag: "h3",
    titleSize: "17px",
    titleColor: "#fff",
    textColor: "#ccc",
    padding: "16px 0",
    border: "#333",
    buttonText: "Reclamar",
  },
  secundario: {
    imageWidth: 120,
    titleTag: "h4",
    titleSize: "15px",
    titleColor: "#ccc",
    textColor: "#999",
    padding: "12px 0",
    border: "#222",
    buttonText: "Ver en Steam",
  },
};

function gameCardHtml(game, variantName = "destacado") {
  const v = CARD_VARIANTS[variantName];
  const hours =
    game.avgPlaytimeMinutes !== null
      ? `${(game.avgPlaytimeMinutes / 60).toFixed(1)}h de media jugadas`
      : "sin datos de horas jugadas";

  const signals = [];
  if (game.currentPlayers !== null && game.currentPlayers !== undefined) {
    signals.push(`${game.currentPlayers.toLocaleString("es-ES")} jugando ahora`);
  }
  if (game.achievementsTotal) signals.push(`${game.achievementsTotal} logros`);
  if (game.dlcCount) signals.push(`${game.dlcCount} DLC`);
  if (game.hasTrailer === false) signals.push("sin trailer propio ⚠️");
  if (game.releaseDate) signals.push(escapeHtml(game.releaseDate));
  if (game.genres?.length) signals.push(escapeHtml(game.genres.slice(0, 3).join(", ")));

  const description = game.shortDescription
    ? `<p style="margin:0 0 6px 0;font-size:13px;color:${
        CARD_VARIANTS[variantName].textColor
      };line-height:1.4;">${escapeHtml(game.shortDescription)}</p>`
    : "";

  // Un regalo de Steam y una key de un agregador se reclaman de forma
  // distinta y caducan de forma distinta: decirlo evita abrir la ficha y no
  // entender por que no aparece el boton de gratis.
  const availability = game.availability
    ? `<p style="margin:0 0 6px 0;font-size:13px;color:${
        game.availability.kind.startsWith("steam-") ? "#a4d007" : "#c0a060"
      };">${escapeHtml(game.availability.label)}${
        game.endDate && game.endDate !== "N/A" ? ` · hasta ${escapeHtml(game.endDate)}` : ""
      }</p>`
    : "";

  // En los descartados el motivo del veto es el dato mas importante: es lo
  // que te deja juzgar si el filtro se ha pasado de estricto para tu gusto.
  const reasons =
    variantName === "secundario" && game.reasons?.length
      ? `<p style="margin:6px 0 0 0;font-size:12px;color:#c07a5a;">
           No destacado: ${escapeHtml(game.reasons.join(" · "))}
         </p>`
      : "";

  return `
  <tr>
    <td style="padding:${v.padding};border-bottom:1px solid ${v.border};">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="${v.imageWidth}" valign="top">
            ${
              game.headerImage
                ? `<img src="${escapeHtml(game.headerImage)}" width="${v.imageWidth}" style="border-radius:6px;display:block;" />`
                : ""
            }
          </td>
          <td style="padding-left:16px;" valign="top">
            <${v.titleTag} style="margin:0 0 6px 0;font-size:${v.titleSize};color:${v.titleColor};">
              ${escapeHtml(game.name)}
            </${v.titleTag}>
            ${availability}
            ${description}
            <p style="margin:0 0 4px 0;font-size:13px;color:${v.textColor};">
              ${escapeHtml(game.reviewScoreDesc ?? "Sin valoración")} · ${game.positivePercent}% positivas
              · ${game.totalReviews.toLocaleString("es-ES")} reseñas
            </p>
            <p style="margin:0 0 4px 0;font-size:13px;color:${v.textColor};">${hours}</p>
            ${
              game.metacritic
                ? `<p style="margin:0 0 4px 0;font-size:13px;color:${v.textColor};">Metacritic: ${game.metacritic}</p>`
                : ""
            }
            ${
              signals.length > 0
                ? `<p style="margin:0 0 4px 0;font-size:12px;color:#888;">${signals.join(" · ")}</p>`
                : ""
            }
            ${reasons}
            <p style="margin:8px 0 0 0;">
              <a href="${escapeHtml(game.claimUrl)}"
                 style="background:#1a9fff;color:#fff;text-decoration:none;padding:8px 14px;border-radius:4px;font-size:13px;display:inline-block;">
                 ${v.buttonText}
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

function unverifiedRowHtml(game) {
  const worth = game.worth && game.worth !== "N/A" ? ` · valorado en ${escapeHtml(game.worth)}` : "";
  const end = game.endDate && game.endDate !== "N/A" ? ` · hasta ${escapeHtml(game.endDate)}` : "";
  return `
  <tr>
    <td style="padding:10px 0;font-size:13px;color:#999;border-bottom:1px solid #222;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          ${
            game.headerImage
              ? `<td width="92" valign="top" style="padding-right:12px;">
                   <img src="${escapeHtml(game.headerImage)}" width="92" style="border-radius:4px;display:block;" />
                 </td>`
              : ""
          }
          <td valign="top">
            <strong style="color:#ccc;">${escapeHtml(game.name)}</strong> —
            <a href="${escapeHtml(game.claimUrl)}" style="color:#1a9fff;">reclamar</a>
            ${worth}${end}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function buildEmailHtml({ qualifying, rejected, unverified, dateLabel }) {
  const qualifyingHtml =
    qualifying.length > 0
      ? qualifying.map((game) => gameCardHtml(game, "destacado")).join("")
      : `<tr><td style="padding:12px 0;color:#999;">Ningún juego nuevo gratis ha superado el filtro de calidad hoy.</td></tr>`;

  const rejectedHtml =
    rejected.length > 0
      ? `
      <h4 style="margin:24px 0 8px 0;font-size:14px;color:#999;">
        También se han vuelto gratis, pero no cumplen el criterio de calidad
      </h4>
      <table cellpadding="0" cellspacing="0" width="100%">${rejected
        .map((game) => gameCardHtml(game, "secundario"))
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
      (nº de reseñas, % positivas, horas medias jugadas, sin deterioro reciente).
    </p>
    <table cellpadding="0" cellspacing="0" width="100%">${qualifyingHtml}</table>
    ${rejectedHtml}
    ${unverifiedHtml}
    <p style="margin:24px 0 0 0;color:#666;font-size:11px;">
      Datos de giveaways cortesía de <a href="https://www.gamerpower.com" style="color:#666;">GamerPower.com</a>.
    </p>
  </div>`;
}

// Enmascara direcciones para poder registrarlas en los logs de GitHub
// Actions sin publicar correos de nadie (este repo es publico).
function maskEmail(address) {
  const [local, domain] = address.trim().split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
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

  const recipients = EMAIL_TO.split(",").map((a) => a.trim()).filter(Boolean);
  console.log(`Destinatarios configurados (${recipients.length}): ${recipients.map(maskEmail).join(", ")}`);

  const info = await transporter.sendMail({
    from: `"Steam Free Tracker" <${GMAIL_USER}>`,
    to: EMAIL_TO,
    subject,
    html,
  });

  // accepted/rejected vienen del propio servidor SMTP de Gmail: si una
  // direccion esta mal escrita o no existe, aparece aqui como rechazada
  // en el momento del envio, sin necesidad de adivinar por que no llego.
  console.log(`Aceptados por Gmail: ${(info.accepted ?? []).map(maskEmail).join(", ") || "ninguno"}`);
  if (info.rejected && info.rejected.length > 0) {
    console.log(`Rechazados por Gmail: ${info.rejected.map(maskEmail).join(", ")}`);
  }
}
