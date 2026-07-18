// Script de prueba TEMPORAL: fuerza un envio para ver en los logs (con
// direcciones enmascaradas) que destinatarios acepta/rechaza Gmail, y
// diagnosticar por que un segundo destinatario no recibio el correo real.
// No toca data/seen.json.
import { sendEmail } from "../src/email.js";

async function main() {
  const dateLabel = new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#1b2838;color:#fff;padding:24px;">
    <h2>Prueba de entrega — ${dateLabel}</h2>
    <p>Correo de prueba para verificar que Gmail acepta todos los destinatarios de EMAIL_TO.</p>
  </div>`;

  await sendEmail({ subject: `[PRUEBA] Diagnóstico de entrega — ${dateLabel}`, html });
  console.log("Email de prueba enviado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
