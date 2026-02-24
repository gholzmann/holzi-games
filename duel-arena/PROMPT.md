Create a complete, playable browser game in a SINGLE HTML file (no external dependencies): 
“Duel Arena" (Local 1v1 Same Keyboard).

GOAL
Two players play together on one keyboard on the same computer. Top-down 2D duel arena: move + shoot + HP + rounds. Must be fun, responsive, and stable.

OUTPUT REQUIREMENTS
- Return ONE complete HTML file only.
- Uses HTML5 Canvas (no libraries, no images, no external assets).
- Runs by saving as `robot_duel.html` and opening in a browser.
- No TODOs, no placeholders.

CANVAS + LAYOUT
- Canvas: 900x600. Center it on the page.
- Draw a clear arena boundary (thicker border).
- Place 5–7 rectangular obstacles inside the arena, arranged symmetrically for fairness.
- Background: solid color; optional subtle grid dots/lines.

PLAYERS (ROBOTS)
- Two “small robots”, drawn with canvas shapes only:
  - Rounded rectangle body
  - Two glowing eyes
  - Small antenna
  - Small panel lines/highlight
- Player 1 (P1): cyan/blue theme
- Player 2 (P2): orange/red theme
- Add a small shadow under each robot.

CONTROLS (IMPORTANT)
Player 1:
- Move: W A S D
- Shoot: F

Player 2:
- Move: Arrow keys
- Shoot: Enter

AIMING (LOCK THIS IN)
- Aim direction is ALWAYS the player’s “last movement direction”.
- Each player stores an aim vector (aimX, aimY).
- When moving (including diagonals), update aim to that movement direction (normalized).
- If player is not moving, aim remains unchanged.
- Shooting fires bullets in that aim direction.
- If a player has never moved yet, default aim:
  - P1 aims up (0, -1)
  - P2 aims up (0, -1)
- Show a small aim indicator line (short line from robot) so players can see direction.

GAMEPLAY RULES
- Each player starts with HP = 7
- Bullets deal 1 damage
- Shooting cooldown ~220ms (tweakable)
- Bullets:
  - small circles or rounded rects
  - constant speed
  - lifetime ~1.2 seconds OR despawn on collision
- Movement is smooth (60fps) with constant speed
- Players cannot pass through walls or obstacles (simple collision resolution)

COLLISIONS
- Players vs walls/obstacles: AABB collision, resolve by pushing out along smallest axis.
- Bullets vs walls: despawn + spark particles
- Bullets vs obstacles: despawn + spark particles
- Bullets vs opponent: apply damage, hit flash, despawn bullet
- Use slightly smaller hitboxes than visuals for fairness.

ROUND + SCORE
- When a player’s HP reaches 0:
  - Freeze action for ~1.5 seconds
  - Show “Player X Wins Round”
  - Add 1 point to winner
  - Respawn both players at symmetric spawn points
  - Reset HP to 7
- Match ends when a player reaches 5 points:
  - Show “Player X Wins Match”
  - Press R to restart match (reset scores and HP)

HUD
- Top-left: P1 HP bar + score
- Top-right: P2 HP bar + score
- Corner hints: “P1 WASD + F” and “P2 Arrows + Enter”
- Center overlays for round over / match over.

POLISH (LIGHTWEIGHT)
- Hit flash on damaged robot (brief brighten)
- Tiny screen shake on hit (subtle)
- Particle sparks on bullet impacts: small fading circles
- Optional slight bob animation for robots (visual only)

TECHNICAL REQUIREMENTS
- make all texts in German
- requestAnimationFrame main loop
- Clean structure:
  - constants/config
  - input handler (keydown/keyup, supports simultaneous keys)
  - entities: players, bullets, particles, obstacles
  - update(dt) + draw()
  - collision helpers
  - game state machine: playing / roundOver / matchOver
- ES6 style (const/let, functions/classes)
- Robust key handling (no stuck keys, both players can act simultaneously).

DO NOT
- No external libraries, no images
- No overengineering
- No networking

FINISH
Ensure it’s fully playable and fun with fair spawns, readable HUD, and responsive controls.
Return the single HTML file only.
Ensure that all texts are in German.
