#!/usr/bin/env node
/*
 * Optional browser playthrough. Needs Playwright (not a project dependency):
 *   node tools/browser-check.js [outDir]
 * Serves the folder, plays a full 36-month game through the page's own buttons
 * at desktop and phone sizes, saves screenshots, and fails on any page error.
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var chromium = require('playwright').chromium;
var ROOT = path.join(__dirname, '..');
var OUT = process.argv[2] || path.join(ROOT, 'tools', 'screens');
var TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (p.endsWith('/')) p += 'index.html';
      fs.readFile(p, function (err, buf) {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
        res.end(buf);
      });
    }).listen(0, function () { resolve(srv); });
  });
}

// what to build, by month index, through the UI
var BUILD_PLAN = {
  0: [['gw', 'Agritourism insurance'], ['gw', 'Waivers and warning signs']],
  1: [['attr', 'Corn Maze', 2], ['gw', 'Seasonal help (payroll set up)']],
  2: [['attr', 'Pumpkin Patch', 3], ['gw', 'Website and listings']],
  4: [['gw', 'Gravel parking lot'], ['gw', 'Email list']],
  6: [['attr', 'Hayrides', 4], ['gw', 'Restrooms']],
  8: [['attr', 'Christmas Trees', 5], ['gw', 'Online booking']],
  14: [['attr', 'Workshops', 6], ['gw', 'Overflow field and attendants']],
  15: [['attr', 'U-Pick', 7]]
};

async function playthrough(browser, base, label, viewport) {
  var ctx = await browser.newContext({ viewport: viewport, deviceScaleFactor: viewport.width < 600 ? 2 : 1, hasTouch: viewport.width < 600 });
  var page = await ctx.newPage();
  var errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });
  page.on('console', function (m) { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + '/index.html');
  await page.screenshot({ path: path.join(OUT, label + '-01-title.png'), fullPage: true });
  await page.click('#btn-new');
  await page.fill('#farm-name', 'Loke Family Farm');
  await page.click('label[for="c-farmType-grain"]');
  await page.click('label[for="c-location-town"]');
  await page.screenshot({ path: path.join(OUT, label + '-02-setup.png'), fullPage: true });
  await page.click('#setup-form button[type=submit]');
  await page.waitForSelector('#screen-game:not([hidden])');
  await page.screenshot({ path: path.join(OUT, label + '-03-month1.png'), fullPage: true });

  // tutorial: tap plot 1 on the map itself, build the stand, pick a focus, open the gate
  var box = await page.locator('#scene').boundingBox();
  await page.mouse.click(box.x + box.width * 0.36, box.y + box.height * 0.80);
  await page.waitForSelector('#build-dialog[open]');
  await page.screenshot({ path: path.join(OUT, label + '-04-build-dialog.png') });
  await page.locator('#build-body .attr', { hasText: 'Farm Stand' }).locator('button').click();
  await page.click('label[for="c-focus-promote"]');

  for (var m = 0; m < 36; m++) {
    var phase = await page.evaluate(function () { return window.OTGUI.state().phase; });
    if (phase === 'ended') break;
    var steps = BUILD_PLAN[m] || [];
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st[0] === 'gw') {
        var btn = page.locator('#gw-list button[aria-label^="Buy ' + st[1] + ' for"], #gw-list button[aria-label="Add ' + st[1] + '"]');
        if (await btn.count() && await btn.isEnabled()) await btn.click();
      } else {
        await page.locator('#plot-list .plot-btn').nth(st[2]).click();
        await page.waitForSelector('#build-dialog[open]');
        var b = page.locator('#build-body .attr', { hasText: st[1] }).locator('button');
        if (await b.isEnabled()) await b.click(); else await page.click('#build-dialog .btn-close');
      }
    }
    // simple monthly judgment through the UI
    var info = await page.evaluate(function () {
      var s = window.OTGUI.state(), f = window.OTG.forecast(s);
      return { stamina: s.stamina, load: f.load, help: s.plan.help, payroll: !!s.gw.payroll, safety: s.safety, visitors: f.visitors };
    });
    var focus = info.stamina < 45 ? 'rest' : info.safety < 50 ? 'tidy' : info.visitors > 250 ? 'promote' : 'rest';
    await page.click('label[for="c-focus-' + focus + '"]');
    for (var k = 0; k < 4 && info.payroll; k++) {
      info = await page.evaluate(function () { var s = window.OTGUI.state(), f = window.OTG.forecast(s); return { load: f.load, help: s.plan.help, payroll: true }; });
      if (info.load > 1.05 && info.help < 3) await page.click('#help-plus');
      else if (info.load < 0.6 && info.help > 0) await page.click('#help-minus');
      else break;
    }
    if (m === 7) await page.screenshot({ path: path.join(OUT, label + '-05-october-plan.png'), fullPage: true });
    await page.click('#btn-main');
    if (m === 7) { await page.waitForTimeout(1500); await page.screenshot({ path: path.join(OUT, label + '-06-animation.png') }); }
    if (m % 2 === 1 && await page.isVisible('#btn-skip-anim')) await page.click('#btn-skip-anim');
    await page.waitForSelector('#view-results:not([hidden])', { timeout: 10000 });
    if (m === 7) await page.screenshot({ path: path.join(OUT, label + '-07-results.png'), fullPage: true });
    var txt = await page.textContent('#btn-main');
    if (/decision/.test(txt)) {
      await page.click('#btn-main');
      await page.waitForSelector('#view-card:not([hidden])');
      if (m < 12) await page.screenshot({ path: path.join(OUT, label + '-08-card-' + m + '.png'), fullPage: true });
      await page.locator('#card-choices button:not([disabled])').first().click();
      await page.waitForSelector('#card-outcome:not([hidden])');
    }
    await page.click('#btn-main');
    if (m === 18) {
      // reload mid-game: the save should bring us back
      await page.reload();
      await page.click('#btn-continue');
      await page.waitForSelector('#screen-game:not([hidden])');
    }
  }
  await page.waitForSelector('#screen-end:not([hidden])');
  await page.screenshot({ path: path.join(OUT, label + '-09-end.png'), fullPage: true });
  var ribbon = await page.textContent('#end-heading');
  // no horizontal scroll on the page
  var overflow = await page.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; });
  await ctx.close();
  return { label: label, ribbon: ribbon, errors: errors, overflow: overflow };
}

(async function () {
  fs.mkdirSync(OUT, { recursive: true });
  var srv = await serve();
  var base = 'http://localhost:' + srv.address().port;
  var browser = await chromium.launch();
  var results = [];
  try {
    results.push(await playthrough(browser, base, 'desktop', { width: 1280, height: 860 }));
    results.push(await playthrough(browser, base, 'phone', { width: 390, height: 844 }));
  } finally {
    await browser.close();
    srv.close();
  }
  var bad = false;
  results.forEach(function (r) {
    console.log(r.label + ': ' + r.ribbon + ' | horizontal overflow ' + r.overflow + 'px | errors: ' + (r.errors.length ? r.errors.join('; ') : 'none'));
    if (r.errors.length || r.overflow > 0) bad = true;
  });
  console.log('Screenshots in ' + OUT);
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
