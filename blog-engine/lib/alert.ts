// Free alert channel: a GitHub Issue (emails the repo owner via GitHub notifications) plus /reports/ALERT.md.
import fs from 'node:fs';
import path from 'node:path';
import { REPORTS_DIR } from './paths.js';
import { fetchRetry } from './http.js';

export async function raiseAlert(title: string, lines: string[]): Promise<string[]> {
  const out: string[] = [];
  const body = `${lines.map((l) => `- ${l}`).join('\n')}\n\nPublishing is paused (\`blog-engine/config.json\` \`paused: true\`).\nTo resume: fix the cause, set \`"paused": false\`, commit.\n\nGenerated ${new Date().toISOString()}`;
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, 'ALERT.md'), `# ${title}\n\n${body}\n`);
  out.push('wrote reports/ALERT.md');
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (token && repo) {
    try {
      const res = await fetchRetry(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, labels: ['blog-engine-alert'] }),
      });
      out.push(res.ok ? `opened GitHub issue (${res.status})` : `GitHub issue failed (${res.status})`);
    } catch (e) { out.push(`GitHub issue failed: ${(e as Error).message}`); }
  } else out.push('GitHub issue skipped (GITHUB_TOKEN/GITHUB_REPOSITORY not set)');
  return out;
}
