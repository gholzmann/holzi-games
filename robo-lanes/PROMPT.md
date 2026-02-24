# 🚗 Lane-Based Robot Traffic Game (Browser)

Create a complete, playable browser game with HTML.

The game is a **lane-based top-down traffic avoidance game** with small robot cars.

---

## 🎮 Core Gameplay

* The player controls a small robot car.
* The road scrolls vertically downward.
* The player car remains near the bottom of the screen.
* Traffic robot cars spawn at the top and move downward.
* The player switches lanes to avoid collisions.
* Score increases over time (distance survived).
* The game gradually becomes faster.

---

## 🕹 Controls

* Arrow Left → move one lane left
* Arrow Right → move one lane right
* Optional: A/D keys also supported
* Movement is discrete lane switching (no smooth steering)
* Prevent moving outside available lanes

---

## 🛣 Road Layout

* 4 vertical lanes
* Centered road on screen
* Dark road background
* Light dashed lane lines that scroll downward
* Responsive scaling allowed but not required

---

## 🤖 Robot Cars (Important)

Both player and traffic cars are **small robots**, not normal cars.

The player robot should look better compared to the traffic robots.

---

## ⚙ Game Mechanics

### Spawning

* Traffic robots spawn randomly in lanes
* Ensure safe spacing:
  * No spawn directly overlapping another robot in the same lane
  * Minimum vertical gap between robots in same lane
* Spawn rate gradually increases over time
* Speed gradually increases over time

### Movement

* All traffic robots move downward
* Remove robots when off-screen

### Collision

* Use simple rectangle collision detection
* Slightly smaller hitboxes than visual body
* On collision:

  * Stop game
  * Show “Game Over”
  * Show final score
  * Press Space to restart

---

## 📈 Difficulty Scaling

* Increase road speed over time
* Slightly decrease spawn interval over time
* Clamp difficulty to reasonable max

---

## 🧮 Scoring

* Score increases continuously based on survival time
* Display score at top of screen
* Use large readable font

---

## 🎨 Visual Polish

* Subtle robot eye glow
* Slight vertical bob animation for traffic robots
* Shadow under robots
* Smooth 60fps animation loop
* Use requestAnimationFrame

---

## 🧠 Code Structure

Organize code clearly:

* Game state variables
* Player object
* Traffic array
* Spawn function
* Update function
* Draw function
* Collision function
* Restart function
* Main game loop

Avoid messy global code.

Use ES6 style (const/let, arrow functions).

---

## 🚫 Do NOT

* Do not use images
* Do not overcomplicate physics
* Do not use 3D

---

## ✅ Output Requirements

Return:

* One single complete HTML file
* Fully playable when saved and opened in a browser
* No missing functions
* No placeholders
* No comments like “TODO”


