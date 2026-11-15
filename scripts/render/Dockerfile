# The Waybar environment for pnpm verify and pnpm render: Waybar on
# headless sway. ubuntu:24.04 ships Waybar 0.9.24, ubuntu:26.04 Waybar 0.15.0.
ARG BASE=ubuntu:26.04
FROM ${BASE}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      waybar sway foot dbus grim imagemagick fonts-jetbrains-mono ca-certificates \
 && rm -rf /var/lib/apt/lists/*
