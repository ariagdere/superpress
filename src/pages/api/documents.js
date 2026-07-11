// src/pages/api/documents.js
import { env } from 'cloudflare:workers';

export const prerender = false;

const BRAND = 'Superpress';

export async function GET({ url }) {
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT title_tr, title_en, doc_type, file_url_tr, file_url_en, brand FROM documents
       WHERE brand = ?
       ORDER BY sort_order`
    )
    .bind(BRAND)
    .all();
  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
}
