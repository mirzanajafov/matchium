import { ConfigService } from '@nestjs/config';
import { createServer } from 'node:http';
import { S3PhotoStore } from './photo-store.js';

async function withStorage(reply: string, use: (store: S3PhotoStore, received: () => string) => Promise<void>) {
  let body = '';
  const server = createServer((request, response) => {
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => response.writeHead(200, { 'content-type': 'application/xml' }).end(reply));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The fake storage has no port');
  const config = { S3_ENDPOINT: `http://127.0.0.1:${address.port}`, S3_ACCESS_KEY: 'key', S3_SECRET_KEY: 'secret' };
  try {
    await use(new S3PhotoStore(new ConfigService(config)), () => body);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('S3PhotoStore', () => {
  it('asks storage to delete every key', async () => {
    await withStorage('<DeleteResult></DeleteResult>', async (store, received) => {
      await store.delete(['u/a.webp', 'u/b.webp']);
      expect(received()).toContain('<Key>u/a.webp</Key>');
      expect(received()).toContain('<Key>u/b.webp</Key>');
    });
  });

  it('reports the keys storage refused to delete', async () => {
    const refusal = '<DeleteResult><Error><Key>u/b.webp</Key><Code>AccessDenied</Code></Error></DeleteResult>';
    await withStorage(refusal, async (store) => {
      await expect(store.delete(['u/a.webp', 'u/b.webp'])).rejects.toThrow('Storage refused u/b.webp (AccessDenied)');
    });
  });
});
