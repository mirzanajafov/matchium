import { IsISO8601, IsOptional } from 'class-validator';

export class MessagesQueryDto {
  @IsOptional()
  @IsISO8601()
  after?: string;
}
