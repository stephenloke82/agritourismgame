/*
 * Open the Gate — page controller. Connects the engine, the scene and the HTML.
 */
(function () {
  'use strict';
  var E = window.OTG, D = E.data, A = D.ATTRACTIONS, G = D.GROUNDWORK, R = D.RULES;
  var SAVE_KEY = 'open-the-gate-save-v1';
  var $ = function (id) { return document.getElementById(id); };
  var money = E.money;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var s = null;          // game state
  var scene = null;
  var view = 'plan';     // which side panel is visible: plan | results | card
  var animating = false;

  // ---------- storage (never required) ----------
  var store = (function () {
    var ok = false;
    try {
      var k = '__otg_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      ok = true;
    } catch (e) { ok = false; }
    return {
      ok: ok,
      load: function () {
        if (!ok) return null;
        try { return E.deserialize(window.localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
      },
      save: function (state) {
        if (!ok) return;
        try { window.localStorage.setItem(SAVE_KEY, E.serialize(state)); } catch (e) { /* storage full or blocked: keep playing */ }
      },
      clear: function () {
        if (!ok) return;
        try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      }
    };
  })();
  function save() { if (s) store.save(s); }

  // ---------- tiny DOM helpers ----------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function announce(msg) { var a = $('announcer'); a.textContent = ''; setTimeout(function () { a.textContent = msg; }, 30); }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }
  function signedMoney(n) { return (n > 0 ? '+' : '') + money(n); }
  function openDialog(d) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); }
  function closeDialog(d) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }

  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      var d = $('confirm-dialog');
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text;
      $('confirm-ok').textContent = okLabel || 'Yes';
      d.returnValue = '';
      var done = function () { d.removeEventListener('close', done); resolve(d.returnValue === 'ok'); };
      d.addEventListener('close', done);
      if (typeof d.showModal === 'function') d.showModal();
      else resolve(window.confirm(text));
    });
  }

  // ---------- screens ----------
  function showScreen(id) {
    ['screen-title', 'screen-setup', 'screen-game', 'screen-end'].forEach(function (x) { $(x).hidden = x !== id; });
    var inGame = id === 'screen-game';
    $('masthead').classList.toggle('no-meters', !inGame);
    $('actionbar').hidden = !inGame;
    window.scrollTo(0, 0);
  }

  // ---------- title & setup ----------
  function initTitle() {
    var saved = store.load();
    $('btn-continue').hidden = !saved;
    $('storage-note').hidden = store.ok;
    showScreen('screen-title');
  }

  function buildSetup() {
    var ft = clear($('farm-type-choices'));
    Object.keys(D.FARM_TYPES).forEach(function (k, i) {
      ft.appendChild(choiceCard('farmType', k, D.FARM_TYPES[k].name, D.FARM_TYPES[k].blurb, i === 0));
    });
    var loc = clear($('location-choices'));
    Object.keys(D.LOCATIONS).forEach(function (k) {
      loc.appendChild(choiceCard('location', k, D.LOCATIONS[k].name, D.LOCATIONS[k].blurb, k === 'town'));
    });
  }

  function choiceCard(name, value, title, blurb, checked, onChange) {
    var id = 'c-' + name + '-' + value;
    var input = el('input', { type: 'radio', name: name, value: value, id: id, checked: checked || null });
    if (onChange) input.addEventListener('change', onChange);
    return el('div', { class: 'choice' }, [
      input,
      el('label', { class: 'choice-card', for: id }, [el('strong', { text: title }), blurb ? el('span', { text: blurb }) : null])
    ]);
  }

  function startNew(e) {
    if (e) e.preventDefault();
    var f = $('setup-form');
    var name = f.farmName.value.trim() || 'Sunny Acres';
    s = E.newGame({ farmName: name, farmType: f.farmType.value, location: f.location.value });
    view = 'plan';
    save();
    enterGame();
  }

  // ---------- game ----------
  function enterGame() {
    if (s.phase === 'ended') { showEnd(); return; }
    showScreen('screen-game');
    if (!scene) scene = window.OTGScene.create($('scene'), function (i) { if (s.phase === 'plan' && !animating) openPlot(i); });
    view = s.phase === 'plan' ? 'plan' : (s.cardOutcome ? 'card' : 'results');
    render();
    // redraw once the display font has loaded so the barn sign uses it
    if (document.fonts && document.fonts.load) {
      document.fonts.load('20px "Alfa Slab One"').then(function () { drawScene(); }, function () {});
    }
  }

  function render() {
    renderMeters();
    $('view-plan').hidden = view !== 'plan';
    $('view-results').hidden = view !== 'results';
    $('view-card').hidden = view !== 'card';
    if (view === 'plan') renderPlan();
    if (view === 'results') renderResults();
    if (view === 'card') renderCard();
    renderDot();
    renderAction();
    drawScene();
  }

  function drawScene() {
    if (!scene || animating) return;
    var o = { highlight: (s.phase === 'plan' && s.tutorial === 1) ? 0 : null };
    if (s.phase !== 'plan' && s.lastResult) { o.turn = s.lastResult.turn; o.rain = s.lastResult.rain; }
    scene.draw(s, o);
    var built = s.plots.filter(Boolean).map(function (p) { return A[p.id].name; });
    $('scene').setAttribute('aria-label', 'Farm scene, ' + window.OTGScene.season(E.calMonth(s.turn)) + '. ' +
      (built.length ? 'Built: ' + built.join(', ') + '.' : 'Nothing built yet.') + ' Use the plot buttons to build.');
  }

  function renderMeters() {
    var t = Math.min(s.turn, R.turns - 1);
    var shownTurn = s.phase === 'plan' ? s.turn : (s.lastResult ? s.lastResult.turn : t);
    $('date-label').textContent = E.monthLabel(shownTurn) + ' · ' + (shownTurn + 1) + '/' + R.turns;
    $('date-label').setAttribute('aria-label', E.monthLabel(shownTurn) + ', month ' + (shownTurn + 1) + ' of ' + R.turns);
    var c = $('m-cash'); c.textContent = money(s.cash); c.classList.toggle('neg', s.cash < 0);
    var full = Math.round(s.stars);
    $('m-stars').innerHTML = '★★★★★'.slice(0, full) + '<span class="off">' + '★★★★★'.slice(0, 5 - full) + '</span> ' + s.stars.toFixed(1);
    $('m-stars').setAttribute('aria-hidden', 'true');
    $('m-stars-text').textContent = s.stars.toFixed(1) + ' out of 5 stars';
    bar('stamina', s.stamina); bar('safety', s.safety);
  }
  function bar(name, v) {
    var f = $('m-' + name + '-bar');
    f.style.width = Math.round(v) + '%';
    f.className = 'bar-fill' + (v < 30 ? ' bad' : v < 55 ? ' warn' : '');
    $('m-' + name).textContent = Math.round(v);
  }

  // ---------- Dot ----------
  function renderDot() {
    var tip;
    if (s.phase === 'plan') tip = E.mentorTip(s).text;
    else if (view === 'card') tip = s.cardOutcome ? 'Every choice teaches something. I\'ve added that lesson to your notebook for the end of the game.' : 'There\'s rarely a perfect answer. Think about cost, safety and the family\'s time.';
    else tip = resultsTip(s.lastResult);
    $('dot-tip').textContent = tip;
    $('btn-skip-tour').hidden = !(s.phase === 'plan' && s.tutorial > 0);
  }

  function resultsTip(r) {
    if (!r) return '';
    if (s.gameOver) return 'The bank has called in the loan. Sometimes the bravest farm decision is to grow more slowly. Let\'s look at what you learned.';
    if (r.incident && !r.incident.covered) return 'That injury came straight out of your pocket. Agritourism insurance turns bills like that into a small deductible.';
    if (s.burnoutNext) return 'The family is spent. Next month the farm closes. Next time, hire help or rest before the busy weeks.';
    if (r.turnedAway > 50) return 'Cars drove away for lack of parking. That\'s money you never see — and neighbors who do see the traffic.';
    if (r.shortFrac > 0.02) return 'There were more jobs than hands. Some harvest was lost. Hired help in busy months pays for itself.';
    if (r.rain >= 2 && !E.owned(s, 'booking') && r.attractions.some(function (x) { return x.rainLoss > 30; })) return 'Rain kept people home. Online booking with rain checks would have saved about half of those visits.';
    if (r.staminaAfter < 35) return 'Family Stamina is getting low. A "Rest the Family" month soon would be wise.';
    if (r.yearEnd) return 'That\'s the end of year ' + r.yearEnd.year + '. Visitor profit this year: ' + money(r.yearEnd.visitorProfit) + '. The goal is ' + money(R.goal) + ' in year 3.';
    if (r.visitorProfit > 0) return 'A profitable month from visitors. Look at hours as well as dollars — the family\'s time is the scarcest thing on the farm.';
    if (r.visitors < 30) return 'A quiet month. Upkeep and insurance still have to be paid, which is why season planning matters.';
    return 'Visitors cost money before they make money. Watch which attractions earn the most per hour.';
  }

  // ---------- plan view ----------
  function plotStatus(i) {
    var p = s.plots[i];
    if (!p) return { what: 'Empty plot', status: 'Tap to build', cls: 'empty' };
    var a = A[p.id];
    if (!E.isReady(s, p)) return { what: a.name, status: 'Getting ready: ' + E.readyIn(s, p) + ' mo', cls: '' };
    if (s.burnoutNext) return { what: a.name, status: 'Closed (burnout)', cls: '' };
    if (a.season[E.calMonth(s.turn)] > 0) return { what: a.name, status: 'Open this month', cls: 'open' };
    for (var k = 1; k <= 12; k++) if (a.season[E.calMonth(s.turn + k)] > 0) return { what: a.name, status: 'Closed until ' + D.MONTHS_SHORT[E.calMonth(s.turn + k)], cls: '' };
    return { what: a.name, status: 'Closed', cls: '' };
  }

  function renderPlan() {
    var list = clear($('plot-list'));
    s.plots.forEach(function (p, i) {
      var st = plotStatus(i);
      var b = el('button', {
        type: 'button', class: 'plot-btn ' + st.cls + (s.tutorial === 1 && i === 0 ? ' pulse' : ''),
        'aria-label': 'Plot ' + (i + 1) + ', ' + window.OTGScene.PLOT_NAMES[i] + ': ' + st.what + ', ' + st.status,
        onclick: function () { openPlot(i); }
      }, [
        el('span', { class: 'plot-num', text: 'Plot ' + (i + 1) + ' · ' + window.OTGScene.PLOT_NAMES[i] }),
        el('span', { class: 'plot-what', text: st.what }),
        el('span', { class: 'plot-status', text: st.status })
      ]);
      list.appendChild(el('li', null, [b]));
    });

    // focus
    var fc = clear($('focus-choices'));
    Object.keys(D.FOCUS).forEach(function (k) {
      var f = D.FOCUS[k];
      fc.appendChild(choiceCard('focus', k, f.name + (f.cost ? ' (' + money(f.cost) + ')' : ''), f.blurb, s.plan.focus === k, function () {
        E.setPlan(s, { focus: k }); save(); refreshPlan();
      }));
    });
    $('focus-group').classList.toggle('pulse', s.tutorial === 2);

    var pc = clear($('price-choices'));
    Object.keys(D.PRICE).forEach(function (k) {
      var p = D.PRICE[k];
      pc.appendChild(choiceCard('price', k, p.name, p.blurb, s.plan.price === k, function () {
        E.setPlan(s, { price: k }); save(); refreshPlan();
      }));
    });

    var payroll = E.owned(s, 'payroll');
    $('help-count').textContent = String(payroll ? s.plan.help : 0);
    $('help-minus').disabled = !payroll || s.plan.help <= 0;
    $('help-plus').disabled = !payroll || s.plan.help >= R.maxHelpers;
    $('help-hint').textContent = payroll
      ? 'Each hand covers about ' + R.helperHours + ' hours for ' + money(R.helperCost) + ' a month.'
      : 'Set up "Seasonal help (payroll)" in Groundwork to hire hands.';

    renderForecast();
    renderGroundwork();
  }

  function refreshPlan() { renderPlan(); renderDot(); renderAction(); drawScene(); }

  function renderForecast() {
    var f = E.forecast(s);
    var box = clear($('forecast'));
    var stamAfter = Math.max(0, Math.min(100, s.stamina + f.staminaDelta));
    var cashAfter = s.cash + f.net;
    var grid = el('div', { class: 'fc-grid' }, [
      stat('Visitors', num(f.visitors), f.turnedAway > 20 ? num(f.turnedAway) + ' turned away (parking for ' + num(f.parkingCap) + ')' : 'Parking for ' + num(f.parkingCap), f.turnedAway > 20 ? 'bad' : ''),
      stat('Visitor profit', signedMoney(f.visitorProfit), 'Income ' + money(f.revenue), f.visitorProfit < 0 ? 'bad' : 'good'),
      stat('Family Stamina', Math.round(s.stamina) + ' → ' + Math.round(stamAfter), (f.staminaDelta >= 0 ? 'Recovering' : 'Draining') + (s.burnoutNext ? ' (farm closed)' : ''), stamAfter < 25 ? 'bad' : ''),
      stat('Cash after month', money(cashAfter), 'Crops ' + money(f.crop) + ', living ' + money(f.living), cashAfter < -R.creditLine ? 'bad' : '')
    ]);
    box.appendChild(grid);

    // hours
    var cap = R.familyHours;
    var total = f.farmHours + f.attrHours;
    var scaleMax = Math.max(total, cap * R.overtimeCap) * 1.05;
    var hb = el('div', { class: 'hours-bar', 'aria-hidden': 'true' });
    var farmW = f.farmHours / scaleMax * 100, visW = f.attrHours / scaleMax * 100;
    hb.appendChild(el('span', { class: 'farm', style: 'width:' + farmW + '%' }));
    hb.appendChild(el('span', { class: 'visit', style: 'left:' + farmW + '%;width:' + visW + '%' }));
    hb.appendChild(el('span', { class: 'cap', style: 'left:' + (cap / scaleMax * 100) + '%' }));
    var hoursText = 'Work this month: farm ' + num(f.farmHours) + ' h + visitors ' + num(f.attrHours) + ' h' +
      (f.helpHours ? ' − hired ' + num(f.helpHours) + ' h' : '') + ' = family ' + num(f.familyNeed) + ' h of ' + cap + ' h they have.';
    box.appendChild(el('p', { class: 'fc-note' + (f.load > 1.15 ? ' warn-text' : ''), text: hoursText }));
    box.appendChild(hb);
    box.appendChild(el('p', { class: 'legend', 'aria-hidden': 'true' }, [
      el('span', null, [el('i', { style: 'background:var(--wood)' }), 'Farm work']),
      el('span', null, [el('i', { style: 'background:var(--sky-2)' }), 'Visitor work']),
      el('span', null, [el('i', { style: 'background:var(--tomato)' }), 'Family hours'])
    ]));
    if (f.shortage > 0) box.appendChild(el('p', { class: 'warn-text', text: 'Too much work! About ' + num(f.shortage) + ' hours of jobs will go undone: lost harvest and long lines.' }));

    // attractions
    var ul = el('ul', { class: 'fc-list' });
    s.plots.forEach(function (p, i) {
      if (!p) return;
      var x = f.attractions.filter(function (y) { return y.plot === i; })[0];
      var right = x && x.visitors > 0 ? num(x.visitors) + ' ' + A[p.id].unit + ' · ' + money(x.revenue) : plotStatus(i).status;
      ul.appendChild(el('li', null, [el('span', { text: A[p.id].name }), el('span', { text: right })]));
    });
    if (ul.children.length) box.appendChild(ul);
    box.appendChild(el('p', { class: 'fc-note', text: 'Forecast assumes typical weather (about ' + f.expectedRain.toFixed(1) + ' rained-out weekends this month). Game numbers only.' }));
  }

  function stat(k, v, sub, cls) {
    return el('div', { class: 'fc-stat' }, [el('span', { class: 'k', text: k }), el('span', { class: 'v ' + (cls || ''), text: v }), sub ? el('span', { class: 's', text: sub }) : null]);
  }

  function renderGroundwork() {
    var ul = clear($('gw-list'));
    Object.keys(G).forEach(function (id) {
      var g = G[id];
      var done = E.owned(s, id);
      var pending = id === 'zoning' && E.zoningPending(s);
      var can = E.canBuildGw(s, id);
      var right;
      if (done) right = el('span', { class: 'gw-status', text: 'Done ✓' });
      else if (pending) right = el('span', { class: 'gw-status', text: 'Approval in ' + Math.max(1, s.zoningReadyTurn - s.turn) + ' mo' });
      else right = el('button', {
        type: 'button', class: 'btn btn-small btn-gold', disabled: can.ok ? null : true,
        'aria-label': (g.cost ? 'Buy ' : 'Add ') + g.name + (g.cost ? ' for ' + money(g.cost) : ''),
        onclick: function () { doGw(id); }
      }, [g.cost ? money(g.cost) : 'Add']);
      var meta = (g.cost ? money(g.cost) + ' once' : 'No setup cost') + (g.upkeep ? ' · ' + money(g.upkeep) + '/mo' : '');
      ul.appendChild(el('li', { class: 'gw-item' + (done ? ' done' : '') }, [
        el('div', null, [el('div', { class: 'gw-name', text: g.name }), el('div', { class: 'gw-meta', text: meta })]),
        right,
        el('p', { class: 'gw-desc', text: g.blurb }),
        (!done && !pending && !can.ok) ? el('p', { class: 'gw-why', text: can.reason }) : null
      ]));
    });
  }

  function doGw(id) {
    var res = E.buildGw(s, id);
    if (!res.ok) { announce(res.reason); return; }
    save();
    announce((id === 'zoning' ? 'Applied for ' : 'Added ') + G[id].name + '. Cash now ' + money(s.cash) + '.');
    refreshPlan();
    renderMeters();
  }

  // ---------- build dialog ----------
  function peakFor(id) {
    var a = A[id], loc = D.LOCATIONS[s.location];
    var bonus = D.FARM_TYPES[s.farmType].bonus[id] || 1;
    var peak = a.draw * Math.max.apply(null, a.season) * bonus * (a.event ? loc.draw * loc.eventBonus : loc.draw);
    if (a.max) peak = Math.min(peak, a.max);
    return peak;
  }
  function riskLabel(r) { return r <= 1 ? 'Low' : r <= 3 ? 'Medium' : 'High'; }

  function attrFacts(id) {
    var a = A[id];
    var peak = peakFor(id);
    var rows = [
      ['Build', money(a.cost)], ['Upkeep', money(a.upkeep) + '/mo'], ['Open', E.seasonText(id)],
      ['Ready', a.establish ? a.establish + ' months after building' : 'Right away'],
      ['Peak month', '~' + num(peak) + ' ' + a.unit], ['Price', money(a.price) + ' each'],
      ['Work at peak', '~' + num(a.hours + a.hoursPer * peak) + ' h/mo'], ['Injury risk', riskLabel(a.risk)]
    ];
    if (a.requires.length) rows.push(['Needs', a.requires.map(function (r) { return G[r].name; }).join(', ')]);
    return el('dl', { class: 'facts' }, rows.map(function (r) { return el('div', null, [el('dt', { text: r[0] }), el('dd', { text: r[1] })]); }));
  }

  function openPlot(i) {
    if (s.phase !== 'plan') return;
    var d = $('build-dialog'), body = clear($('build-body'));
    var p = s.plots[i];
    $('build-title').textContent = 'Plot ' + (i + 1) + ' · ' + window.OTGScene.PLOT_NAMES[i];
    if (p) {
      var a = A[p.id], st = s.attrStats[p.id] || { revenue: 0, costs: 0, hours: 0, visitors: 0 };
      body.appendChild(el('h3', { class: 'attr-name', text: a.name }));
      body.appendChild(el('p', { class: 'attr-blurb', text: plotStatus(i).status + '. ' + a.blurb }));
      body.appendChild(attrFacts(p.id));
      body.appendChild(el('p', { text: 'So far: ' + num(st.visitors) + ' ' + a.unit + ', income ' + money(st.revenue) + ', running costs ' + money(st.costs) + ', ' + num(st.hours) + ' hours of work.' }));
      body.appendChild(el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn btn-plain', onclick: function () { closeDialog(d); } }, ['Keep it']),
        el('button', { type: 'button', class: 'btn btn-main', onclick: function () {
          confirmBox('Remove ' + a.name + '?', 'It will be cleared from plot ' + (i + 1) + '. You will not get the build cost back, but its upkeep stops.', 'Remove it').then(function (ok) {
            if (!ok) return;
            E.demolish(s, i); save(); closeDialog(d); announce(a.name + ' removed.'); refreshPlan();
          });
        } }, ['Remove (no refund)'])
      ]));
    } else {
      body.appendChild(el('p', { class: 'panel-sub', text: 'Cash ' + money(s.cash) + ' · the bank will lend down to ' + money(-R.creditLine) + '. Figures assume a 3-star farm and fair prices.' }));
      var ul = el('ul', { class: 'attr-list' });
      var ids = Object.keys(A);
      ids.forEach(function (id) {
        var a = A[id];
        var can = E.canBuild(s, id, i);
        var fit = D.FARM_TYPES[s.farmType].bonus[id] || 1;
        var tag = fit >= 1.15 ? el('span', { class: 'tag fit', text: 'Good fit for ' + D.FARM_TYPES[s.farmType].name }) :
          fit < 0.9 ? el('span', { class: 'tag', text: 'Weak fit' }) : null;
        var built = E.has(s, id);
        ul.appendChild(el('li', { class: 'attr' + (can.ok ? '' : ' blocked') }, [
          el('div', { class: 'attr-head' }, [el('h3', { class: 'attr-name', text: a.name }), tag]),
          el('p', { class: 'attr-blurb', text: a.blurb }),
          attrFacts(id),
          can.ok ? null : el('p', { class: 'why', text: built ? 'Already built.' : can.reason }),
          el('button', {
            type: 'button', class: 'btn btn-leaf' + (s.tutorial === 1 && id === 'stand' ? ' pulse' : ''), disabled: can.ok ? null : true,
            onclick: function () {
              var res = E.build(s, id, i);
              if (!res.ok) { announce(res.reason); return; }
              save(); closeDialog(d);
              announce('Built ' + a.name + ' on plot ' + (i + 1) + '. Cash now ' + money(s.cash) + '.');
              render();
            }
          }, ['Build for ' + money(a.cost)])
        ]));
      });
      body.appendChild(ul);
    }
    openDialog(d);
  }

  // ---------- results ----------
  function renderResults() {
    var r = s.lastResult, box = clear($('results'));
    if (!r) return;
    $('results-heading').textContent = E.monthLabel(r.turn) + ' — results';
    var rainTxt = r.closed ? 'The gate was closed this month.' :
      r.rain === 0 ? '☀ Dry weekends all month.' : '☔ ' + r.rain + ' of 4 weekends rained out.';
    box.appendChild(el('p', { class: 'weather-line', text: rainTxt }));
    if (r.incident) {
      var where = r.incident.where ? ' at the ' + A[r.incident.where].name : '';
      box.appendChild(el('div', { class: 'incident', role: 'note' }, [
        el('strong', { text: 'A visitor was hurt' + where + '. ' }),
        r.incident.covered ? 'Insurance covered it; you paid the ' + money(r.incident.cost) + ' deductible (the claim was ' + money(r.incident.raw) + ').' :
          'With no agritourism insurance you paid ' + money(r.incident.cost) + ' in medical and legal bills.'
      ]));
    }
    if (r.events && r.events.length) box.appendChild(el('ul', { class: 'events' }, r.events.map(function (e) { return el('li', { text: e }); })));

    var rows = [];
    rows.push(['section', 'Money in']);
    rows.push(['row', D.FARM_TYPES[s.farmType].name + ' crop sales' + (r.cropLost > 1 ? ' (' + money(r.cropLost) + ' lost to undone work)' : ''), r.crop]);
    r.attractions.forEach(function (x) {
      if (x.visitors <= 0) return;
      var own = x.id === 'stand' ? x.revenue - r.addOn : x.revenue;
      rows.push(['row', A[x.id].name + ' · ' + num(x.visitors) + ' ' + A[x.id].unit + (x.rainLoss > 5 ? ' (rain kept ' + num(x.rainLoss) + ' away)' : ''), own]);
    });
    if (r.addOn > 0) rows.push(['row', 'Farm Stand sales to other visitors', r.addOn]);
    rows.push(['section', 'Money out']);
    if (r.cogs) rows.push(['row', 'Cost of goods sold (produce, supplies)', -r.cogs]);
    if (r.upkeep) rows.push(['row', 'Attraction upkeep', -r.upkeep]);
    if (r.gwUpkeep) rows.push(['row', 'Groundwork upkeep (insurance, website…)', -r.gwUpkeep]);
    if (r.helpCost) rows.push(['row', 'Hired hands', -r.helpCost]);
    if (r.focusCost) rows.push(['row', 'Monthly focus: ' + D.FOCUS[r.focus].name, -r.focusCost]);
    rows.push(['row', 'Family living and farm overhead', -r.living]);
    if (r.interest) rows.push(['row', 'Interest on overdraft', -r.interest]);
    if (r.incident) rows.push(['row', 'Injury bills', -r.incident.cost]);
    rows.push(['total', 'Change in cash', r.net]);

    var tbody = el('tbody');
    rows.forEach(function (row) {
      if (row[0] === 'section') tbody.appendChild(el('tr', { class: 'section' }, [el('th', { colspan: '2', scope: 'colgroup', text: row[1] })]));
      else tbody.appendChild(el('tr', { class: row[0] === 'total' ? 'total' : '' }, [
        el(row[0] === 'total' ? 'th' : 'td', { text: row[1], scope: row[0] === 'total' ? 'row' : null }),
        el('td', { class: 'num ' + (row[2] < 0 ? 'neg' : row[2] > 0 ? 'pos' : ''), text: signedMoney(row[2]) })
      ]));
    });
    box.appendChild(el('table', null, [el('caption', { class: 'sr-only', text: 'Ledger for ' + E.monthLabel(r.turn) }), tbody]));

    // goal tracker
    var year = E.yearOf(r.turn);
    var ytd = E.yearProfit(s, year);
    var pct = Math.max(0, Math.min(100, ytd / R.goal * 100));
    box.appendChild(el('div', { class: 'goal-box' }, [
      el('div', { html: 'Visitor profit this month: <strong>' + signedMoney(r.visitorProfit) + '</strong><br>Year ' + year + ' so far: <strong>' + money(ytd) + '</strong> of the ' + money(R.goal) + ' goal' + (year < 3 ? ' (only year 3 counts for the ribbon)' : '') }),
      el('div', { class: 'progress', role: 'img', 'aria-label': Math.round(pct) + '% of the goal' }, [el('span', { style: 'width:' + pct + '%' })])
    ]));

    var chips = el('ul', { class: 'meter-changes', 'aria-label': 'Meter changes' });
    var prev = s.history.length > 1 ? s.history[s.history.length - 2] : null;
    chips.appendChild(chip('Stars ' + r.starsAfter.toFixed(1), r.starsDelta));
    chips.appendChild(chip('Stamina ' + Math.round(r.staminaAfter), r.staminaAfter - (prev ? prev.stamina : 90)));
    chips.appendChild(chip('Safety ' + Math.round(r.safetyAfter), r.safetyAfter - (prev ? prev.safety : 55)));
    box.appendChild(chips);
  }
  function chip(text, delta) {
    var cls = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : '';
    var arrow = delta > 0.05 ? ' ▲' : delta < -0.05 ? ' ▼' : '';
    return el('li', { class: 'chip ' + cls, text: text + arrow });
  }

  // ---------- dilemma card ----------
  function renderCard() {
    var v = E.cardView(s);
    var out = s.cardOutcome;
    if (!v && !out) { view = 'results'; render(); return; }
    var card = v || {};
    if (out) { var c = E.cardById(out.id); card = { title: c.title, text: typeof c.text === 'function' ? '' : c.text, choices: [] }; }
    $('card-heading').textContent = card.title;
    $('card-text').textContent = card.text;
    var ch = clear($('card-choices'));
    var oc = $('card-outcome');
    if (!out) {
      v.choices.forEach(function (c) {
        ch.appendChild(el('button', {
          type: 'button', class: 'btn btn-plain', disabled: c.available ? null : true,
          onclick: function () { choose(c.index); }
        }, [c.label + (c.available ? '' : ' (not possible right now)')]));
      });
      oc.hidden = true;
    } else {
      ch.appendChild(el('p', null, [el('strong', { text: 'You chose: ' }), out.label]));
      clear(oc).hidden = false;
      if (out.result) oc.appendChild(el('p', { class: 'result', text: out.result }));
      if (out.effects.length) oc.appendChild(el('ul', { class: 'meter-changes' }, out.effects.map(function (e) { return el('li', { class: 'chip', text: e }); })));
      oc.appendChild(el('div', { class: 'lesson' }, [el('strong', { text: 'Lesson: ' }), out.lesson]));
    }
  }

  function choose(i) {
    var out = E.chooseCard(s, i);
    if (!out) return;
    save();
    render();
    var oc = $('card-outcome');
    if (oc) { oc.setAttribute('tabindex', '-1'); oc.focus({ preventScroll: false }); }
  }

  // ---------- main action ----------
  function renderAction() {
    var b = $('btn-main'), hint = $('action-hint');
    b.disabled = animating;
    b.classList.toggle('pulse', s.phase === 'plan' && s.tutorial === 3);
    if (animating) { b.textContent = 'Visitors arriving…'; hint.textContent = ''; return; }
    if (s.phase === 'plan') {
      b.textContent = s.burnoutNext ? 'Rest this month' : 'Open the gate';
      var f = E.forecast(s);
      hint.textContent = s.burnoutNext ? 'The family needs a month off.' :
        'Forecast: ' + num(f.visitors) + ' visitors, ' + signedMoney(f.visitorProfit) + ' visitor profit';
    } else if (s.phase === 'results') {
      if (view === 'results') {
        var more = s.pendingCard && !s.cardOutcome;
        b.textContent = more ? 'Next: a decision' : (s.gameOver || s.turn >= R.turns ? 'See your ribbon' : 'Next month');
        hint.textContent = more ? 'Something needs your answer.' : '';
      } else {
        b.textContent = s.cardOutcome ? (s.gameOver || s.turn >= R.turns ? 'See your ribbon' : 'Next month') : 'Choose an answer above';
        b.disabled = !s.cardOutcome;
        hint.textContent = '';
      }
    }
  }

  function onMain() {
    if (animating) return;
    if (s.phase === 'plan') return runMonth();
    if (s.phase === 'results') {
      if (view === 'results' && s.pendingCard && !s.cardOutcome) {
        view = 'card'; render(); focusPanel('card-panel'); return;
      }
      if (s.pendingCard && !s.cardOutcome) return;
      E.nextMonth(s);
      save();
      if (s.phase === 'ended') { showEnd(); return; }
      view = 'plan';
      render();
      window.scrollTo(0, 0);
      $('main').focus({ preventScroll: true });
      announce(E.monthLabel(s.turn) + '. ' + E.mentorTip(s).text);
    }
  }

  function runMonth() {
    var r = E.openGate(s);
    if (!r) return;
    save();
    var finish = function () {
      animating = false;
      $('btn-skip-anim').hidden = true;
      $('anim-caption').hidden = true;
      view = 'results';
      render();
      focusPanel('results-panel');
    };
    if (reduceMotion || !scene) { finish(); return; }
    animating = true;
    renderMeters(); renderAction();
    $('btn-skip-anim').hidden = false;
    var cap = $('anim-caption');
    cap.hidden = false;
    // on small screens make sure the scene is visible while it plays
    var wrap = document.querySelector('.scene-wrap');
    if (wrap.getBoundingClientRect().top < 0) wrap.scrollIntoView({ block: 'start', behavior: 'auto' });
    scene.animate(s, r, finish, function (t) {
      cap.textContent = r.closed ? 'Gate closed this month' : num(r.visitors * Math.min(1, t * 1.25)) + ' visitors';
    });
  }

  function focusPanel(id) {
    var p = $(id);
    if (!p) return;
    p.focus({ preventScroll: true });
    if (window.innerWidth < 960) p.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // ---------- end ----------
  var RIBBON_COLORS = [['#1f5fd6', '#123f99', '1ST'], ['#d8402c', '#a12a19', '2ND'], ['#f4f1e8', '#c9c1ad', '3RD'], ['#3f8f3a', '#2c6b29', 'HM']];

  function ribbonSvg(tier) {
    var c = RIBBON_COLORS[tier], ink = tier === 2 ? '#1b1f3a' : '#fff';
    var petals = '';
    for (var i = 0; i < 16; i++) {
      var a = i / 16 * Math.PI * 2;
      petals += '<circle cx="' + (75 + Math.cos(a) * 46).toFixed(1) + '" cy="' + (70 + Math.sin(a) * 46).toFixed(1) + '" r="18" fill="' + c[1] + '"/>';
    }
    return '<svg viewBox="0 0 150 190" role="img" aria-label="' + ['Blue', 'Red', 'White', 'Honorable Mention'][tier] + ' ribbon">' +
      '<path d="M50 100 L30 185 L52 170 L68 188 L75 110 Z" fill="' + c[0] + '" stroke="#1b1f3a" stroke-width="3"/>' +
      '<path d="M100 100 L120 185 L98 170 L82 188 L75 110 Z" fill="' + c[0] + '" stroke="#1b1f3a" stroke-width="3"/>' +
      petals + '<circle cx="75" cy="70" r="46" fill="' + c[0] + '" stroke="#1b1f3a" stroke-width="3"/>' +
      '<circle cx="75" cy="70" r="34" fill="#f2b632" stroke="#1b1f3a" stroke-width="3"/>' +
      '<text x="75" y="80" text-anchor="middle" font-family="Alfa Slab One, Georgia, serif" font-size="26" fill="' + (tier === 2 ? '#1b1f3a' : '#1b1f3a') + '">' + c[2] + '</text></svg>';
  }

  function showEnd() {
    var rep = E.endReport(s);
    showScreen('screen-end');
    var box = clear($('end'));
    var headline = rep.gameOver === 'bank' ? 'The bank closed the gate after ' + rep.monthsPlayed + ' months.' :
      'Year-3 visitor profit: ' + money(rep.y3) + ' (goal ' + money(rep.goal) + ').';
    var hero = el('div', { class: 'end-hero' }, [
      el('div', { class: 'ribbon', html: ribbonSvg(rep.tier) }),
      el('h2', { id: 'end-heading', tabindex: '-1', text: s.farmName + ' — ' + rep.ribbon }),
      el('p', { text: 'County fair judging, ' + D.FARM_TYPES[s.farmType].name + ' farm, ' + D.LOCATIONS[s.location].name.toLowerCase() + '.' }),
      el('p', null, [el('strong', { text: headline })]),
      rep.reason ? el('p', { text: rep.reason }) : null
    ]);
    box.appendChild(hero);

    var yr = el('div', { class: 'year-row' }, rep.years.map(function (v, i) {
      return stat('Year ' + (i + 1) + ' visitor profit', money(v), i === 2 ? (v >= rep.goal ? 'Goal met' : 'Goal ' + money(rep.goal)) : null, v < 0 ? 'bad' : (i === 2 && v >= rep.goal ? 'good' : ''));
    }));
    var panel1 = el('section', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: 'How the farm did' }), yr,
      el('div', { class: 'fc-grid' }, [
        stat('Visitors welcomed', num(rep.totalVisitors)), stat('Cash at the end', money(rep.cash)),
        stat('Star rating', rep.stars.toFixed(1) + ' / 5'), stat('Family Stamina', String(rep.stamina)),
        stat('Spent on building', money(rep.capital)), stat('Burnout months', String(rep.burnouts), null, rep.burnouts ? 'bad' : 'good')
      ])
    ]);
    box.appendChild(panel1);

    // attraction table
    var thead = el('thead', null, [el('tr', null, ['Attraction', 'Visitors', 'Income', 'Running costs', 'Hours', 'Profit', 'Profit / hour', 'Build cost'].map(function (h) { return el('th', { scope: 'col', text: h }); }))]);
    var tbody = el('tbody', null, rep.rows.map(function (r) {
      return el('tr', null, [
        el('th', { scope: 'row', text: r.name }), el('td', { text: num(r.visitors) }), el('td', { text: money(r.revenue) }),
        el('td', { text: money(r.costs) }), el('td', { text: num(r.hours) }), el('td', { text: money(r.profit) }),
        el('td', { text: r.perHour == null ? '—' : money(r.perHour) }), el('td', { text: money(r.build) })
      ]);
    }));
    var panel2 = el('section', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: 'Every attraction, all three years' }),
      el('p', { class: 'panel-sub', text: 'Running costs include goods sold, upkeep and a share of hired help by hours worked. Build costs are shown separately.' }),
      rep.rows.length ? el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Attraction results table' }, [el('table', { class: 'report-table' }, [thead, tbody])]) : el('p', { text: 'You never opened an attraction.' }),
      rep.best ? el('p', null, [el('strong', { text: 'Best earner per hour: ' }), rep.best.name + ' at ' + money(rep.best.perHour) + ' an hour.']) : null,
      rep.worst ? el('p', null, [el('strong', { text: 'Worst earner per hour: ' }), rep.worst.name + ' at ' + money(rep.worst.perHour) + ' an hour.']) : null
    ]);
    box.appendChild(panel2);

    var panel3 = el('section', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: 'Lessons in your notebook (' + rep.lessons.length + ')' }),
      rep.lessons.length ? el('ol', { class: 'lessons' }, rep.lessons.map(function (l) { return el('li', null, [el('strong', { text: l.title + ' — ' }), l.lesson]); })) : el('p', { text: 'No lessons collected this time.' })
    ]);
    box.appendChild(panel3);
    box.appendChild(el('p', { class: 'disclaimer', text: 'All figures are game numbers, not real benchmarks or financial advice. Legal topics are general; check your own local and state rules, and talk to your insurer, extension office and planning department.' }));
    box.appendChild(el('div', { class: 'end-actions' }, [
      el('button', { type: 'button', class: 'btn btn-main', onclick: function () { store.clear(); s = null; buildSetup(); showScreen('screen-setup'); } }, ['Play again']),
      el('button', { type: 'button', class: 'btn btn-plain', onclick: function () { initTitle(); } }, ['Back to title'])
    ]));
    $('end-heading').focus();
  }

  // ---------- wiring ----------
  function init() {
    buildSetup();
    $('btn-new').addEventListener('click', function () {
      var saved = store.load();
      var go = function () { buildSetup(); showScreen('screen-setup'); $('farm-name').focus(); };
      if (saved && saved.phase !== 'ended') confirmBox('Start a new farm?', 'This replaces the farm you have saved.', 'Start new').then(function (ok) { if (ok) go(); });
      else go();
    });
    $('btn-continue').addEventListener('click', function () { s = store.load(); if (s) enterGame(); else initTitle(); });
    $('btn-setup-back').addEventListener('click', initTitle);
    $('setup-form').addEventListener('submit', startNew);
    $('btn-howto').addEventListener('click', function () { openDialog($('help-dialog')); });
    $('btn-help').addEventListener('click', function () { openDialog($('help-dialog')); });
    $('btn-main').addEventListener('click', onMain);
    $('btn-skip-anim').addEventListener('click', function () { if (scene) scene.skip(); });
    $('btn-skip-tour').addEventListener('click', function () { s.tutorial = 0; save(); render(); });
    $('help-minus').addEventListener('click', function () { E.setPlan(s, { help: s.plan.help - 1 }); save(); refreshPlan(); });
    $('help-plus').addEventListener('click', function () { E.setPlan(s, { help: s.plan.help + 1 }); save(); refreshPlan(); });
    // close dialogs by clicking the backdrop
    ['build-dialog', 'help-dialog'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === e.currentTarget) closeDialog(e.currentTarget); });
    });
    var resizeT = 0;
    window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(function () { if (s && !animating) drawScene(); }, 120); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && animating && scene) scene.skip(); });
    initTitle();
  }

  // exposed for automated browser checks
  window.OTGUI = { state: function () { return s; } };
  init();
})();
