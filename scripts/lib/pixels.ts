/** Raw screenshots from the render scripts, and the checks pnpm render runs on them. */
import { readFileSync } from "node:fs";

export interface Image {
  width: number;
  height: number;
  rgb: Buffer;
}

/** Reads <base>.rgb and <base>.size, written next to each PNG by the scene script. */
export function load(base: string): Image {
  const [width, height] = readFileSync(`${base}.size`, "utf8").trim().split(" ").map(Number) as [
    number,
    number,
  ];
  const rgb = readFileSync(`${base}.rgb`);
  if (rgb.length !== width * height * 3) throw new Error(`${base}: unexpected pixel data size`);
  return { width, height, rgb };
}

export const hexAt = (img: Image, i: number) =>
  `#${[0, 1, 2].map((k) => (img.rgb[i * 3 + k] as number).toString(16).padStart(2, "0")).join("")}`;

/** Every color in the image and how many pixels have it exactly. */
export function histogram(img: Image): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < img.width * img.height; i++) {
    const h = hexAt(img, i);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return counts;
}

/** The smallest box around everything that is not `canvas`. */
export function bbox(img: Image, canvas: string): [number, number, number, number] {
  let [x0, y0, x1, y1] = [img.width, img.height, -1, -1];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (hexAt(img, y * img.width + x) === canvas) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) throw new Error("the screenshot is empty");
  return [x0, y0, x1, y1];
}

export interface Expect {
  label: string;
  hex: string;
  min: number;
}

/** The failed expectations, as readable lines. */
export function expectPixels(img: Image, expect: Expect[]): string[] {
  const counts = histogram(img);
  return expect
    .filter(({ hex, min }) => (counts.get(hex) ?? 0) < min)
    .map(
      ({ label, hex, min }) =>
        `${label} ${hex}: ${counts.get(hex) ?? 0} exact pixels, want ≥ ${min}`,
    );
}
