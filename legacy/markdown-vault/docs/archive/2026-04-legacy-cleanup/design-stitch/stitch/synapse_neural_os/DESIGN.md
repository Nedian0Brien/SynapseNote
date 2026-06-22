# Design System: The Neural Operating System

## 1. Overview & Creative North Star: "The Digital Synapse"
The Creative North Star for this system is **The Digital Synapse**. We are not building a static note-taking app; we are designing a living, breathing "Neural Operating System." The goal is to make the user feel as though they are interfacing directly with their own thoughts, augmented by artificial intelligence.

To achieve a "High-End Editorial" experience, we must break away from the rigid, boxy layouts of legacy software. This system relies on **Atmospheric Depth**, where content floats in a vast, dark digital void. We use intentional asymmetry—such as offset sidebars and varying card widths—to create a sense of organic growth. Every interaction should feel fluid, like a signal traveling through a neuron, rather than a mechanical click-and-response.

---

## 2. Colors & Surface Philosophy
The palette is rooted in deep obsidian tones, punctuated by high-energy bioluminescent accents.

### The Color Tokens
- **Background/Surface:** `#131313` (The Void)
- **Primary (Electric Violet):** `#D2BBFF` (Text/Icon) / `#7C3AED` (Container)
- **Secondary (Synapse Blue):** `#ADC6FF` (Text/Icon) / `#0566D9` (Container)
- **Tertiary (Neural Amber):** `#FFB784` (Contextual Highlights)

### The "No-Line" Rule
Traditional 1px solid borders are strictly prohibited for sectioning. They create visual noise and "trap" the user's data. Instead, define boundaries through:
1.  **Background Shifts:** Use `surface-container-low` for sidebars against a `surface` background.
2.  **Tonal Transitions:** Use vertical white space (`spacing.12` or `spacing.16`) to separate content blocks.

### The "Glass & Gradient" Rule
To evoke a futuristic feel, all floating panels (sidebars, command palettes, AI insights) must use **Glassmorphism**.
- **Recipe:** `surface-container-low` at 70% opacity + `backdrop-blur: 20px`.
- **Signature Textures:** Use a subtle linear gradient on primary CTAs transitioning from `#7C3AED` to `#3B82F6` at a 135-degree angle. This represents the "spark" of AI intelligence.

---

## 3. Typography: Editorial Intelligence
We pair the geometric precision of **Lexend** with the utilitarian clarity of **Inter**.

- **Display & Headlines (Lexend):** Used for big ideas and navigation headers. Lexend’s expanded character width feels "open" and futuristic. Use `display-lg` (3.5rem) for empty states or dashboard greetings to command authority.
- **Body & Titles (Inter):** The workhorse for thought-capture. `body-md` (0.875rem) is the standard for notes, providing high information density without sacrificing legibility.
- **Labels (Inter):** Small-caps or tight tracking on `label-sm` should be used for metadata and AI status indicators.

**Editorial Tip:** Use high contrast in scale. A `display-sm` headline sitting next to `body-sm` metadata creates a sophisticated, magazine-like hierarchy that feels custom-built.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to mimic light; we use them to mimic **glow**.

- **The Layering Principle:** Stack surfaces to create focus.
    - *Level 0:* `surface` (The Base)
    - *Level 1:* `surface-container-low` (The Workspace)
    - *Level 2:* `surface-container-high` (The Active Note)
- **Ambient Shadows:** For floating modals, use an extra-diffused shadow: `box-shadow: 0 20px 50px rgba(124, 58, 237, 0.08)`. This creates a violet "aura" rather than a grey shadow.
- **The "Ghost Border" Fallback:** If a border is required for a node-based UI element, use the `outline-variant` token at 15% opacity. It should be felt, not seen.

---

## 5. Components: The Neural Building Blocks

### Buttons & Chips
- **Primary Button:** Gradient background (`primary-container` to `secondary-container`), rounded-md (`0.375rem`), with a subtle inner-glow on hover.
- **Action Chips:** Use `surface-container-highest` with `label-md` text. No borders. On selection, transition the background to `primary-container` with a 2px "synapse glow" shadow.

### Input Fields & Search
- **The Omnibar:** A large, glassmorphic input field. On focus, the border-less container should gain a subtle `primary` outer glow (2px blur). Use `lexend` for the input text to make "searching" feel like a command.

### Cards & Lists
- **The "No-Divider" Rule:** Lists must never use horizontal lines. Use `spacing.4` to separate list items. 
- **AI Context Cards:** Use `surface-container-lowest` for the card body. Add a left-accented vertical bar (2px width) in `primary` to indicate the AI is currently "reading" or "processing" this block.

### Node-Based UI (The Graph)
- **Nodes:** Circles using `primary-fixed-dim` for inactive states and a pulsing `primary` for active states.
- **Edges (Connections):** Use `outline-variant` at 20% opacity. When a connection is "active," animate a gradient stroke following the path of the line.

---

## 6. Do’s and Don’ts

### Do:
- **Use Breathing Room:** Embrace the `spacing.20` and `spacing.24` tokens for margin between major modules. White space is "mental space."
- **Nesting Depth:** Always place a higher-tier surface container inside a lower-tier one to create a natural hierarchy.
- **Intentional Asymmetry:** Align text to the left but allow AI-generated imagery or node graphs to bleed off the right edge of the grid.

### Don't:
- **Don't use pure black (#000000):** It kills the depth. Use `surface` (#131313) to allow for subtle "glow" effects to remain visible.
- **Don't use 100% Opaque Borders:** This shatters the "glass" metaphor. 
- **Don't over-animate:** AI shouldn't be "jittery." Use long, smooth transitions (300ms–500ms) with `cubic-bezier(0.4, 0, 0.2, 1)`.

### Accessibility Note:
While we lean into dark aesthetics, ensure all `on-surface` text meets a 4.5:1 contrast ratio. Use `primary-fixed-dim` for interactive elements that need to stand out against the deep charcoal void.