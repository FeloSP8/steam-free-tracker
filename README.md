# steam-free-tracker

Proceso diario que detecta juegos de Steam que **pasan a ser gratuitos**
(ofertas al 100% de descuento), filtra los que realmente merecen la pena y
te envía un resumen por email con un enlace directo para reclamarlos.

## Cómo decide qué juego "merece la pena"

Un juego gratis pasa el filtro solo si cumple **todos** estos criterios
(configurables en `config.json`):

| Criterio | Por qué importa | Umbral por defecto |
|---|---|---|
| **Número total de reseñas** | Evita juegos con pocas reseñas donde el % no es fiable (20 reseñas al 95% es ruido estadístico) | ≥ 1000 |
| **% de reseñas positivas** | Señal principal de calidad percibida. Steam usa un algoritmo bayesiano, no un % simple | ≥ 80% ("Muy positivas" o mejor) |
| **Horas de juego medias** (SteamSpy) | Un juego con reseñas buenas pero que la gente abandona a los 10 minutos no es tan interesante | ≥ 60 min de media |
| **Reseñas recientes vs. históricas** | Si el sentimiento de los últimos 30 días es notablemente peor que el histórico, indica soporte abandonado, servidores caídos o un parche roto — se **rechaza aunque el histórico sea excelente**, y este veto no lo anula ni un Metacritic alto | rechazo si % reciente (con ≥10 reseñas de muestra) cae por debajo del umbral de % positivas |
| **Metacritic** (si existe) | Excepción: si un juego no llega al resto de umbrales pero tiene Metacritic ≥ 80, se acepta igual (salvo que aplique el veto de deterioro reciente) | override en 80 |
| **Jugadores concurrentes actuales** | Desactivado por defecto — un juego narrativo/singleplayer excelente puede tener pocos jugadores simultáneos sin que eso sea un problema. Actívalo (`minCurrentPlayers`) si te importa sobre todo el multijugador/live-service | 0 (sin filtro) |
| **Género excluido** | Lista opcional (`excludeGenres`) para descartar categorías que no te interesan (p. ej. `"Casino"`) | `[]` (sin filtro) |

Solo se evalúan apps de tipo `game` (se excluyen DLC, bandas sonoras, software).

Los juegos gratis que **no** pasan el filtro no se descartan silenciosamente:
aparecen en una sección secundaria del correo ("también gratis, pero no
cumplen el criterio") para que puedas decidir tú si te interesan.

### Señales informativas (no filtran, pero se muestran en el correo)

Para ayudarte a detectar asset-flips/shovelware de un vistazo, cada juego
recomendado muestra también: **jugadores activos ahora mismo** (API oficial
de Steam), **número de logros**, **número de DLC**, si tiene **trailer
propio** y sus **géneros**. Pocos logros + sin trailer + género genérico son
señales típicas de un asset-flip, pero no son garantía por sí solas, así que
se dejan como información y no como filtro automático.

> **Lo que no se automatiza:** detectar si un developer/publisher tiene un
> catálogo enorme de juegos casi idénticos (red flag clásica de asset-flips
> en cadena) requeriría scraping de búsquedas por desarrollador, sin una API
> fiable disponible. Tampoco se usa SteamDB para el pico de jugadores de
> 24h — su API no es pública y raspar su web incumpliría sus términos; en su
> lugar se usa el endpoint oficial `ISteamUserStats/GetNumberOfCurrentPlayers`
> de Steam, que da los jugadores concurrentes ahora mismo (sin el histórico
> de picos, pero sin depender de scraping).

## Cómo detecta que un juego "pasa a ser gratis"

Se combinan dos fuentes públicas, ninguna requiere API key ni login:

1. **[GamerPower](https://www.gamerpower.com/api/giveaways?platform=steam&type=game)**
   — agregador dedicado a giveaways, filtrado a juegos completos en Steam.
   Cubre tanto ofertas 100% en la tienda de Steam como keys repartidas a
   través de partners. Fuente principal por ser la más exhaustiva y estable
   (JSON diseñado para esto, no scraping).
2. `store.steampowered.com/api/featuredcategories` — ofertas destacadas en
   portada de Steam, como red de seguridad por si algo no apareciera aún
   en GamerPower.

Cuando el giveaway de GamerPower no enlaza directamente a la ficha de Steam
(p. ej. una key repartida por un partner), se intenta resolver el `appid`
buscando el título en `store.steampowered.com/api/storesearch`, para poder
consultar sus reseñas y aplicar el filtro de calidad. Si aun así no se
encuentra, el juego se incluye en el correo en una sección aparte
("sin datos de reseñas para verificar calidad") en vez de descartarlo o
colarlo silenciosamente como si hubiera pasado el filtro.

Como verificación cruzada, cualquier candidato con `appid` resuelto se
contrasta contra la API oficial `appdetails` de Steam: si su precio actual
no es 0, se descarta como falso positivo.

> Limitación conocida: no detecta el caso raro de un juego que cambia
> permanentemente su modelo a Free-to-Play sin pasar por ningún giveaway
> ni oferta (ninguna de las dos fuentes lo reportaría).

El estado de qué juegos ya se han notificado se guarda en `data/seen.json`
(por `appid` de Steam, o por id de GamerPower si no se pudo resolver uno)
y se commitea automáticamente tras cada ejecución, para no repetir avisos.

Los datos de giveaways se muestran cortesía de GamerPower.com, con
atribución en el propio correo (requisito de su API gratuita).

## Añadir el juego a tu librería

No se hace de forma automática (para no tener que guardar tus credenciales
de Steam como secreto). Cada juego del correo incluye un botón **"Reclamar"** con el enlace de canje
correcto según el origen: la ficha de Steam (checkout gratuito) para ofertas
detectadas directamente en la tienda, o la página de GamerPower/partner
cuando el giveaway se reparte como key externa. Cuando se conoce el `appid`
de Steam, además aparece un enlace **"Abrir en app de Steam"** (`steam://`)
para abrirlo directamente en el cliente de escritorio.

## Configuración

### 1. Secretos de GitHub Actions

En `Settings → Secrets and variables → Actions` del repo, crea:

- `GMAIL_USER`: tu dirección de Gmail (ej. `felipesrmd@gmail.com`)
- `GMAIL_APP_PASSWORD`: una [contraseña de aplicación](https://myaccount.google.com/apppasswords)
  de 16 caracteres (requiere verificación en dos pasos activada en tu cuenta
  de Google). **No uses tu contraseña normal.**
- `EMAIL_TO`: dirección donde quieres recibir el resumen (puede ser la misma)

### 2. Umbrales de calidad

Edita `config.json` para ajustar los umbrales o el país/idioma usado en las
consultas a Steam:

```json
{
  "countryCode": "us",
  "language": "spanish",
  "quality": {
    "minTotalReviews": 1000,
    "minPositivePercent": 80,
    "minAvgPlaytimeMinutes": 60,
    "metacriticOverride": 80,
    "recentReviewMinSample": 10,
    "minCurrentPlayers": 0,
    "excludeGenres": []
  }
}
```

### 3. Activar el cron

El workflow en `.github/workflows/daily.yml` corre todos los días a las
09:00 UTC. **GitHub solo ejecuta workflows programados (`schedule`) desde
la rama por defecto del repo**, así que esta rama debe fusionarse a `main`
para que el cron se active. Mientras tanto puedes lanzarlo manualmente
desde la pestaña "Actions" → "Steam Free Games Daily Check" → "Run workflow".

## Ejecutar en local

```bash
npm install
export GMAIL_USER=tu_correo@gmail.com
export GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
export EMAIL_TO=tu_correo@gmail.com
npm start
```
