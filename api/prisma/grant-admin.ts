import 'dotenv/config';
import pg from 'pg';

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error('usage: npm run admin:grant -- <email>');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rowCount } = await client.query(`UPDATE "User" SET role = 'ADMIN' WHERE email = $1`, [email]);
  console.log(rowCount ? `${email} is now an admin` : `no user with email ${email}`);
  process.exitCode = rowCount ? 0 : 1;
} finally {
  await client.end();
}
