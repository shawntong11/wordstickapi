// WordStick API — /api/tree
// Returns WordHub 3-level directory tree structure

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400'); // cache 24h

  if (req.method !== 'GET') return res.status(405).end();

  try {
    const rows = await sql`
      SELECT word, ipa, image_url, category, sub_category
      FROM wordhub_words
      ORDER BY category, sub_category, id
    `;

    // Build tree grouped by category > sub_category
    const tree = {};
    for (const r of rows) {
      const cat = r.category || 'general';
      const sub = r.sub_category || '未分类';
      if (!tree[cat]) tree[cat] = {};
      if (!tree[cat][sub]) tree[cat][sub] = [];
      tree[cat][sub].push({
        w: r.word,
        i: r.ipa || '',
        img: r.image_url || ''
      });
    }

    return res.json(tree);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
