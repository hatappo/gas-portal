import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { contactSheet, parseOptions, views } from '../scripts/screenshots.mjs';

const themes = ['mint', 'modern', 'dracula'];

test('Default to every theme, view, and both widths', () => {
  const options = parseOptions([], themes);
  assert.deepEqual(options.themes, themes);
  assert.deepEqual(options.views, Object.keys(views));
  assert.deepEqual(options.widths, [1280, 390]);
  assert.equal(path.basename(options.out), 'screenshots');
});

test('Narrow themes, views, widths, and output directory from flags', () => {
  const options = parseOptions(['--themes', 'modern, mint', '--views', 'links,appearance', '--widths', '390', '--out', 'screenshots/modern'], themes);
  assert.deepEqual(options.themes, ['modern', 'mint']);
  assert.deepEqual(options.views, ['links', 'appearance']);
  assert.deepEqual(options.widths, [390]);
  assert.equal(options.out, path.resolve('screenshots/modern'));
});

test('Reject unknown themes, views, widths, flags, and missing values', () => {
  for (const [argv, message] of [
    [['--themes', 'tsuyukusa'], /Unknown themes: tsuyukusa/],
    [['--views', 'home'], /Unknown views: home/],
    [['--widths', '100'], /Widths must be/],
    [['--widths', 'wide'], /Widths must be/],
    [['--theme', 'mint'], /Unknown option: --theme/],
    [['--themes'], /Missing value for --themes/],
    [['--themes', '--views'], /Missing value for --themes/],
    [['--out', '.'], /--out must be inside/],
    [['--out', 'screenshots-other'], /--out must be inside/],
    [['--out', '/tmp'], /--out must be inside/],
  ]) {
    assert.throws(() => parseOptions(argv, themes), message, argv.join(' '));
  }
});

test('Label every theme in the contact sheet and escape captions', () => {
  const html = contactSheet([{ theme: 'mint', src: 'data:image/png;base64,AA' }, { theme: '<b>', src: 'data:image/png;base64,BB' }]);
  assert.match(html, /<figcaption>mint<\/figcaption><img src="data:image\/png;base64,AA"/);
  assert.match(html, /<figcaption>&#60;b&#62;<\/figcaption>/);
  assert.doesNotMatch(html, /<b>/);
});

test('Every view waits for a ready selector before the capture', () => {
  for (const [name, view] of Object.entries(views)) {
    assert.equal(typeof view.ready, 'string', name);
    assert.equal(typeof view.hash, 'string', name);
  }
});
