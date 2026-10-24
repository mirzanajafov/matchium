import { Injectable } from '@nestjs/common';
import { isoDay } from '../common/clock.js';
import { toThousandths } from '../common/rounding.js';
import { certainty, toBeliefState } from '../engine/belief.js';
import { preferenceShifts } from '../engine/revealed.js';
import { photoRefs, photoSelect } from '../photos/photos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(userId: string) {
    const [user, decisionsLearned] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { belief: true, photos: photoSelect } }),
      this.prisma.matchDecision.count({ where: { userId, learnedAt: { not: null } } }),
    ]);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      birthDate: isoDay(user.birthDate),
      gender: user.gender,
      seeking: user.seeking,
      city: user.city,
      bio: user.bio ?? '',
      photos: photoRefs(user.photos),
      role: user.role,
      emailDigest: user.emailDigest,
      emailVerified: user.emailVerifiedAt !== null,
      answerCount: user.belief?.answerCount ?? 0,
      certainty: user.belief ? toThousandths(certainty(toBeliefState(user.belief))) : 0,
      decisionsLearned,
      preferenceShifts: preferenceShifts(user.belief?.muGap ?? []),
    };
  }

  async setBio(userId: string, bio: string) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { bio: bio || null } });
    return { bio: user.bio ?? '' };
  }

  async setEmailDigest(userId: string, emailDigest: boolean) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { emailDigest } });
    return { emailDigest: user.emailDigest };
  }
}
