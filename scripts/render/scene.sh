#!/bin/sh
# Runs inside the render image: shows the example bar in real Waybar on
# headless sway and screenshots it.
#   scene.sh bar
#     workspaces (focused, idle, urgent) and the resize mode. (Headless sway
#     has no pointer, so hover states and tooltips cannot be shown.)
#   /themes    this repository's themes/ (read-only)
#   /examples  this repository's examples/ (read-only)
#   /out       where <scene>.png goes; render.ts leaves override.jsonc there:
#              fixed values for the network, volume and clock modules, which
#              need hardware or change by the minute
set -eu
scene=$1
export LANG=C.UTF-8
CANVAS='#0b1f27' # bg1, the spec's canvas
mkdir -p "$HOME/.config/waybar"
cp /themes/mistpine.css /themes/style.css "$HOME/.config/waybar/"
# The screenshots use JetBrains Mono, after the style's own font line.
printf '\n* { font-family: "JetBrains Mono"; }\n' >> "$HOME/.config/waybar/style.css"
cp /out/override.jsonc "$HOME/.config/waybar/config.jsonc"

export XDG_RUNTIME_DIR=/tmp/xdg && mkdir -p -m 700 $XDG_RUNTIME_DIR
cat > /tmp/sway.conf <<CFG
output * resolution 3000x500 scale 3 bg $CANVAS solid_color
xwayland disable
default_border none
mode "resize" {
    bindsym Escape mode "default"
}
CFG
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway --unsupported-gpu -c /tmp/sway.conf >/tmp/sway.log 2>&1 &
for _ in $(seq 100); do [ -e $XDG_RUNTIME_DIR/wayland-1 ] && break; sleep 0.1; done
export WAYLAND_DISPLAY=wayland-1 SWAYSOCK=$(ls $XDG_RUNTIME_DIR/sway-ipc.*.sock)

# Workspaces 1-3 hold a window each (an empty one would vanish), with no
# borders and on a canvas-colored terminal; 3 asks for attention.
count() { swaymsg -t get_tree | grep -c '"pid"' || true; }
for ws in 3 2 1; do
  swaymsg -q workspace number $ws
  n=$(count)
  foot -o colors.background=0b1f27 sh -c 'printf "\033[?25l"; exec sleep 600' >/dev/null 2>&1 &
  for _ in $(seq 100); do [ "$(count)" -gt "$n" ] && break; sleep 0.1; done
done
swaymsg -q '[workspace=3] urgent enable'

dbus-run-session waybar >/out/$scene.log 2>&1 &
for _ in $(seq 100); do grep -q 'Bar configured' /out/$scene.log 2>/dev/null && break; sleep 0.1; done
# Waybar learns the mode from sway's events, so enter it now.
swaymsg -q mode resize
sleep 2

png="/out/$scene.png"
grim "$png"
# Raw pixels and size for the checks in render.ts.
convert "$png" -depth 8 "rgb:${png%.png}.rgb"
identify -format '%w %h\n' "$png" > "${png%.png}.size"
