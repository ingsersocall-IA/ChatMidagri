import { Module } from '@nestjs/common';
import { SpeechController } from './speech.controller';
import { SttService } from './stt.service';
import { TtsService } from './tts.service';

@Module({
  controllers: [SpeechController],
  providers: [SttService, TtsService],
  exports: [SttService, TtsService],
})
export class SpeechModule {}
