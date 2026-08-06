import nodemailer from "nodemailer";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function steamClientUrl(appid) {
  return `steam://store/${appid}`;
}

// Las fechas de GamerPower vienen como "2026-08-09 23:59:00", que en un
// correo se lee fatal.
function formatEndDate(raw) {
  if (!raw || raw === "N/A") return null;
  const parsed = new Date(String(raw).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return escapeHtml(raw);
  return parsed.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

// Las dos secciones de juegos con appid usan la misma tarjeta. La de los
// descartados va atenuada, pero enseña los mismos datos: para decidir si un
// "no cumple el criterio" te interesa igualmente hace falta ver la portada,
// la nota y el genero, no solo el motivo del veto.
//
// La tarjeta es de una sola columna a proposito. La version anterior ponia
// portada y texto en dos celdas de una tabla, y en el movil eso estrangulaba
// la columna de texto a dos palabras por linea con un hueco muerto enorme
// bajo la imagen. Apilar no necesita media queries (que Gmail aplica de
// forma irregular) y se ve igual de bien en movil y en escritorio.
const CARD_VARIANTS = {
  destacado: {
    titleSize: "19px",
    titleColor: "#ffffff",
    textColor: "#c6d4e1",
    background: "#16202d",
    border: "#2a3f5a",
    buttonText: "Reclamar",
  },
  secundario: {
    titleSize: "16px",
    titleColor: "#c6d4e1",
    background: "#141c26",
    border: "#243448",
    buttonText: "Ver en Steam",
  },
};

function gameCardHtml(game, variantName = "destacado") {
  const v = CARD_VARIANTS[variantName];
  const muted = "#8a9bad";

  // Linea principal: lo que decide si el juego te interesa.
  const score = `${escapeHtml(game.reviewScoreDesc ?? "Sin valoración")} · ${
    game.positivePercent
  }% de ${game.totalReviews.toLocaleString("es-ES")} reseñas`;

  // Linea secundaria: todo lo demas junto, para no encadenar seis parrafos
  // de una linea cada uno.
  const meta = [];
  if (game.metacritic) meta.push(`Metacritic ${game.metacritic}`);
  meta.push(
    game.avgPlaytimeMinutes !== null && game.avgPlaytimeMinutes !== undefined
      ? `${(game.avgPlaytimeMinutes / 60).toFixed(1)}h de media`
      : "horas jugadas sin datos"
  );
  if (game.currentPlayers !== null && game.currentPlayers !== undefined) {
    meta.push(`${game.currentPlayers.toLocaleString("es-ES")} jugando ahora`);
  }
  if (game.achievementsTotal) meta.push(`${game.achievementsTotal} logros`);
  if (game.dlcCount) meta.push(`${game.dlcCount} DLC`);
  if (game.hasTrailer === false) meta.push("sin trailer propio ⚠️");

  const tags = [];
  if (game.releaseDate) tags.push(escapeHtml(game.releaseDate));
  if (game.genres?.length) tags.push(escapeHtml(game.genres.slice(0, 3).join(", ")));

  // Un regalo de Steam y una key de un agregador se reclaman de forma
  // distinta: decirlo evita abrir la ficha y no entender por que no aparece
  // el boton de gratis. La etiqueta corta va en una pastilla y el detalle
  // largo debajo, en vez de un parrafo de colores de cuatro lineas.
  const esDeSteam = game.availability?.kind.startsWith("steam-");
  const endDate = formatEndDate(game.endDate);
  const detalle = [game.availability?.detail, endDate ? `hasta el ${endDate}` : null]
    .filter(Boolean)
    .join(" · ");

  const availability = game.availability
    ? `<p style="margin:0 0 10px 0;">
         <span style="display:inline-block;background:${esDeSteam ? "#2b4a12" : "#4a3a12"};
                      color:${esDeSteam ? "#c3f04a" : "#f0cd4a"};font-size:12px;font-weight:bold;
                      padding:5px 10px;border-radius:4px;">
           ${escapeHtml(game.availability.badge)}
         </span>
         ${
           detalle
             ? `<span style="display:block;margin-top:6px;font-size:12px;color:${muted};">${escapeHtml(
                 detalle
               )}</span>`
             : ""
         }
       </p>`
    : "";

  // En los descartados el motivo del veto es el dato mas importante: es lo
  // que te deja juzgar si el filtro se ha pasado de estricto para tu gusto.
  const reasons =
    variantName === "secundario" && game.reasons?.length
      ? `<p style="margin:12px 0 0 0;padding:8px 10px;background:#2a1f14;border-radius:4px;
                   font-size:12px;color:#e0a878;line-height:1.4;">
           <strong>No destacado:</strong> ${escapeHtml(game.reasons.join(" · "))}
         </p>`
      : "";

  return `
  <tr>
    <td style="padding:0 0 16px 0;">
      <table cellpadding="0" cellspacing="0" width="100%" role="presentation"
             style="background:${v.background};border:1px solid ${v.border};border-radius:8px;">
        ${
          game.headerImage
            ? `<tr>
                 <td style="padding:0;line-height:0;">
                   <a href="${escapeHtml(game.claimUrl)}">
                     <img src="${escapeHtml(game.headerImage)}" alt="" width="600"
                          style="width:100%;max-width:100%;height:auto;display:block;
                                 border-radius:7px 7px 0 0;" />
                   </a>
                 </td>
               </tr>`
            : ""
        }
        <tr>
          <td style="padding:16px;">
            <h3 style="margin:0 0 8px 0;font-size:${v.titleSize};line-height:1.3;color:${v.titleColor};">
              ${escapeHtml(game.name)}
            </h3>
            ${availability}
            ${
              game.shortDescription
                ? `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.5;color:${v.textColor};">
                     ${escapeHtml(game.shortDescription)}
                   </p>`
                : ""
            }
            <p style="margin:0 0 4px 0;font-size:14px;color:${v.textColor};">${score}</p>
            <p style="margin:0 0 4px 0;font-size:13px;color:${muted};">${meta.join(" · ")}</p>
            ${
              tags.length > 0
                ? `<p style="margin:0;font-size:12px;color:${muted};">${tags.join(" · ")}</p>`
                : ""
            }
            ${reasons}
            <p style="margin:16px 0 0 0;">
              <a href="${escapeHtml(game.claimUrl)}"
                 style="background:#1a9fff;color:#fff;text-decoration:none;padding:12px 20px;
                        border-radius:4px;font-size:15px;font-weight:bold;display:inline-block;">
                ${v.buttonText}
              </a>
              ${
                game.appid
                  ? `<a href="${escapeHtml(steamClientUrl(game.appid))}"
                       style="display:inline-block;margin:8px 0 0 12px;color:#66c0f4;
                              text-decoration:none;font-size:13px;">
                      Abrir en la app
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
  const endDate = formatEndDate(game.endDate);
  const detalle = [
    game.worth && game.worth !== "N/A" ? `valorado en ${escapeHtml(game.worth)}` : null,
    endDate ? `hasta el ${endDate}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `
  <tr>
    <td style="padding:0 0 12px 0;">
      <table cellpadding="0" cellspacing="0" width="100%" role="presentation"
             style="background:#141c26;border:1px solid #243448;border-radius:8px;">
        ${
          game.headerImage
            ? `<tr>
                 <td style="padding:0;line-height:0;">
                   <a href="${escapeHtml(game.claimUrl)}">
                     <img src="${escapeHtml(game.headerImage)}" alt="" width="600"
                          style="width:100%;max-width:100%;height:auto;display:block;
                                 border-radius:7px 7px 0 0;" />
                   </a>
                 </td>
               </tr>`
            : ""
        }
        <tr>
          <td style="padding:14px 16px;">
            <h3 style="margin:0 0 6px 0;font-size:16px;line-height:1.3;color:#c6d4e1;">
              ${escapeHtml(game.name)}
            </h3>
            ${
              detalle
                ? `<p style="margin:0 0 10px 0;font-size:12px;color:#8a9bad;">${detalle}</p>`
                : ""
            }
            <p style="margin:0;">
              <a href="${escapeHtml(game.claimUrl)}"
                 style="background:#1a9fff;color:#fff;text-decoration:none;padding:10px 18px;
                        border-radius:4px;font-size:14px;font-weight:bold;display:inline-block;">
                Reclamar
              </a>
            </p>
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
      : `<tr><td style="padding:0 0 8px 0;font-size:14px;color:#8a9bad;">
           Ningún juego nuevo gratis ha superado el filtro de calidad hoy.
         </td></tr>`;

  const sectionTitle = (text) =>
    `<h4 style="margin:28px 0 12px 0;font-size:13px;font-weight:bold;letter-spacing:0.5px;
                text-transform:uppercase;color:#8a9bad;">${text}</h4>`;

  const rejectedHtml =
    rejected.length > 0
      ? sectionTitle("También gratis, pero no cumplen el criterio") +
        `<table cellpadding="0" cellspacing="0" width="100%" role="presentation">${rejected
          .map((game) => gameCardHtml(game, "secundario"))
          .join("")}</table>`
      : "";

  const unverifiedHtml =
    unverified && unverified.length > 0
      ? sectionTitle("Sin datos de reseñas para verificar calidad") +
        `<table cellpadding="0" cellspacing="0" width="100%" role="presentation">${unverified
          .map(unverifiedRowHtml)
          .join("")}</table>`
      : "";

  // El ancho maximo es ajustado a proposito: la portada de Steam mide 460px,
  // asi que a 520 llena la tarjeta sin verse escalada, y en movil la columna
  // de texto sigue siendo comoda.
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>Juegos gratis en Steam</title>
</head>
<body style="margin:0;padding:0;background:#0e1520;">
  <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="background:#0e1520;">
    <tr>
      <td align="center" style="padding:16px;">
        <table cellpadding="0" cellspacing="0" width="520" role="presentation"
               style="width:100%;max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
          <tr>
            <td style="padding:0 0 20px 0;">
              <h1 style="margin:0 0 6px 0;font-size:22px;line-height:1.3;color:#ffffff;">
                Juegos gratis en Steam
              </h1>
              <p style="margin:0;font-size:13px;color:#8a9bad;">
                ${escapeHtml(dateLabel)} · solo se destacan los que superan el filtro de calidad
              </p>
            </td>
          </tr>
          <tr>
            <td>
              <table cellpadding="0" cellspacing="0" width="100%" role="presentation">${qualifyingHtml}</table>
              ${rejectedHtml}
              ${unverifiedHtml}
              <p style="margin:28px 0 0 0;color:#5d6b7a;font-size:11px;line-height:1.5;">
                Datos de giveaways cortesía de
                <a href="https://www.gamerpower.com" style="color:#5d6b7a;">GamerPower.com</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
