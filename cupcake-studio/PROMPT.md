Create a complete, playable browser game in a SINGLE HTML file (no external dependencies) called:

“Cupcake Studio”

GOAL
This is a calm, creative decorating game for children (around 8 years old).
There is NO losing condition.
The player decorates cupcakes using frosting, sprinkles, toppings, and cute extras.

Return ONE complete HTML file only.
No placeholders. No TODO comments.

────────────────────────
TECHNICAL REQUIREMENTS
────────────────────────

- Use HTML + CSS + JavaScript only.
- Use Canvas for drawing the cupcake.
- UI controls can be regular HTML buttons or simple styled divs.
- No images.
- Must run by saving as `index.html` and opening in browser.
- Responsive scaling is optional but layout must not break.

Canvas size: approx 900x600.

Use requestAnimationFrame only if needed (not required).

────────────────────────
GAMEPLAY
────────────────────────

The screen has:

LEFT SIDE:
- Cupcake drawing area (canvas)
- Large centered cupcake

RIGHT SIDE:
- Decoration controls

The cupcake consists of:

1) Base (cupcake wrapper)
2) Frosting layer
3) Toppings layer
4) Decorative extras

────────────────────────
DECORATION FEATURES
────────────────────────

1. Frosting Colors
- Provide at least 6 frosting color buttons:
  Pink, Purple, Blue, Yellow, Mint, White
- Clicking a color changes frosting color immediately.

2. Sprinkles
- Button: “Add Sprinkles”
- Sprinkles appear randomly on frosting area
- Different sprinkle colors each time
- Button: “Clear Sprinkles”

3. Toppings (select one at a time)
- Cherry
- Strawberry
- Blueberry
- Star candy
- Heart candy
- Clicking a topping places it on top center
- Only one main topping at a time

4. Extra Decorations
- Small candy pieces randomly scattered
- Chocolate drizzle overlay (toggle button)
- Glitter sparkles effect (toggle)

5. Background Color Selector
- At least 5 soft pastel background colors

6. Reset Button
- Clears everything to default cupcake

7. “Surprise Me” Button
- Randomly generates:
  - Frosting color
  - Sprinkles
  - Topping
  - Background
  - Decorations

────────────────────────
VISUAL STYLE
────────────────────────

- Cute, colorful, soft pastel palette
- Rounded shapes
- Slight shadow under cupcake
- Frosting should look swirled (simple curved shape)
- Sprinkles are small rectangles or ovals
- Glitter = small soft glowing dots
- No harsh colors
- No black outlines (use dark pastel lines instead)

Make the cupcake look friendly and charming.

────────────────────────
CODE STRUCTURE
────────────────────────

Organize clearly:

- State object storing:
  frostingColor
  sprinkles array
  topping type
  drizzle on/off
  glitter on/off
  backgroundColor

- Functions:
  drawCupcake()
  drawWrapper()
  drawFrosting()
  drawSprinkles()
  drawTopping()
  drawDrizzle()
  drawGlitter()
  resetCupcake()
  randomizeCupcake()

Avoid messy global logic.

────────────────────────
USER EXPERIENCE
────────────────────────

- Everything reacts instantly.
- No delays.
- No game over.
- Smooth redraw after each change.
- Add small hover animation on buttons (optional).
- Display title text: “Cupcake Studio” at top.
- All texts should be in German

────────────────────────
DO NOT
────────────────────────

- No timers
- No scoring
- No losing
- No external assets
- No complicated physics

────────────────────────
FINAL CHECK
────────────────────────

Make sure:
- It works immediately when opened.
- Buttons are clickable.
- Decorations visually update.
- Surprise button produces different combinations each time.
- Reset returns to original cupcake.
- All texts are in German

Return only the complete HTML file.
