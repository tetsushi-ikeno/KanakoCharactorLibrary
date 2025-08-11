// api/characters.js  ← CommonJSで書いています（import不要）
const OWNER  = process.env.GITHUB_OWNER;
const REPO   = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE   = process.env.GITHUB_FILEPATH || 'data/characters.json';

const RAW_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE}`;

module.exports = async (req, res) => {
  // CORS（必要に応じて本番は許可ドメインを絞る）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'GET only' })); }

  try {
    const r = await fetch(RAW_URL);
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const text = await r.text();
    const data = text ? JSON.parse(text) : [];
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    return res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: String(e.message || e) }));
  }
};
