import { ConfigService } from '@nestjs/config';
import { createServer } from 'node:http';
import { S3PhotoStore } from './photo-store.js';

const refusal = `<?xml version="1.0" encoding="UTF-8"?>
<DeleteResult><Error><Key>u/b.webp</Key><Code>AccessDenied</Code><Message>Access Denied</Message></Error></DeleteResult>`;

describe('S3PhotoStore', () => {
  it('reports the keys storage refused to delete', async () => {
    const server = createServer((request, response) => {
      request.resume();
      request.on('end', () => response.writeHead(200, { 'content-type': 'application/xml' }).end(refusal));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('The fake storage has no port');
    const store = new S3PhotoStore(
      new ConfigService({
        S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
        S3_ACCESS_KEY: 'key',
        S3_SECRET_KEY: 'secret',
      }),
    );
    try {
      await expect(store.delete(['u/a.webp', 'u/b.webp'])).rejects.toThrow('Storage refused u/b.webp (AccessDenied)');
    } finally {
      server.close();
    }
  });
});
