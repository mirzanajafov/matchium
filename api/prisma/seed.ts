import 'dotenv/config';
import { readFileSync } from 'node:fs';
import pg from 'pg';

interface ContractQuestion {
  id: string;
  dimension: number;
  text: string;
  noise: number;
  reverse: boolean;
}

const { questions } = JSON.parse(
  readFileSync(new URL('../../contract/questions.json', import.meta.url), 'utf8'),
) as { questions: ContractQuestion[] };

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  for (const q of questions) {
    await client.query(
      `INSERT INTO "Question" (id, dimension, text, noise, reverse) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET dimension = $2, text = $3, noise = $4, reverse = $5`,
      [q.id, q.dimension, q.text, q.noise, q.reverse],
    );
  }
  await client.query('COMMIT');
  console.log(`Seeded ${questions.length} questions`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
