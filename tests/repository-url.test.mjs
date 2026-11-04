import assert from 'node:assert/strict';
import { test } from 'node:test';
import { githubUrl } from '../scripts/repository-url.mjs';

test("Convert GitHub HTTPS and SSH remotes into browsing URLs", () => {
  for (const remote of ['git@github.com:example/portal.git', 'https://github.com/example/portal.git', 'ssh://git@github.com/example/portal', 'https://github.com/example/portal/']) {
    assert.equal(githubUrl(remote), 'https://github.com/example/portal');
  }
});

test("Reject credentials, arbitrary hosts, HTML, and path traversal", () => {
  for (const remote of ['', 'https://token@github.com/example/portal', 'https://evil.test/example/portal', 'https://github.com/../portal', 'https://github.com/example/portal?x=1', 'javascript:alert(1)', 'https://github.com/example/"onclick="']) {
    assert.equal(githubUrl(remote), '');
  }
});
