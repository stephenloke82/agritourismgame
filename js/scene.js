/*
 * Open the Gate — canvas farm scene.
 * Drawing only: reads game state, never changes it.
 */
(function (root) {
  'use strict';
  var W = 960, H = 600;
  var Y_TOP = 252, Y_BOT = 522, CX = 480;
  var DISPLAY_FONT = '"Alfa Slab One", "Rockwell", "Roboto Slab", Georgia, serif';

  // Ten plots in ground coordinates: [u0, u1, v0, v1]  (u: -1 left .. 1 right, v: 0 back .. 1 front)
  // Columns across the field, then rows from the gate back toward the barn.
  var COLS = [[-0.97, -0.57], [-0.49, -0.11], [0.11, 0.49], [0.57, 0.97]];
  var ROWS = { middle: [0.56, 0.71], back: [0.37, 0.52], far: [0.19, 0.33], top: [0.02, 0.15] };
  // Plots 0-9 are the starting farm; 10-17 are fields you can buy.
  var PLOTS = [[-0.47, -0.11, 0.75, 0.97], [0.11, 0.47, 0.75, 0.97]];
  ['middle', 'back', 'far', 'top'].forEach(function (row) {
    COLS.forEach(function (c) { PLOTS.push([c[0], c[1], ROWS[row][0], ROWS[row][1]]); });
  });
  var SIDES = ['far left', 'left', 'right', 'far right'];
  var PLOT_NAMES = ['By the gate, left', 'By the gate, right'];
  ['Middle row', 'Back row', 'Far field', 'Top field'].forEach(function (row) {
    SIDES.forEach(function (side) { PLOT_NAMES.push(row + ', ' + side); });
  });
  // draw from the back of the field to the front so nearer things overlap farther ones
  var DRAW_ORDER = [14, 15, 16, 17, 10, 11, 12, 13, 6, 7, 8, 9, 2, 3, 4, 5, 0, 1];

  function proj(u, v) {
    var half = 250 + 232 * v;
    return { x: CX + u * half, y: Y_TOP + (Y_BOT - Y_TOP) * v, k: 0.62 + 0.38 * v };
  }
  function quad(p) {
    return [proj(p[0], p[2]), proj(p[1], p[2]), proj(p[1], p[3]), proj(p[0], p[3])];
  }
  function center(p) { return proj((p[0] + p[1]) / 2, (p[2] + p[3]) / 2); }

  function season(cm) {
    if (cm === 11 || cm <= 1) return 'winter';
    if (cm <= 4) return 'spring';
    if (cm <= 7) return 'summer';
    return 'fall';
  }
  var PALETTE = {
    winter: { grass: '#e3ebe6', grass2: '#cdd9d3', field: '#d6dcd6', rows: '#b9c4bd', hill: '#7f9bbd', hill2: '#5d7fa9', leaf: null },
    spring: { grass: '#8cc65a', grass2: '#76b24a', field: '#a07a4e', rows: '#7fbf4f', hill: '#4f9a52', hill2: '#3a7d45', leaf: '#6fbf4a' },
    summer: { grass: '#57a23d', grass2: '#4a9134', field: '#5fa843', rows: '#3f8a30', hill: '#3f8a46', hill2: '#2f7139', leaf: '#3f8f3a' },
    fall: { grass: '#b3a640', grass2: '#a0943a', field: '#d9a13a', rows: '#b07a28', hill: '#a8752f', hill2: '#7f5a2a', leaf: '#e07a2a' }
  };

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }
  function rect(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  function tri(ctx, x, y, w, h, fill) {
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x - w / 2, y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }
  // seeded jitter so drawings don't shimmer between frames
  function jit(i, j) { var x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); }

  // ---------- backdrop ----------
  function drawSky(ctx, rainy) {
    var g = ctx.createLinearGradient(0, 0, 0, Y_TOP);
    g.addColorStop(0, rainy ? '#2b3a78' : '#1b36a8');
    g.addColorStop(1, rainy ? '#56679e' : '#3d63d6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Y_TOP + 4);
    // gold sunburst behind the barn
    var sx = CX, sy = 205;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, Y_TOP); ctx.clip();
    var rays = 28;
    for (var i = 0; i < rays; i++) {
      var a0 = Math.PI + (i / rays) * Math.PI, a1 = Math.PI + ((i + 0.5) / rays) * Math.PI;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a0) * 900, sy + Math.sin(a0) * 900);
      ctx.lineTo(sx + Math.cos(a1) * 900, sy + Math.sin(a1) * 900);
      ctx.closePath();
      ctx.fillStyle = rainy ? 'rgba(200,200,220,0.10)' : (i % 2 ? '#2f55d4' : '#2a4cc4');
      ctx.fill();
    }
    circle(ctx, sx, sy, 92, rainy ? 'rgba(220,220,235,0.35)' : '#ffd25a');
    circle(ctx, sx, sy, 74, rainy ? 'rgba(235,235,245,0.35)' : '#ffe08a');
    ctx.restore();
  }

  function drawHills(ctx, pal) {
    ctx.fillStyle = pal.hill2;
    ctx.beginPath(); ctx.moveTo(0, Y_TOP);
    for (var x = 0; x <= W; x += 40) ctx.lineTo(x, Y_TOP - 38 - 26 * Math.sin(x / 130) - 12 * Math.sin(x / 47));
    ctx.lineTo(W, Y_TOP); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.hill;
    ctx.beginPath(); ctx.moveTo(0, Y_TOP + 2);
    for (x = 0; x <= W; x += 40) ctx.lineTo(x, Y_TOP - 14 - 16 * Math.sin(x / 90 + 2) - 6 * Math.sin(x / 33));
    ctx.lineTo(W, Y_TOP + 2); ctx.closePath(); ctx.fill();
  }

  function drawTree(ctx, x, y, s, pal, sea) {
    rect(ctx, x - 3 * s, y - 16 * s, 6 * s, 16 * s, '#6b4526');
    if (sea === 'winter') {
      ctx.strokeStyle = '#6b4526'; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(x, y - 16 * s); ctx.lineTo(x - 10 * s, y - 34 * s);
      ctx.moveTo(x, y - 18 * s); ctx.lineTo(x + 11 * s, y - 32 * s); ctx.moveTo(x, y - 14 * s); ctx.lineTo(x + 2 * s, y - 38 * s); ctx.stroke();
      return;
    }
    circle(ctx, x, y - 30 * s, 17 * s, pal.leaf);
    circle(ctx, x - 9 * s, y - 24 * s, 11 * s, pal.leaf);
    circle(ctx, x + 10 * s, y - 25 * s, 12 * s, pal.leaf);
  }

  function drawBarn(ctx, name) {
    var x = 392, y = 128, w = 176, h = 120;
    // gambrel roof
    ctx.fillStyle = '#5b2a20';
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 40); ctx.lineTo(x + 22, y + 4); ctx.lineTo(x + w / 2, y - 22);
    ctx.lineTo(x + w - 22, y + 4); ctx.lineTo(x + w + 10, y + 40); ctx.closePath(); ctx.fill();
    rect(ctx, x, y + 38, w, h - 38, '#d8402c');
    // vertical boards
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    for (var i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(x + i * w / 12, y + 40); ctx.lineTo(x + i * w / 12, y + h); ctx.stroke(); }
    // door with X
    var dx = x + w / 2 - 30, dy = y + 72, dw = 60, dh = h - 72;
    rect(ctx, dx, dy, dw, dh, '#b5321f');
    ctx.strokeStyle = '#fff6e3'; ctx.lineWidth = 4;
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy + dh); ctx.moveTo(dx + dw, dy); ctx.lineTo(dx, dy + dh); ctx.stroke();
    // hayloft
    rect(ctx, x + w / 2 - 14, y + 8, 28, 24, '#3a1a12');
    ctx.strokeStyle = '#fff6e3'; ctx.lineWidth = 3; ctx.strokeRect(x + w / 2 - 14, y + 8, 28, 24);
    // name board
    var bx = x + 10, by = y + 42, bw = w - 20, bh = 26;
    rect(ctx, bx, by, bw, bh, '#fff6e3');
    ctx.strokeStyle = '#1b1f3a'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#1b1f3a';
    var size = 18;
    ctx.font = size + 'px ' + DISPLAY_FONT;
    var label = (name || '').toUpperCase();
    while (ctx.measureText(label).width > bw - 10 && size > 8) { size--; ctx.font = size + 'px ' + DISPLAY_FONT; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, by + bh / 2 + 1);
    // silo
    rect(ctx, x + w + 14, y + 10, 34, h - 10, '#c9cfd6');
    ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(x + w + 31, y + 10, 17, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for (i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + w + 14, y + 10 + i * 20); ctx.lineTo(x + w + 48, y + 10 + i * 20); ctx.stroke(); }
  }

  function drawGround(ctx, pal, sea) {
    var g = ctx.createLinearGradient(0, Y_TOP, 0, H);
    g.addColorStop(0, pal.grass2); g.addColorStop(1, pal.grass);
    ctx.fillStyle = g; ctx.fillRect(0, Y_TOP, W, H - Y_TOP);
    // lane from gate to barn
    var lane = [proj(-0.07, -0.02), proj(0.07, -0.02), proj(0.08, 1.04), proj(-0.08, 1.04)];
    poly(ctx, lane); ctx.fillStyle = sea === 'winter' ? '#c9c2b3' : '#c7a873'; ctx.fill();
    // road
    rect(ctx, 0, 538, W, 62, '#4a4a55');
    rect(ctx, 0, 536, W, 4, '#8a8576');
    ctx.fillStyle = '#f2b632';
    for (var x = 10; x < W; x += 70) ctx.fillRect(x, 566, 36, 5);
  }

  function drawGate(ctx, open) {
    rect(ctx, 432, 470, 10, 72, '#6b4526');
    rect(ctx, 518, 470, 10, 72, '#6b4526');
    rect(ctx, 426, 462, 108, 18, '#6b4526');
    ctx.fillStyle = '#fff6e3'; ctx.font = '12px ' + DISPLAY_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(open ? 'OPEN' : 'WELCOME', 480, 472);
    // fence along the road
    ctx.strokeStyle = '#fff6e3'; ctx.lineWidth = 3;
    [[10, 426], [534, 950]].forEach(function (seg) {
      ctx.beginPath(); ctx.moveTo(seg[0], 520); ctx.lineTo(seg[1], 520); ctx.moveTo(seg[0], 530); ctx.lineTo(seg[1], 530); ctx.stroke();
      for (var x = seg[0]; x <= seg[1]; x += 30) rect(ctx, x - 2, 512, 4, 24, '#fff6e3');
    });
    if (!open) {
      ctx.strokeStyle = '#fff6e3'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(444, 500); ctx.lineTo(516, 500); ctx.moveTo(444, 516); ctx.lineTo(516, 516);
      ctx.moveTo(444, 500); ctx.lineTo(516, 516); ctx.stroke();
    }
  }

  // ---------- plots ----------
  function drawEmptyPlot(ctx, q, pal, sea, i) {
    poly(ctx, q); ctx.fillStyle = pal.field; ctx.fill();
    ctx.strokeStyle = pal.rows; ctx.lineWidth = 2;
    for (var r = 1; r < 6; r++) {
      var t = r / 6;
      ctx.beginPath();
      ctx.moveTo(q[0].x + (q[3].x - q[0].x) * t, q[0].y + (q[3].y - q[0].y) * t);
      ctx.lineTo(q[1].x + (q[2].x - q[1].x) * t, q[1].y + (q[2].y - q[1].y) * t);
      ctx.stroke();
    }
  }

  function drawForSale(ctx, q, pal, i) {
    poly(ctx, q); ctx.fillStyle = pal.grass2; ctx.fill();
    // wild tufts
    ctx.fillStyle = pal.hill;
    for (var t = 0; t < 10; t++) {
      var a = jit(i, t + 20), b = jit(t + 20, i);
      var lx = q[0].x + (q[3].x - q[0].x) * (0.15 + 0.7 * a), rx = q[1].x + (q[2].x - q[1].x) * (0.15 + 0.7 * a);
      var y = q[0].y + (q[3].y - q[0].y) * (0.15 + 0.7 * a), x = lx + (rx - lx) * (0.1 + 0.8 * b);
      ctx.beginPath(); ctx.arc(x, y, 3, Math.PI, 0); ctx.fill();
    }
    ctx.save(); poly(ctx, q); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,246,227,0.8)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }

  function signPost(ctx, x, y, k, text, bg) {
    ctx.font = Math.round(11 * k) + 'px ' + DISPLAY_FONT;
    var w = ctx.measureText(text).width + 12 * k, h = 16 * k;
    rect(ctx, x - 1.5 * k, y - h, 3 * k, h + 6 * k, '#6b4526');
    rect(ctx, x - w / 2, y - h - 12 * k, w, h, bg || '#fff6e3');
    ctx.strokeStyle = '#1b1f3a'; ctx.lineWidth = 1.2; ctx.strokeRect(x - w / 2, y - h - 12 * k, w, h);
    ctx.fillStyle = '#1b1f3a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2 - 12 * k + 1);
  }

  var DRAW = {
    stand: function (ctx, c, k) {
      var w = 78 * k, h = 34 * k, x = c.x - w / 2, y = c.y - h / 2 + 6 * k;
      rect(ctx, x, y, w, h, '#c8955a');
      for (var i = 0; i < 6; i++) rect(ctx, x + i * w / 6, y - 16 * k, w / 6, 16 * k, i % 2 ? '#fff6e3' : '#e2452f');
      ctx.fillStyle = '#e2452f'; ctx.beginPath();
      for (i = 0; i < 6; i++) { ctx.moveTo(x + i * w / 6, y); ctx.arc(x + (i + 0.5) * w / 6, y, w / 12, 0, Math.PI); }
      ctx.fill();
      ['#e2452f', '#f2b632', '#3f8f3a', '#e07a2a'].forEach(function (col, j) {
        rect(ctx, x + 5 * k + j * 18 * k, y + 12 * k, 15 * k, 10 * k, '#8a5a2b');
        for (var b = 0; b < 3; b++) circle(ctx, x + 9 * k + j * 18 * k + b * 4 * k, y + 11 * k, 3 * k, col);
      });
    },
    upick: function (ctx, c, k, q, sea) {
      for (var r = 0; r < 4; r++) {
        for (var b = 0; b < 6; b++) {
          var t = (r + 0.5) / 4, s = (b + 0.5) / 6;
          var lx = q[0].x + (q[3].x - q[0].x) * t, ly = q[0].y + (q[3].y - q[0].y) * t;
          var rx = q[1].x + (q[2].x - q[1].x) * t;
          var x = lx + (rx - lx) * s, y = ly;
          circle(ctx, x, y, 8 * k, sea === 'winter' ? '#9aa79f' : '#2f7a2f');
          if (sea === 'summer' || sea === 'fall' || sea === 'spring') {
            circle(ctx, x - 3 * k, y - 2 * k, 2.2 * k, sea === 'spring' ? '#fff6e3' : '#e2452f');
            circle(ctx, x + 3 * k, y + 1 * k, 2.2 * k, sea === 'spring' ? '#fff6e3' : '#e2452f');
          }
        }
      }
    },
    pumpkin: function (ctx, c, k, q, sea) {
      poly(ctx, q); ctx.fillStyle = sea === 'winter' ? '#cdd6cf' : '#4f8f37'; ctx.fill();
      if (sea === 'fall' || sea === 'summer') {
        for (var i = 0; i < 18; i++) {
          var t = jit(i, 1), s = jit(i, 2);
          var lx = q[0].x + (q[3].x - q[0].x) * (0.15 + 0.7 * t), rx = q[1].x + (q[2].x - q[1].x) * (0.15 + 0.7 * t);
          var y = q[0].y + (q[3].y - q[0].y) * (0.15 + 0.7 * t);
          var x = lx + (rx - lx) * (0.1 + 0.8 * s);
          var r = (sea === 'fall' ? 6 : 3) * k;
          ctx.beginPath(); ctx.ellipse(x, y, r * 1.25, r, 0, 0, Math.PI * 2); ctx.fillStyle = sea === 'fall' ? '#e8761f' : '#9cbf3a'; ctx.fill();
          rect(ctx, x - 1, y - r - 3 * k, 2, 3 * k, '#3a5a1f');
        }
      }
    },
    maze: function (ctx, c, k, q, sea) {
      poly(ctx, q); ctx.fillStyle = sea === 'winter' ? '#d6d2bf' : sea === 'fall' ? '#d8b23a' : sea === 'spring' ? '#8cc65a' : '#3f8f3a'; ctx.fill();
      ctx.save(); poly(ctx, q); ctx.clip();
      ctx.strokeStyle = sea === 'winter' ? '#bdb59c' : '#a77b2a'; ctx.lineWidth = 3 * k;
      for (var i = 0; i < 7; i++) {
        var t = (i + 0.5) / 7;
        var a = { x: q[0].x + (q[3].x - q[0].x) * t, y: q[0].y + (q[3].y - q[0].y) * t };
        var b = { x: q[1].x + (q[2].x - q[1].x) * t, y: q[1].y + (q[2].y - q[1].y) * t };
        var s0 = jit(i, 3) * 0.4, s1 = 0.55 + jit(i, 4) * 0.4;
        ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * s0, a.y); ctx.lineTo(a.x + (b.x - a.x) * s1, a.y); ctx.stroke();
        if (i < 6) {
          var sx = a.x + (b.x - a.x) * s1;
          ctx.beginPath(); ctx.moveTo(sx, a.y); ctx.lineTo(sx, a.y + (q[3].y - q[0].y) / 7); ctx.stroke();
        }
      }
      ctx.restore();
    },
    petting: function (ctx, c, k, q) {
      poly(ctx, q); ctx.fillStyle = '#9ac46a'; ctx.fill();
      ctx.strokeStyle = '#fff6e3'; ctx.lineWidth = 2.5 * k; poly(ctx, q); ctx.stroke();
      // little shed
      rect(ctx, c.x + 18 * k, c.y - 22 * k, 30 * k, 22 * k, '#d8402c');
      tri(ctx, c.x + 33 * k, c.y - 21 * k, 36 * k, 12 * k, '#5b2a20');
      [[-30, 4, '#fff'], [-8, 10, '#8a5a2b'], [-22, -10, '#f2e6d0'], [6, -4, '#fff']].forEach(function (g) {
        var x = c.x + g[0] * k, y = c.y + g[1] * k;
        ctx.beginPath(); ctx.ellipse(x, y, 9 * k, 6 * k, 0, 0, Math.PI * 2); ctx.fillStyle = g[2]; ctx.fill();
        circle(ctx, x + 9 * k, y - 5 * k, 4 * k, g[2]);
        rect(ctx, x - 6 * k, y + 4 * k, 2 * k, 6 * k, '#1b1f3a'); rect(ctx, x + 5 * k, y + 4 * k, 2 * k, 6 * k, '#1b1f3a');
      });
    },
    hayride: function (ctx, c, k) {
      // tractor
      rect(ctx, c.x + 18 * k, c.y - 12 * k, 26 * k, 16 * k, '#e2452f');
      rect(ctx, c.x + 30 * k, c.y - 26 * k, 12 * k, 14 * k, '#e2452f');
      circle(ctx, c.x + 38 * k, c.y + 6 * k, 9 * k, '#1b1f3a'); circle(ctx, c.x + 22 * k, c.y + 8 * k, 6 * k, '#1b1f3a');
      // wagon with hay
      rect(ctx, c.x - 42 * k, c.y - 6 * k, 56 * k, 10 * k, '#8a5a2b');
      for (var i = 0; i < 3; i++) rect(ctx, c.x - 40 * k + i * 18 * k, c.y - 18 * k, 16 * k, 12 * k, '#f2c94c');
      circle(ctx, c.x - 32 * k, c.y + 8 * k, 6 * k, '#1b1f3a'); circle(ctx, c.x + 4 * k, c.y + 8 * k, 6 * k, '#1b1f3a');
    },
    school: function (ctx, c, k) {
      // shelter
      rect(ctx, c.x - 44 * k, c.y - 26 * k, 40 * k, 6 * k, '#8a5a2b');
      rect(ctx, c.x - 42 * k, c.y - 20 * k, 4 * k, 22 * k, '#6b4526'); rect(ctx, c.x - 10 * k, c.y - 20 * k, 4 * k, 22 * k, '#6b4526');
      rect(ctx, c.x - 38 * k, c.y - 6 * k, 28 * k, 4 * k, '#c8955a');
      // bus
      rect(ctx, c.x + 2 * k, c.y - 18 * k, 48 * k, 22 * k, '#f2b632');
      for (var i = 0; i < 4; i++) rect(ctx, c.x + 6 * k + i * 11 * k, c.y - 14 * k, 8 * k, 7 * k, '#cfe3f5');
      circle(ctx, c.x + 12 * k, c.y + 5 * k, 5 * k, '#1b1f3a'); circle(ctx, c.x + 40 * k, c.y + 5 * k, 5 * k, '#1b1f3a');
    },
    dinners: function (ctx, c, k) {
      ctx.strokeStyle = '#1b1f3a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x - 50 * k, c.y - 30 * k); ctx.quadraticCurveTo(c.x, c.y - 18 * k, c.x + 50 * k, c.y - 30 * k); ctx.stroke();
      for (var i = 0; i < 9; i++) {
        var t = i / 8, x = c.x - 50 * k + 100 * k * t, y = c.y - 30 * k + 12 * k * 4 * t * (1 - t) * 0.5 + 0;
        circle(ctx, x, y + 3 * k, 2.5 * k, '#ffd25a');
      }
      rect(ctx, c.x - 50 * k, c.y - 6 * k, 100 * k, 12 * k, '#fff6e3');
      rect(ctx, c.x - 46 * k, c.y + 6 * k, 3 * k, 10 * k, '#6b4526'); rect(ctx, c.x + 43 * k, c.y + 6 * k, 3 * k, 10 * k, '#6b4526');
      for (i = 0; i < 6; i++) circle(ctx, c.x - 40 * k + i * 16 * k, c.y - 4 * k, 3 * k, i % 2 ? '#e2452f' : '#3f8f3a');
    },
    cabin: function (ctx, c, k) {
      var w = 64 * k, h = 34 * k, x = c.x - w / 2, y = c.y - h / 2 + 6 * k;
      rect(ctx, x, y, w, h, '#8a5a2b');
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      for (var i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x, y + i * h / 5); ctx.lineTo(x + w, y + i * h / 5); ctx.stroke(); }
      tri(ctx, c.x, y + 1, w + 14 * k, 24 * k, '#3a2a20');
      rect(ctx, x + w * 0.65, y - 20 * k, 8 * k, 14 * k, '#6b4526');
      rect(ctx, c.x - 7 * k, y + h - 20 * k, 14 * k, 20 * k, '#3a2a20');
      rect(ctx, x + 6 * k, y + 8 * k, 12 * k, 10 * k, '#ffd25a');
      rect(ctx, x + w - 18 * k, y + 8 * k, 12 * k, 10 * k, '#ffd25a');
    },
    weddings: function (ctx, c, k) {
      ctx.strokeStyle = '#fff6e3'; ctx.lineWidth = 4 * k;
      ctx.beginPath(); ctx.arc(c.x, c.y - 4 * k, 22 * k, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c.x - 22 * k, c.y - 4 * k); ctx.lineTo(c.x - 22 * k, c.y + 12 * k);
      ctx.moveTo(c.x + 22 * k, c.y - 4 * k); ctx.lineTo(c.x + 22 * k, c.y + 12 * k); ctx.stroke();
      [[-18, -16], [-6, -26], [8, -25], [19, -15]].forEach(function (f, i) { circle(ctx, c.x + f[0] * k, c.y + f[1] * k, 4 * k, i % 2 ? '#e2452f' : '#ffd25a'); });
      for (var r = 0; r < 2; r++) for (var i = 0; i < 4; i++) {
        rect(ctx, c.x - 46 * k + i * 8 * k, c.y + 4 * k + r * 9 * k, 6 * k, 6 * k, '#fff6e3');
        rect(ctx, c.x + 16 * k + i * 8 * k, c.y + 4 * k + r * 9 * k, 6 * k, 6 * k, '#fff6e3');
      }
    },
    workshops: function (ctx, c, k) {
      var w = 54 * k, h = 30 * k, x = c.x - w / 2, y = c.y - h / 2 + 4 * k;
      rect(ctx, x, y, w, h, '#3f8f3a');
      tri(ctx, c.x, y + 1, w + 10 * k, 20 * k, '#1b1f3a');
      rect(ctx, c.x - 6 * k, y + h - 16 * k, 12 * k, 16 * k, '#c8955a');
      rect(ctx, x + w - 4 * k, y + 2 * k, 30 * k, 12 * k, '#fff6e3');
      ctx.fillStyle = '#1b1f3a'; ctx.font = Math.round(8 * k) + 'px ' + DISPLAY_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CLASS', x + w + 11 * k, y + 8.5 * k);
    },
    sunflowers: function (ctx, c, k, q, sea) {
      poly(ctx, q); ctx.fillStyle = sea === 'winter' ? '#cdd6cf' : '#5f9e3a'; ctx.fill();
      for (var r = 0; r < 3; r++) {
        for (var b = 0; b < 7; b++) {
          var t = (r + 0.7) / 3.3, u = (b + 0.5) / 7;
          var lx = q[0].x + (q[3].x - q[0].x) * t, rx = q[1].x + (q[2].x - q[1].x) * t;
          var y = q[0].y + (q[3].y - q[0].y) * t, x = lx + (rx - lx) * u;
          rect(ctx, x - 1, y - 14 * k, 2, 14 * k, '#3f7a2a');
          if (sea === 'summer' || sea === 'fall') {
            circle(ctx, x, y - 15 * k, 5 * k, '#f2b632');
            circle(ctx, x, y - 15 * k, 2.2 * k, '#6b4526');
          } else if (sea === 'spring') {
            circle(ctx, x - 2 * k, y - 10 * k, 2 * k, '#6fbf4a'); circle(ctx, x + 2 * k, y - 8 * k, 2 * k, '#6fbf4a');
          }
        }
      }
    },
    playground: function (ctx, c, k, q) {
      poly(ctx, q); ctx.fillStyle = '#c9a46a'; ctx.fill();
      // hay bale pyramid
      [[-40, 4], [-24, 4], [-8, 4], [-32, -8], [-16, -8], [-24, -20]].forEach(function (h) {
        rect(ctx, c.x + h[0] * k, c.y + h[1] * k, 15 * k, 11 * k, '#f2c94c');
        ctx.strokeStyle = '#b8902a'; ctx.lineWidth = 1; ctx.strokeRect(c.x + h[0] * k, c.y + h[1] * k, 15 * k, 11 * k);
      });
      // tube slide
      ctx.strokeStyle = '#e2452f'; ctx.lineWidth = 7 * k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x + 14 * k, c.y - 22 * k); ctx.quadraticCurveTo(c.x + 44 * k, c.y - 16 * k, c.x + 40 * k, c.y + 12 * k); ctx.stroke();
      ctx.lineCap = 'butt';
      rect(ctx, c.x + 8 * k, c.y - 26 * k, 12 * k, 4 * k, '#1b36a8');
      rect(ctx, c.x + 9 * k, c.y - 22 * k, 3 * k, 34 * k, '#1b36a8'); rect(ctx, c.x + 16 * k, c.y - 22 * k, 3 * k, 34 * k, '#1b36a8');
    },
    pond: function (ctx, c, k, q, sea) {
      poly(ctx, q); ctx.fillStyle = '#7fb85a'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x, c.y + 2 * k, 52 * k, 17 * k, 0, 0, Math.PI * 2);
      ctx.fillStyle = sea === 'winter' ? '#dfe9f2' : '#3d7fd6'; ctx.fill();
      ctx.strokeStyle = '#c8955a'; ctx.lineWidth = 2; ctx.stroke();
      if (sea !== 'winter') {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(c.x - 22 * k, c.y); ctx.lineTo(c.x - 8 * k, c.y); ctx.moveTo(c.x + 10 * k, c.y + 7 * k); ctx.lineTo(c.x + 26 * k, c.y + 7 * k); ctx.stroke();
      }
      // little dock and an angler
      rect(ctx, c.x + 30 * k, c.y - 6 * k, 20 * k, 5 * k, '#8a5a2b');
      person(ctx, c.x + 42 * k, c.y - 6 * k, k, '#e2452f');
      ctx.strokeStyle = '#1b1f3a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x + 44 * k, c.y - 20 * k); ctx.lineTo(c.x + 26 * k, c.y - 30 * k); ctx.lineTo(c.x + 22 * k, c.y + 2 * k); ctx.stroke();
    },
    trees: function (ctx, c, k, q, sea) {
      for (var r = 0; r < 3; r++) {
        for (var b = 0; b < 5; b++) {
          var t = (r + 0.6) / 3.2, s = (b + 0.5) / 5;
          var lx = q[0].x + (q[3].x - q[0].x) * t, rx = q[1].x + (q[2].x - q[1].x) * t;
          var y = q[0].y + (q[3].y - q[0].y) * t + 6 * k, x = lx + (rx - lx) * s;
          rect(ctx, x - 1.5 * k, y - 3 * k, 3 * k, 5 * k, '#6b4526');
          tri(ctx, x, y - 2 * k, 18 * k, 28 * k, '#1f6b3a');
          if (sea === 'winter') tri(ctx, x, y - 20 * k, 9 * k, 10 * k, '#ffffff');
        }
      }
    }
  };

  function drawGroundwork(ctx, s, pal) {
    var O = root.OTG;
    // parking (front right outer)
    if (O.owned(s, 'parking1')) {
      var lot = quad([0.56, 0.99, 0.71, 0.98]);
      poly(ctx, lot); ctx.fillStyle = '#b8ad97'; ctx.fill();
      ctx.strokeStyle = '#fff6e3'; ctx.lineWidth = 2;
      for (var i = 1; i < 7; i++) {
        var a = proj(0.56 + i * 0.06, 0.74), b = proj(0.56 + i * 0.06, 0.84);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    if (O.owned(s, 'parking2')) {
      var ov = quad([1.01, 1.12, 0.40, 0.98]);
      poly(ctx, ov); ctx.fillStyle = pal.grass2; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
      for (i = 0; i < 6; i++) { var p = proj(1.02 + i * 0.018, 0.45), q2 = proj(1.02 + i * 0.018, 0.95); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q2.x, q2.y); ctx.stroke(); }
      var pc = proj(1.06, 0.66); signPost(ctx, pc.x, pc.y, 0.85, 'P', '#f2b632');
    }
    // restrooms, handwash, signs (front left outer)
    var base = proj(-0.86, 0.9);
    if (O.owned(s, 'restrooms')) {
      rect(ctx, base.x - 22, base.y - 40, 44, 40, '#2f5fb3');
      tri(ctx, base.x, base.y - 39, 52, 14, '#1b1f3a');
      rect(ctx, base.x - 16, base.y - 28, 12, 28, '#cfe3f5'); rect(ctx, base.x + 4, base.y - 28, 12, 28, '#cfe3f5');
    }
    if (O.owned(s, 'handwash')) {
      var hw = proj(-0.64, 0.86);
      rect(ctx, hw.x - 10, hw.y - 22, 20, 22, '#e7ecef'); rect(ctx, hw.x - 12, hw.y - 26, 24, 5, '#9aa3ad');
      circle(ctx, hw.x, hw.y - 14, 4, '#3d63d6');
    }
    if (O.owned(s, 'waivers')) {
      var sg = proj(-0.3, 1.02); signPost(ctx, sg.x - 6, sg.y + 2, 0.8, '! PLEASE READ', '#f2b632');
    }
    if (O.owned(s, 'email')) {
      var mb = proj(0.22, 1.03);
      rect(ctx, mb.x - 1.5, mb.y - 14, 3, 16, '#6b4526'); rect(ctx, mb.x - 9, mb.y - 24, 18, 11, '#e2452f');
      rect(ctx, mb.x + 7, mb.y - 30, 2, 8, '#f2b632');
    }
    if (O.owned(s, 'fencing')) {
      ctx.strokeStyle = '#fff6e3'; ctx.lineWidth = 2;
      [-1.0, 1.0].forEach(function (u) {
        var a = proj(u, 0.0), b = proj(u, 0.72);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(a.x, a.y - 6); ctx.lineTo(b.x, b.y - 8); ctx.stroke();
        for (var f = 0; f <= 8; f++) { var pp = proj(u, f * 0.09); rect(ctx, pp.x - 1.5, pp.y - 12 * pp.k, 3, 12 * pp.k, '#fff6e3'); }
      });
    }
    if (O.owned(s, 'accessible')) {
      var pa = [proj(-0.105, 0.0), proj(-0.08, 0.0), proj(-0.085, 1.0), proj(-0.115, 1.0)];
      poly(ctx, pa); ctx.fillStyle = '#d9d4c7'; ctx.fill();
    }
    if (O.owned(s, 'firstaid')) {
      var fa = proj(-0.76, 0.77);
      tri(ctx, fa.x, fa.y, 34, 22, '#fff6e3');
      rect(ctx, fa.x - 3, fa.y - 16, 6, 12, '#e2452f'); rect(ctx, fa.x - 7, fa.y - 12, 14, 4, '#e2452f');
    }
    if (O.owned(s, 'snackbar')) {
      var sk = proj(0.63, 0.86);
      rect(ctx, sk.x - 18, sk.y - 24, 36, 24, '#fff6e3');
      for (var st = 0; st < 4; st++) rect(ctx, sk.x - 20 + st * 10, sk.y - 32, 10, 8, st % 2 ? '#fff6e3' : '#3f8f3a');
      rect(ctx, sk.x - 14, sk.y - 18, 28, 8, '#c8955a');
    }
    if (O.owned(s, 'shade')) {
      [[0.79, 0.86], [0.93, 0.87]].forEach(function (u) {
        var sp2 = proj(u[0], u[1]);
        rect(ctx, sp2.x - 1, sp2.y - 22, 2, 22, '#6b4526');
        ctx.beginPath(); ctx.moveTo(sp2.x - 16, sp2.y - 18); ctx.quadraticCurveTo(sp2.x, sp2.y - 34, sp2.x + 16, sp2.y - 18); ctx.closePath();
        ctx.fillStyle = '#e2452f'; ctx.fill();
        rect(ctx, sp2.x - 9, sp2.y - 6, 18, 4, '#8a5a2b');
      });
    }
    if (O.owned(s, 'signage')) {
      rect(ctx, 866, 500, 4, 34, '#6b4526'); rect(ctx, 930, 500, 4, 34, '#6b4526');
      rect(ctx, 856, 488, 88, 26, '#1b36a8');
      ctx.strokeStyle = '#f2b632'; ctx.lineWidth = 2; ctx.strokeRect(856, 488, 88, 26);
      ctx.fillStyle = '#ffd25a'; ctx.font = '11px ' + DISPLAY_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('FARM ← TURN', 900, 501);
    }
    if (O.owned(s, 'cooler')) {
      rect(ctx, 300, 204, 46, 40, '#e7ecef'); rect(ctx, 296, 198, 54, 8, '#9aa3ad');
      rect(ctx, 316, 220, 14, 24, '#cfd8de');
    }
    if (O.owned(s, 'kitchen')) {
      rect(ctx, 610, 186, 64, 54, '#fff6e3'); tri(ctx, 642, 187, 74, 22, '#3f8f3a');
      rect(ctx, 654, 160, 9, 20, '#8a8576'); rect(ctx, 618, 200, 16, 14, '#cfe3f5'); rect(ctx, 650, 214, 14, 26, '#c8955a');
    }
    if (s.gw.zoning) { signPost(ctx, 380, 248, 0.7, 'PERMIT', '#fff6e3'); }
    if (O.owned(s, 'website')) { signPost(ctx, 560, 532, 0.7, 'BOOK ONLINE', '#3d63d6'); }
    // hired hands near the barn
    var hands = O.owned(s, 'payroll') ? s.plan.help : 0;
    for (i = 0; i < hands; i++) person(ctx, 372 - i * 12, 248, 1, '#e2452f', '#1b36a8');
  }

  function person(ctx, x, y, k, shirt, pants) {
    rect(ctx, x - 2 * k, y - 6 * k, 4 * k, 6 * k, pants || '#1b1f3a');
    rect(ctx, x - 3 * k, y - 13 * k, 6 * k, 8 * k, shirt);
    circle(ctx, x, y - 16 * k, 3 * k, '#f1c8a0');
  }

  function drawWeather(ctx, rain, sea, t) {
    if (!rain) {
      if (sea === 'winter') drawSnow(ctx, t, 0.4);
      return;
    }
    ctx.fillStyle = 'rgba(40,50,90,0.18)'; ctx.fillRect(0, 0, W, H);
    [[140, 70], [330, 50], [640, 64], [820, 44]].forEach(function (cl) {
      circle(ctx, cl[0], cl[1], 34, '#c9cfdc'); circle(ctx, cl[0] + 34, cl[1] + 6, 28, '#b9c0d0'); circle(ctx, cl[0] - 32, cl[1] + 8, 24, '#d4d9e4');
    });
    if (sea === 'winter') { drawSnow(ctx, t, 1); return; }
    ctx.strokeStyle = 'rgba(220,230,255,0.55)'; ctx.lineWidth = 1.5;
    var off = (t || 0) * 400;
    ctx.beginPath();
    for (var i = 0; i < 90 * Math.min(4, rain) / 2; i++) {
      var x = (jit(i, 9) * W + off * 0.3) % W, y = (jit(i, 8) * H + off) % H;
      ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 14);
    }
    ctx.stroke();
  }
  function drawSnow(ctx, t, amount) {
    var off = (t || 0) * 60;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < 70 * amount; i++) {
      var x = (jit(i, 5) * W + Math.sin(off / 20 + i) * 8) % W, y = (jit(i, 6) * H + off) % H;
      ctx.beginPath(); ctx.arc(x, y, 1.6 + jit(i, 7) * 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- the whole scene ----------
  function render(ctx, s, opts) {
    opts = opts || {};
    var O = root.OTG, D = O.data;
    var cm = O.calMonth(opts.turn != null ? opts.turn : s.turn);
    var sea = season(cm), pal = PALETTE[sea];
    var rain = opts.rain || 0;
    drawSky(ctx, rain > 0);
    drawHills(ctx, pal);
    drawBarn(ctx, s.farmName);
    [[60, 240, 1.1], [130, 232, 0.9], [250, 238, 0.8], [700, 236, 0.85], [800, 240, 1.1], [905, 234, 0.95]].forEach(function (t) { drawTree(ctx, t[0], t[1], t[2], pal, sea); });
    drawGround(ctx, pal, sea);
    // left outer front: a little garden for when nothing's built
    var openSet = {};
    if (s.lastResult && opts.useLast) s.lastResult.attractions.forEach(function (x) { if (x.visitors > 0) openSet[x.id] = 1; });
    var owned = s.plotsOwned || 10;
    DRAW_ORDER.forEach(function (i) {
      var p = PLOTS[i];
      var q = quad(p), c = center(p);
      var plot = s.plots[i];
      if (i >= owned) {
        drawForSale(ctx, q, pal, i);
        if (opts.showEmptySigns !== false && i === owned) signPost(ctx, c.x, c.y + 8 * c.k, c.k * 1.25, 'FOR SALE', '#ffd25a');
      } else if (!plot) {
        drawEmptyPlot(ctx, q, pal, sea, i);
        if (opts.showEmptySigns !== false) signPost(ctx, c.x, c.y + 10 * c.k, c.k * 1.5, '+ ' + (i + 1), '#fff6e3');
      } else {
        poly(ctx, q); ctx.fillStyle = pal.grass2; ctx.fill();
        var ready = O.isReady(s, plot, opts.turn);
        var a = D.ATTRACTIONS[plot.id];
        var inSeason = a.season[cm] > 0;
        if (!ready) {
          drawEmptyPlot(ctx, q, pal, sea, i);
          for (var sp = 0; sp < 14; sp++) {
            var t = jit(i, sp), u = jit(sp, i);
            var lx = q[0].x + (q[3].x - q[0].x) * (0.2 + 0.6 * t), rx = q[1].x + (q[2].x - q[1].x) * (0.2 + 0.6 * t);
            var y = q[0].y + (q[3].y - q[0].y) * (0.2 + 0.6 * t), x = lx + (rx - lx) * (0.1 + 0.8 * u);
            tri(ctx, x, y, 6 * c.k, 9 * c.k, '#3f8f3a');
          }
          var left = plot.builtTurn + a.establish - (opts.turn != null ? opts.turn : s.turn);
          signPost(ctx, c.x, c.y + 10 * c.k, c.k * 1.15, 'READY IN ' + left + ' MO', '#ffd25a');
        } else {
          ctx.save();
          if (!inSeason) ctx.globalAlpha = 0.55;
          DRAW[plot.id](ctx, c, c.k, q, sea);
          ctx.restore();
          if (!inSeason) signPost(ctx, c.x + 30 * c.k, c.y + 18 * c.k, c.k * 0.85, 'CLOSED', '#d7d2c4');
        }
      }
      if (opts.highlight === i) {
        ctx.save(); poly(ctx, q); ctx.lineWidth = 5; ctx.strokeStyle = '#ffd25a'; ctx.setLineDash([10, 6]); ctx.stroke(); ctx.restore();
      }
    });
    drawGroundwork(ctx, s, pal);
    drawGate(ctx, !s.burnoutNext);
    if (!opts.noWeather) drawWeather(ctx, rain, sea, opts.t);
  }

  // ---------- public controller ----------
  function create(canvas, onPlot) {
    var ctx = canvas.getContext('2d');
    var state = null, opts = {}, raf = 0, anim = null;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(2, root.devicePixelRatio || 1);
      var w = Math.max(1, Math.round(rect.width * dpr));
      var h = Math.round(w * H / W);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(w / W, 0, 0, h / H, 0, 0);
    }

    function draw(s, o) {
      if (s) state = s;
      if (o) opts = o;
      if (!state || anim) return;
      resize();
      ctx.clearRect(0, 0, W, H);
      render(ctx, state, opts);
    }

    function plotAt(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      var x = (clientX - r.left) / r.width * W, y = (clientY - r.top) / r.height * H;
      for (var i = 0; i < PLOTS.length; i++) if (inside(quad(PLOTS[i]), x, y)) return i;
      return -1;
    }
    function inside(pts, x, y) {
      var c = false;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        if (((pts[i].y > y) !== (pts[j].y > y)) && (x < (pts[j].x - pts[i].x) * (y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x)) c = !c;
      }
      return c;
    }

    canvas.addEventListener('click', function (e) {
      if (anim) return;
      var i = plotAt(e.clientX, e.clientY);
      if (i >= 0 && onPlot) onPlot(i);
    });
    canvas.addEventListener('mousemove', function (e) {
      if (anim) return;
      canvas.style.cursor = plotAt(e.clientX, e.clientY) >= 0 ? 'pointer' : 'default';
    });

    /*
     * Cars arrive and visitors walk to the open attractions.
     * s: state after the month (turn already advanced); r: the month's result.
     */
    function animate(s, r, done, onTick) {
      stop();
      state = s;
      var turn = r.turn;
      resize();
      var bg = document.createElement('canvas');
      bg.width = canvas.width; bg.height = canvas.height;
      var bctx = bg.getContext('2d');
      bctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      var openPlots = r.attractions.filter(function (x) { return x.visitors > 0; }).map(function (x) { return x.plot; });
      var nCars = r.closed ? 0 : Math.max(openPlots.length ? 3 : 0, Math.min(36, Math.round(r.visitors / 70)));
      var colors = ['#e2452f', '#f2b632', '#ffffff', '#3f8f3a', '#1b36a8', '#8a5a2b', '#9aa3ad'];
      var cars = [], people = [];
      for (var i = 0; i < nCars; i++) {
        var fromLeft = jit(i, 11) < 0.5;
        cars.push({ delay: i / Math.max(1, nCars) * 0.55, fromLeft: fromLeft, color: colors[i % colors.length],
          lot: { x: 650 + jit(i, 12) * 220, y: 470 + jit(i, 13) * 40 } });
        if (openPlots.length) {
          var dest = center(PLOTS[openPlots[i % openPlots.length]]);
          for (var pp = 0; pp < 2; pp++) people.push({ car: i, dest: { x: dest.x + (jit(i, pp) - 0.5) * 50, y: dest.y + (jit(pp, i) - 0.5) * 20 }, shirt: colors[(i + pp + 2) % colors.length] });
        }
      }
      var start = performance.now(), duration = r.closed ? 1800 : 4200;
      anim = { done: done };
      render(bctx, s, { turn: turn, rain: r.rain, showEmptySigns: false, noWeather: true });
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(bg, 0, 0, W, H);
        cars.forEach(function (c, idx) {
          var local = (t - c.delay) / 0.4;
          if (local <= 0) return;
          var p = carPos(c, Math.min(1, local));
          drawCar(ctx, p.x, p.y, c.color, p.flip);
        });
        people.forEach(function (p) {
          var c = cars[p.car];
          var local = (t - c.delay - 0.4) / 0.35;
          if (local <= 0 || local > 1.3) return;
          var e = Math.min(1, local);
          var x = c.lot.x + (p.dest.x - c.lot.x) * e, y = c.lot.y + (p.dest.y - c.lot.y) * e;
          person(ctx, x, y, 0.9, p.shirt);
        });
        drawWeather(ctx, r.rain, season(root.OTG.calMonth(turn)), t * 3);
        if (onTick) onTick(t);
        if (t < 1) raf = requestAnimationFrame(frame);
        else finish();
      }
      raf = requestAnimationFrame(frame);
    }

    function carPos(c, e) {
      // road -> gate -> up the lane -> parking lot
      var startX = c.fromLeft ? -40 : W + 40, roadY = c.fromLeft ? 585 : 553;
      if (e < 0.45) { var a = e / 0.45; return { x: startX + (480 - startX) * a, y: roadY, flip: !c.fromLeft }; }
      if (e < 0.65) { var b = (e - 0.45) / 0.2; return { x: 480, y: roadY + (500 - roadY) * b, flip: false }; }
      var d = (e - 0.65) / 0.35; return { x: 480 + (c.lot.x - 480) * d, y: 500 + (c.lot.y - 500) * d, flip: false };
    }
    function drawCar(ctx, x, y, color, flip) {
      ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
      rect(ctx, -16, -10, 32, 10, color);
      rect(ctx, -9, -17, 18, 8, color);
      rect(ctx, -7, -15, 6, 5, '#cfe3f5'); rect(ctx, 1, -15, 6, 5, '#cfe3f5');
      circle(ctx, -9, 0, 4, '#1b1f3a'); circle(ctx, 9, 0, 4, '#1b1f3a');
      ctx.restore();
    }

    function finish() {
      var a = anim; anim = null;
      cancelAnimationFrame(raf);
      draw();
      if (a && a.done) a.done();
    }
    function stop() { if (anim) finish(); }

    return { draw: draw, plotAt: plotAt, animate: animate, skip: stop, isAnimating: function () { return !!anim; } };
  }

  root.OTGScene = { create: create, PLOT_NAMES: PLOT_NAMES, W: W, H: H, season: season };
})(typeof self !== 'undefined' ? self : this);
