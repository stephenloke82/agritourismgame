// Run with:  node --test tests/
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var E = require('../js/engine.js');
var sim = require('../tools/simulate.js');
var D = E.data;

function fresh(opts) { return E.newGame(Object.assign({ seed: 42, farmType: 'grain', location: 'town', tutorial: false }, opts || {})); }

function playMonth(s, choice) {
  E.openGate(s);
  if (s.pendingCard) E.chooseCard(s, choice || 0);
  E.nextMonth(s);
}

test('data: 12 attractions, enough cards, and every card is well formed', function () {
  assert.strictEqual(Object.keys(D.ATTRACTIONS).length, 12);
  var regular = D.CARDS.filter(function (c) { return !c.followupOnly; });
  assert.ok(regular.length >= 24, 'at least 24 dilemma cards');
  D.CARDS.forEach(function (c) {
    assert.ok(c.title && c.lesson, c.id + ' has title and lesson');
    assert.ok(c.choices.length >= 1 && c.choices.length <= 3, c.id + ' has 1-3 choices');
    if (!c.followupOnly) {
      assert.strictEqual(typeof c.when, 'function', c.id + ' has a condition');
      assert.ok(c.choices.length >= 2, c.id + ' regular cards offer a real choice');
    }
  });
  // every follow-up referenced by a card exists
  var ids = D.CARDS.map(function (c) { return c.id; });
  var src = require('fs').readFileSync(require('path').join(__dirname, '../js/data.js'), 'utf8');
  (src.match(/followup: \{ id: '([a-z_]+)'/g) || []).forEach(function (m) {
    var id = m.match(/'([a-z_]+)'/)[1];
    assert.ok(ids.indexOf(id) >= 0, 'follow-up ' + id + ' exists');
  });
  Object.keys(D.ATTRACTIONS).forEach(function (id) {
    var a = D.ATTRACTIONS[id];
    assert.strictEqual(a.season.length, 12);
    a.requires.forEach(function (r) { assert.ok(D.GROUNDWORK[r], id + ' requires known groundwork ' + r); });
  });
});

test('new game starts in March of year 1 with sane meters', function () {
  var s = fresh();
  assert.strictEqual(E.calMonth(s.turn), 2);
  assert.strictEqual(E.monthLabel(s.turn), 'March, Year 1');
  assert.strictEqual(s.plots.length, D.PLOT_COUNT);
  assert.ok(s.stamina > 0 && s.stamina <= 100);
  assert.strictEqual(s.phase, 'plan');
});

test('same seed and same choices give the same game', function () {
  var a = sim.play(sim.strategies.thoughtful, 'orchard', 'town', 7).rep;
  var b = sim.play(sim.strategies.thoughtful, 'orchard', 'town', 7).rep;
  assert.deepStrictEqual(a.years, b.years);
  assert.strictEqual(a.ribbon, b.ribbon);
});

test('building costs cash, uses a plot, and respects prerequisites', function () {
  var s = fresh();
  var cash = s.cash;
  assert.ok(E.build(s, 'stand', 0).ok);
  assert.strictEqual(s.cash, cash - D.ATTRACTIONS.stand.cost);
  assert.strictEqual(s.plots[0].id, 'stand');
  assert.strictEqual(E.build(s, 'upick', 0).ok, false, 'plot already used');
  var w = E.canBuild(s, 'weddings', 3);
  assert.strictEqual(w.ok, false);
  assert.ok(/Zoning/.test(w.reason));
  assert.strictEqual(E.canBuild(s, 'hayride', 3).ok, false, 'hayrides need insurance');
  E.buildGw(s, 'insurance');
  assert.ok(E.canBuild(s, 'hayride', 3).ok);
});

test('zoning takes three months to approve', function () {
  var s = fresh();
  assert.ok(E.buildGw(s, 'zoning').ok);
  assert.strictEqual(E.owned(s, 'zoning'), false);
  assert.ok(E.zoningPending(s));
  playMonth(s); playMonth(s);
  assert.strictEqual(E.owned(s, 'zoning'), false);
  playMonth(s);
  assert.strictEqual(E.owned(s, 'zoning'), true);
});

test('establishing attractions are not open until ready', function () {
  var s = fresh();
  E.build(s, 'maze', 2); // March build, 4 months to establish
  var p = s.plots[2];
  assert.strictEqual(E.isReady(s, p), false);
  assert.strictEqual(E.readyIn(s, p), 4);
});

test('forecast does not change state or consume randomness', function () {
  var s = fresh();
  E.build(s, 'stand', 0);
  var before = JSON.stringify(s);
  var f = E.forecast(s);
  assert.ok(f.visitors > 0);
  assert.strictEqual(JSON.stringify(s), before);
});

test('parking caps monthly visitors', function () {
  var s = fresh({ location: 'city' });
  s.turn = 7; // October
  s.cash = 200000;
  ['pumpkin', 'maze'].forEach(function (id, i) { E.build(s, id, i); s.plots[i].builtTurn = 0; s.plots[i].monthsOpen = 12; });
  E.buildGw(s, 'insurance'); E.build(s, 'hayride', 2);
  var f = E.forecast(s);
  assert.ok(f.demand > E.parkingCap(s));
  assert.ok(Math.abs(f.visitors - E.parkingCap(s)) < 1e-6);
  assert.ok(f.turnedAway > 0);
});

test('rain cuts outdoor visitors, and online booking halves the loss', function () {
  var s = fresh(); s.turn = 7; s.cash = 100000;
  E.build(s, 'pumpkin', 0); s.plots[0].builtTurn = 0;
  var dry = E.computeMonth(s, { rain: 0 }).demand;
  var wet = E.computeMonth(s, { rain: 4 }).demand;
  E.buildGw(s, 'website'); E.buildGw(s, 'booking');
  var dryB = E.computeMonth(s, { rain: 0 }).demand;
  var wetB = E.computeMonth(s, { rain: 4 }).demand;
  assert.ok(wet < dry * 0.5);
  assert.ok(Math.abs((1 - wetB / dryB) - (1 - wet / dry) / 2) < 1e-9);
});

test('hired help reduces the family load and costs money', function () {
  var s = fresh(); s.turn = 7; s.cash = 100000;
  E.build(s, 'pumpkin', 0); s.plots[0].builtTurn = 0;
  var noHelp = E.forecast(s);
  E.buildGw(s, 'payroll');
  E.setPlan(s, { help: 2 });
  var help = E.forecast(s);
  assert.ok(help.load < noHelp.load);
  assert.strictEqual(help.helpCost, 2 * D.RULES.helperCost);
});

test('stamina at zero causes a burnout month with the gate closed', function () {
  var s = fresh();
  E.build(s, 'stand', 0);
  s.stamina = 1;
  s.turn = 7; // October harvest crunch for grain
  E.buildGw(s, 'insurance');
  E.build(s, 'hayride', 1);
  E.setPlan(s, { focus: 'promote' });
  E.openGate(s);
  assert.strictEqual(s.stamina, 0);
  assert.strictEqual(s.burnoutNext, true);
  assert.strictEqual(s.burnouts, 1);
  if (s.pendingCard) E.chooseCard(s, 0);
  E.nextMonth(s);
  var r = E.openGate(s);
  assert.strictEqual(r.closed, true);
  assert.strictEqual(r.visitors, 0);
  assert.ok(s.stamina >= 50);
});

test('going past the credit line twice ends the game', function () {
  var s = fresh();
  s.cash = -D.RULES.creditLine - 20000;
  playMonth(s);
  assert.strictEqual(s.gameOver, null);
  assert.strictEqual(s.bankWarnings, 1);
  E.openGate(s);
  assert.strictEqual(s.gameOver, 'bank');
  if (s.pendingCard) E.chooseCard(s, 0);
  E.nextMonth(s);
  assert.strictEqual(s.phase, 'ended');
  assert.strictEqual(E.endReport(s).ribbon, 'Honorable Mention');
});

test('choosing a card applies effects and records the lesson', function () {
  var s = fresh();
  E.build(s, 'stand', 0);
  E.openGate(s);
  s.pendingCard = 'machinery';
  s.cardOutcome = null;
  var cash = s.cash, safety = s.safety;
  var out = E.chooseCard(s, 0);
  assert.ok(out);
  assert.strictEqual(s.cash, cash - 900);
  assert.ok(s.safety > safety);
  assert.ok(s.flags.fenced);
  assert.ok(s.lessons.some(function (l) { return l.id === 'machinery'; }));
  assert.strictEqual(E.chooseCard(s, 1), null, 'cannot answer twice');
});

test('a full game always ends after 36 months with a report', function () {
  var res = sim.play(sim.strategies.thoughtful, 'livestock', 'remote', 99);
  assert.strictEqual(res.s.phase, 'ended');
  assert.strictEqual(res.rep.monthsPlayed, 36);
  assert.ok(['Blue Ribbon', 'Red Ribbon', 'White Ribbon', 'Honorable Mention'].indexOf(res.rep.ribbon) >= 0);
  assert.ok(res.rep.rows.length > 0);
  assert.ok(res.rep.lessons.length > 0);
});

test('save and load round-trips, and bad saves are rejected', function () {
  var s = fresh();
  E.build(s, 'stand', 0);
  playMonth(s);
  var t = E.deserialize(E.serialize(s));
  assert.deepStrictEqual(t, s);
  assert.strictEqual(E.deserialize('not json'), null);
  assert.strictEqual(E.deserialize('{"v":999}'), null);
});

test('balance: careful play usually earns Blue, careless expansion usually fails', function () {
  var farms = Object.keys(D.FARM_TYPES), locs = ['town', 'city'];
  var smartBlue = 0, carelessFail = 0, n = 0;
  farms.forEach(function (ft) {
    locs.forEach(function (loc) {
      for (var i = 0; i < 4; i++) {
        n++;
        if (sim.play(sim.strategies.thoughtful, ft, loc, 500 + i).rep.tier === 0) smartBlue++;
        if (sim.play(sim.strategies.careless, ft, loc, 500 + i).rep.tier >= 2) carelessFail++;
      }
    });
  });
  assert.ok(smartBlue / n >= 0.7, 'thoughtful blue rate ' + smartBlue / n);
  assert.ok(carelessFail / n >= 0.7, 'careless fail rate ' + carelessFail / n);
});
