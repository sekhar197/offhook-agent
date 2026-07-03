# offhook-agent — safety-gate demo, recorded reproducibly with VHS (charmbracelet/vhs).
# Regenerate the README clip:  vhs docs/launch/safety-gate.tape
# Produces a deterministic GIF (no API key) of the gate blocking an unsafe self-edit.

Output docs/launch/safety-gate.gif

Require npm

Set Shell bash
Set FontSize 19
Set Width 1200
Set Height 800
Set Padding 22
Set Theme "Catppuccin Mocha"
Set TypingSpeed 55ms
Set WindowBar Colorful
Set BorderRadius 10

# --- invisible setup: force the deterministic (no-key) money-shot, clean screen.
# PATH shim forces npm→arm64 — vhs is an x64 binary, so its shell runs node
# under Rosetta, which breaks esbuild/tsx native bindings on Apple Silicon.
# (Shim: a dir on PATH whose `npm` execs `arch -arm64 /usr/local/bin/npm "$@"`.)
Hide
Type "cd ~/Documents/offhook-agent && export OFFHOOK_AGENT_DEMO_DETERMINISTIC=1 && export PATH=/private/tmp/claude-502/-Users-Sekhar-nirvah-ai/1b151880-4d3c-44c4-a6ea-e228c7a347ef/scratchpad/shim:$PATH && clear"
Enter
Sleep 1s
Show

# --- the take
Type "npm run demo:safety-gate"
Sleep 900ms
Enter
Sleep 6s
# hold on the ⛔ BLOCKED verdict so it reads on autoplay
Sleep 4s
