# offhook-agent — CLI tour, recorded reproducibly with VHS (charmbracelet/vhs).
# Regenerate the README clip:  vhs docs/launch/cli-tour.tape
# Shows the real CLI: the command menu, doctor, and a live chat exchange.
# Needs: offhook-agent installed globally + an LLM key in ./.env (for chat).

Output docs/launch/cli-tour.gif

Set Shell bash
Set FontSize 19
Set Width 1200
Set Height 800
Set Padding 22
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set WindowBar Colorful
Set BorderRadius 10

# --- invisible setup
Hide
Type "cd ~/Documents/offhook-agent && clear"
Enter
Sleep 1s
Show

# --- the command menu
Type "offhook-agent"
Sleep 500ms
Enter
Sleep 4s

# --- doctor: config, knowledge, keys
Type "offhook-agent doctor"
Sleep 500ms
Enter
Sleep 4.5s

# --- chat: talk to the real agent, no voice keys
Type "offhook-agent chat"
Sleep 500ms
Enter
Sleep 3.5s
Type "Hi - I'm trying to reach Sekhar. What does he actually do?"
Sleep 400ms
Enter
Sleep 7s
Type "Great, that's all - bye!"
Sleep 400ms
Enter
Sleep 6s

# hold the final frame so it reads on autoplay
Sleep 3s
