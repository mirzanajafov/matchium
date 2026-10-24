import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { Clock, utcDay } from '../common/clock.js';
import type { Prisma } from '../generated/prisma/client.js';
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
  private readonly log = new Logger(PhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: PhotoStore,
    private readonly clock: Clock,
  ) {}

  async upload(userId: string, input: Buffer | undefined): Promise<PhotoRef> {
    if (!this.store.enabled) throw new ServiceUnavailableException('Photo uploads are not set up');
    if (!input?.length) throw new BadRequestException('Attach a photo');
    const processed = await processPhoto(input);
    if (!processed) throw new BadRequestException("That file isn't a photo we can read");

    const key = `${userId}/${randomUUID()}.webp`;
    await this.store.put(key, processed.data, WEBP);
    try {
      const photo = await this.prisma.$transaction(async (tx) => {
        await this.lockOwner(tx, userId);
        const position = await tx.photo.count({ where: { userId } });
        if (position >= MAX_PHOTOS) throw new ConflictException(`You can have up to ${MAX_PHOTOS} photos`);
        return tx.photo.create({
          data: { userId, key, width: processed.width, height: processed.height, position },
        });
      });
      return { id: photo.id, width: photo.width, height: photo.height };
    } catch (error) {
      await this.discard([key]);
      throw error;
    }
  }

  async remove(userId: string, photoId: string) {
    const key = await this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, userId);
      const photo = await tx.photo.findFirst({ where: { id: photoId, userId } });
      if (!photo) throw new NotFoundException('Photo not found');
      await tx.photo.delete({ where: { id: photo.id } });
      await this.renumber(tx, userId, []);
      return photo.key;
    });
    await this.discard([key]);
  }

  async makeMain(userId: string, photoId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, userId);
      const photo = await tx.photo.findFirst({ where: { id: photoId, userId } });
      if (!photo) throw new NotFoundException('Photo not found');
      await this.renumber(tx, userId, [photoId]);
    });
  }

  private async lockOwner(tx: Prisma.TransactionClient, userId: string) {
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
  }

  private async renumber(tx: Prisma.TransactionClient, userId: string, first: string[]) {
    const photos = await tx.photo.findMany({ where: { userId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    const ordered = [...photos.filter((p) => first.includes(p.id)), ...photos.filter((p) => !first.includes(p.id))];
    for (const [position, photo] of ordered.entries()) {
      if (photo.position !== position) await tx.photo.update({ where: { id: photo.id }, data: { position } });
    }
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
    await this.store
      .delete(keys)
      .catch((error: unknown) => this.log.warn(`Could not delete stored photos ${keys.join(', ')}: ${String(error)}`));
  }

  private async canSee(viewer: AuthUser, ownerId: string): Promise<boolean> {
    if (viewer.id === ownerId || viewer.role === 'ADMIN') return true;
    const pair = [viewer.id, ownerId];
    const current = await this.prisma.match.count({
      where: {
        userAId: { in: pair },
        userBId: { in: pair },
        closedAt: null,
        OR: [{ day: utcDay(this.clock.now()) }, { AND: pair.map(likedBy) }],
      },
    });
    return current > 0;
  }
}

function likedBy(userId: string) {
  return { decisions: { some: { userId, liked: true } } };
}

export function photoRefs(photos: { id: string; width: number; height: number }[]): PhotoRef[] {
  return photos.map(({ id, width, height }) => ({ id, width, height }));
}

export const photoSelect = {
  select: { id: true, width: true, height: true } as const,
  orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
};
