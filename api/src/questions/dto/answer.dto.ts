import { IsInt, Matches, Max, Min } from 'class-validator';

export class QuestionParams {
  @Matches(/^[a-z_]+\.\d+$/)
  id: string;
}

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
