// api/characters.js
const OWNER  = process.env.GITHUB_OWNER;
const REPO   = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const FILE   = process.env.GITHUB_FILEPATH || 'data/characters.json';
const ADMIN  = process.env.ADMIN_SECRET;
const TOKEN  = process.env.GITHUB_TOKEN;

const RAW_URL      = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE}`;
const CONTENTS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;

function json(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(body));
}

async function getShaAndData(){
  const r = await fetch(`${CONTENTS_URL}?ref=${encodeURIComponent(BRANCH)}`, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'kanako-vercel-func'
    }
  });
  if (!r.ok) throw new Error(`GitHub getContent ${r.status}`);
  const j = await r.json();
  const content = Buffer.from(j.content || '', 'base64').toString('utf8');
  const data = content ? JSON.parse(content) : [];
  return { data, sha: j.sha };
}

async function commitJson(newData, message, prevSha){
  const body = {
    message,
    content: Buffer.from(JSON.stringify(newData, null, 2), 'utf8').toString('base64'),
    branch: BRANCH,
    sha: prevSha
  };
  const r = await fetch(CONTENTS_URL, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'kanako-vercel-func'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(()=> '');
    throw new Error(`GitHub commit ${r.status} ${t}`);
  }
}

module.exports = async (req, res) => {
  // CORS（必要なら許可ドメインを絞ってください）
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Admin-Secret');

  if (req.method === 'OPTIONS') return res.end();

  try {
    if (req.method === 'GET') {
      // 速いのでGETはraw経由
      const r = await fetch(RAW_URL);
      if (!r.ok) throw new Error(`GitHub raw ${r.status}`);
      const text = await r.text();
      const data = text ? JSON.parse(text) : [];
      return json(res, 200, data);
    }

    // 認証（簡易）
    const incoming = req.headers['x-admin-secret'];
    if (!ADMIN || incoming !== ADMIN) return json(res, 401, { error: 'Unauthorized' });

    // 受信ボディ
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (req.method === 'POST') {
      if (!body.id || !body.name) return json(res, 400, { error: 'idとnameは必須' });
      const { data, sha } = await getShaAndData();
      if (data.some(c => c.id === body.id)) return json(res, 409, { error: '同じidが存在' });
      const next = [...data, body];
      await commitJson(next, `feat: add character ${body.id}`, sha);
      return json(res, 200, { created: true, id: body.id });
    }

    if (req.method === 'PATCH') {
      if (!body.id) return json(res, 400, { error: 'idは必須' });
      const { data, sha } = await getShaAndData();
      const i = data.findIndex(c => c.id === body.id);
      if (i === -1) return json(res, 404, { error: 'idが見つかりません' });
      const updated = { ...data[i], ...body };
      const next = [...data.slice(0,i), updated, ...data.slice(i+1)];
      await commitJson(next, `chore: update character ${body.id}`, sha);
      return json(res, 200, { updated: true, id: body.id });
    }

    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
};
