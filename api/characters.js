// api/characters.js  ← TypeScriptではなくJSにします
const OWNER   = process.env.GITHUB_OWNER;
const REPO    = process.env.GITHUB_REPO;
const BRANCH  = process.env.GITHUB_BRANCH || 'main';
const FILE    = process.env.GITHUB_FILEPATH || 'data/characters.json';

// 公開リポならトークンなしで raw を読めます（まずGETだけ通す）
const RAW_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE}`;

export default async function handler(req, res) {
  // CORS（必要なら本番でドメインしぼる）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const r = await fetch(RAW_URL);
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const text = await r.text();
    const data = text ? JSON.parse(text) : [];
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
