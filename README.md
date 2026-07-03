# steam-free-tracker

Proceso diario que detecta juegos de Steam que **pasan a ser gratuitos**
(ofertas al 100% de descuento), filtra los que realmente merecen la pena y
te envía un resumen por email con un enlace directo para reclamarlos.

## Cómo decide qué juego "merece la pena"

Un juego gratis pasa el filtro solo si cumple **todos** estos criterios
(configurables en `config.json`):

| Criterio | Por qué importa | Umbral por defecto |
|---|---|---|
| **Número total de reseñas** | Evita juegos con pocas reseñas donde el % no es fiable (5 reseñas al 100% no dice nada) | ≥ 500 |
| **% de reseñas positivas** | Señal principal de calidad percibida por quienes lo jugaron | ≥ 70% |
| **Horas de juego medias** (SteamSpy) | Un juego con reseñas buenas pero que la gente abandona a los 10 minutos no es tan interesante | ≥ 60 min de media |
| **Metacritic** (si existe) | Se usa como excepción: si un juego no llega al resto de umbrales pero tiene Metacritic ≥ 80, se acepta igual | override en 80 |

Los juegos gratis que **no** pasan el filtro no se descartan silenciosamente:
aparecen en una sección secundaria del correo ("también gratis, pero no
cumplen el criterio") para que puedas decidir tú si te interesan.

Solo se evalúan apps de tipo `game` (se excluyen DLC, bandas sonoras, software).

## Cómo detecta que un juego "pasa a ser gratis"

Se combinan dos fuentes públicas de Steam (sin necesidad de API key ni login):

1. `store.steampowered.com/api/featuredcategories` — ofertas destacadas en portada.
2. Búsqueda de la tienda filtrando por `specials=1&maxprice=free` — más exhaustiva.

Se filtran los resultados con descuento del 100% (es decir, que **antes**
tenían precio y ahora cuestan 0), para no mezclar con juegos free-to-play
de toda la vida.

> Limitación conocida: esto cubre "ofertas temporales al 100%" y grandes
> promociones destacadas. No detecta el caso raro de un juego que cambia
> permanentemente su modelo a Free-to-Play sin pasar por una oferta.

El estado de qué `appid` ya se ha notificado se guarda en `data/seen.json`
y se commitea automáticamente tras cada ejecución, para no repetir avisos
del mismo juego mientras la oferta siga activa.

## Añadir el juego a tu librería

No se hace de forma automática (para no tener que guardar tus credenciales
de Steam como secreto). Cada juego del correo incluye dos enlaces:

- **Reclamar en Steam**: abre la ficha de la tienda en el navegador. Con
  sesión iniciada, solo tienes que pulsar "Instalar"/completar el carrito
  gratuito.
- **Abrir en app de Steam**: enlace `steam://` que abre directamente el
  cliente de escritorio si lo tienes instalado.

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
    "minTotalReviews": 500,
    "minPositivePercent": 70,
    "minAvgPlaytimeMinutes": 60,
    "metacriticOverride": 80
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
