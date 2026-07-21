import type {
  AudioTranscriber,
  AudioTranscriptionResult,
  AudioTranscriptionTarget,
} from '../domain/audio-transcription.js';

export class FakeAudioTranscriber implements AudioTranscriber {
  public async transcribe(_target: AudioTranscriptionTarget): Promise<AudioTranscriptionResult> {
    return {
      text: 'Esta é uma transcrição simulada para validar o processamento local de áudio.',
      language: 'pt-BR',
      model: 'fake-local-v1',
      confidence: 0.99,
    };
  }
}
