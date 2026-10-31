/*
 * Open the Gate — game data.
 * Every number in this file is a GAME number, tuned for play balance.
 * None of it is a real-world benchmark, price list or financial advice.
 *
 * Month arrays are calendar months: index 0 = January ... 11 = December.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OTG_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var RULES = {
    startMonth: 2,            // the game opens in March of year 1
    turns: 36,
    startCash: 30000,
    creditLine: 40000,        // the bank lets you go this far below zero
    interestRate: 0.01,       // per month on any overdraft
    livingCost: 2500,         // family living + farm overhead each month
    familyHours: 420,         // hours the family can work in a normal month
    overtimeCap: 1.3,         // beyond this much work, jobs go undone
    helperHours: 140,         // hours one hired hand covers per month
    helperCost: 3200,         // wages, payroll taxes, workers' comp per hand per month
    maxHelpers: 3,
    maxDelegate: 0.65,       // share of all work hired hands can cover
    goal: 60000,              // year-3 visitor profit target
    baseParking: 450,         // visitors a month the farmyard can park
    standAddOn: 2,          // stand spend from visitors who came for something else
    burnoutCrop: 0.5          // share of crop income kept in a burnout month
  };

  var FOCUS = {
    promote: { name: 'Promote', cost: 700, blurb: 'Ads, posters and posts. More visitors now, more people know you later.' },
    tidy: { name: 'Fix and Tidy', cost: 300, blurb: 'Mend fences, mow, scrub restrooms. Safer farm, happier reviews.' },
    rest: { name: 'Rest the Family', cost: 0, blurb: 'Shorter days and a real day off. Family Stamina recovers.' }
  };

  var PRICE = {
    budget: { name: 'Budget', price: 0.8, draw: 1.12, quality: 0.25, blurb: 'Lower prices, more visitors, more work per dollar.' },
    fair: { name: 'Fair', price: 1.0, draw: 1.0, quality: 0, blurb: 'Middle-of-the-road prices.' },
    premium: { name: 'Premium', price: 1.25, draw: 0.86, quality: -0.3, blurb: 'Higher prices, fewer visitors. Works best with a strong star rating.' }
  };

  var LOCATIONS = {
    city: {
      name: 'Near a city', blurb: '40 minutes from a big city. Lots of visitors, busy roads, nervous neighbors.',
      draw: 1.15, eventBonus: 1.0, wet: 0
    },
    town: {
      name: 'Small-town crossroads', blurb: 'On a county road near a market town. A steady trickle of visitors.',
      draw: 1.0, eventBonus: 1.1, wet: 0
    },
    remote: {
      name: 'Remote valley', blurb: 'Beautiful and quiet, but far from anyone. Fewer day-trippers; stays and weddings do well.',
      draw: 0.76, eventBonus: 1.55, wet: 0.05
    }
  };

  var FARM_TYPES = {
    orchard: {
      name: 'Orchard',
      blurb: 'Apples, pears and peaches. Picking season runs straight into fall visitor season.',
      hours: [110, 140, 170, 190, 210, 210, 200, 300, 360, 340, 170, 100],
      crop: [0, 0, 0, 0, 0, 500, 1500, 6000, 13000, 11000, 3000, 1000],
      bonus: { stand: 1.2, upick: 1.5, dinners: 1.15, workshops: 1.1, trees: 0.9, maze: 0.8, petting: 0.8 }
    },
    garden: {
      name: 'Market Garden',
      blurb: 'Vegetables, berries and flowers. Long, steady summer hours.',
      hours: [90, 120, 200, 260, 300, 320, 320, 320, 290, 230, 130, 90],
      crop: [0, 0, 500, 1500, 3000, 5000, 6500, 7000, 6000, 4000, 1500, 0],
      bonus: { stand: 1.35, upick: 1.3, dinners: 1.3, workshops: 1.25, maze: 0.8, hayride: 0.9 }
    },
    livestock: {
      name: 'Livestock',
      blurb: 'Cattle, sheep and goats. Chores every single day, all year.',
      hours: [250, 260, 320, 300, 260, 240, 240, 240, 250, 250, 250, 250],
      crop: [2900, 2900, 2900, 2900, 2900, 2900, 2900, 2900, 2900, 2900, 2900, 2900],
      bonus: { petting: 1.5, school: 1.35, cabin: 1.2, workshops: 1.1, upick: 0.6, pumpkin: 0.85, maze: 0.85 }
    },
    grain: {
      name: 'Grain',
      blurb: 'Corn, wheat and soybeans. Quiet months, then planting and harvest crunches.',
      hours: [50, 50, 110, 300, 320, 130, 220, 150, 320, 360, 140, 50],
      crop: [0, 0, 0, 0, 0, 0, 9000, 4000, 0, 15000, 8000, 0],
      bonus: { maze: 1.5, pumpkin: 1.3, hayride: 1.3, upick: 0.6, petting: 0.85, dinners: 0.9 }
    }
  };

  /*
   * Attractions. draw = visitors in a peak month at a 3-star farm near a small town.
   * season = share of peak draw by calendar month (0 = closed).
   * hours = fixed hours per open month + hoursPer visitor.
   * risk = how much this attraction adds to the chance of an injury.
   * outdoor = share of visitors lost to rain (0 = fully indoors).
   */
  var ATTRACTIONS = {
    stand: {
      name: 'Farm Stand', icon: 'stand', unit: 'shoppers',
      cost: 3000, upkeep: 120, draw: 120, price: 12, cogs: 0.4,
      hours: 50, hoursPer: 0.05, risk: 1, outdoor: 0.2, establish: 0,
      season: [0.3, 0.3, 0.5, 0.6, 0.8, 1, 1, 1, 1, 1, 0.7, 0.6],
      requires: [],
      blurb: 'A roadside stand by the gate. Also sells snacks and produce to everyone who comes for other attractions.'
    },
    upick: {
      name: 'U-Pick', icon: 'upick', unit: 'pickers',
      cost: 5000, upkeep: 150, draw: 205, price: 16, cogs: 0.25,
      hours: 40, hoursPer: 0.06, risk: 2, outdoor: 1, establish: 3,
      season: [0, 0, 0, 0, 0.5, 1, 0.9, 0.8, 1, 0.8, 0, 0],
      requires: [],
      blurb: 'Visitors pick their own berries, apples or flowers. Plants need a few months to settle in.'
    },
    pumpkin: {
      name: 'Pumpkin Patch', icon: 'pumpkin', unit: 'visitors',
      cost: 4000, upkeep: 100, draw: 600, price: 11, cogs: 0.25,
      hours: 60, hoursPer: 0.045, risk: 2, outdoor: 1, establish: 3,
      season: [0, 0, 0, 0, 0, 0, 0, 0, 0.45, 1, 0, 0],
      requires: [],
      blurb: 'The classic fall draw. Must be planted by early summer to be ready for September.'
    },
    maze: {
      name: 'Corn Maze', icon: 'maze', unit: 'visitors',
      cost: 6500, upkeep: 250, draw: 490, price: 13, cogs: 0.05,
      hours: 50, hoursPer: 0.035, risk: 3, outdoor: 1, establish: 4,
      season: [0, 0, 0, 0, 0, 0, 0, 0.3, 0.6, 1, 0.2, 0],
      requires: [],
      blurb: 'A maze cut into a corn field. Plant in spring, cut the paths in summer, open in late summer.'
    },
    petting: {
      name: 'Petting Barn', icon: 'petting', unit: 'visitors', animals: true,
      cost: 8000, upkeep: 500, draw: 215, price: 9, cogs: 0.08,
      hours: 90, hoursPer: 0.04, risk: 6, outdoor: 0.6, establish: 1,
      season: [0, 0, 0, 0.6, 0.9, 1, 1, 1, 0.9, 1, 0.3, 0],
      requires: [],
      blurb: 'Goats, rabbits and calves for families to meet. Animals mean daily chores and handwashing.'
    },
    hayride: {
      name: 'Hayrides', icon: 'hayride', unit: 'riders',
      cost: 7000, upkeep: 200, draw: 390, price: 8, cogs: 0.05,
      hours: 40, hoursPer: 0.07, risk: 7, outdoor: 1, establish: 0,
      season: [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1, 0.4, 0.3],
      requires: ['insurance'],
      blurb: 'A tractor pulls a wagon of visitors round the farm. Fun, popular and one of the riskiest rides.'
    },
    school: {
      name: 'School Tours', icon: 'school', unit: 'students', event: true,
      cost: 2500, upkeep: 80, draw: 170, price: 10, cogs: 0.1,
      hours: 40, hoursPer: 0.09, max: 700, risk: 3, outdoor: 0.6, establish: 1,
      season: [0, 0, 0, 0.8, 1, 0.6, 0, 0, 0.6, 1, 0.4, 0],
      requires: ['insurance', 'handwash'],
      blurb: 'Weekday field trips. Booked ahead, so less hurt by rain, but lots of talking and herding.'
    },
    dinners: {
      name: 'Farm Dinners', icon: 'dinners', unit: 'guests', event: true,
      cost: 9000, upkeep: 150, draw: 60, price: 110, cogs: 0.5,
      hours: 50, hoursPer: 0.45, max: 200, risk: 1, outdoor: 0.5, establish: 0,
      season: [0, 0, 0, 0, 0.5, 1, 1, 1, 1, 0.6, 0, 0],
      requires: ['zoning', 'kitchen', 'restrooms'],
      blurb: 'Long-table dinners in the field. High ticket price, high food cost and long evenings.'
    },
    cabin: {
      name: 'Farm Stay Cabin', icon: 'cabin', unit: 'nights', event: true,
      cost: 32000, upkeep: 450, draw: 20, price: 150, cogs: 0.15,
      hours: 20, hoursPer: 1.2, max: 28, risk: 1, outdoor: 0, establish: 2,
      season: [0.5, 0.5, 0.6, 0.8, 1, 1, 1, 1, 1, 1, 0.7, 0.8],
      requires: ['zoning', 'website'],
      blurb: 'An overnight cabin. Earns most months of the year, but costs a lot to build and must be cleaned after every stay.'
    },
    weddings: {
      name: 'Barn Weddings', icon: 'weddings', unit: 'guests', event: true,
      cost: 28000, upkeep: 350, draw: 180, price: 38, cogs: 0.12,
      hours: 60, hoursPer: 0.15, max: 480, risk: 2, outdoor: 0.2, establish: 2,
      season: [0, 0, 0, 0.3, 0.8, 1, 0.9, 0.9, 1, 1, 0.3, 0],
      requires: ['zoning', 'restrooms', 'parking1'],
      blurb: 'Rent the barn for weddings. Big checks, big expectations, and permits to match.'
    },
    workshops: {
      name: 'Workshops', icon: 'workshops', unit: 'students', event: true,
      cost: 2000, upkeep: 40, draw: 20, price: 45, cogs: 0.3,
      hours: 16, hoursPer: 0.3, max: 90, risk: 1, outdoor: 0, establish: 0,
      season: [1, 1, 0.8, 0.6, 0.5, 0.3, 0.3, 0.3, 0.5, 0.6, 1, 1],
      requires: [],
      blurb: 'Classes in canning, pruning or wreath-making. Small but steady, even in winter.'
    },
    trees: {
      name: 'Christmas Trees', icon: 'trees', unit: 'families',
      cost: 6000, upkeep: 80, draw: 180, price: 55, cogs: 0.45,
      hours: 40, hoursPer: 0.08, risk: 2, outdoor: 0.5, establish: 0,
      season: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 1],
      requires: [],
      blurb: 'Choose-and-cut trees in winter. Your own trees take years to grow, so you buy many in at first.'
    }
  };

  var GROUNDWORK = {
    insurance: {
      name: 'Agritourism insurance', cost: 0, upkeep: 320,
      blurb: 'Liability cover for visitors. Limits what an injury costs you to a $1,000 deductible.'
    },
    waivers: {
      name: 'Waivers and warning signs', cost: 700, upkeep: 0,
      blurb: 'Posted signs and signed waivers. Raises Safety and trims the cost of an incident. Check what your state requires.'
    },
    handwash: {
      name: 'Handwash stations', cost: 1500, upkeep: 40,
      blurb: 'Soap and running water at animal areas and food. Needed for school tours.'
    },
    parking1: {
      name: 'Gravel parking lot', cost: 4000, upkeep: 50, parking: 1800,
      blurb: 'Off-road parking for about 1,800 visitors a month (your farmyard holds about 450).'
    },
    parking2: {
      name: 'Overflow field and attendants', cost: 3000, upkeep: 250, parking: 4500, requires: ['parking1'],
      blurb: 'A mowed overflow field with weekend attendants. Room for about 4,500 visitors a month.'
    },
    restrooms: {
      name: 'Restrooms', cost: 5500, upkeep: 120,
      blurb: 'A proper restroom block. Visitors notice. Needed for weddings and dinners.'
    },
    zoning: {
      name: 'Zoning permit', cost: 1500, upkeep: 0, delay: 3,
      blurb: 'Permission for events and lodging. Takes about 3 months to approve. Needed for the cabin, weddings, dinners and kitchen.'
    },
    kitchen: {
      name: 'Commercial kitchen', cost: 16000, upkeep: 150, requires: ['zoning'],
      blurb: 'Licensed kitchen for pies, jams and dinners. The stand earns more per shopper. Needed for farm dinners.'
    },
    website: {
      name: 'Website and listings', cost: 1200, upkeep: 40,
      blurb: 'A simple site plus map and tourism listings. More visitors find you, and the email list grows faster.'
    },
    booking: {
      name: 'Online booking', cost: 900, upkeep: 60, requires: ['website'],
      blurb: 'Timed tickets and rain checks. Halves rain losses and helps booked events.'
    },
    payroll: {
      name: 'Seasonal help (payroll set up)', cost: 400, upkeep: 0,
      blurb: 'Paperwork, workers\' comp and training so you can hire hands by the month.'
    },
    email: {
      name: 'Email list', cost: 200, upkeep: 15,
      blurb: 'A sign-up sheet and newsletter. Grows from your visitors and brings repeat visits.'
    }
  };

  // Chance that any one weekend in this calendar month is rained out.
  var RAIN = [0.3, 0.3, 0.35, 0.4, 0.35, 0.25, 0.2, 0.2, 0.25, 0.3, 0.35, 0.3];

  /*
   * Dilemma cards.
   * when(s, h): may this card appear now? h = helper queries from the engine.
   * choices[].fx: effects (cash, stars, stamina, safety, awareness, gw, zoning,
   *   flag, followup, mod, chance). fx may be a function (s, h) returning effects.
   * choices[].need(s, h): optional; the choice is greyed out when false.
   * choices[].wise: used only by the balance simulator's careful player.
   */
  var CARDS = [
    {
      id: 'insurer', title: 'The insurance renewal',
      when: function (s, h) { return h.anyBuilt() && !h.gw('insurance'); }, weight: 3,
      text: 'Your farm policy is up for renewal. The form asks: "Do members of the public visit the property for recreation or to buy goods?"',
      choices: [
        { label: 'Tell the truth and add agritourism coverage', wise: true,
          fx: { gw: 'insurance' }, result: 'Your agent adds liability coverage for visitors. The premium goes up, but an injury claim is now covered.' },
        { label: 'Tick "No" — it is only a few visitors',
          fx: { flag: { hiddenVisitors: true } }, result: 'You save the premium for now and hope nothing happens.' }
      ],
      lesson: 'A standard farm policy often excludes paying visitors. Tell your insurer exactly what you plan and get agritourism coverage in writing before you open.'
    },
    {
      id: 'claim_denied', title: 'Claim denied', followupOnly: true,
      text: 'After the accident, the insurance adjuster asks how many visitors you get. Because you said "no visitors" on the renewal form, the claim is denied and the policy is cancelled.',
      choices: [
        { label: 'Pay the bills and buy proper coverage', wise: true,
          fx: { cash: -2500, gw: 'insurance', flag: { hiddenVisitors: false } }, result: 'An expensive lesson, but you are covered from now on.' },
        { label: 'Pay the bills and go without insurance',
          fx: { cash: -2500, stars: -0.1, flag: { hiddenVisitors: false } }, result: 'Every future incident comes straight out of your pocket.' }
      ],
      lesson: 'Leaving visitors off an insurance form can void the policy exactly when you need it.'
    },
    {
      id: 'handwash', title: 'Sticky hands at the goat pen',
      when: function (s, h) { return (h.isOpen('petting') || h.isOpen('school')) && !h.gw('handwash'); }, weight: 4,
      text: 'A parent with a toddler asks where to wash up after the goat pen. There is a garden hose and a roll of paper towels.',
      choices: [
        { label: 'Install proper handwash stations ($1,500)', wise: true, need: function (s, h) { return h.canSpend(1500); },
          fx: { cash: -1500, gw: 'handwash' }, result: 'Soap, running water and paper towels at the exit of the pen.' },
        { label: 'Put out hand sanitizer ($100)',
          fx: { cash: -100, safety: 3, followup: { id: 'illness', in: 2, chance: 0.3 } }, result: 'Bottles go up on every post. Better than nothing, but not by much.' },
        { label: 'Families can wash up at home',
          fx: { safety: -10, followup: { id: 'illness', in: 2, chance: 0.55 } }, result: 'You skip the expense.' }
      ],
      lesson: 'After touching animals, people need soap and running water. Hand sanitizer does not remove germs like E. coli well. Put handwash stations at the exit of animal areas.'
    },
    {
      id: 'illness', title: 'A call from the health department', followupOnly: true,
      text: 'Two children who visited your animals got sick with E. coli. The county health department wants to inspect.',
      choices: [
        { label: 'Cooperate fully and install handwash stations', wise: true,
          fx: { cash: -2500, gw: 'handwash', stars: -0.4, safety: 10 }, result: 'The inspector is satisfied. The local news story still stings.' },
        { label: 'Cooperate, but keep costs down',
          fx: { cash: -800, stars: -0.6, safety: 2 }, result: 'You fix the minimum. Reviews mention the outbreak for months.' }
      ],
      lesson: 'Animal contact areas need handwashing, no eating near animals, and clear signs. One outbreak can cost far more than prevention.'
    },
    {
      id: 'double_bus', repeat: true, title: 'Two buses, one morning',
      when: function (s, h) { return h.isOpen('school'); }, weight: 3,
      text: 'At 9 a.m. two school buses pull in. Both teachers are holding a confirmation for today.',
      choices: [
        { label: 'Run both groups — everyone pitches in',
          fx: { stamina: -8, stars: 0.1 }, result: 'Ninety kids, two tours, one very long day. The teachers are grateful.' },
        { label: 'Ask one class to rebook and send them home with a gift',
          fx: { cash: -250, stars: -0.05 }, result: 'Disappointed kids, but a polite rebooking.' },
        { label: 'Set up online booking so it never happens again ($900)', wise: true,
          need: function (s, h) { return h.gw('website') && !h.gw('booking') && h.canSpend(900); },
          fx: { cash: -900, gw: 'booking', stamina: -3 }, result: 'One calendar, automatic confirmations and a daily cap.' }
      ],
      lesson: 'Keep one booking calendar, confirm every group in writing, and set a daily limit.'
    },
    {
      id: 'one_star', repeat: true, title: 'A one-star review',
      when: function (s, h) { return h.lastVisitors() > 150 && h.turn >= 2; }, weight: 2,
      text: 'A new review: "Long lines, no shade, and the bathroom was gross. Never again." One star.',
      choices: [
        { label: 'Reply calmly: thank them and say what you are fixing', wise: true,
          fx: { stars: 0.15 }, result: 'Your short, polite reply gets more likes than the review.' },
        { label: 'Reply and set the record straight',
          fx: { stars: -0.25 }, result: 'The argument in the comments is now the first thing people see.' },
        { label: 'Ignore it',
          fx: { stars: -0.08 }, result: 'It sits there, unanswered.' }
      ],
      lesson: 'Future visitors read your reply more than the complaint. Be brief, thank them, and fix what is fair.'
    },
    {
      id: 'neighbors', title: 'Cars on the county road',
      when: function (s, h) { var l = h.last(); return l && (l.turnedAway > 0 || (!h.gw('parking1') && l.visitors > 380)); }, weight: 4,
      text: 'On Saturday, cars lined both shoulders of the county road. A neighbor could not get a tractor out of their own lane.',
      choices: [
        { label: 'Build a gravel parking lot now ($4,000)', wise: true,
          need: function (s, h) { return !h.gw('parking1') && h.canSpend(4000); },
          fx: { cash: -4000, gw: 'parking1', flag: { neighborsOk: true } }, result: 'Cars are off the road by next weekend.' },
        { label: 'Hire weekend parking help and take the neighbors a pie',
          fx: { cash: -800, stars: 0.05, flag: { neighborsOk: true } }, result: 'Orange vests, cones, and a much friendlier neighbor.' },
        { label: 'It is a public road',
          fx: { followup: { id: 'zoning_letter', in: 2 } }, result: 'The neighbor says nothing more to you. They do call the county.' }
      ],
      lesson: 'Neighbors decide how your zoning hearing goes. Keep parking off the road and talk to them before the busy season.'
    },
    {
      id: 'zoning_letter', title: 'A letter from the county',
      when: function (s, h) { return !h.gw('zoning') && !h.zoningPending() && h.lastVisitors() > 900 && h.year >= 1; }, weight: 2,
      text: 'The county planning office writes: "Commercial visitor activity on agricultural land may require a permit. Please contact us within 30 days."',
      choices: [
        { label: 'Call them and apply for the permit ($1,500)', wise: true,
          need: function (s, h) { return !h.gw('zoning') && !h.zoningPending(); },
          fx: { cash: -1500, zoning: 'start' }, result: 'The planner is helpful. Approval should take about three months.' },
        { label: 'Hire a land-use attorney to speed it up ($3,000)',
          need: function (s, h) { return !h.gw('zoning') && h.canSpend(3000); },
          fx: { cash: -3000, zoning: 'fast' }, result: 'The attorney knows the planning staff. Approval in about a month.' },
        { label: 'Ignore it',
          fx: { followup: { id: 'zoning_fine', in: 3 } }, result: 'The letter goes in the drawer.' }
      ],
      lesson: 'Rules for farm stands, events and lodging differ by county and state. Call your planning office before you build, not after.'
    },
    {
      id: 'zoning_fine', title: 'Notice of violation', followupOnly: true,
      text: 'The county sends a notice of violation for operating without a permit: a $2,500 fine, and you must apply.',
      choices: [
        { label: 'Pay the fine and apply',
          fx: function (s, h) { return (h.gw('zoning') || h.zoningPending()) ? { cash: -2500 } : { cash: -4000, zoning: 'start' }; },
          wise: true, result: 'Paid. The planner is noticeably cooler with you now.' }
      ],
      lesson: 'Ignoring a planning letter turns a simple permit into a fine plus the same permit.'
    },
    {
      id: 'bride', title: 'The bigger wedding',
      when: function (s, h) { return h.isOpen('weddings'); }, weight: 3,
      text: 'A bride wants 250 guests. Your permit, restrooms and parking are set up for 150.',
      choices: [
        { label: 'Say no, and offer your 150-guest package', wise: true,
          fx: { stars: 0.05 }, result: 'They book anyway — and trust you more for being clear.' },
        { label: 'Say yes for an extra $3,000',
          fx: { cash: 3000, safety: -15, followup: { id: 'fire_marshal', in: 1, chance: 0.6 } }, result: 'It is a big check. It will also be a very crowded barn.' },
        { label: 'Refer them to a larger venue for a finder\'s fee',
          fx: { cash: 300 }, result: 'A small fee and a good relationship with the venue down the road.' }
      ],
      lesson: 'Guest limits on your permit protect you. Put the cap in the contract and do not stretch it for one big check.'
    },
    {
      id: 'fire_marshal', title: 'The fire marshal stops by', followupOnly: true,
      text: 'After a complaint about the overcrowded wedding, the fire marshal inspects the barn.',
      choices: [
        { label: 'Pay the fine and post occupancy limits',
          wise: true, fx: { cash: -2000, stars: -0.2, safety: 8 }, result: 'Occupancy signs go up by every door.' }
      ],
      lesson: 'Occupancy limits exist because barns burn fast and exits jam. Inspectors respond to complaints.'
    },
    {
      id: 'influencer', title: 'Free entry for a post?',
      when: function (s, h) { return h.stars() >= 3 && h.openCount() > 0 && h.turn >= 3; }, weight: 2,
      text: 'A social media creator with 40,000 followers asks for free entry for their family of six "for exposure".',
      choices: [
        { label: 'Yes, if they are local and agree in writing what they will post', wise: true,
          fx: { cash: -120, chance: { p: 0.7, yes: { awareness: 0.05, text: 'Their followers are mostly nearby. You see a bump in visits.' }, no: { text: 'Turns out most of their followers live overseas. Nothing changes.' } } },
          result: 'You ask for their audience numbers first.' },
        { label: 'Offer them a regular ticket',
          fx: {}, result: 'They buy tickets and post a few photos anyway.' },
        { label: 'Free entry, no strings',
          fx: { cash: -120, chance: { p: 0.3, yes: { awareness: 0.02, text: 'One nice post.' }, no: { text: 'No post ever appears.' } } },
          result: 'You wave them through.' }
      ],
      lesson: 'Ask where a creator\'s followers live and what they will post. A small local account is often worth more than a big one far away.'
    },
    {
      id: 'coupon', title: 'The daily-deal offer',
      when: function (s, h) { return h.openCount() > 0 && h.turn >= 2; }, weight: 2,
      text: 'A daily-deal website offers to sell vouchers for 60% off your prices. They keep half of what is left.',
      choices: [
        { label: 'Run the deal',
          fx: { stamina: -6, mod: { draw: 1.35, price: 0.7, months: 2, label: 'Deal vouchers' } },
          result: 'Crowds of bargain-hunters arrive. The checks are small.' },
        { label: 'Decline', wise: true, fx: {}, result: 'You keep your prices.' },
        { label: 'Run your own midweek family deal instead',
          fx: { mod: { draw: 1.08, months: 1, label: 'Midweek deal' } }, result: 'A modest boost on slow weekdays.' }
      ],
      lesson: 'With deep discounts you keep roughly 20% of a normal ticket. They bring one-time bargain-hunters who still need your time.'
    },
    {
      id: 'rain_refunds', repeat: true, title: 'Rained-out tickets',
      when: function (s, h) { var l = h.last(); return l && l.rain >= 2 && l.visitors > 200 && h.anyOutdoorOpenLast(); }, weight: 4,
      text: 'Families who pre-bought tickets for last month\'s rained-out weekends are asking for their money back.',
      choices: [
        { label: 'Give full refunds',
          fx: function (s, h) { return { cash: -Math.round(Math.min(2500, h.lastVisitors() * 0.6)), stars: 0.05 }; },
          result: 'Refunds go out. Everyone is polite.' },
        { label: 'Offer rain checks for later this season', wise: true,
          fx: { stars: 0.05, mod: { draw: 1.08, months: 1, label: 'Rain checks' } }, result: 'Most families come back on a sunny day.' },
        { label: 'No refunds — it says so on the ticket',
          fx: { stars: -0.3 }, result: 'Technically right. The reviews are not kind.' }
      ],
      lesson: 'Post your weather policy before you sell tickets. Rain checks keep the money and the goodwill, and online booking makes them easy.'
    },
    {
      id: 'dogs', title: 'Dogs in the U-pick',
      when: function (s, h) { return h.isOpen('upick'); }, weight: 3,
      text: 'Visitors keep bringing dogs into the picking rows. One just lifted its leg on the strawberries.',
      choices: [
        { label: 'No pets in picking areas: signs plus a shaded waiting spot ($300)', wise: true,
          fx: { cash: -300, safety: 6, stars: -0.05 }, result: 'A few grumbles, then everyone gets used to it.' },
        { label: 'Leashed dogs are welcome',
          fx: { stars: 0.05, safety: -8 }, result: 'Dog owners love you. The produce safety inspector will not.' },
        { label: 'Leave it', fx: { safety: -5 }, result: 'Nothing changes.' }
      ],
      lesson: 'Animal droppings in produce fields are a food safety risk. Many U-picks ban pets in picking areas; check the produce safety rules where you farm.'
    },
    {
      id: 'machinery', title: 'A child on the tractor',
      when: function (s, h) { return !h.flag('fenced') && (h.lastVisitors() > 400 || h.isOpen('hayride')); }, weight: 3,
      text: 'You find a child climbing on the tractor parked by the shed. The keys are in it.',
      choices: [
        { label: 'Fence off the equipment yard and pull the keys ($900)', wise: true,
          fx: { cash: -900, safety: 12, flag: { fenced: true } }, result: 'A gate and a lock now separate the public from the machines.' },
        { label: 'Put up a "Keep off" sign', fx: { cash: -60, safety: 3 }, result: 'Children cannot read the sign from the tractor seat.' },
        { label: 'Kids will be kids', fx: { safety: -10 }, result: 'You lift the child down and carry on.' }
      ],
      lesson: 'Machinery and livestock cause most serious farm injuries. Separate public and working areas with fences and locks, not just signs.'
    },
    {
      id: 'weekends', title: 'We want our weekends back',
      when: function (s, h) { return h.turn >= 8 && h.stamina() < 65 && !h.flag('familyDay'); }, weight: 3,
      text: 'At dinner the family says nobody has had a Saturday off since spring. Someone missed a cousin\'s wedding to run the gate.',
      choices: [
        { label: 'Close one weekend day a month for family time', wise: true,
          fx: { stamina: 6, flag: { familyDay: true } }, result: 'A little less income, a lot more patience. Family Stamina recovers a bit faster from now on.' },
        { label: 'Pay for weekend cover this month ($1,000)',
          fx: { cash: -1000, stamina: 8 }, result: 'A paid helper runs the gate while the family takes a weekend off.' },
        { label: 'Push through to the end of the season',
          fx: { stamina: -10 }, result: 'Nobody argues. Nobody is happy either.' }
      ],
      lesson: 'Agritourism happens on weekends and holidays. Plan days off and backup staff on purpose, or the family pays for it.'
    },
    {
      id: 'hayride_driver', title: 'Who drives the hayride?',
      when: function (s, h) { return h.has('hayride') && !h.flag('trainedDriver'); }, weight: 4,
      text: 'Your 16-year-old nephew wants to drive the hayride tractor this fall. He is good with tractors.',
      choices: [
        { label: 'Use a trained adult driver and inspect the wagon ($400)', wise: true,
          fx: { cash: -400, safety: 8, flag: { trainedDriver: true } }, result: 'Hitch pins, steps and rails checked. Your nephew loads the wagon instead.' },
        { label: 'Let him drive', fx: { safety: -15, flag: { teenDriver: true } }, result: 'He is thrilled.' },
        { label: 'Hire an experienced driver part-time ($1,200)',
          fx: { cash: -1200, safety: 6, stamina: 4, flag: { trainedDriver: true } }, result: 'A retired school-bus driver takes the job.' }
      ],
      lesson: 'Hayride drivers should be trained adults. Inspect hitches, rails and steps, and check your local rules; some places require licensing or inspections.'
    },
    {
      id: 'allergens', title: 'Does this have nuts?',
      when: function (s, h) { return h.isOpen('stand') && h.turn >= 3 && !h.flag('labels'); }, weight: 2,
      text: 'A customer asks if your jam bars contain nuts. The label just says "Jam Bars".',
      choices: [
        { label: 'Print ingredient and allergen labels ($350)', wise: true,
          fx: { cash: -350, flag: { labels: true } }, result: 'Every package now lists ingredients and allergens.' },
        { label: 'Put up an "Ask us about ingredients" sign',
          fx: { followup: { id: 'allergy', in: 2, chance: 0.4 } }, result: 'The sign is small. The line is long.' },
        { label: 'Stop selling baked goods',
          fx: { flag: { noBaking: true, labels: true } }, result: 'Simpler, but the stand earns a bit less per shopper.' }
      ],
      lesson: 'Packaged food usually needs ingredient and allergen labels. Cottage food and labeling rules vary; check with your state agriculture or health department.'
    },
    {
      id: 'allergy', title: 'An allergic reaction', followupOnly: true,
      text: 'A visitor had an allergic reaction to tree nuts in an unlabeled bar. They are fine, but angry.',
      choices: [
        { label: 'Apologize, pay the bill, and label everything', wise: true,
          fx: { cash: -1500, stars: -0.25, flag: { labels: true } }, result: 'Labels go on every package that afternoon.' }
      ],
      lesson: 'A label costs pennies. A reaction can cost a life, and your reputation.'
    },
    {
      id: 'grant', title: 'A tourism grant',
      when: function (s, h) { return h.turn >= 5 && !h.flag('grantTried'); }, weight: 2,
      text: 'The regional tourism office has a matching grant for farm marketing. The application is twelve pages.',
      choices: [
        { label: 'Apply — it will take some evenings', wise: true,
          fx: { stamina: -6, flag: { grantTried: true }, followup: { id: 'grant_result', in: 2 } }, result: 'You write the budget at the kitchen table after chores.' },
        { label: 'Skip it this year', fx: {}, result: 'Maybe next year.' }
      ],
      lesson: 'Tourism offices, state agriculture departments and USDA programs offer grants. They take paperwork, matching money and good records.'
    },
    {
      id: 'grant_result', title: 'Grant decision', followupOnly: true,
      text: 'A letter from the tourism office arrives.',
      choices: [
        { label: 'Open it', wise: true,
          fx: { chance: { p: 0.65, yes: { cash: 4000, awareness: 0.06, text: 'Approved! The grant pays for a regional ad campaign.' },
            no: { text: 'Not this round. The reviewers ask for visitor counts and a marketing plan next time.' } } },
          result: '' }
      ],
      lesson: 'Good records (visitor counts, sales by month) make grant applications much stronger.'
    },
    {
      id: 'cabin_cleaner', repeat: true, title: 'The cleaner quits',
      when: function (s, h) { return h.isOpen('cabin'); }, weight: 3,
      text: 'Your cabin cleaner quits two days before a fully booked weekend.',
      choices: [
        { label: 'The family cleans it', fx: { stamina: -6 }, result: 'Sheets, towels and a bathroom, between chores.' },
        { label: 'Hire a cleaning service for now ($400)', wise: true, fx: { cash: -400 }, result: 'More expensive, but done right.' },
        { label: 'Cancel the bookings', fx: { cash: -600, stars: -0.3 }, result: 'Refunds and an unhappy review.' }
      ],
      lesson: 'Lodging lives on cleaning. Keep a backup cleaner and build turnover costs into your nightly rate.'
    },
    {
      id: 'heat_wave', repeat: true, title: 'Heat wave coming',
      when: function (s, h) { return h.cm >= 5 && h.cm <= 7 && h.anyOutdoorOpen(); }, weight: 2,
      text: 'The forecast says it will be over 100°F all weekend.',
      choices: [
        { label: 'Add shade tents and free water ($400)', wise: true,
          fx: { cash: -400, safety: 5, stars: 0.05 }, result: 'Visitors linger in the shade. Nobody faints.' },
        { label: 'Open early mornings only', fx: { stamina: 3, mod: { draw: 0.88, months: 1, label: 'Short hours' } }, result: 'Cooler, quieter, fewer visitors.' },
        { label: 'Carry on as usual', fx: { safety: -8, stars: -0.1 }, result: 'Two visitors need to sit in the air-conditioned office.' }
      ],
      lesson: 'Heat illness is a real risk for visitors and workers. Shade, water and adjusted hours are cheap protection.'
    },
    {
      id: 'bee_sting', title: 'A bee sting',
      when: function (s, h) { return h.anyOutdoorOpen() && h.cm >= 4 && h.cm <= 9 && !h.flag('firstAid'); }, weight: 2,
      text: 'A child is stung by a bee and their parent asks for help. Your first-aid kit is a box of bandages from 2009.',
      choices: [
        { label: 'Train the family in first aid and stock a real kit ($250)', wise: true,
          fx: { cash: -250, safety: 6, flag: { firstAid: true } }, result: 'Everyone learns first aid and how to write up an incident report.' },
        { label: 'Hand them ice from the cooler', fx: {}, result: 'The child is fine this time.' }
      ],
      lesson: 'Have a first-aid kit, someone trained, and a written incident report form. Write down what happened every time.'
    },
    {
      id: 'lost_child', repeat: true, title: 'Lost in the maze',
      when: function (s, h) { return h.isOpen('maze'); }, weight: 4,
      text: 'A parent runs up to the gate: their six-year-old is somewhere in the corn maze.',
      choices: [
        { label: 'Set up a lost-child plan: flags, a meeting spot, a maze watcher ($300)', wise: true,
          fx: { cash: -300, stamina: -2, safety: 8 }, result: 'The child is found in four minutes, waving a flag.' },
        { label: 'Everyone drop what you are doing and search', fx: { stamina: -4, stars: -0.1 }, result: 'Found after forty frightening minutes.' }
      ],
      lesson: 'Plan for lost children before you open: a meeting point, staff who know the layout, and a way for visitors to signal for help.'
    },
    {
      id: 'pumpkin_rot', repeat: true, title: 'Rotten pumpkins',
      when: function (s, h) { return h.has('pumpkin') && h.isReady('pumpkin') && (h.cm === 7 || h.cm === 8); }, weight: 4,
      text: 'A wet August rotted part of the pumpkin field.',
      choices: [
        { label: 'Buy in pumpkins from a wholesaler ($1,500)', wise: true, fx: { cash: -1500 }, result: 'Bins of pumpkins fill the gaps.' },
        { label: 'Open with a thin field', fx: { stars: -0.1, mod: { draw: 0.85, months: 1, label: 'Thin pumpkin field' } }, result: 'Visitors notice the bare patches.' },
        { label: 'Raise prices to make up for it', fx: { stars: -0.1, mod: { price: 1.08, months: 2, label: 'Pumpkin prices up' } }, result: 'Grumbling at the checkout.' }
      ],
      lesson: 'Weather will hit your crop some years. Keep a backup supplier and a little cash for bad seasons.'
    },
    {
      id: 'tour_operator', title: 'A bus tour company calls',
      when: function (s, h) { return h.stars() >= 3.4 && h.openCount() >= 2 && !h.flag('tourDeal'); }, weight: 2,
      text: 'A bus tour company wants to bring senior groups on weekdays. They ask for 20% commission.',
      choices: [
        { label: 'Accept, but cap groups to quiet days', wise: true,
          fx: { flag: { tourDeal: true }, mod: { draw: 1.1, price: 0.97, months: 4, label: 'Bus tours' } }, result: 'Quiet Tuesdays fill up with cheerful groups.' },
        { label: 'Decline', fx: { flag: { tourDeal: true } }, result: 'You keep weekdays for farm work.' }
      ],
      lesson: 'Group tours fill quiet weekdays. Commissions of 10–25% are common; make sure the price still covers your time.'
    },
    {
      id: 'sales_tax', title: 'What about sales tax?',
      when: function (s, h) { return h.turn >= 4 && !h.flag('taxAsked') && h.lastVisitors() > 0; }, weight: 2,
      text: 'Your accountant asks whether you have been collecting sales tax on admissions and stand sales.',
      choices: [
        { label: 'Register and collect it properly ($300 setup)', wise: true,
          fx: { cash: -300, flag: { taxAsked: true } }, result: 'Your register now adds the right tax.' },
        { label: 'Sort it out at tax time',
          fx: { flag: { taxAsked: true }, followup: { id: 'tax_bill', in: 6 } }, result: 'You make a note to deal with it later.' }
      ],
      lesson: 'Sales tax on admissions, food and products differs from state to state. Ask an accountant who knows your state before you open.'
    },
    {
      id: 'tax_bill', title: 'A back-tax bill', followupOnly: true,
      text: 'The state tax office bills you for uncollected sales tax, with penalties.',
      choices: [{ label: 'Pay it', wise: true, fx: { cash: -2500 }, result: 'Paid, plus interest.' }],
      lesson: 'Uncollected sales tax comes out of your own pocket later, with penalties on top.'
    },
    {
      id: 'extension', title: 'An extension workshop',
      when: function (s, h) { return h.turn >= 2 && !h.flag('extension'); }, weight: 1,
      text: 'The extension office is running a one-day agritourism safety workshop in town.',
      choices: [
        { label: 'Go — it is $75 and a day off the farm', wise: true,
          fx: { cash: -75, stamina: -2, safety: 10, flag: { extension: true } }, result: 'You come home with a checklist and three new contacts.' },
        { label: 'Too busy this month', fx: { flag: { extension: true } }, result: 'Maybe next year.' }
      ],
      lesson: 'Extension offices are a low-cost source of training, checklists and local rules. Use them.'
    },
    {
      id: 'food_truck', title: 'A food truck asks',
      when: function (s, h) { return h.lastVisitors() > 600 && !h.flag('foodTruck'); }, weight: 2,
      text: 'A local food truck asks to park at your farm on busy weekends and pay you 10% of sales.',
      choices: [
        { label: 'Yes, if they show their permit and insurance', wise: true,
          fx: { cash: 400, stars: 0.1, flag: { foodTruck: true } }, result: 'Tacos by the pumpkins. Visitors stay longer.' },
        { label: 'No, we sell our own snacks', fx: { flag: { foodTruck: true } }, result: 'The stand keeps all the snack sales.' }
      ],
      lesson: 'Partners can add to a visit without adding to your workload. Ask for their permits and proof of insurance.'
    },
    {
      id: 'wedding_rain', title: 'Rain on the big day',
      when: function (s, h) { return h.isOpen('weddings') && !h.flag('weddingTent'); }, weight: 2,
      text: 'Heavy rain is forecast for Saturday\'s wedding.',
      choices: [
        { label: 'Rent a tent with sides ($900)', wise: true,
          fx: { cash: -900, stars: 0.1, flag: { weddingTent: true } }, result: 'Dry guests, happy couple, glowing review. You add a weather clause to future contracts.' },
        { label: 'Hope for the best',
          fx: { chance: { p: 0.5, yes: { text: 'The rain holds off.' }, no: { stars: -0.4, text: 'Mud on the dress, and on your reviews.' } } }, result: '' }
      ],
      lesson: 'Event contracts need a weather plan that says who pays for it.'
    },
    {
      id: 'chef', title: 'A chef wants in',
      when: function (s, h) { return h.has('dinners') && !h.flag('chefAsked'); }, weight: 3,
      text: 'A well-known local chef offers to cook your farm dinners for 30% of ticket sales.',
      choices: [
        { label: 'Partner with the chef', wise: true,
          fx: { flag: { chefAsked: true, chef: true } }, result: 'Dinners sell out faster, and you work fewer evenings.' },
        { label: 'Keep cooking yourselves', fx: { flag: { chefAsked: true } }, result: 'You keep the whole ticket, and the whole workload.' }
      ],
      lesson: 'Partners cost a share of revenue but can raise demand and save your hours. Compare profit per hour, not just revenue.'
    },
    {
      id: 'photographers', title: 'Photographers in the field',
      when: function (s, h) { return h.turn >= 4 && !h.flag('photo') && h.anyBuilt(); }, weight: 1,
      text: 'Local photographers want to use your fields for paid family mini-sessions.',
      choices: [
        { label: 'Charge a site fee and require a signed waiver', wise: true,
          fx: { cash: 600, flag: { photo: true } }, result: 'A tidy fee and a few new followers.' },
        { label: 'Let them in free', fx: { stars: 0.03, safety: -3, flag: { photo: true } }, result: 'They are grateful, and they trample a row.' },
        { label: 'No thanks', fx: { flag: { photo: true } }, result: 'The fields stay quiet.' }
      ],
      lesson: 'A photographer using your farm is running a business on it. Charge a fee and ask for a waiver or proof of insurance.'
    },
    {
      id: 'tree_prices', title: 'Wholesale trees cost more',
      when: function (s, h) { return h.has('trees') && (h.cm === 9 || h.cm === 10) && !h.flag('treePrices' + h.year); }, weight: 4,
      text: 'Wholesale prices for pre-cut Christmas trees jumped 30% this year.',
      choices: [
        { label: 'Pay it and hold your prices', fx: function (s, h) { var f = { cash: -1200, flag: {} }; f.flag['treePrices' + h.year] = true; return f; }, result: 'Your margin shrinks; your customers do not notice.' },
        { label: 'Raise your prices a little', wise: true, fx: function (s, h) { var f = { stars: -0.05, mod: { price: 1.05, months: 2, label: 'Tree prices up' }, flag: {} }; f.flag['treePrices' + h.year] = true; return f; }, result: 'Most families understand.' }
      ],
      lesson: 'Christmas trees take six to ten years to grow. Until your own are ready, bought-in trees eat into the margin.'
    },
    {
      id: 'harvest_clash', repeat: true, title: 'Frost warning',
      when: function (s, h) { return (h.cm === 8 || h.cm === 9) && h.farmHours() >= 300 && h.openCount() > 0; }, weight: 3,
      text: 'A hard frost is forecast. The harvest has to come in this week, the same week as your busiest weekend.',
      choices: [
        { label: 'Hire extra hands for the week ($1,500)', wise: true, fx: { cash: -1500 }, result: 'Crop in, gate open, everyone sleeps.' },
        { label: 'The family does both', fx: { stamina: -12 }, result: 'Harvest by headlamp, visitors by day.' },
        { label: 'Close to visitors for a weekend', fx: { mod: { draw: 0.78, months: 1, label: 'Closed for harvest' } }, result: 'The crop comes first.' }
      ],
      lesson: 'Peak visitor season sits right on top of harvest. Book seasonal help early.'
    }
  ];

  return {
    MONTHS: MONTHS, MONTHS_SHORT: MONTHS_SHORT, RULES: RULES, FOCUS: FOCUS, PRICE: PRICE,
    LOCATIONS: LOCATIONS, FARM_TYPES: FARM_TYPES, ATTRACTIONS: ATTRACTIONS,
    GROUNDWORK: GROUNDWORK, RAIN: RAIN, CARDS: CARDS, PLOT_COUNT: 10
  };
});
