import { Type } from 'class-transformer';
import { IsString, IsUrl, Length, ValidateNested } from 'class-validator';

export class SubscriptionKeysDto {
  @IsString()
  @Length(1, 200)
  p256dh: string;

  @IsString()
  @Length(1, 100)
  auth: string;
}

export class SubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @Length(1, 1000)
  endpoint: string;

  @ValidateNested()
  @Type(() => SubscriptionKeysDto)
  keys: SubscriptionKeysDto;
}

export class UnsubscribeDto {
  @IsString()
  @Length(1, 1000)
  endpoint: string;
}
