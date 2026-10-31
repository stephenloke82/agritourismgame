#!/usr/bin/env node
/*
 * Balance simulator for Open the Gate.
 * Plays many seeded games with scripted strategies and prints how often each
 * one earns each ribbon.  Usage:  node tools/simulate.js [gamesPerCombo]
 */
'use strict';
var E = require('../js/engine.js');
var D = E.data, A = D.ATTRACTIONS, G = D.GROUNDWORK, R = D.RULES;

// ---------- shared helpers ----------
function monthsUntilOpen(s, id) {
  // months from now until this attraction's season next starts (0 = in season now)
  for (var k = 0; k < 12; k++) if (A[id].season[E.calMonth(s.turn + k)] > 0) return k;
  return 99;
}
function freePlot(s) { return s.plots.indexOf(null); }

function chooseHelp(s, maxLoad) {
  if (!E.owned(s, 'payroll')) return 0;
  for (var h = 0; h <= R.maxHelpers; h++) {
    E.setPlan(s, { help: h });
    var f = E.forecast(s);
    if (f.load <= maxLoad) return h;
  }
  return R.maxHelpers;
}

function wiseCard(s) {
  var v = E.cardView(s);
  var c = E.cardById(v.id);
  var pick = -1;
  v.choices.forEach(function (ch, i) { if (pick < 0 && ch.available && c.choices[i].wise) pick = i; });
  if (pick < 0) v.choices.forEach(function (ch, i) { if (pick < 0 && ch.available) pick = i; });
  return pick;
}

function randomCard(s) {
  var v = E.cardView(s);
  var ok = v.choices.filter(function (c) { return c.available; });
  return ok[Math.floor(E.rand(s) * ok.length)].index;
}

// ---------- strategies ----------
// Each plan entry: [id, kind, earliestTurn]. Attractions wait until they'd be ready for their season.
var CORE = {
  orchard: ['upick', 'pumpkin', 'maze', 'hayride', 'trees', 'workshops', 'school', 'petting'],
  garden: ['upick', 'pumpkin', 'maze', 'workshops', 'hayride', 'trees', 'school', 'petting'],
  livestock: ['petting', 'pumpkin', 'school', 'maze', 'hayride', 'trees', 'workshops', 'upick'],
  grain: ['maze', 'pumpkin', 'hayride', 'trees', 'upick', 'workshops', 'school', 'petting']
};

function thoughtful(opts) {
  opts = opts || {};
  var reserve = opts.reserve != null ? opts.reserve : -8000; // lowest cash we'll build down to
  var limit = opts.limit || 99;
  return {
    name: opts.name || 'thoughtful',
    plan: function (s) {
      var t = s.turn, cm = E.calMonth(t);
      var gwOrder = ['insurance', 'waivers', 'payroll', 'website', 'email'];
      if (t === 0) { E.build(s, 'stand', 0); }
      var spend = function (cost) { return s.cash - cost >= reserve; };
      gwOrder.forEach(function (g) { if (!E.owned(s, g) && spend(G[g].cost) && t >= (g === 'website' || g === 'email' ? 1 : 0)) E.buildGw(s, g); });
      var f0 = E.forecast(s);
      var animals = s.plots.some(function (p) { return p && A[p.id].animals; });
      if ((animals || CORE[s.farmType].indexOf('petting') < 3) && !E.owned(s, 'handwash') && spend(1500)) E.buildGw(s, 'handwash');
      // attractions in the farm's preferred order
      var built = s.plots.filter(Boolean).length;
      CORE[s.farmType].forEach(function (id) {
        if (built >= limit || E.has(s, id) || freePlot(s) < 0) return;
        var wait = monthsUntilOpen(s, id);
        var ready = A[id].establish;
        if (wait < ready && A[id].season[cm] === 0) return; // too late this year
        if (wait - ready > 3 && wait < 99) return;           // too early, would pay upkeep for nothing
        if (A[id].requires.some(function (r) { return !E.owned(s, r); })) {
          A[id].requires.forEach(function (r) { if (r !== 'zoning' && E.canBuildGw(s, r).ok && spend(G[r].cost)) E.buildGw(s, r); });
        }
        if (E.canBuild(s, id).ok && spend(A[id].cost)) { E.build(s, id); built++; }
      });
      // parking & comfort as crowds grow
      var lastTA = s.history.length ? s.history[s.history.length - 1].turnedAway : 0;
      var f = E.forecast(s);
      var peakDemand = f.demand;
      if ((peakDemand > E.parkingCap(s) * 0.9 || lastTA > 0 || cm === 7) && !E.owned(s, 'parking1') && built >= 2 && spend(4000)) E.buildGw(s, 'parking1');
      if (E.owned(s, 'parking1') && !E.owned(s, 'parking2') && (peakDemand > 1700 || (cm === 8 && t > 12)) && spend(3000)) E.buildGw(s, 'parking2');
      if (!E.owned(s, 'restrooms') && t >= 4 && spend(5500)) E.buildGw(s, 'restrooms');
      if (!E.owned(s, 'booking') && E.owned(s, 'website') && t >= 5 && spend(900)) E.buildGw(s, 'booking');
      if (opts.events && !s.gw.zoning && !E.zoningPending(s) && t >= 6 && spend(1500)) E.buildGw(s, 'zoning');
      if (opts.events && s.gw.zoning) {
        opts.events.forEach(function (id) {
          if (E.has(s, id) || freePlot(s) < 0) return;
          A[id].requires.forEach(function (r) { if (E.canBuildGw(s, r).ok && spend(G[r].cost + 10000)) E.buildGw(s, r); });
          if (E.canBuild(s, id).ok && spend(A[id].cost + 5000)) E.build(s, id);
        });
      }
      // the month's plan
      var price = s.stars >= 4.2 ? 'premium' : 'fair';
      E.setPlan(s, { price: price });
      var maxLoad = s.stamina > 75 ? 1.15 : s.stamina > 50 ? 1.0 : 0.85;
      E.setPlan(s, { focus: 'promote' });
      E.setPlan(s, { help: chooseHelp(s, maxLoad) });
      f = E.forecast(s);
      var focus;
      if (s.stamina < 45 || s.stamina + f.staminaDelta < 25) focus = 'rest';
      else if (s.safety < 50) focus = 'tidy';
      else if (f.visitors > 250) focus = 'promote';
      else if (s.stamina < 90) focus = 'rest';
      else focus = s.stars < 3.6 ? 'tidy' : 'promote';
      E.setPlan(s, { focus: focus });
      if (focus !== 'promote') E.setPlan(s, { help: chooseHelp(s, maxLoad) });
    },
    card: wiseCard
  };
}

var careless = {
  name: 'careless',
  plan: function (s) {
    // builds every attraction it can afford, as soon as it can, and pushes the family hard
    var ids = Object.keys(A).sort(function (a, b) { return A[b].cost - A[a].cost; });
    ids.forEach(function (id) {
      if (freePlot(s) < 0) return;
      if (E.canBuild(s, id).ok) E.build(s, id);
    });
    E.setPlan(s, { focus: 'promote', price: 'budget' });
  },
  card: randomCard
};

var greedy = {
  name: 'expand-fast',
  // a slightly smarter over-expander: does the obvious paperwork, but builds everything and skips help
  plan: function (s) {
    ['insurance', 'zoning', 'restrooms', 'parking1', 'website', 'kitchen'].forEach(function (g) { if (E.canBuildGw(s, g).ok) E.buildGw(s, g); });
    var ids = Object.keys(A).sort(function (a, b) { return A[b].cost - A[a].cost; });
    ids.forEach(function (id) { if (freePlot(s) >= 0 && E.canBuild(s, id).ok) E.build(s, id); });
    E.setPlan(s, { focus: s.stamina < 20 ? 'rest' : 'promote', price: 'fair' });
  },
  card: wiseCard
};

var idle = {
  name: 'crops-only',
  plan: function (s) { E.setPlan(s, { focus: 'rest', price: 'fair' }); },
  card: wiseCard
};

var modest = thoughtful({ name: 'modest (stand+2)', limit: 3, reserve: 0 });
var medium = thoughtful({ name: 'careful (5 attr)', limit: 5, reserve: -5000 });
var smart = thoughtful({ name: 'thoughtful' });
var smartEvents = thoughtful({ name: 'thoughtful+events', events: ['workshops', 'dinners', 'weddings', 'cabin'] });

function randomPlayer() {
  return {
    name: 'random',
    plan: function (s) {
      if (E.rand(s) < 0.25) {
        var ids = Object.keys(A); var id = ids[Math.floor(E.rand(s) * ids.length)];
        if (freePlot(s) >= 0 && E.canBuild(s, id).ok) E.build(s, id);
      }
      if (E.rand(s) < 0.25) {
        var gs = Object.keys(G); var g = gs[Math.floor(E.rand(s) * gs.length)];
        if (E.canBuildGw(s, g).ok) E.buildGw(s, g);
      }
      var foci = ['promote', 'tidy', 'rest'], prices = ['budget', 'fair', 'premium'];
      E.setPlan(s, { focus: foci[Math.floor(E.rand(s) * 3)], price: prices[Math.floor(E.rand(s) * 3)], help: Math.floor(E.rand(s) * 3) });
    },
    card: randomCard
  };
}

// ---------- run ----------
function play(strategy, farmType, location, seed) {
  var s = E.newGame({ seed: seed, farmType: farmType, location: location, tutorial: false });
  while (s.phase !== 'ended') {
    if (s.phase === 'plan') {
      strategy.plan(s);
      E.openGate(s);
    }
    if (s.phase === 'results') {
      if (s.pendingCard) E.chooseCard(s, strategy.card(s));
      E.nextMonth(s);
    }
  }
  return { s: s, rep: E.endReport(s) };
}

function run(n) {
  var strategies = [smart, smartEvents, medium, modest, greedy, careless, randomPlayer(), idle];
  var farms = Object.keys(D.FARM_TYPES), locs = Object.keys(D.LOCATIONS);
  var summary = [];
  strategies.forEach(function (st) {
    var all = { ribbons: [0, 0, 0, 0], y3: [], bank: 0, burn: 0, games: 0 };
    var byCombo = [];
    farms.forEach(function (ft) {
      locs.forEach(function (loc) {
        var c = { ribbons: [0, 0, 0, 0], y3: 0, bank: 0, burn: 0 };
        for (var i = 0; i < n; i++) {
          var res = play(st, ft, loc, 1000 + i * 7919);
          c.ribbons[res.rep.tier]++; all.ribbons[res.rep.tier]++;
          c.y3 += res.rep.y3; all.y3.push(res.rep.y3);
          if (res.rep.gameOver) { c.bank++; all.bank++; }
          if (res.rep.burnouts) { c.burn++; all.burn++; }
          all.games++;
        }
        byCombo.push(ft.padEnd(9) + ' ' + loc.padEnd(6) + ' blue ' + pct(c.ribbons[0], n) + ' red ' + pct(c.ribbons[1], n) +
          ' white ' + pct(c.ribbons[2], n) + ' hm ' + pct(c.ribbons[3], n) + '  avgY3 ' + E.money(c.y3 / n).padStart(9) +
          '  bank ' + pct(c.bank, n) + ' burnout ' + pct(c.burn, n));
      });
    });
    all.y3.sort(function (a, b) { return a - b; });
    var line = st.name.padEnd(18) + ' blue ' + pct(all.ribbons[0], all.games) + ' red ' + pct(all.ribbons[1], all.games) +
      ' white ' + pct(all.ribbons[2], all.games) + ' hm ' + pct(all.ribbons[3], all.games) +
      '  medianY3 ' + E.money(all.y3[Math.floor(all.y3.length / 2)]).padStart(9) +
      '  bank ' + pct(all.bank, all.games) + '  burnout ' + pct(all.burn, all.games);
    summary.push(line);
    if (process.argv.indexOf('--detail') >= 0) { console.log('\n== ' + st.name); byCombo.forEach(function (l) { console.log('  ' + l); }); }
  });
  console.log('\nStrategy           ribbons across all farm types and locations');
  summary.forEach(function (l) { console.log(l); });
}

function pct(a, b) { return (Math.round(100 * a / b) + '%').padStart(4); }

if (require.main === module) run(parseInt(process.argv[2], 10) || 30);
module.exports = { play: play, strategies: { thoughtful: smart, careless: careless, greedy: greedy, idle: idle, modest: modest } };
