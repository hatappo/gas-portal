import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionTypes, hasActionFilters, matchesAction, typeSuggestion } from '../src/browser/action-search.ts';
const item = { service: 'github', title: 'Release checklist', context: 'acme/portal', reasons: ['Direct review', 'Team review'] };
const match = (value, text, types) => matchesAction(value, { text, types }, '(No subject)');

test('Type suggestions preserve free text and only recognize a trailing type token', () => {
  assert.deepEqual(typeSuggestion('release IS:review'), { prefix: 'release', term: 'review' });
  assert.deepEqual(typeSuggestion('is:'), { prefix: '', term: '' });
  assert.deepEqual(typeSuggestion(' 資料  is:レビュー'), { prefix: ' 資料', term: 'レビュー' });
  assert.equal(typeSuggestion('this:review'), null);
  assert.equal(typeSuggestion('type:review'), null);
  assert.equal(typeSuggestion('is:review release'), null);
  assert.equal(typeSuggestion('hello'), null);
});

test('Types combine with OR and intersect normalized title and context search', () => {
  assert.equal(match(item, 'ＲＥＬＥＡＳＥ', ['issue', 'review']), true);
  assert.equal(match(item, 'acme', ['team-review']), true);
  assert.equal(match(item, 'missing', ['review']), false);
  assert.equal(match(item, 'release', ['issue', 'todo']), false);
  assert.equal(match(item, '', []), true);
  assert.equal(match(item, 'release is:slack', ['review']), true, 'Draft suggestions do not change the free-text search');
  assert.equal(match(item, '', ['unknown']), false);
});

test('Types distinguish services and include unknown Slack To-do status', () => {
  assert.equal(match({ ...item, service: 'slack', reasons: ['To-do (status unknown)'] }, '', ['todo']), true);
  assert.equal(match({ ...item, service: 'github', reasons: ['To-do'] }, '', ['todo']), false);
  assert.equal(match({ ...item, service: 'gmail', title: '', reasons: ['Unread mail'] }, 'no subject', ['mail']), true);
  assert.equal(match({ ...item, service: 'gmail', reasons: ['Unread mail'] }, '', ['todo']), false);
  assert.equal(new Set(actionTypes.map(type => type.id)).size, actionTypes.length);
});


test('Uncommitted type suggestions do not change unfiltered Inbox count semantics', () => {
  assert.equal(hasActionFilters({ text: 'is:', types: [] }), false);
  assert.equal(hasActionFilters({ text: '   ', types: [] }), false);
  assert.equal(hasActionFilters({ text: 'release is:', types: [] }), true);
  assert.equal(hasActionFilters({ text: '', types: ['todo'] }), true);
});
