// 通过 Netlify API 以文件摘要方式上传部署（GitHub Actions 中使用）
// 用法: NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... node scripts/netlify-deploy.mjs [distDir]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { request as httpsRequest } from 'node:https';

const API = 'https://api.netlify.com/api/v1';
const TOKEN = process.env.NETLIFY_AUTH_TOKEN;
const SITE = process.env.NETLIFY_SITE_ID;
if (!TOKEN || !SITE) { console.error('缺少 NETLIFY_AUTH_TOKEN / NETLIFY_SITE_ID'); process.exit(1); }
const dir = process.argv[2] ?? 'dist';

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');
const files = new Map();
function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.set('/' + relative(dir, p).split(sep).join('/'), readFileSync(p));
  }
}
walk(dir);
// netlify.toml 一并上传，使 redirects/headers 生效
if (existsSync('netlify.toml')) files.set('/netlify.toml', readFileSync('netlify.toml'));

// 本地网络对部分 Netlify LB IP 不可达，可用 NETLIFY_API_IP 固定解析（CI 中不设置）
const PIN_IP = process.env.NETLIFY_API_IP;
function rawReq(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const r = httpsRequest(API + path, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, ...headers },
      timeout: 120000,
      ...(PIN_IP ? { lookup: (_h, opts, cb) => (opts.all ? cb(null, [{ address: PIN_IP, family: 4 }]) : cb(null, PIN_IP, 4)) } : {}),
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode < 300, text: async () => Buffer.concat(chunks).toString(), json: async () => JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
async function req(method, path, body, headers = {}) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await rawReq(method, path, body, headers);
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
}

const manifest = Object.fromEntries([...files].map(([p, b]) => [p, sha1(b)]));
const createRes = await req('POST', `/sites/${SITE}/deploys`, JSON.stringify({ files: manifest }), { 'Content-Type': 'application/json' });
if (!createRes.ok) { console.error('创建部署失败', createRes.status, await createRes.text()); process.exit(1); }
const deploy = await createRes.json();
console.log('deploy', deploy.id, 'required:', (deploy.required ?? []).length);

const bySha = new Map([...files].map(([p, b]) => [sha1(b), [p, b]]));
for (const sha of deploy.required ?? []) {
  const entry = bySha.get(sha);
  if (!entry) { console.error('缺少必需文件 sha', sha); process.exit(1); }
  const [p, buf] = entry;
  const putPath = '/deploys/' + deploy.id + '/files/' + p.slice(1).split('/').map(encodeURIComponent).join('/');
  const res = await req('PUT', putPath, buf, { 'Content-Type': 'application/octet-stream' });
  if (!res.ok) { console.error('上传失败', p, res.status); process.exit(1); }
  console.log('uploaded', p);
}

for (let i = 0; i < 60; i++) {
  const res = await req('GET', `/deploys/${deploy.id}`);
  const d = await res.json();
  if (d.state === 'ready') break;
  if (d.state === 'error') { console.error('部署处理失败', d.error_message); process.exit(1); }
  await new Promise((r) => setTimeout(r, 3000));
}
const pub = await req('POST', `/sites/${SITE}/deploys/${deploy.id}/restore`);
if (!pub.ok) { console.error('发布失败', pub.status, await pub.text()); process.exit(1); }
console.log('✓ 已发布 https://' + (process.env.NETLIFY_DOMAIN ?? SITE + '.netlify.app'));