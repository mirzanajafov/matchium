import { Global, Module } from '@nestjs/common';
import { PhotoStore, S3PhotoStore } from './photo-store.js';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

@Global()
@Module({
  controllers: [PhotosController],
  providers: [PhotosService, { provide: PhotoStore, useClass: S3PhotoStore }],
  exports: [PhotosService],
})
export class PhotosModule {}
