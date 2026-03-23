// WordStick API — /api/words
// Handles: GET (fetch words) and POST (save/sync words)

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  // CORS — allow Chrome extension and any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-ID');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = req.headers['x-user-id'];

  // ── GET /api/words ─────────────────────────────────────────────────
  // Returns WordHub library + user's saved words
  if (req.method === 'GET') {
    const { type, category, limit = 200, offset = 0 } = req.query;

    try {
      if (type === 'wordhub') {
        // Fetch WordHub library words
        const catFilter = category ? sql`AND category = ${category}` : sql``;
        const rows = await sql`
          SELECT word, ipa, image_url, category, sub_category, source
          FROM wordhub_words
          ${catFilter}
          ORDER BY id
          LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `;
        return res.json({ words: rows, total: rows.length });
      }

      if (type === 'user' && userId) {
        // Fetch user's saved words
        const rows = await sql`
          SELECT word, phonetic, primary_zh, image_url, category, view_count, saved_at
          FROM user_words
          WHERE user_id = ${userId}
          ORDER BY saved_at DESC
        `;
        return res.json({ words: rows });
      }

      if (type === 'all' && userId) {
        // Fetch both — user words + WordHub library
        const [userWords, hubWords] = await Promise.all([
          sql`SELECT word, phonetic as ipa, primary_zh, image_url, category, view_count, saved_at, 'wordstick' as source
              FROM user_words WHERE user_id = ${userId} ORDER BY saved_at DESC`,
          sql`SELECT word, ipa, '' as primary_zh, image_url, category, sub_category, 'wordhub' as source
              FROM wordhub_words ORDER BY id`
        ]);
        return res.json({ userWords, hubWords });
      }

      // Default: return WordHub categories summary
      const cats = await sql`
        SELECT category, COUNT(*) as count
        FROM wordhub_words
        GROUP BY category
        ORDER BY count DESC
      `;
      return res.json({ categories: cats });

    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST /api/words ────────────────────────────────────────────────
  // Sync WordStick saved words to cloud
  if (req.method === 'POST') {
    if (!userId) return res.status(400).json({ error: 'Missing X-User-ID header' });

    const { words } = req.body;
    if (!Array.isArray(words) || !words.length) {
      return res.status(400).json({ error: 'words array required' });
    }

    try {
      // Upsert each word
      for (const w of words) {
        await sql`
          INSERT INTO user_words (user_id, word, phonetic, primary_zh, image_url, category, view_count, saved_at)
          VALUES (
            ${userId},
            ${w.word || ''},
            ${w.phonetic || ''},
            ${w.primaryZh || w.primary_zh || ''},
            ${w.imageUrl || w.image_url || ''},
            ${w.category || 'general'},
            ${w.viewCount || w.view_count || 0},
            ${w.savedAt || w.saved_at || Date.now()}
          )
          ON CONFLICT (user_id, word)
          DO UPDATE SET
            phonetic = EXCLUDED.phonetic,
            primary_zh = EXCLUDED.primary_zh,
            image_url = EXCLUDED.image_url,
            category = EXCLUDED.category,
            view_count = EXCLUDED.view_count,
            saved_at = EXCLUDED.saved_at
        `;
      }
      return res.json({ success: true, synced: words.length });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DELETE /api/words ──────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!userId) return res.status(400).json({ error: 'Missing X-User-ID header' });
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: 'word param required' });

    try {
      await sql`DELETE FROM user_words WHERE user_id = ${userId} AND word = ${word}`;
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
