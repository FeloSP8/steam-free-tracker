// Todas las fuentes externas (Steam, SteamSpy, GamerPower) pasan por aqui.
//
// Antes cada llamada hacia `await res.json()` a pelo. Cuando Steam limita
// peticiones o tiene un mal momento no siempre responde con un error HTTP:
// a menudo devuelve 200 con una pagina HTML ("<!DOCTYPE ..."), res.json()
// lanza una excepcion y esa excepcion tumbaba la ejecucion entera por un
// solo juego (paso el 30/10/2026 con las reseñas de un giveaway).
//
// Aqui cualquier fallo (red, HTTP, cuerpo que no es JSON) se registra y se
// devuelve null, que es lo que cada fuente ya trata como "sin dato". Se
// reintenta una vez tras una pausa corta porque casi todos estos fallos son
// transitorios.

const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt(url, headers) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { error: `HTTP ${res.status}` };

    const text = await res.text();
    try {
      return { data: JSON.parse(text) };
    } catch {
      const preview = text.slice(0, 60).replace(/\s+/g, " ");
      return { error: `respuesta no JSON ("${preview}...")` };
    }
  } catch (err) {
    return { error: `error de red (${err.message})` };
  }
}

export async function fetchJson(url, { label, headers } = {}) {
  let result = await attempt(url, headers);
  if (result.error) {
    await sleep(RETRY_DELAY_MS);
    result = await attempt(url, headers);
  }
  if (result.error) {
    console.warn(`${label ?? url}: ${result.error}; se continua sin este dato`);
    return null;
  }
  return result.data;
}
