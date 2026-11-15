/**
 * Checks the style with Waybar itself, in Docker: Waybar 0.9.24 (Ubuntu
 * 24.04) and 0.15.0 (Ubuntu 26.04), on headless sway.
 *
 *   pnpm verify                  both releases
 *   pnpm verify -- 26.04         one Ubuntu release
 *
 * 1. themes/mistpine.css defines every palette color as the spec has it.
 * 2. Waybar loads themes/style.css and examples/config.jsonc, unchanged,
 *    with no errors: it stops at the first CSS error, logs it and never
 *    configures the bar.
 * 3. The bar it draws has the style's colors on screen: the status-line
 *    background, the focused workspace, the separators and the example's
 *    labels and values.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSpec } from "@mistpine/port-kit";
import { image } from "@mistpine/port-kit/docker";
import { type Expect, expectPixels, load } from "@mistpine/port-kit/pixels";

const ROOT = join(import.meta.dirname, "..");

const RELEASES = { "24.04": "0.9.24", "26.04": "0.15.0" } as const;
type Release = keyof typeof RELEASES;

const asked = process.argv.slice(2).filter((a) => a !== "--");
const releases = (asked.length ? asked : Object.keys(RELEASES)) as Release[];
for (const r of releases) if (!(r in RELEASES)) fail(`unknown release ${r}: use 24.04 or 26.04`);

function fail(message: string): never {
  console.error(`verify: ${message}`);
  process.exit(1);
}

const { spec } = await loadSpec(ROOT);
const ui = (name: string) =>
  (spec.ui[name]?.hex ?? fail(`the spec has no ui.${name}`)).toLowerCase();
const pal = (name: string) => (spec.palette[name] ?? fail(`the spec has no ${name}`)).toLowerCase();

// ---------------------------------------------------------------- 1. the file

const defined = new Map(
  [
    ...readFileSync(join(ROOT, "themes", "mistpine.css"), "utf8").matchAll(
      /^@define-color ([a-z0-9-]+) (#[0-9a-f]{6});$/gm,
    ),
  ].map((m) => [m[1] as string, m[2] as string]),
);
for (const [key, hex] of Object.entries(spec.palette)) {
  const name = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  if (defined.get(name) !== hex.toLowerCase()) {
    fail(`mistpine.css: @${name} is ${defined.get(name)}, the spec says ${hex}`);
  }
}
if (defined.size !== Object.keys(spec.palette).length) fail("mistpine.css has extra colors");
console.log(`mistpine.css: ${defined.size} palette colors match the spec`);

// ---------------------------------------------------------------- 2-3. Waybar

/** The bar at 1600 px wide, scale 1. Minimums are about half a good render; small text
 * is antialiased, and GTK 3 in 24.04 leaves fewer exact pixels than 26.04. */
const EXPECT: Expect[] = [
  { label: "bar background (statusBg)", hex: ui("statusBg"), min: 10_000 },
  { label: "focused workspace (selection)", hex: ui("selection"), min: 200 },
  { label: "focused underline (accent)", hex: ui("accent"), min: 20 },
  { label: "separators (border)", hex: ui("border"), min: 30 },
  { label: "labels (yellow)", hex: pal("yellow"), min: 10 },
  { label: "values (bright purple)", hex: pal("brightPurple"), min: 10 },
];

/**
 * The container's own noise: no rfkill, no system or accessibility bus, no
 * portal. Waybar 0.9.24 also prints basic_string::_M_create at start, with or
 * without this style.
 */
const NOISE = /RFKILL|SYSTEM Bus|org\.a11y\.Bus|portal\.Desktop|basic_string::_M_create/;

for (const release of releases) {
  const tag = image({
    name: "mistpine-waybar",
    release,
    context: join(ROOT, "scripts", "render"),
    hostUser: true,
  });
  const out = mkdtempSync(join(tmpdir(), "mistpine-waybar-verify-"));
  try {
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "--init",
        "-v",
        `${join(ROOT, "themes")}:/themes:ro`,
        "-v",
        `${join(ROOT, "examples")}:/examples:ro`,
        "-v",
        `${join(ROOT, "scripts", "verify", "run.sh")}:/run.sh:ro`,
        "-v",
        `${out}:/out`,
        "--user",
        `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
        "-e",
        "HOME=/tmp/home",
        tag,
        "sh",
        "/run.sh",
      ],
      { stdio: ["ignore", "inherit", "inherit"], timeout: 120_000 },
    );
    const version = readFileSync(join(out, "version"), "utf8").match(/v(\S+)/)?.[1];
    if (version !== RELEASES[release]) fail(`ubuntu:${release} has Waybar ${version}`);
    const label = `Waybar ${version} (ubuntu:${release})`;

    const log = readFileSync(join(out, "waybar.log"), "utf8");
    const problems = log
      .split("\n")
      .filter((l) => /\[(error|critical)\]|warning|is not a valid|parsing error/i.test(l))
      .filter((l) => !NOISE.test(l));
    if (problems.length) fail(`${label} reported:\n  ${problems.join("\n  ")}`);
    if (!/Using CSS file \S+\/style\.css/.test(log)) fail(`${label} did not load style.css`);
    if (!log.includes("Bar configured")) fail(`${label} never showed the bar:\n${log}`);

    const missing = expectPixels(load(join(out, "bar")), EXPECT);
    if (missing.length) fail(`${label}: the bar is missing colors:\n  ${missing.join("\n  ")}`);
    console.log(`${label}: no errors, and the bar shows the spec's colors`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
