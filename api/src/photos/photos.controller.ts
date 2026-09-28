import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { RateLimit } from '../limits/rate-limit.decorator.js';
import { MAX_UPLOAD_BYTES } from './process-photo.js';
import { PhotosService, WEBP } from './photos.service.js';

@ApiTags('photos')
@ApiBearerAuth()
@Controller()
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post('me/photos')
  @RateLimit({ name: 'photo-upload', by: 'user', limit: 20, windowSeconds: 3600 })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: { buffer: Buffer }) {
    return this.photos.upload(user.id, file?.buffer);
  }

  @Delete('me/photos/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.photos.remove(user.id, id);
  }

  @Post('me/photos/:id/main')
  @HttpCode(204)
  async makeMain(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.photos.makeMain(user.id, id);
  }

  @Get('photos/:id')
  @Header('Cache-Control', 'private, max-age=3600')
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return new StreamableFile(await this.photos.read(user, id), { type: WEBP });
  }
}
