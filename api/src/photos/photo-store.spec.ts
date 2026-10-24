import { createServer } from 'node:http';
import { testConfig } from '../../test/support/config.js';
import { S3PhotoStore } from './photo-store.js';

async function withStorage(
  reply: string,
  use: (store: S3PhotoStore, received: () => string) => Promise<void>,
  status: (method: string) => number = () => 200,
) {
  let received = '';
  const server = createServer((request, response) => {
    const method = request.method ?? '';
    received = `${method} ${request.url ?? ''} `;
    request.on('data', (chunk: Buffer) => (received += chunk.toString()));
    request.on('end', () => response.writeHead(status(method), { 'content-type': 'application/xml' }).end(reply));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The fake storage has no port');
  const config = { S3_ENDPOINT: `http://127.0.0.1:${address.port}`, S3_ACCESS_KEY: 'key', S3_SECRET_KEY: 'secret' };
  try {
    await use(new S3PhotoStore(testConfig(config)), () => received);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

describe('S3PhotoStore', () => {
  it('creates the bucket when storage says it is missing', async () => {
    const missing = (method: string) => (method === 'HEAD' ? 404 : 200);
    await withStorage(
      '',
      async (store, received) => {
        await store.onModuleInit();
        expect(received()).toMatch(/^PUT \/matchium-photos\/? /);
      },
      missing,
    );
  });

  it('refuses to start when storage turns the bucket check down, instead of carrying on without photos', async () => {
    const forbidden = (method: string) => (method === 'HEAD' ? 403 : 200);
    await withStorage(
      '',
      async (store) => {
        await expect(store.onModuleInit()).rejects.toThrow('Photo storage refused bucket matchium-photos');
      },
      forbidden,
    );
  });

  it('asks storage to delete every key', async () => {
    await withStorage('<DeleteResult></DeleteResult>', async (store, received) => {
      await store.delete(['u/a.webp', 'u/b.webp']);
      expect(received()).toMatch(/^POST \/matchium-photos\/\?delete/);
      expect(received()).toContain('<Quiet>true</Quiet>');
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
