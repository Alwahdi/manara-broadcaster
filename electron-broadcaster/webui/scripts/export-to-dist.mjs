import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "out");
const dist = resolve(root, "dist");

if (!existsSync(out)) {
  throw new Error("Next export output not found. Run `next build` first.");
}

rmSync(dist, { recursive: true, force: true });
cpSync(out, dist, { recursive: true });
