// api/characters.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Octokit } from "@octokit/rest";

// 環境変数
const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = 'main',
  GITHUB_FILEPATH = 'data/characters.json',
  ADMIN_SECRET,
} = process.env;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// 共有：GitHubのJSONを取得
async function fetchJson(): Promise<{ data: any[]; sha: string }> {
  const res = await octokit.repos.getContent({
    owner: GITHUB_OWNER!,
    repo: GITHUB_REPO!,
    path: GITHUB_FILEPATH!,
    ref: GITHUB_BRANCH,
  });

  if (!('content' in res.data)) throw new Error('Not a file');
  const content = Buffer.from(res.data.content!, 'base64').toString('utf8');
  const data = JSON.parse(content || '[]');
  const sha = (res.data as any).sha;
  return { data, sha };
}

// 共有：GitHubへコミット
async function commitJson(newData: any[], message: string, prevSha: string) {
  const content = Buffer.from(JSON.stringify(newData, null, 2), 'utf8').toString('base64');
  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER!,
    repo: GITHUB_REPO!,
    path: GITHUB_FILEPATH!,
    message,
    content,
    sha: prevSha,
    branch: GITHUB_BRANCH,
  });
}

function ok(res: VercelResponse, body: any) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // 必要に応じてドメイン制限
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
  return res.status(200).json(body);
}

function err(res: VercelResponse, status: number, message: string) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(status).json({ error: message });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return ok(res, { ok: true });

  try {
    if (req.method === 'GET') {
      const { data } = await fetchJson();
      return ok(res, data);
    }

    // 簡易認証
    const incoming = req.headers['x-admin-secret'];
    if (incoming !== ADMIN_SECRET) {
      return err(res, 401, 'Unauthorized');
    }

    if (req.method === 'POST') {
      // 新規登録（例: {id, name, series, ...}）
      const body = req.body;
      if (!body || !body.id || !body.name) return err(res, 400, 'idとnameは必須です');

      const { data, sha } = await fetchJson();
      if (data.some((c: any) => c.id === body.id)) {
        return err(res, 409, '同じidが既に存在します');
      }

      const newData = [...data, body];
      await commitJson(newData, `feat: add character ${body.id}`, sha);
      return ok(res, { created: true, id: body.id });
    }

    if (req.method === 'PATCH') {
      // 既存更新（例: {id, ...fieldsToUpdate}）
      const body = req.body;
      if (!body || !body.id) return err(res, 400, 'idは必須です');

      const { data, sha } = await fetchJson();
      const idx = data.findIndex((c: any) => c.id === body.id);
      if (idx === -1) return err(res, 404, '該当idが見つかりません');

      const updated = { ...data[idx], ...body };
      const newData = [...data.slice(0, idx), updated, ...data.slice(idx + 1)];
      await commitJson(newData, `chore: update character ${body.id}`, sha);
      return ok(res, { updated: true, id: body.id });
    }

    return err(res, 405, 'Method Not Allowed');
  } catch (e: any) {
    console.error(e);
    return err(res, 500, e.message || 'Internal Server Error');
  }
}
