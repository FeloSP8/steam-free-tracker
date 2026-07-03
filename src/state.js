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
  const arr = Array.from(set).sort((a, b) => a - b);
  await writeFile(path, JSON.stringify(arr, null, 2) + "\n", "utf-8");
}
