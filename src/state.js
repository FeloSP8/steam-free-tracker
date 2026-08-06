import { readFile, writeFile } from "node:fs/promises";

export async function readSeen(path) {
  try {
    const raw = await readFile(path, "utf-8");
    const arr = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export async function writeSeen(path, set) {
  // Las claves son cadenas ("steam:606150", "gp:3716"), asi que hay que
  // compararlas como tales: restarlas daba NaN y dejaba el fichero sin ordenar.
  const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
  await writeFile(path, JSON.stringify(arr, null, 2) + "\n", "utf-8");
}
