// Todas las fuentes externas (Steam, SteamSpy, GamerPower, feeds RSS) pasan
// por aqui.
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

// Con los feeds de terceros hay mas hosts de los que depender, y uno que no
// responde no puede dejar la ejecucion colgada hasta el limite de Actions.
const TIMEOUT_MS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt(url, headers, asJson) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { error: `HTTP ${res.status}` };

    const text = await res.text();
    if (!asJson) return { data: text };
    try {
      return { data: JSON.parse(text) };
    } catch {
      // La URL final dice si Steam nos ha redirigido (p.ej. a la ficha o a
      // la portada), que es lo que distingue un bloqueo pasajero de un
      // endpoint que ha cambiado.
      const preview = text.slice(0, 60).replace(/\s+/g, " ");
      const redirect = res.redirected ? `, redirigido a ${res.url}` : "";
      return { error: `respuesta no JSON (HTTP ${res.status}${redirect}: "${preview}...")` };
    }
  } catch (err) {
    return { error: `error de red (${err.message})` };
  }
}

async function fetchWithRetry(url, { label, headers } = {}, asJson) {
  let result = await attempt(url, headers, asJson);
  if (result.error) {
    await sleep(RETRY_DELAY_MS);
    result = await attempt(url, headers, asJson);
  }
  if (result.error) {
    console.warn(`${label ?? url}: ${result.error}; se continua sin este dato`);
    return null;
  }
  return result.data;
}

export function fetchJson(url, options) {
  return fetchWithRetry(url, options, true);
}

// Para los feeds RSS/Atom, que no son JSON.
export function fetchText(url, options) {
  return fetchWithRetry(url, options, false);
}
