/**
 * Writes the Waybar files from the mistpine spec:
 *
 * - themes/mistpine.css: the palette as GTK `@define-color`s, for
 *   `@import` from your own style.css.
 * - themes/style.css: the mistpine bar (src/style.css), importing
 *   mistpine.css next to it.
 * - examples/config.jsonc: the bar in the screenshots (src/config.jsonc),
 *   with the palette names in its span colors replaced by hex.
 *
 *   pnpm generate          write the files
 *   pnpm generate --check  fail if any file is out of date
 *
 * Every color comes from palette/mistpine.json in the reference repository
 * (see lib/colors.ts). Before anything is written, the sources may use
 * colors only by palette name, and every text color must clear 4.5:1 on the
 * background it sits on.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { contrast, loadSpec, mix, ROOT } from "./lib/colors.ts";

const check = process.argv.includes("--check");
const { spec, source } = await loadSpec();

/** The CSS name for a palette key: `brightRed` → `bright-red`. */
const cssName = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const palette = new Map(
  Object.entries(spec.palette).map(([k, hex]) => [cssName(k), hex.toLowerCase()]),
);
const hexOf = (name: string) => {
  const hex = palette.get(name);
  if (!hex) throw new Error(`the palette has no ${name}`);
  return hex;
};

/** Recomputes the spec's blends, so the port provably uses the spec's math. */
function verifyBlends(): void {
  const names: Record<string, string> = {
    "@terminal.background": spec.terminal.background?.hex ?? "",
  };
  let checked = 0;
  for (const [name, t] of Object.entries(spec.ui)) {
    if (!t.derived) continue;
    const m = t.derived.match(/^mix\((\S+), \$(\w+), (\d+)%\)$/);
    if (!m) throw new Error(`ui.${name}: unknown blend ${t.derived}`);
    const [, base, key, pct] = m as unknown as [string, string, string, string];
    const from = names[base] ?? hexOf(cssName(base.replace(/^\$/, "")));
    const got = mix(from, hexOf(cssName(key)), Number(pct) / 100);
    if (got !== t.hex) throw new Error(`ui.${name}: ${t.derived} gives ${got}, spec says ${t.hex}`);
    checked++;
  }
  if (checked === 0) throw new Error("the spec has no blends: did its format change?");
}

/** The style's roles must stay the spec's: [what, palette name, spec token]. */
const ROLES: [string, string, string][] = [
  ["bar background", "bg2", "statusBg"],
  ["bar text", "fg2", "statusFg"],
  ["separators", "bg4", "border"],
  ["focused workspace", "bg3", "selection"],
  ["focused underline", "blue", "accent"],
  ["tooltips", "bg0", "panelBg"],
  ["urgent", "red", "error"],
  ["binding mode", "yellow", "warning"],
];

/** Text on background, as src/style.css and src/config.jsonc pair them. */
const PAIRS: [string, string, string][] = [
  ["bar text", "fg2", "bg2"],
  ["workspaces", "fg1", "bg2"],
  ["focused workspace", "fg3", "bg3"],
  ["urgent workspace", "bg0", "red"],
  ["binding mode", "bg0", "yellow"],
  ["muted and offline modules", "fg1", "bg2"],
  ["battery warning", "yellow", "bg2"],
  ["critical modules", "bg0", "red"],
  ["tooltips and menus", "fg3", "bg0"],
  ["hovered menu items", "fg3", "bg3"],
  ["example labels", "yellow", "bg2"],
  ["example values", "bright-purple", "bg2"],
];

// ---------------------------------------------------------------- lint

const failures: string[] = [];
for (const [what, name, token] of ROLES) {
  if (spec.ui[token]?.ref !== Object.keys(spec.palette).find((k) => cssName(k) === name)) {
    failures.push(`${what}: ${name} is no longer the spec's ui.${token}`);
  }
}
for (const [what, fg, bg] of PAIRS) {
  const r = contrast(hexOf(fg), hexOf(bg));
  if (r < 4.5)
    failures.push(
      `${what}: ${fg} on ${bg} is ${(Math.floor(r * 100) / 100).toFixed(2)}:1, want 4.5:1`,
    );
}

const style = readFileSync(join(ROOT, "src", "style.css"), "utf8");
const body = style.replace(/^\/\*[\s\S]*?\*\/\n+/, ""); // the leading comment is for this repo
const noComments = style.replace(/\/\*[\s\S]*?\*\//g, "");
for (const m of noComments.matchAll(/:\s*([^;{}]*);/g)) {
  const value = m[1] as string;
  if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(value)) {
    failures.push(`src/style.css: a literal color in "${value.trim()}": use a palette name`);
  }
}
for (const m of noComments.matchAll(/@([a-z][a-z0-9-]*)/g)) {
  if (!palette.has(m[1] as string)) failures.push(`src/style.css: @${m[1]} is not a palette color`);
}
// Every rule's text color must be one PAIRS knows about (a rough guard).
const usedText = new Set(
  [...noComments.matchAll(/(?:^|[\s;{])color:\s*@([a-z0-9-]+)/g)].map((m) => m[1]),
);
const pairedText = new Set(PAIRS.map(([, fg]) => fg));
for (const name of usedText) {
  if (!pairedText.has(name as string))
    failures.push(`src/style.css: text in @${name} has no contrast check`);
}

const configSrc = readFileSync(join(ROOT, "src", "config.jsonc"), "utf8");
const config = configSrc
  .replace(/^(\/\/.*\n)+/, "")
  .replace(/color='@([a-z0-9-]+)'/g, (_, name: string) => {
    if (!palette.has(name)) failures.push(`src/config.jsonc: @${name} is not a palette color`);
    return `color='${hexOf(name)}'`;
  });
if (/#[0-9a-f]{6}/i.test(configSrc)) failures.push("src/config.jsonc: use palette names, not hex");
// The README lists the palette: every color must be there, as the spec has it.
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
for (const [name, hex] of palette) {
  if (!readme.includes(`\`${hex}\``)) failures.push(`README.md: no \`${hex}\` for ${name}`);
}
verifyBlends();

// ---------------------------------------------------------------- write

const GENERATED = [
  " * Generated by scripts/generate.ts from the mistpine spec",
  " * (https://github.com/mistpine/mistpine/blob/main/palette/mistpine.json).",
  " * Do not edit by hand.",
];

const colors = [
  "/*",
  " * mistpine for Waybar: https://github.com/mistpine/mistpine.waybar",
  " * MIT License",
  " *",
  " * The palette as GTK colors. Import it at the top of your style.css:",
  ' *   @import "mistpine.css";',
  " * and use the names: background: @bg2; color: @fg2;",
  " *",
  ...GENERATED,
  " */",
  "",
  ...[...palette].map(([name, hex]) => `@define-color ${name} ${hex};`),
  "",
].join("\n");

const fullStyle = [
  "/*",
  " * mistpine for Waybar: https://github.com/mistpine/mistpine.waybar",
  " * MIT License",
  " *",
  " * Save as ~/.config/waybar/style.css, with mistpine.css next to it.",
  " *",
  ...GENERATED,
  " */",
  "",
  '@import "mistpine.css";',
  "",
  body,
].join("\n");

const exampleConfig = [
  "// mistpine for Waybar: the bar in the screenshots.",
  "// https://github.com/mistpine/mistpine.waybar · MIT License",
  "// Generated by scripts/generate.ts from src/config.jsonc and the mistpine",
  "// spec. Do not edit by hand.",
  config,
].join("\n");

if (failures.length) {
  console.error(`generate: ${failures.length} problem(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

const outputs: [string, string][] = [
  ["themes/mistpine.css", colors],
  ["themes/style.css", fullStyle],
  ["examples/config.jsonc", exampleConfig],
];
let stale = 0;
for (const [rel, text] of outputs) {
  const file = join(ROOT, rel);
  let current = "";
  try {
    current = readFileSync(file, "utf8");
  } catch {}
  if (current === text) continue;
  if (check) {
    console.error(`${rel} is out of date: run pnpm generate`);
    stale++;
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`wrote ${rel}`);
}
if (stale) process.exit(1);
console.log(`${check ? "up to date" : "done"} (spec: ${source})`);
