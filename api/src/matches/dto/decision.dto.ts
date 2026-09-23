import { IsBoolean } from 'class-validator';

export class DecisionDto {
  @IsBoolean()
  like: boolean;
}
