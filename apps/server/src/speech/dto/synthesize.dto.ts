import { IsString, MinLength } from 'class-validator';

export class SynthesizeDto {
  @IsString()
  @MinLength(1)
  text: string;
}
