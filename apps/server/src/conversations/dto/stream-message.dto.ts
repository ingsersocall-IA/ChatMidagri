import { MinLength } from 'class-validator';

export class StreamMessageDto {
  @MinLength(3, { message: 'El mensaje debe tener al menos 3 caracteres.' })
  content: string;
}
