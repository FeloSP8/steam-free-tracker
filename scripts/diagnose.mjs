// Script temporal de diagnostico: NO envia email ni toca data/seen.json.
// Solo imprime lo que ve cada fuente para un appid concreto.
const APPID = Number(process.env.DIAG_APPID ?? 606150);
const CC = "us";
const L = "spanish";
const STORE = "https://store.steampowered.com";

function j(v) {
  return JSON.stringify(v, null, 2);
}

async function main() {
  console.log("=== 1) appdetails ===");
  {
    const res = await fetch(`${STORE}/api/appdetails?appids=${APPID}&cc=${CC}&l=${L}`);
    console.log("status:", res.status);
    const data = await res.json();
    const d = data?.[APPID]?.data;
    console.log("name:", d?.name, "| type:", d?.type, "| is_free:", d?.is_free);
    console.log("price_overview:", j(d?.price_overview ?? null));
    console.log("package_groups:", j(d?.package_groups ?? null));
  }

  console.log("\n=== 2) featuredcategories (specials) ===");
  {
    const res = await fetch(`${STORE}/api/featuredcategories?cc=${CC}&l=${L}`);
    console.log("status:", res.status);
    const data = await res.json();
    console.log("claves top-level:", Object.keys(data ?? {}).join(", "));
    const specials = data?.specials?.items ?? [];
    console.log("specials items:", specials.length);
    console.log("specials con -100%:", j(specials.filter((i) => i.discount_percent === 100).map((i) => ({ id: i.id, name: i.name }))));
    const hit = specials.find((i) => i.id === APPID);
    console.log("appid en specials:", hit ? j(hit) : "NO");
    // Algunas categorias extra que podrian contener promos "free to keep".
    for (const key of Object.keys(data ?? {})) {
      const items = data?.[key]?.items;
      if (!Array.isArray(items)) continue;
      const found = items.find((i) => i.id === APPID);
      if (found) console.log(`appid encontrado en categoria "${key}":`, j(found));
    }
  }

  console.log("\n=== 3) busqueda de la tienda (specials=1&maxprice=free) ===");
  {
    const url =
      `${STORE}/search/results/?query&start=0&count=100` +
      `&specials=1&maxprice=free&category1=998&cc=${CC}&l=${L}&json=1`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (steam-free-tracker diag)" } });
    console.log("status:", res.status);
    const data = await res.json();
    console.log("total_count:", data?.total_count);
    const html = data?.results_html ?? "";
    console.log("html length:", html.length);
    console.log("contiene appid?", html.includes(`data-ds-appid="${APPID}"`));
    console.log("primeros 1200 chars del html:\n", html.slice(0, 1200));
  }

  console.log("\n=== 4) busqueda de la tienda SIN specials (maxprice=free) ===");
  {
    const url =
      `${STORE}/search/results/?query&start=0&count=100` +
      `&maxprice=free&category1=998&cc=${CC}&l=${L}&json=1`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (steam-free-tracker diag)" } });
    console.log("status:", res.status);
    const data = await res.json();
    console.log("total_count:", data?.total_count);
    console.log("contiene appid?", (data?.results_html ?? "").includes(`data-ds-appid="${APPID}"`));
  }

  console.log("\n=== 5) storesearch por titulo ===");
  {
    const res = await fetch(`${STORE}/api/storesearch/?term=Moonlighter&cc=${CC}&l=${L}`);
    console.log("status:", res.status);
    const data = await res.json();
    console.log(j((data?.items ?? []).slice(0, 5)));
  }

  console.log("\n=== 6) GamerPower ===");
  {
    const res = await fetch("https://www.gamerpower.com/api/giveaways?platform=steam&type=game", {
      headers: { "User-Agent": "steam-free-tracker (contacto via github.com/FeloSP8)" },
    });
    console.log("status:", res.status, "| content-type:", res.headers.get("content-type"));
    const text = await res.text();
    console.log("body length:", text.length);
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      console.log("NO es JSON. Primeros 500 chars:\n", text.slice(0, 500));
    }
    if (Array.isArray(data)) {
      console.log("giveaways:", data.length);
      console.log("titulos:", j(data.map((g) => g.title)));
      const hit = data.find((g) => /moonlighter/i.test(g.title ?? ""));
      console.log("Moonlighter:", hit ? j(hit) : "NO aparece");
    }
  }

  console.log("\n=== 7) pagina de la ficha (deteccion de promo free-to-keep) ===");
  {
    const res = await fetch(`${STORE}/app/${APPID}/?cc=${CC}&l=${L}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (steam-free-tracker diag)",
        Cookie: "birthtime=0; lastagecheckage=1-0-1970; wants_mature_content=1",
      },
    });
    console.log("status:", res.status);
    const html = await res.text();
    console.log("html length:", html.length);
    for (const needle of ["game_area_purchase_game", "Free to keep", "free to keep", "Gratis para siempre", "FreeLicenseAcquisition", "add to your account", "añádelo a tu cuenta"]) {
      console.log(`  contiene "${needle}":`, html.includes(needle));
    }
    const idx = html.indexOf("game_area_purchase_game");
    if (idx !== -1) console.log("fragmento compra:\n", html.slice(idx, idx + 1500).replace(/\s+/g, " "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
