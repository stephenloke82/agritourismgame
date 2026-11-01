#!/usr/bin/env node
/*
 * Builds open-the-gate.html: the whole game in ONE file (CSS and scripts inlined).
 * Easy to open from a download, email, or paste into a website's HTML embed.
 *   node tools/build-single.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'open-the-gate.html');

var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// keep a literal "</script" or "</style" inside code from closing the tag early
function safe(code, tag) { return code.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag); }

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/, function (m, href) {
  return '<style>\n' + safe(read(href), 'style') + '\n</style>';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (m, src) {
  return '<script>\n' + safe(read(src), 'script') + '\n</script>';
});
html = html.replace('<head>', '<head>\n  <!-- Built from the source files by tools/build-single.js. Edit those, then rebuild. -->');

if (/<script src=|<link rel="stylesheet" href="(?!https)/.test(html)) throw new Error('Something was not inlined.');
fs.writeFileSync(OUT, html);
console.log('Wrote ' + path.relative(ROOT, OUT) + ' (' + Math.round(html.length / 1024) + ' KB)');
