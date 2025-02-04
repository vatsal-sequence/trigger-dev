import { logger, task } from "@trigger.dev/sdk/v3";
import { createClient } from "@deepgram/sdk";
import axios from "axios";
import { uploadToS3 } from "../../utils/s3";

// Define response types
export type TranscriptionSuccess = {
  success: true;
  output: {
    transcription: string;
    s3Path: string;
  }
};

export type TranscriptionError = {
  success: false;
  error: string;
};

export type TranscriptionResult = TranscriptionSuccess | TranscriptionError;

// Initialize clients
const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

export const audioTranscriptionTask = task({
  id: "audio-transcription",
  maxDuration: 600000,
  run: async (payload: { audioUrl: string; videoUrl: string; processFolder: string }, { ctx }): Promise<TranscriptionResult> => {
    try {
      if (!payload.audioUrl) {
        throw new Error('Audio URL is required');
      }

      logger.info("Starting audio transcription", { audioUrl: payload.audioUrl });

      // Download audio file with proper error handling
      let audioBuffer: Buffer;
      try {
        const response = await axios({
          method: 'GET',
          url: payload.audioUrl,
          responseType: 'arraybuffer',
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 30000, // 30 seconds timeout
          validateStatus: (status) => status === 200,
          headers: {
            'Accept': '*/*',
            'User-Agent': 'TriggerDev-AudioProcessor/1.0'
          }
        });

        audioBuffer = Buffer.from(response.data);
        logger.info("Audio file downloaded successfully", {
          size: audioBuffer.length,
          contentType: response.headers['content-type']
        });
      } catch (error: any) {
        const errorMessage = error.response
          ? `Failed to download audio: ${error.response.status} - ${error.response.statusText}`
          : `Failed to download audio: ${error.message}`;

        logger.error("Audio download failed", {
          error: errorMessage,
          url: payload.audioUrl,
          status: error.response?.status,
          headers: error.response?.headers
        });

        throw new Error(errorMessage);
      }

      // Send to Deepgram for transcription
      const transcription = await transcribeAudio(audioBuffer);

      // Upload transcription to S3
      logger.info("Uploading transcription to S3");
      const s3Path = await uploadToS3(
        Buffer.from(transcription),
        payload.processFolder,
        'transcription',
        'text/plain'
      );

      logger.info("Transcription uploaded to S3", { s3Path });

      return {
        success: true,
        output: {
          transcription: transcription,
          s3Path: s3Path,
        }
      };
    } catch (error) {
      logger.error("Error in audio transcription task", {
        error: error.message,
        audioUrl: payload.audioUrl
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Audio buffer is empty or invalid');
  }

  try {
    const response = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        smart_format: true,
        punctuate: true,
      }
    );

    if (!response) {
      throw new Error('No response from Deepgram');
    }

    logger.info("Transcription completed successfully");
    return response.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  } catch (error) {
    logger.error("Deepgram transcription error", {
      error: error.message,
      errorType: error.constructor.name
    });
    throw new Error(`Transcription failed: ${error.message}`);
  }
}