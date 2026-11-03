import { execFileSync } from 'node:child_process';

/** origin から GitHub の閲覧用 URL だけを作る。認証情報・任意ホストは同梱しない。 */
export function githubUrl(remote) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
  if (!match || [match[1], match[2]].some((part) => part === '.' || part === '..')) return '';
  return `https://github.com/${match[1]}/${match[2]}`;
}

export function readRepositoryUrl(root) {
  try {
    return githubUrl(execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    return '';
  }
}
