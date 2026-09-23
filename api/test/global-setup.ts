import { execSync } from 'node:child_process';
import { config } from 'dotenv';

export default function setup() {
  const { parsed } = config({ path: '.env.test', quiet: true });
  const env = { ...process.env, ...parsed };
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  execSync('node prisma/seed.ts', { env, stdio: 'ignore' });
}
