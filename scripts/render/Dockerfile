# The Waybar environment for pnpm verify and pnpm render: Waybar on
# headless sway. ubuntu:24.04 ships Waybar 0.9.24, ubuntu:26.04 Waybar 0.15.0.
ARG BASE=ubuntu:26.04
FROM ${BASE}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      waybar sway foot dbus grim imagemagick fonts-jetbrains-mono ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# The containers run as the host's uid and gid (docker.ts): give them a user
# and group, which dbus-daemon looks up (dbus-run-session waybar). ubuntu
# images have uid 1000 already; a CI runner is 1001.
ARG UID=1000
ARG GID=1000
RUN getent group "$GID" >/dev/null || groupadd -g "$GID" mistpine \
 && { getent passwd "$UID" >/dev/null || useradd -u "$UID" -g "$GID" -M -d /tmp/home mistpine; }
