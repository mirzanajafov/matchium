import { IsInt, Max, Min } from 'class-validator';

export class AnswerDto {
  @IsInt()
  @Min(1)
  @Max(5)
  self: number;

  @IsInt()
  @Min(1)
  @Max(5)
  partner: number;

  @IsInt()
  @Min(1)
  @Max(5)
  importance: number;
}
