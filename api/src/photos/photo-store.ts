import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errorMessage } from '../common/errors.js';
import type { Env } from '../config/env.js';

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

  constructor(config: ConfigService<Env, true>) {
    super();
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const accessKeyId = config.get('S3_ACCESS_KEY', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_KEY', { infer: true });
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.enabled = Boolean(endpoint && accessKeyId && secretAccessKey);
    if (this.enabled) {
      this.client = new S3Client({
        endpoint,
        region: config.get('S3_REGION', { infer: true }),
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async onModuleInit() {
    if (!this.client) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!(error instanceof NotFound)) {
        throw new Error(`Checking photo bucket ${this.bucket} failed: ${errorMessage(error)}`);
      }
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.log.log(`Created bucket ${this.bucket}`);
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.s3().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.s3().send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error(`Photo ${key} came back empty`);
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(keys: string[]) {
    if (keys.length === 0) return;
    const { Errors } = await this.s3().send(
      new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
    );
    if (Errors?.length) {
      throw new Error(`Storage refused ${Errors.map(({ Key = '?', Code = '?' }) => `${Key} (${Code})`).join(', ')}`);
    }
  }

  private s3(): S3Client {
    if (!this.client) throw new Error('Photo storage is not configured');
    return this.client;
  }
}
