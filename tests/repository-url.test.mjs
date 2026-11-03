import assert from 'node:assert/strict';
import { test } from 'node:test';
import { githubUrl } from '../scripts/repository-url.mjs';

test('GitHub の HTTPS・SSH remote を閲覧用 URL に変換する', () => {
  for (const remote of ['git@github.com:example/portal.git', 'https://github.com/example/portal.git', 'ssh://git@github.com/example/portal', 'https://github.com/example/portal/']) {
    assert.equal(githubUrl(remote), 'https://github.com/example/portal');
  }
});

test('認証情報・任意ホスト・HTML・パストラバーサルを URL に含めない', () => {
  for (const remote of ['', 'https://token@github.com/example/portal', 'https://evil.test/example/portal', 'https://github.com/../portal', 'https://github.com/example/portal?x=1', 'javascript:alert(1)', 'https://github.com/example/"onclick="']) {
    assert.equal(githubUrl(remote), '');
  }
});
