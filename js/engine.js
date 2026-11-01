/*
 * Open the Gate — game engine.
 * Pure game logic: no DOM, no canvas. Works in the browser (window.OTG) and
 * in Node (require('./engine.js')) so it can be tested and balance-simulated.
 * All state is plain JSON so it can be saved to localStorage.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.OTG = factory(root.OTG_DATA);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  var R = D.RULES;
  var A = D.ATTRACTIONS;
  var G = D.GROUNDWORK;
  var SAVE_VERSION = 2;

  // ---------- small helpers ----------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function round(v) { return Math.round(v); }

  // mulberry32: tiny seeded RNG; state is a 32-bit integer kept in game state.
  function rand(s) {
    var t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(s, lo, hi) { return lo + Math.floor(rand(s) * (hi - lo + 1)); }

  function calMonth(turn) { return (R.startMonth + turn) % 12; }
  function yearOf(turn) { return Math.floor(turn / 12) + 1; }
  function monthLabel(turn) { return D.MONTHS[calMonth(turn)] + ', Year ' + yearOf(turn); }

  function money(n) {
    var neg = n < 0; n = Math.abs(Math.round(n));
    var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−$' : '$') + s;
  }

  // ---------- new game ----------
  function newGame(opts) {
    opts = opts || {};
    var seed = (opts.seed == null ? Math.floor(Math.random() * 2147483647) : opts.seed) | 0;
    var s = {
      v: SAVE_VERSION,
      seed: seed, rng: seed,
      farmName: (opts.farmName || 'Sunny Acres').slice(0, 28),
      farmType: D.FARM_TYPES[opts.farmType] ? opts.farmType : 'orchard',
      location: D.LOCATIONS[opts.location] ? opts.location : 'town',
      turn: 0, phase: 'plan',
      cash: R.startCash, stars: 3, stamina: 90, safety: 55,
      awareness: 0, emailList: 0,
      plots: [], gw: {}, zoningReadyTurn: null,
      plan: { focus: 'promote', price: 'fair', help: 0 },
      flags: {}, mods: [], followups: [], seenCards: {}, lessons: [],
      history: [], attrStats: {}, capital: 0,
      lastResult: null, pendingCard: null, cardOutcome: null,
      burnouts: 0, burnoutNext: false, bankWarnings: 0, gameOver: null,
      tutorial: opts.tutorial === false ? 0 : 1,
      wetYear: 0, plotsOwned: R.basePlots
    };
    for (var i = 0; i < D.PLOT_COUNT; i++) s.plots.push(null);
    // some years are wetter than others
    s.wetYear = (rand(s) - 0.5) * 0.16 + D.LOCATIONS[s.location].wet;
    return s;
  }

  // ---------- queries ----------
  function owned(s, id) { return !!s.gw[id]; }
  function zoningPending(s) { return !s.gw.zoning && s.zoningReadyTurn != null; }

  function builtList(s) {
    var out = [];
    s.plots.forEach(function (p, i) { if (p) out.push({ plot: i, id: p.id, p: p, a: A[p.id] }); });
    return out;
  }
  function has(s, id) { return s.plots.some(function (p) { return p && p.id === id; }); }
  function isReady(s, p, turn) { return (turn == null ? s.turn : turn) >= p.builtTurn + A[p.id].establish; }
  function readyIn(s, p) { return Math.max(0, p.builtTurn + A[p.id].establish - s.turn); }
  function requirementsMet(s, id) {
    return A[id].requires.every(function (r) { return owned(s, r); });
  }
  function isOpenNow(s, p, turn) {
    turn = turn == null ? s.turn : turn;
    var a = A[p.id];
    return isReady(s, p, turn) && a.season[calMonth(turn)] > 0 && requirementsMet(s, p.id);
  }
  function openIds(s) {
    if (s.burnoutNext) return [];
    return s.plots.filter(function (p) { return p && isOpenNow(s, p); }).map(function (p) { return p.id; });
  }
  function parkingCap(s) {
    if (owned(s, 'parking2')) return G.parking2.parking;
    if (owned(s, 'parking1')) return G.parking1.parking;
    return R.baseParking;
  }
  function creditLeft(s) { return s.cash + R.creditLine; }
  function plotOwned(s, i) { return i < s.plotsOwned; }
  function freePlot(s) {
    for (var i = 0; i < s.plotsOwned; i++) if (!s.plots[i]) return i;
    return -1;
  }
  function plotCost(s) { return R.plotBaseCost + R.plotStepCost * (s.plotsOwned - R.basePlots); }
  function canBuyPlot(s) {
    if (s.phase !== 'plan') return { ok: false, reason: 'You can buy land while planning a month.' };
    if (s.plotsOwned >= R.maxPlots) return { ok: false, reason: 'You own every field there is.' };
    if (plotCost(s) > creditLeft(s)) return { ok: false, reason: 'The bank will not lend that much right now.' };
    return { ok: true, cost: plotCost(s) };
  }
  function buyPlot(s) {
    var c = canBuyPlot(s);
    if (!c.ok) return c;
    s.cash -= c.cost;
    s.capital += c.cost;
    s.plotsOwned++;
    return { ok: true, plot: s.plotsOwned - 1, cost: c.cost };
  }

  function seasonText(id) {
    var sea = A[id].season, out = [], start = -1;
    for (var m = 0; m <= 12; m++) {
      var on = m < 12 && sea[m] > 0;
      if (on && start < 0) start = m;
      if (!on && start >= 0) { out.push([start, m - 1]); start = -1; }
    }
    if (out.length === 1 && out[0][0] === 0 && out[0][1] === 11) return 'All year';
    // join Dec–Jan wraparound
    if (out.length > 1 && out[0][0] === 0 && out[out.length - 1][1] === 11) {
      var first = out.shift(); out[out.length - 1][1] = first[1];
    }
    return out.map(function (r) {
      return r[0] === r[1] ? D.MONTHS_SHORT[r[0]] : D.MONTHS_SHORT[r[0]] + '–' + D.MONTHS_SHORT[r[1]];
    }).join(', ');
  }

  // ---------- building ----------
  function canBuild(s, id, plot) {
    var a = A[id];
    if (!a) return { ok: false, reason: 'Unknown attraction.' };
    if (s.phase !== 'plan') return { ok: false, reason: 'You can build while planning a month.' };
    if (plot != null && !plotOwned(s, plot)) return { ok: false, reason: 'You need to buy that field first.' };
    if (plot != null && s.plots[plot]) return { ok: false, reason: 'That plot is already in use.' };
    if (has(s, id)) return { ok: false, reason: 'You already have one.' };
    if (plot == null && freePlot(s) < 0) return { ok: false, reason: 'No empty plots left. Buy more land.' };
    var missing = a.requires.filter(function (r) { return !owned(s, r); });
    if (missing.length) {
      return { ok: false, reason: 'Needs ' + missing.map(function (r) {
        return G[r].name + (r === 'zoning' && zoningPending(s) ? ' (approval pending)' : '');
      }).join(', ') + '.', missing: missing };
    }
    if (a.cost > creditLeft(s)) return { ok: false, reason: 'The bank will not lend that much right now.' };
    return { ok: true };
  }

  function build(s, id, plot) {
    if (plot == null) plot = freePlot(s);
    var c = canBuild(s, id, plot);
    if (!c.ok) return c;
    s.cash -= A[id].cost;
    s.capital += A[id].cost;
    s.plots[plot] = { id: id, builtTurn: s.turn, monthsOpen: 0 };
    if (!s.attrStats[id]) s.attrStats[id] = { revenue: 0, costs: 0, hours: 0, visitors: 0, build: 0 };
    s.attrStats[id].build += A[id].cost;
    if (s.tutorial === 1) s.tutorial = 2;
    return { ok: true };
  }

  function demolish(s, plot) {
    if (s.phase !== 'plan' || !s.plots[plot]) return { ok: false };
    s.plots[plot] = null;
    return { ok: true };
  }

  function canBuildGw(s, id) {
    var g = G[id];
    if (!g) return { ok: false, reason: 'Unknown.' };
    if (s.phase !== 'plan') return { ok: false, reason: 'You can do groundwork while planning a month.' };
    if (owned(s, id)) return { ok: false, reason: 'Done.' };
    if (id === 'zoning' && zoningPending(s)) return { ok: false, reason: 'Application in progress.' };
    var missing = (g.requires || []).filter(function (r) { return !owned(s, r); });
    if (missing.length) return { ok: false, reason: 'Needs ' + missing.map(function (r) { return G[r].name; }).join(', ') + '.' };
    if (g.cost > creditLeft(s)) return { ok: false, reason: 'The bank will not lend that much right now.' };
    return { ok: true };
  }

  function buildGw(s, id) {
    var c = canBuildGw(s, id);
    if (!c.ok) return c;
    s.cash -= G[id].cost;
    s.capital += G[id].cost;
    if (id === 'zoning') s.zoningReadyTurn = s.turn + G.zoning.delay;
    else s.gw[id] = true;
    return { ok: true };
  }

  function setPlan(s, plan) {
    if (plan.focus && D.FOCUS[plan.focus]) s.plan.focus = plan.focus;
    if (plan.price && D.PRICE[plan.price]) s.plan.price = plan.price;
    if (plan.help != null) s.plan.help = owned(s, 'payroll') ? clamp(plan.help | 0, 0, R.maxHelpers) : 0;
    if (s.tutorial === 2 && plan.focus) s.tutorial = 3;
  }

  // ---------- the month model ----------
  function modProduct(s, key, turn) {
    var m = 1;
    s.mods.forEach(function (x) { if (x.until >= turn && x.from <= turn && x[key]) m *= x[key]; });
    return m;
  }

  /*
   * Compute one month without changing state.
   * env: { rain: rained-out weekends (may be fractional for a forecast), noise: star noise }
   */
  function computeMonth(s, env) {
    var turn = s.turn, cm = calMonth(turn);
    var ft = D.FARM_TYPES[s.farmType], loc = D.LOCATIONS[s.location];
    var price = D.PRICE[s.plan.price], focus = s.plan.focus;
    var closed = !!s.burnoutNext;
    var rain = env.rain || 0;
    var r = {
      turn: turn, cm: cm, closed: closed, rain: rain, focus: focus, price: s.plan.price, help: s.plan.help, attractions: [],
      visitors: 0, demand: 0, turnedAway: 0, revenue: 0, addOn: 0, cogs: 0,
      upkeep: 0, gwUpkeep: 0, helpCost: 0, focusCost: 0, living: R.livingCost, interest: 0,
      crop: 0, cropLost: 0, attrHours: 0, farmHours: ft.hours[cm], helpHours: 0
    };

    var help = owned(s, 'payroll') ? s.plan.help : 0;
    var open = closed ? [] : s.plots.filter(function (p) { return p && isOpenNow(s, p, turn); });
    var openCount = open.length;

    // demand multipliers shared by all attractions
    var starMult = 0.55 + 0.15 * s.stars;
    // marketing effects add together rather than stacking
    var market = 1 + s.awareness + (owned(s, 'website') ? 0.08 : 0) + emailBoost(s) +
      (owned(s, 'signage') ? 0.03 : 0) + (owned(s, 'accessible') ? 0.02 : 0) +
      ((!closed && focus === 'promote') ? 0.2 : 0);
    var modDraw = modProduct(s, 'draw', turn);
    var modPrice = modProduct(s, 'price', turn);
    var family = s.flags.familyDay ? 0.96 : 1;
    var play = open.some(function (p) { return p.id === 'playground'; }) ? 0.05 : 0;
    var stay = 1 + Math.min(0.15 + play, 0.04 * Math.max(0, openCount - 1) + play);
    var cardPay = owned(s, 'cardpay') ? 1.025 : 1;
    var summer = cm >= 5 && cm <= 7;
    var kitchen = owned(s, 'kitchen') ? 1.3 : 1;
    var standMult = (s.flags.noBaking ? 0.9 : 1) * kitchen;

    open.forEach(function (p) {
      var a = A[p.id];
      var d = a.draw * a.season[cm] * starMult * market * modDraw * price.draw * family;
      d *= (ft.bonus[p.id] || 1);
      d *= a.event ? loc.draw * loc.eventBonus : loc.draw;
      if (a.event && owned(s, 'booking')) d *= 1.15;
      if (p.id === 'dinners' && s.flags.chef) d *= 1.4;
      if (p.id === 'stand') d *= standMult > 1 ? 1.1 : 1;
      // a new attraction takes a while to become known
      d *= Math.min(1, 0.7 + 0.03 * p.monthsOpen);
      if (a.max) d = Math.min(d, a.max * a.season[cm]);
      // rain
      var lossFrac = Math.min(1, rain / 4) * 0.75 * a.outdoor * (owned(s, 'booking') ? 0.5 : 1);
      var rainLoss = d * lossFrac;
      d -= rainLoss;
      r.attractions.push({ id: p.id, plot: s.plots.indexOf(p), demand: d, rainLoss: rainLoss, visitors: 0, revenue: 0, cogs: 0, hours: 0, upkeep: 0 });
      r.demand += d;
    });

    // parking caps the month
    var cap = parkingCap(s);
    var scale = r.demand > cap ? cap / r.demand : 1;
    r.parkingCap = cap;
    r.turnedAway = Math.max(0, r.demand - cap);

    r.attractions.forEach(function (x) {
      var a = A[x.id];
      x.visitors = x.demand * scale;
      var unitPrice = a.price * price.price * modPrice * stay * cardPay;
      if (x.id === 'stand') unitPrice *= standMult;
      if (x.id === 'dinners' && s.flags.chef) unitPrice *= 0.7;
      x.revenue = x.visitors * unitPrice;
      x.cogs = x.revenue * a.cogs * (owned(s, 'cooler') && a.cogs >= 0.2 ? 0.9 : 1);
      x.hours = a.hours + a.hoursPer * x.visitors;
      if (x.id === 'dinners' && s.flags.chef) x.hours *= 0.5;
      r.visitors += x.visitors;
      r.revenue += x.revenue;
      r.cogs += x.cogs;
      r.attrHours += x.hours;
    });

    // the stand sells to everyone who came for something else
    var stand = r.attractions.filter(function (x) { return x.id === 'stand'; })[0];
    if (stand) {
      var others = r.visitors - stand.visitors;
      r.addOn = others * R.standAddOn * price.price * standMult * cardPay;
      var addCogs = r.addOn * A.stand.cogs;
      stand.revenue += r.addOn; stand.cogs += addCogs;
      r.revenue += r.addOn; r.cogs += addCogs;
      stand.hours += others * 0.01; r.attrHours += others * 0.01;
    }

    // a snack bar sells a little to every visitor
    r.snack = 0; r.snackCogs = 0; r.snackHours = 0;
    if (owned(s, 'snackbar') && r.visitors > 0) {
      r.snack = r.visitors * R.snackSpend * price.price * cardPay;
      r.snackCogs = r.snack * 0.5;
      r.snackHours = 25 + r.visitors * 0.01;
      r.revenue += r.snack; r.cogs += r.snackCogs; r.attrHours += r.snackHours;
    }

    // upkeep on everything built (open or not)
    s.plots.forEach(function (p) {
      if (!p) return;
      var u = A[p.id].upkeep;
      r.upkeep += u;
      var x = r.attractions.filter(function (y) { return y.id === p.id; })[0];
      if (x) x.upkeep = u;
      else r.attractions.push({ id: p.id, plot: s.plots.indexOf(p), closedNow: true, demand: 0, rainLoss: 0, visitors: 0, revenue: 0, cogs: 0, hours: 0, upkeep: u });
    });
    Object.keys(s.gw).forEach(function (k) { if (s.gw[k]) r.gwUpkeep += G[k].upkeep; });
    r.landUpkeep = (s.plotsOwned - R.basePlots) * R.plotUpkeep;
    r.gwUpkeep += r.landUpkeep;

    // labor
    // hired hands can take on most of the work, but the family still has to run the place
    r.helpHours = Math.min(help * R.helperHours, R.maxDelegate * (r.farmHours + r.attrHours));
    r.helpWasted = help * R.helperHours - r.helpHours;
    r.helpCost = help * R.helperCost;
    var totalNeed = r.farmHours + r.attrHours;
    var familyNeed = Math.max(0, totalNeed - r.helpHours);
    var capacity = R.familyHours * R.overtimeCap;
    var shortage = Math.max(0, familyNeed - capacity);
    r.familyNeed = familyNeed;
    r.load = familyNeed / R.familyHours;
    r.shortage = shortage;
    var shortFrac = totalNeed > 0 ? shortage / totalNeed : 0;
    r.shortFrac = shortFrac;

    // crops
    var crop = ft.crop[cm];
    if (closed) crop *= R.burnoutCrop;
    r.cropLost = crop * Math.min(1, shortFrac * 1.2);
    r.crop = crop - r.cropLost;

    // focus cost
    r.focusCost = closed ? 0 : D.FOCUS[focus].cost;
    if (s.cash < 0) r.interest = -s.cash * R.interestRate;

    // meters (deltas, before incidents and cards)
    var stam = (0.95 - r.load) * 50;
    stam = clamp(stam, -35, 10);
    if (focus === 'rest' || closed) stam += 15;
    if (s.flags.familyDay) stam += 3;
    r.staminaDelta = stam;

    // stars move toward this month's visitor experience
    if (r.visitors > 30) {
      var q = 2.7;
      q += owned(s, 'restrooms') ? 0.35 : (r.visitors > 300 ? -0.3 : 0);
      if (owned(s, 'shade')) q += summer ? 0.12 : 0.03;
      if (owned(s, 'accessible')) q += 0.05;
      q += 0.15 * Math.min(4, openCount - 1);
      if (focus === 'tidy') q += 0.4;
      q += price.quality;
      if (s.plan.price === 'premium' && openCount >= 4) q += 0.15;
      q -= Math.min(0.8, 1.5 * (r.turnedAway / Math.max(1, r.demand)));
      q -= Math.min(1, shortFrac * 3);
      if (s.stamina < 30) q -= 0.4;
      q += (s.safety - 60) / 100;
      var animals = open.some(function (p) { return A[p.id].animals; });
      if (animals && !owned(s, 'handwash')) q -= 0.2;
      q += env.noise || 0;
      r.quality = q;
      r.starsDelta = (clamp(q, 1, 5) - s.stars) * 0.3;
    } else {
      r.quality = null;
      r.starsDelta = closed ? -0.3 : 0;
    }

    // safety drifts toward a target
    var target = 50;
    if (owned(s, 'waivers')) target += 15;
    var hasAnimals = open.some(function (p) { return A[p.id].animals; }) || r.attractions.some(function (x) { return x.id === 'school' && !x.closedNow; });
    if (hasAnimals) target += owned(s, 'handwash') ? 8 : -12;
    else if (owned(s, 'handwash')) target += 4;
    if (s.flags.fenced || owned(s, 'fencing')) target += 8;
    if (s.flags.fenced && owned(s, 'fencing')) target += 3;
    if (s.flags.firstAid || owned(s, 'firstaid')) target += 4;
    if (owned(s, 'shade') && summer) target += 4;
    if (owned(s, 'accessible')) target += 3;
    if (s.stamina < 30) target -= 10;
    target -= 15 * (r.turnedAway / Math.max(1, r.demand));
    r.attractions.forEach(function (x) { target -= A[x.id].risk * Math.min(1, x.visitors / 500); });
    if (s.flags.teenDriver && r.attractions.some(function (x) { return x.id === 'hayride' && x.visitors > 0; })) target -= 10;
    r.safetyTarget = target;
    var sd = (target - s.safety) * 0.35;
    if (focus === 'tidy' && !closed) sd += 10;
    r.safetyDelta = sd;

    // incident probability
    var base = 0;
    r.attractions.forEach(function (x) { base += A[x.id].risk * x.visitors / 1000 * 0.012; });
    if (s.flags.teenDriver) base *= 1.3;
    r.incidentChance = Math.min(0.5, base * clamp(1.6 - s.safety / 100, 0.6, 1.6));

    // money
    var visitorCosts = r.cogs + r.upkeep + r.gwUpkeep + r.helpCost + r.focusCost;
    r.visitorProfit = r.revenue - visitorCosts;
    r.net = r.crop + r.revenue - visitorCosts - r.living - r.interest;

    // allocate hired help to attractions by hours, for the end report
    r.attractions.forEach(function (x) {
      x.helpShare = r.attrHours > 0 ? r.helpCost * x.hours / r.attrHours : 0;
    });
    return r;
  }

  function emailBoost(s) { return Math.min(0.12, s.emailList / 6000); }

  function expectedRain(s) {
    return 4 * clamp(D.RAIN[calMonth(s.turn)] + s.wetYear, 0.05, 0.8);
  }

  function forecast(s) {
    var r = computeMonth(s, { rain: expectedRain(s), noise: 0 });
    r.expectedRain = expectedRain(s);
    return r;
  }

  // ---------- running a month ----------
  function openGate(s) {
    if (s.phase !== 'plan' || s.gameOver) return null;
    var cm = calMonth(s.turn);
    var p = clamp(D.RAIN[cm] + s.wetYear, 0.05, 0.8);
    var rain = 0;
    for (var w = 0; w < 4; w++) if (rand(s) < p) rain++;
    var noise = (rand(s) - 0.5) * 0.3;
    var r = computeMonth(s, { rain: rain, noise: noise });
    var events = [];

    // incident
    var incident = null;
    if (r.visitors > 0 && rand(s) < r.incidentChance) {
      var sev = rand(s);
      var raw = sev < 0.6 ? randInt(s, 3000, 9000) : sev < 0.92 ? randInt(s, 10000, 25000) : randInt(s, 30000, 60000);
      if (owned(s, 'waivers')) raw *= 0.7;
      if (owned(s, 'firstaid')) raw *= 0.85;
      var covered = owned(s, 'insurance');
      var cost = covered ? 1000 : raw;
      // pick the riskiest busy attraction as the scene
      var pick = r.attractions.filter(function (x) { return x.visitors > 0; })
        .sort(function (a, b) { return A[b.id].risk * b.visitors - A[a.id].risk * a.visitors; })[0];
      incident = { cost: round(cost), raw: round(raw), covered: covered, where: pick ? pick.id : null, severe: sev >= 0.6 };
      r.incident = incident;
      r.visitorProfit -= incident.cost;
      r.net -= incident.cost;
      r.starsDelta -= 0.25;
      r.safetyDelta -= 4;
      if (s.flags.hiddenVisitors && !covered) {
        s.followups.push({ id: 'claim_denied', turn: s.turn + 1 });
      }
      learn(s, 'incident', 'Visitor injury', covered
        ? 'Insurance turned a big bill into a deductible. Keep coverage current and tell your insurer about every new activity.'
        : 'Without agritourism insurance, one injury can wipe out a season of profit. Waivers help, but they are not insurance.');
    }

    // apply money and meters
    s.cash += r.net;
    s.stars = clamp(s.stars + r.starsDelta, 1, 5);
    s.safety = clamp(s.safety + r.safetyDelta, 0, 100);
    s.stamina = clamp(s.stamina + r.staminaDelta, 0, 100);
    r.staminaAfter = s.stamina;

    // awareness and the email list
    s.awareness = s.awareness * 0.97 + (r.closed ? 0 : (s.plan.focus === 'promote' ? 0.05 : 0));
    s.awareness = Math.min(0.3, s.awareness);
    if (owned(s, 'email')) {
      var signups = r.visitors * (owned(s, 'website') ? 0.07 : 0.03);
      s.emailList = Math.round(s.emailList * 0.99 + signups);
    }

    // attraction bookkeeping
    r.attractions.forEach(function (x) {
      var st = s.attrStats[x.id] || (s.attrStats[x.id] = { revenue: 0, costs: 0, hours: 0, visitors: 0, build: 0 });
      st.revenue += x.revenue;
      st.costs += x.cogs + x.upkeep + x.helpShare;
      st.hours += x.hours;
      st.visitors += x.visitors;
      if (x.visitors > 0) {
        var plot = s.plots[x.plot];
        if (plot) plot.monthsOpen++;
      }
    });

    if (r.snack > 0) {
      var sb = s.attrStats.snackbar || (s.attrStats.snackbar = { revenue: 0, costs: 0, hours: 0, visitors: 0, build: G.snackbar.cost });
      sb.revenue += r.snack;
      sb.costs += r.snackCogs + G.snackbar.upkeep;
      sb.hours += r.snackHours;
      sb.visitors += r.visitors;
    }

    // zoning approval
    if (s.zoningReadyTurn != null && !s.gw.zoning && s.turn + 1 >= s.zoningReadyTurn) {
      s.gw.zoning = true;
      events.push('Your zoning permit was approved.');
    }

    if (r.turnedAway > 20) events.push(Math.round(r.turnedAway) + ' visitors drove away because there was nowhere to park.');
    if (r.shortFrac > 0.02) events.push('There were not enough hands. Some harvest was left in the field and visitors waited in long lines.');
    if (r.closed) events.push('The family was burned out, so the gate stayed closed this month.');

    // burnout check
    var wasClosed = s.burnoutNext;
    var burnedOut = false;
    s.burnoutNext = false;
    if (wasClosed) {
      s.stamina = Math.max(s.stamina, 50);
    } else if (s.stamina <= 0) {
      s.burnouts++;
      s.burnoutNext = true;
      burnedOut = true;
      events.push('Family Stamina hit zero. Next month the farm closes so everyone can recover.');
      learn(s, 'burnout', 'Burnout', 'When the family runs out of energy, everything stops. Watch the hours, hire help before the peak, and rest before you have to.');
    }

    // bank
    if (s.cash < -R.creditLine) {
      s.bankWarnings++;
      if (s.bankWarnings >= 2) {
        s.gameOver = 'bank';
        events.push('The bank called in the loan. The farm cannot keep going.');
      } else {
        events.push('Warning from the bank: you are past your credit line. Get back under ' + money(-R.creditLine) + ' by next month.');
      }
    } else {
      s.bankWarnings = 0;
    }

    r.events = events;
    r.cashAfter = s.cash;
    r.starsAfter = s.stars;
    r.safetyAfter = s.safety;

    s.history.push({
      turn: s.turn, year: yearOf(s.turn), cm: cm, visitors: round(r.visitors), revenue: round(r.revenue),
      visitorProfit: round(r.visitorProfit), crop: round(r.crop), cash: round(s.cash), stars: s.stars,
      stamina: round(s.stamina), safety: round(s.safety), rain: rain, closed: r.closed,
      turnedAway: round(r.turnedAway), incident: !!incident, burnout: burnedOut,
      outdoorOpen: r.attractions.some(function (x) { return x.visitors > 0 && A[x.id].outdoor >= 0.5; })
    });

    // the county fair judges every farm year
    if ((s.turn + 1) % 12 === 0) {
      var yr = yearOf(s.turn);
      r.yearEnd = { year: yr, visitorProfit: yearProfit(s, yr), tier: yearTier(s, yr), ribbon: RIBBONS[yearTier(s, yr)] };
      // next year brings different weather
      s.wetYear = (rand(s) - 0.5) * 0.16 + D.LOCATIONS[s.location].wet;
    }

    s.lastResult = r;
    if (s.tutorial === 3 || s.tutorial === 2) s.tutorial = 0;

    // choose a dilemma for after the ledger
    s.pendingCard = s.gameOver ? null : pickCard(s);
    s.cardOutcome = null;
    s.phase = 'results';
    s.turn++;
    // drop expired modifiers
    s.mods = s.mods.filter(function (m) { return m.until >= s.turn; });
    return r;
  }

  function yearProfit(s, year) {
    var t = 0;
    s.history.forEach(function (h) { if (h.year === year) t += h.visitorProfit; });
    return t;
  }

  // ---------- dilemma cards ----------
  function helpers(s) {
    var last = s.history[s.history.length - 1] || null;
    var h = {
      turn: s.turn, cm: calMonth(s.turn), year: yearOf(s.turn) - 1,
      has: function (id) { return has(s, id); },
      isReady: function (id) { return s.plots.some(function (p) { return p && p.id === id && isReady(s, p); }); },
      // "open" for cards means it was open in the month just played
      isOpen: function (id) {
        return s.lastResult && s.lastResult.attractions.some(function (x) { return x.id === id && x.visitors > 0; });
      },
      gw: function (id) { return owned(s, id); },
      flag: function (k) { return !!s.flags[k]; },
      zoningPending: function () { return zoningPending(s); },
      anyBuilt: function () { return s.plots.some(Boolean); },
      openCount: function () { return s.lastResult ? s.lastResult.attractions.filter(function (x) { return x.visitors > 0; }).length : 0; },
      anyOutdoorOpen: function () { return !!(last && last.outdoorOpen); },
      anyOutdoorOpenLast: function () { return !!(last && last.outdoorOpen); },
      last: function () { return last; },
      lastVisitors: function () { return last ? last.visitors : 0; },
      stars: function () { return s.stars; },
      stamina: function () { return s.stamina; },
      farmHours: function () { return D.FARM_TYPES[s.farmType].hours[calMonth(s.turn)]; },
      canSpend: function (n) { return creditLeft(s) >= n; },
      freePlots: function () { var n = 0; for (var i = 0; i < s.plotsOwned; i++) if (!s.plots[i]) n++; return n; },
      morePlots: function () { return s.plotsOwned < R.maxPlots; },
      plotCost: function () { return plotCost(s); }
    };
    // card helpers look at the month just played; s.turn has not advanced yet when picking
    return h;
  }

  function cardById(id) { return D.CARDS.filter(function (c) { return c.id === id; })[0]; }

  function pickCard(s) {
    // follow-ups due now take priority (turn is the month just played)
    for (var i = 0; i < s.followups.length; i++) {
      if (s.followups[i].turn <= s.turn) {
        var f = s.followups.splice(i, 1)[0];
        return f.id;
      }
    }
    if (s.turn === 0) return null;
    if (rand(s) > 0.85) return null;
    var h = helpers(s);
    var pool = D.CARDS.filter(function (c) {
      if (c.followupOnly) return false;
      var seen = s.seenCards[c.id];
      if (seen != null && s.turn - seen < (c.repeat ? 10 : 30)) return false;
      try { return c.when(s, h); } catch (e) { return false; }
    });
    if (!pool.length) return null;
    var total = pool.reduce(function (t, c) { return t + (c.weight || 1); }, 0);
    var roll = rand(s) * total;
    for (var j = 0; j < pool.length; j++) {
      roll -= pool[j].weight || 1;
      if (roll <= 0) return pool[j].id;
    }
    return pool[pool.length - 1].id;
  }

  function cardView(s) {
    if (!s.pendingCard) return null;
    var c = cardById(s.pendingCard);
    if (!c) return null;
    var h = helpers(s);
    return {
      id: c.id, title: c.title, lesson: c.lesson,
      text: typeof c.text === 'function' ? c.text(s, h) : c.text,
      choices: c.choices.map(function (ch, i) {
        return { index: i, label: ch.label, available: ch.need ? !!ch.need(s, h) : true };
      })
    };
  }

  function applyFx(s, fx, out) {
    if (!fx) return;
    if (fx.cash) { s.cash += fx.cash; out.push(signed(fx.cash, 'Cash', true)); out.cash = (out.cash || 0) + fx.cash; }
    if (fx.stars) { s.stars = clamp(s.stars + fx.stars, 1, 5); out.push(signed(fx.stars, 'Stars')); }
    if (fx.stamina) { s.stamina = clamp(s.stamina + fx.stamina, 0, 100); out.push(signed(fx.stamina, 'Family Stamina')); }
    if (fx.safety) { s.safety = clamp(s.safety + fx.safety, 0, 100); out.push(signed(fx.safety, 'Safety')); }
    if (fx.awareness) { s.awareness = Math.min(0.3, s.awareness + fx.awareness); out.push('More people know about your farm'); }
    if (fx.gw && !s.gw[fx.gw]) {
      s.gw[fx.gw] = true;
      if (fx.gw === 'zoning') s.zoningReadyTurn = s.turn;
      out.push('Added: ' + G[fx.gw].name);
    }
    if (fx.zoning && !s.gw.zoning) {
      var delay = fx.zoning === 'fast' ? 1 : G.zoning.delay;
      s.zoningReadyTurn = s.zoningReadyTurn != null ? Math.min(s.zoningReadyTurn, s.turn + delay) : s.turn + delay;
      out.push('Zoning permit applied for (about ' + delay + (delay === 1 ? ' month)' : ' months)'));
    }
    if (fx.plot && s.plotsOwned < R.maxPlots) { s.plotsOwned++; out.push('Added: one more field'); }
    if (fx.flag) Object.keys(fx.flag).forEach(function (k) { s.flags[k] = fx.flag[k]; });
    if (fx.followup) {
      if (fx.followup.chance == null || rand(s) < fx.followup.chance) {
        s.followups.push({ id: fx.followup.id, turn: s.turn + fx.followup.in });
      }
    }
    if (fx.mod) {
      var m = { from: s.turn, until: s.turn + (fx.mod.months || 1) - 1, label: fx.mod.label || 'Effect' };
      if (fx.mod.draw) m.draw = fx.mod.draw;
      if (fx.mod.price) m.price = fx.mod.price;
      s.mods.push(m);
      out.push(m.label + ' for ' + (fx.mod.months || 1) + (fx.mod.months > 1 ? ' months' : ' month'));
    }
    if (fx.chance) {
      var branch = rand(s) < fx.chance.p ? fx.chance.yes : fx.chance.no;
      if (branch.text) out.text = branch.text;
      applyFx(s, branch, out);
    }
  }

  function signed(v, label, isMoney) {
    if (isMoney) return label + ' ' + (v > 0 ? '+' : '') + money(v);
    var n = Math.abs(v) < 1 ? (Math.round(v * 100) / 100) : Math.round(v);
    return label + ' ' + (v > 0 ? '+' : '−') + Math.abs(n);
  }

  function chooseCard(s, index) {
    if (s.phase !== 'results' || !s.pendingCard || s.cardOutcome) return null;
    var c = cardById(s.pendingCard);
    var ch = c.choices[index];
    var h = helpers(s);
    if (!ch || (ch.need && !ch.need(s, h))) return null;
    // card effects happen "now", which is the start of the next month (s.turn already advanced)
    var fx = typeof ch.fx === 'function' ? ch.fx(s, h) : ch.fx;
    var out = [];
    applyFx(s, fx, out);
    // money decided on a card counts toward the month just played
    if (out.cash) {
      var last = s.history[s.history.length - 1];
      if (last) { last.visitorProfit += out.cash; last.cash = Math.round(s.cash); }
    }
    s.seenCards[c.id] = s.turn - 1;
    learn(s, c.id, c.title, c.lesson);
    s.cardOutcome = {
      id: c.id, choice: index, label: ch.label,
      result: [ch.result, out.text].filter(Boolean).join(' '),
      effects: out.slice(), lesson: c.lesson
    };
    if (s.stamina <= 0 && !s.burnoutNext) {
      s.burnoutNext = true; s.burnouts++;
      var lastH = s.history[s.history.length - 1];
      if (lastH) lastH.burnout = true;
    }
    return s.cardOutcome;
  }

  function learn(s, id, title, lesson) {
    if (s.lessons.some(function (l) { return l.id === id; })) return;
    s.lessons.push({ id: id, title: title, lesson: lesson, turn: s.turn });
  }

  // after reading the results (and answering any card), move on
  function nextMonth(s) {
    if (s.phase !== 'results') return false;
    if (s.pendingCard && !s.cardOutcome) return false;
    s.pendingCard = null;
    s.cardOutcome = null;
    if (s.gameOver) { s.phase = 'ended'; return true; }
    s.phase = 'plan';
    if (!owned(s, 'payroll')) s.plan.help = 0;
    return true;
  }

  // ---------- mentor ----------
  function mentorTip(s) {
    var cm = calMonth(s.turn);
    if (s.tutorial === 1) return { key: 'tut1', text: 'Welcome! I\'m Dot. Start small: tap the plot by the gate and build a Farm Stand. It sells to everyone who visits.' };
    if (s.tutorial === 2) return { key: 'tut2', text: 'Good. Now pick one focus for the month. Promote gets the word out; it\'s a fine first choice.' };
    if (s.tutorial === 3) return { key: 'tut3', text: 'Check the forecast below, then press "Open the gate" to run the month.' };
    var f = forecast(s);
    var cash = s.cash;
    if (s.burnoutNext) return { key: 'burn', text: 'The family is burned out. The gate stays closed this month while everyone recovers. Plan lighter months ahead.' };
    if (cash < -R.creditLine * 0.75) return { key: 'bank', text: 'The bank is nervous. Build nothing new this month, drop hired help where you can, and let the cash recover.' };
    if (s.stamina < 30 || (s.stamina + f.staminaDelta < 15)) return { key: 'stam', text: 'Family Stamina is running low. Choose "Rest the Family" or hire help, or the farm will shut for a burnout month.' };
    if (f.load > 1.25 && owned(s, 'payroll') && s.plan.help < R.maxHelpers) return { key: 'hours', text: 'This month needs far more hours than the family has. Add a hired hand — it costs less than a burnout.' };
    if (f.load > 1.25 && !owned(s, 'payroll')) return { key: 'payroll', text: 'Busy season is coming and the family is stretched. Set up seasonal help in Groundwork so you can hire hands.' };
    if (has(s, 'hayride') && !owned(s, 'insurance')) return { key: 'ins', text: 'You have visitors on wagons without insurance. That is the first thing to fix.' };
    if (s.plots.some(Boolean) && !owned(s, 'insurance') && s.turn >= 1) return { key: 'ins2', text: 'Visitors are coming and you have no agritourism insurance. One injury could cost more than a whole season.' };
    if (s.plots.some(function (p) { return p && A[p.id].animals; }) && !owned(s, 'handwash')) return { key: 'wash', text: 'Animals and visitors need handwash stations: soap and running water at the exit of the pen.' };
    if (s.safety < 45) return { key: 'safe', text: 'Safety is slipping. A "Fix and Tidy" month and waivers with warning signs will bring it back up.' };
    if (s.history.length && s.history[s.history.length - 1].turnedAway > 50) return { key: 'park', text: 'Cars were turned away last month. More parking means more visitors — and happier neighbors.' };
    if (f.turnedAway > 50) return { key: 'park2', text: 'This month you\'ll have more visitors than parking spaces. Consider a bigger lot.' };
    if (!s.plots.some(Boolean)) return { key: 'first', text: 'Build something by the gate! A Farm Stand is cheap and earns from every visitor.' };
    if ((cm >= 2 && cm <= 5) && !has(s, 'pumpkin') && !has(s, 'maze') && freePlot(s) >= 0) return { key: 'fall', text: 'Fall is when most visitors come. Plant a Pumpkin Patch or Corn Maze by early summer so it is ready in September.' };
    if (!owned(s, 'waivers') && s.turn >= 2) return { key: 'waive', text: 'Waivers and warning signs are cheap and lift your Safety. Ask what your state requires.' };
    if (!owned(s, 'website') && s.turn >= 2) return { key: 'web', text: 'A simple website and listings help people find you, and grow your email list faster.' };
    if (!s.gw.zoning && !zoningPending(s) && s.turn >= 6) return { key: 'zone', text: 'Thinking about dinners, weddings or a cabin later? A zoning permit takes months. Apply early.' };
    if (s.stars >= 4.2 && s.plan.price !== 'premium') return { key: 'prem', text: 'Your reviews are strong. Premium prices could earn the same money with fewer, happier visitors and fewer hours.' };
    if (f.visitors < 50 && s.plan.focus === 'promote' && s.stamina < 80) return { key: 'quiet', text: 'It\'s a quiet month. A good time to rest the family before the busy season.' };
    if (!owned(s, 'email') && s.turn >= 3) return { key: 'email', text: 'Start an email list. Past visitors are your cheapest future visitors.' };
    if (!owned(s, 'restrooms') && f.visitors > 300) return { key: 'rest', text: 'Proper restrooms lift your star rating when crowds come.' };
    if (freePlot(s) < 0 && s.plotsOwned < R.maxPlots && s.cash > plotCost(s) + 10000 && s.stamina > 60) return { key: 'land', text: 'Every plot is in use. If the family has hours to spare, buying another field gives you room to grow.' };
    if (!owned(s, 'firstaid') && s.turn >= 4 && s.history.some(function (h) { return h.visitors > 300; })) return { key: 'aid', text: 'With this many visitors, a first-aid station and some training is cheap protection.' };
    if (!owned(s, 'cardpay') && s.turn >= 3 && f.visitors > 200) return { key: 'card', text: 'A card reader is cheap. Visitors who can tap to pay tend to spend a little more.' };
    if ((cm === 7 || cm === 8) && !owned(s, 'payroll')) return { key: 'help', text: 'Harvest and fall visitors arrive together. Line up seasonal help before September.' };
    return { key: 'ok', text: 'Things look steady. Keep an eye on the forecast hours — profit per hour matters as much as profit.' };
  }

  // ---------- end of game ----------
  var RIBBONS = ['Blue Ribbon', 'Red Ribbon', 'White Ribbon', 'Honorable Mention'];

  function completedYears(s) { return Math.floor(s.history.length / 12); }

  // a county fair ribbon for one finished farm year; each burnout that year costs a ribbon
  function yearTier(s, year) {
    var p = yearProfit(s, year);
    var tier = p >= R.goal ? 0 : p >= 40000 ? 1 : p >= 20000 ? 2 : 3;
    var burns = s.history.filter(function (h) { return h.year === year && h.burnout; }).length;
    return Math.min(3, tier + burns);
  }

  function endReport(s) {
    var done = completedYears(s);
    var years = [];
    for (var y = 1; y <= Math.max(done, E_YEARS_SHOWN(s)); y++) {
      var complete = y <= done;
      years.push({ year: y, visitorProfit: yearProfit(s, y), complete: complete,
        tier: complete ? yearTier(s, y) : null, ribbon: complete ? RIBBONS[yearTier(s, y)] : null });
    }
    var judged = years.filter(function (y) { return y.complete; });
    var best = judged.slice().sort(function (a, b) { return a.tier - b.tier || b.visitorProfit - a.visitorProfit; })[0] || null;
    var tier = best ? best.tier : 3;
    var blues = judged.filter(function (y) { return y.tier === 0; }).length;
    var firstBlue = judged.filter(function (y) { return y.tier === 0; })[0];
    var rows = Object.keys(s.attrStats).map(function (id) {
      var st = s.attrStats[id];
      var profit = st.revenue - st.costs;
      return {
        id: id, name: A[id] ? A[id].name : G[id].name, revenue: round(st.revenue), costs: round(st.costs), build: round(st.build),
        hours: round(st.hours), visitors: round(st.visitors), profit: round(profit),
        perHour: st.hours > 0 ? profit / st.hours : null
      };
    }).sort(function (a, b) { return b.profit - a.profit; });
    var ranked = rows.filter(function (r) { return r.hours >= 20 && r.perHour != null; })
      .sort(function (a, b) { return b.perHour - a.perHour; });
    var reason = s.gameOver === 'bank' ? 'The bank called in the loan.' :
      s.burnouts > 0 ? ('The family burned out ' + s.burnouts + (s.burnouts === 1 ? ' time' : ' times') + '. Each burnout costs that year a ribbon.') : '';
    return {
      ribbon: best ? best.ribbon : 'No ribbon yet', tier: tier, judged: judged.length, reason: reason,
      years: years, best: best, blues: blues, firstBlueYear: firstBlue ? firstBlue.year : null,
      y3: yearProfit(s, 3), goal: R.goal, goalYear: R.goalYear, burnouts: s.burnouts, gameOver: s.gameOver,
      monthsPlayed: s.history.length,
      totalVisitors: s.history.reduce(function (t, h) { return t + h.visitors; }, 0),
      cash: round(s.cash), stars: s.stars, stamina: round(s.stamina), safety: round(s.safety),
      rows: rows, bestEarner: ranked[0] || null, worstEarner: ranked.length > 1 ? ranked[ranked.length - 1] : null,
      capital: s.capital, lessons: s.lessons.slice(), plotsOwned: s.plotsOwned
    };
  }
  // show the year in progress too
  function E_YEARS_SHOWN(s) { return s.history.length ? yearOf(s.history.length - 1) : 0; }

  // ---------- saving ----------
  function serialize(s) { return JSON.stringify(s); }
  function deserialize(str) {
    try {
      var s = JSON.parse(str);
      if (!s || !Array.isArray(s.plots)) return null;
      if (s.v === 1) {
        // older saves: 10 plots and a 36-month game; carry them into endless play
        while (s.plots.length < D.PLOT_COUNT) s.plots.push(null);
        s.plotsOwned = R.basePlots;
        if (s.phase === 'ended' && !s.gameOver) s.phase = s.pendingCard && !s.cardOutcome ? 'results' : 'plan';
        s.v = 2;
      }
      if (s.v !== SAVE_VERSION) return null;
      return s;
    } catch (e) { return null; }
  }

  return {
    data: D, newGame: newGame, rand: rand,
    calMonth: calMonth, yearOf: yearOf, monthLabel: monthLabel, money: money, seasonText: seasonText,
    owned: owned, has: has, zoningPending: zoningPending, isReady: isReady, readyIn: readyIn, isOpenNow: isOpenNow,
    openIds: openIds, parkingCap: parkingCap, creditLeft: creditLeft, builtList: builtList,
    canBuild: canBuild, build: build, demolish: demolish, canBuildGw: canBuildGw, buildGw: buildGw,
    setPlan: setPlan, computeMonth: computeMonth, forecast: forecast, openGate: openGate,
    cardView: cardView, chooseCard: chooseCard, nextMonth: nextMonth, cardById: cardById, helpers: helpers,
    mentorTip: mentorTip, endReport: endReport, yearProfit: yearProfit, yearTier: yearTier, ribbons: RIBBONS,
    completedYears: completedYears, plotOwned: plotOwned, freePlot: freePlot, plotCost: plotCost,
    canBuyPlot: canBuyPlot, buyPlot: buyPlot,
    serialize: serialize, deserialize: deserialize
  };
});
