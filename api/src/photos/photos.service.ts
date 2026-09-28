import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PhotoStore } from './photo-store.js';
import { processPhoto } from './process-photo.js';

export const MAX_PHOTOS = 4;
export const WEBP = 'image/webp';

export interface PhotoRef {
  id: string;
  width: number;
  height: number;
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: PhotoStore,
  ) {}

  async upload(userId: string, input: Buffer | undefined): Promise<PhotoRef> {
    if (!this.store.enabled) throw new ServiceUnavailableException('Photo uploads are not set up');
    if (!input?.length) throw new BadRequestException('Attach a photo');
    if ((await this.prisma.photo.count({ where: { userId } })) >= MAX_PHOTOS) {
      throw new ConflictException(`You can have up to ${MAX_PHOTOS} photos`);
    }
    const processed = await processPhoto(input);
    if (!processed) throw new BadRequestException("That file isn't a photo we can read");

    const key = `${userId}/${randomUUID()}.webp`;
    await this.store.put(key, processed.data, WEBP);
    const photo = await this.prisma.photo.create({
      data: { userId, key, width: processed.width, height: processed.height },
    });
    return { id: photo.id, width: photo.width, height: photo.height };
  }

  async remove(userId: string, photoId: string) {
    const photo = await this.prisma.photo.findFirst({ where: { id: photoId, userId } });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.prisma.photo.delete({ where: { id: photo.id } });
    await this.store.delete([photo.key]);
  }

  async read(viewer: AuthUser, photoId: string): Promise<Buffer> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || !(await this.canSee(viewer, photo.userId))) throw new NotFoundException('Photo not found');
    return this.store.get(photo.key);
  }

  async keys(userId: string): Promise<string[]> {
    const photos = await this.prisma.photo.findMany({ where: { userId }, select: { key: true } });
    return photos.map((p) => p.key);
  }

  async discard(keys: string[]) {
    await this.store.delete(keys);
  }

  private async canSee(viewer: AuthUser, ownerId: string): Promise<boolean> {
    if (viewer.id === ownerId || viewer.role === 'ADMIN') return true;
    const shared = await this.prisma.match.count({
      where: {
        closedAt: null,
        OR: [
          { userAId: viewer.id, userBId: ownerId },
          { userAId: ownerId, userBId: viewer.id },
        ],
      },
    });
    return shared > 0;
  }
}

export function photoRefs(photos: { id: string; width: number; height: number }[]): PhotoRef[] {
  return photos.map(({ id, width, height }) => ({ id, width, height }));
}

export const photoSelect = {
  select: { id: true, width: true, height: true },
  orderBy: { createdAt: 'asc' },
} as const;
