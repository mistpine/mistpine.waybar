/**
 * Renders the README image from Waybar itself and checks its pixels:
 * assets/preview.png, the example bar with a focused, an idle and an urgent
 * workspace and the resize mode.
 *
 * It runs in Docker (scripts/render/Dockerfile, scene.sh): Waybar on
 * headless sway at scale 3, so the strip stays readable when GitHub shrinks
 * it. The network, volume and clock modules get fixed values (they need
 * hardware or change by the minute); everything else is
 * examples/config.jsonc and themes/style.css as shipped, plus JetBrains
 * Mono. The README image comes from Ubuntu 26.04 (Waybar 0.15); 24.04
 * (Waybar 0.9.24) renders it too, for the pixel checks.
 *
 *   pnpm render
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "@mistpine/port-kit";
import { image } from "@mistpine/port-kit/docker";
import { type Expect, expectPixels, hexAt, type Image, load } from "@mistpine/port-kit/pixels";

const ROOT = join(import.meta.dirname, "..");

const WORK = join(ROOT, ".render");
const ASSETS = join(ROOT, "assets");
const { spec } = await loadSpec(ROOT);
const ui = (name: string) => (spec.ui[name]?.hex ?? "").toLowerCase();
const pal = (name: string) => (spec.palette[name] ?? "").toLowerCase();
const CANVAS = ui("editorBg");

function rowIsCanvas(img: Image, y: number): boolean {
  for (let x = 0; x < img.width; x++) if (hexAt(img, y * img.width + x) !== CANVAS) return false;
  return true;
}

/** Minimums are about half of what a good render has. */
const EXPECT: Expect[] = [
  { label: "bar background (statusBg)", hex: ui("statusBg"), min: 50_000 },
  { label: "focused workspace (selection)", hex: ui("selection"), min: 2_000 },
  { label: "focused underline (accent)", hex: ui("accent"), min: 300 },
  { label: "separators (border)", hex: ui("border"), min: 150 },
  { label: "urgent workspace (error)", hex: ui("error"), min: 2_000 },
  { label: "resize mode (warning)", hex: ui("warning"), min: 3_000 },
  { label: "focused workspace text", hex: pal("fg3"), min: 30 },
  { label: "idle workspace text", hex: pal("fg1"), min: 30 },
  { label: "values (bright purple)", hex: pal("brightPurple"), min: 300 },
];

/** Fixed values for the modules that need hardware or a clock, in the example's markup. */
function override(dir: string): void {
  const example = readFileSync(join(ROOT, "examples", "config.jsonc"), "utf8");
  const label = example.match(/<span color='(#[0-9a-f]{6})'><b>CPU/)?.[1];
  const value = example.match(/<b>CPU<\/b><\/span> <span color='(#[0-9a-f]{6})'/)?.[1];
  if (!label || !value) throw new Error("examples/config.jsonc: no CPU label and value colors");
  const kv = (l: string, v: string) =>
    `<span color='${label}'><b>${l}</b></span> <span color='${value}'>${v}</span>`;
  // The markup goes in format; exec prints only the plain value.
  const custom = (format: string, text: string) => ({
    exec: `echo '${text}'`,
    interval: "once",
    format,
  });
  writeFileSync(
    join(dir, "override.jsonc"),
    `${JSON.stringify(
      {
        include: ["/examples/config.jsonc"],
        "modules-right": ["custom/network", "custom/volume", "custom/clock"],
        "custom/network": custom(kv("wlp5s0", "{}"), "192.168.1.20"),
        "custom/volume": custom(kv("VOL", "{}"), "62%"),
        "custom/clock": custom(`<span color='${value}'>{}</span>`, "Sat 14 Nov  21:30"),
      },
      null,
      2,
    )}\n`,
  );
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });
const uid = `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`;
const failures: string[] = [];

for (const release of ["26.04", "24.04"]) {
  const tag = image({
    name: "mistpine-waybar",
    release,
    context: join(ROOT, "scripts", "render"),
    hostUser: true,
  });
  const out = join(WORK, release);
  mkdirSync(out, { recursive: true });
  override(out);
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
      `${join(ROOT, "scripts", "render")}:/scene:ro`,
      "-v",
      `${out}:/out`,
      "--user",
      uid,
      "-e",
      "HOME=/tmp/home",
      tag,
      "sh",
      "/scene/scene.sh",
      "bar",
    ],
    { stdio: ["ignore", "ignore", "inherit"], timeout: 120_000 },
  );
  const img = load(join(out, "bar"));
  const label = `bar (ubuntu:${release})`;
  const fails = expectPixels(img, EXPECT);
  if (fails.length) {
    failures.push(`${label}:\n  ${fails.join("\n  ")}`);
    console.log(`✗ ${label}`);
    continue;
  }
  console.log(`✓ ${label}`);
  if (release !== "26.04") continue;
  // The bar alone: the rows down to the first one that is all canvas.
  let height = 0;
  while (height < img.height && !rowIsCanvas(img, height)) height++;
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${out}:/out`,
      "-v",
      `${ASSETS}:/assets`,
      "--user",
      uid,
      tag,
      "convert",
      "/out/bar.png",
      "-crop",
      `${img.width}x${height}+0+0`,
      "+repage",
      "-strip",
      "/assets/preview.png",
    ],
    { stdio: "inherit" },
  );
}

if (failures.length) {
  console.error(`render: pixel checks failed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("wrote assets/preview.png");
