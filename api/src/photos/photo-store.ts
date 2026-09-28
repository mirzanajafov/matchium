import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export abstract class PhotoStore {
  abstract readonly enabled: boolean;
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  abstract delete(keys: string[]): Promise<void>;
}

@Injectable()
export class S3PhotoStore extends PhotoStore implements OnModuleInit {
  readonly enabled: boolean;
  private readonly log = new Logger(S3PhotoStore.name);
  private readonly client?: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    super();
    const endpoint = config.get<string>('S3_ENDPOINT') ?? '';
    const accessKeyId = config.get<string>('S3_ACCESS_KEY') ?? '';
    const secretAccessKey = config.get<string>('S3_SECRET_KEY') ?? '';
    this.bucket = config.get<string>('S3_BUCKET') ?? 'matchium-photos';
    this.enabled = Boolean(endpoint && accessKeyId && secretAccessKey);
    if (this.enabled) {
      this.client = new S3Client({
        endpoint,
        region: config.get<string>('S3_REGION') ?? 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async onModuleInit() {
    if (!this.client) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        this.log.warn(`Could not prepare bucket ${this.bucket}: ${(error as Error).message}`);
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.s3().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.s3().send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await result.Body!.transformToByteArray());
  }

  async delete(keys: string[]) {
    if (keys.length === 0) return;
    await this.s3().send(
      new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
    );
  }

  private s3(): S3Client {
    if (!this.client) throw new Error('Photo storage is not configured');
    return this.client;
  }
}
