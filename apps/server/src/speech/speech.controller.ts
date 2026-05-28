import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { SttService } from './stt.service';
import { TtsService } from './tts.service';

@Controller('speech')
@UseGuards(AuthGuard('jwt'))
export class SpeechController {
  constructor(
    private readonly stt: SttService,
    private readonly tts: TtsService,
  ) {}

  /**
   * POST /api/speech/transcribe
   * Recibe un archivo de audio (multipart/form-data, campo "file") y devuelve el texto transcrito.
   */
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ text: string }> {
    const text = await this.stt.transcribe(
      file.buffer,
      file.originalname ?? 'audio.wav',
    );
    return { text };
  }

  /**
   * GET /api/speech/synthesize/stream
   * Recibe texto por query param y transmite audio WAV codificado en base64 por SSE.
   * Eventos: { type: 'audio', data: '<base64>' } | { type: 'done' } | { type: 'error', message }
   */
  @Get('synthesize/stream')
  async synthesizeStream(
    @Query('text') text: string,
    @Query('conversationId') _conversationId: string,
    @Req() _req: { user: { userId: string } },
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    if (!text || text.trim().length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Texto vacío' })}\n\n`);
      res.end();
      return;
    }

    try {
      for await (const chunk of this.tts.synthesizeStream(text.trim())) {
        const base64 = chunk.toString('base64');
        res.write(`data: ${JSON.stringify({ type: 'audio', data: base64 })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error de síntesis';
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    }
    res.end();
  }
}
