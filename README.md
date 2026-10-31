# Open the Gate

A turn-based browser game for farmers who are thinking about adding agritourism to a working farm.

You run a farm for **3 years, one month per turn (36 turns, about 15 minutes)**. The goal is to earn **$60,000 a year in visitor profit by year 3** without burning out the family. It runs in any modern browser, works on phones, needs no installation, and has no dependencies or build step.

> All figures in the game are **game numbers**. They are not real-world benchmarks or financial advice. Legal topics (insurance, zoning, waivers, food labels, sales tax) are kept general. Always check your own local and state rules.

## How to play

1. **Set up your farm.** Give it a name (it's painted on the barn), then pick a farm type (Orchard, Market Garden, Livestock or Grain) and a location (near a city, a small-town crossroads, or a remote valley). Each farm type has its own crop income, monthly work hours and attractions that suit it.
2. **Each month:**
   - **Build** attractions on the 10 plots. Tap a plot on the map, or use the plot buttons.
   - Do **groundwork**: insurance, waivers and signs, handwash stations, parking, restrooms, zoning permit, commercial kitchen, website, online booking, seasonal-help payroll and an email list.
   - Pick **one focus**: Promote, Fix and Tidy, or Rest the Family.
   - Set your **price level** (Budget, Fair or Premium) and, once payroll is set up, how many **hired hands** you need.
   - Read the **forecast** (visitors, hours, stamina and money), then press **Open the gate**.
   - Watch the visitors arrive (tap **Skip** to jump ahead), read the **results ledger**, then answer the month's **decision card** if there is one.
3. **Watch the four meters:**
   - **Cash.** The bank lets you go $40,000 below zero. If you stay past that two months in a row, the game ends.
   - **Stars** (1–5) are your reviews. More stars bring more visitors.
   - **Family Stamina** (0–100) falls when the family works more hours than it has. At zero, the farm closes for a burnout month.
   - **Safety** (0–100). Low safety makes injuries more likely. Insurance limits what an injury costs you.
4. **At the end** you get a county fair ribbon (Blue, Red, White or Honorable Mention). The report shows your year-3 visitor profit and a table of every attraction's revenue, costs, hours and profit per hour. It also names your best and worst earner per hour and lists every lesson you collected. Each burnout month costs you one ribbon level.

**Tips from Dot, the mentor:** fall is busy for both visitors and harvest, so line up help early. Pumpkin patches and corn mazes have to be planted months ahead. Parking caps how many visitors you can take. Rain hurts outdoor attractions, and online booking halves the loss.

Progress saves automatically in your browser (`localStorage`). If the browser blocks storage, the game still works, but progress is lost when you close the page.

## Play it

- **On your computer:** download or clone this repository and open `index.html` in a browser. No server is needed.
- **Online:** host it with GitHub Pages (below) and share the link.

### Turn on GitHub Pages

1. On GitHub, open the repository and go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose the branch (for example `main`) and the folder **`/ (root)`**, then click **Save**.
4. After a minute or two, the page shows your site address, usually `https://<your-username>.github.io/agritourismgame/`.

The game uses the Alfa Slab One font from Google Fonts. If that font can't load (for example when offline), the game falls back to similar system fonts.

## For developers

```
index.html          page structure
css/style.css       crate-label styling, phone layout, focus states, reduced motion
js/data.js          all game numbers: farm types, locations, attractions, groundwork, dilemma cards
js/engine.js        pure game logic (no DOM): seeded RNG, monthly model, cards, mentor, end report
js/scene.js         canvas farm scene and the arrival animation (drawing only)
js/ui.js            connects the engine, the scene and the page
tests/              engine tests (Node's built-in test runner)
tools/simulate.js   balance simulator: many seeds × strategies × farm types × locations
tools/browser-check.js  optional full playthrough in a real browser (needs Playwright)
```

You need Node 18 or newer. There is nothing to install.

```bash
npm test
```

```bash
node tools/simulate.js 30 --detail
```

The engine is deterministic for a given seed, and all game state is plain JSON. Balance numbers live in `js/data.js`. After changing them, re-run the simulator. It plays thoughtful, careful, modest, over-expanding, careless, random and crops-only strategies across every farm type and location. The target is that a thoughtful player usually earns Blue and careless expansion usually fails.
