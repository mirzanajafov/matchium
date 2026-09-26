import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ADMIN_ONLY = 'adminOnly';

export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
