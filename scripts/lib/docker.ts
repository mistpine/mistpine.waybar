/** The Docker image pnpm verify and pnpm render run waybar in. */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./colors.ts";

/** Builds (or reuses) the image with the given Ubuntu release's waybar. */
export function image(release: string): string {
  const tag = `mistpine-waybar:${release}`;
  execFileSync(
    "docker",
    [
      "build",
      "-q",
      "--build-arg",
      `BASE=ubuntu:${release}`,
      // The containers run as the host's uid (so the files they write are
      // yours), and D-Bus needs that uid to be a user in the image.
      "--build-arg",
      `UID=${process.getuid?.() ?? 0}`,
      "--build-arg",
      `GID=${process.getgid?.() ?? 0}`,
      "-t",
      tag,
      "-f",
      join(ROOT, "scripts", "render", "Dockerfile"),
      join(ROOT, "scripts", "render"),
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  return tag;
}
