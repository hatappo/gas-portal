import { execFileSync } from 'node:child_process';

/** Derive a GitHub browsing URL from origin without embedding credentials or arbitrary hosts. */
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
