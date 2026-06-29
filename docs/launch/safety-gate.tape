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

# --- invisible setup: force the deterministic (no-key) money-shot, clean screen
Hide
Type "cd ~/Documents/offhook-agent && export OFFHOOK_AGENT_DEMO_DETERMINISTIC=1 && clear"
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
