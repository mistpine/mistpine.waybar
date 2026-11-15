#!/bin/sh
# Runs inside the verify image: starts Waybar with themes/style.css and
# examples/config.jsonc, unchanged, on headless sway, and leaves its log, its
# version and a screenshot in /out for verify.ts.
#   /themes, /examples  this repository's files (read-only)
set -u
export LANG=C.UTF-8
mkdir -p "$HOME/.config/waybar"
cp /themes/mistpine.css /themes/style.css /examples/config.jsonc "$HOME/.config/waybar/"
waybar --version > /out/version

export XDG_RUNTIME_DIR=/tmp/xdg && mkdir -p -m 700 $XDG_RUNTIME_DIR
printf 'output * resolution 1600x200 bg #0b1f27 solid_color\nxwayland disable\n' > /tmp/sway.conf
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway --unsupported-gpu -c /tmp/sway.conf >/tmp/sway.log 2>&1 &
for _ in $(seq 100); do [ -e $XDG_RUNTIME_DIR/wayland-1 ] && break; sleep 0.1; done
export WAYLAND_DISPLAY=wayland-1 SWAYSOCK=$(ls $XDG_RUNTIME_DIR/sway-ipc.*.sock)

dbus-run-session waybar > /out/waybar.log 2>&1 &
for _ in $(seq 100); do grep -q 'Bar configured' /out/waybar.log 2>/dev/null && break; sleep 0.1; done
sleep 2
grim /out/bar.png
convert /out/bar.png -depth 8 rgb:/out/bar.rgb
identify -format '%w %h\n' /out/bar.png > /out/bar.size
exit 0
