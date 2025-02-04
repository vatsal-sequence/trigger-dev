import { logger, task } from "@trigger.dev/sdk/v3";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import { uploadToS3 } from "../../utils/s3";

export type AudioExtractionSuccess = {
  success: true;
  output: {
    audioBuffer: Buffer;
    s3Path: string;
    tempDir: string;
  }
};

export type AudioExtractionError = {
  success: false;
  error: string;
};

export type AudioExtractionResult = AudioExtractionSuccess | AudioExtractionError;

export const audioExtractorTask = task({
  id: "audio-extractor",
  maxDuration: 600000,
  run: async (payload: { videoUrl: string, processFolder: string }, { ctx }): Promise<AudioExtractionResult> => {
    let tempDir = '';
    try {
      if (!payload.videoUrl) {
        throw new Error('Video URL is required');
      }

      logger.info("Starting audio extraction", { videoUrl: payload.videoUrl });

      // Create temporary directory for processing
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-extraction-'));
      logger.info("Audio extraction tempDir", { tempDir });

      const videoPath = path.join(tempDir, 'video.mp4');
      const audioPath = path.join(tempDir, 'audio.mp3');

      // Download video
      logger.info("Downloading video");
      const response = await axios({
        method: 'GET',
        url: payload.videoUrl,
        responseType: 'arraybuffer'
      });
      await fs.writeFile(videoPath, response.data);

      // Extract audio
      logger.info("Extracting audio from video");
      await extractAudioFromVideo(videoPath, audioPath);

      // Read the audio file
      const audioBuffer = await fs.readFile(audioPath);

      // Upload to S3
      const s3Path = await uploadToS3(
        audioBuffer,
        payload.processFolder,
        'audio',
        'audio/mpeg'
      );

      logger.info("Audio file uploaded to S3", { s3Path });

      return {
        success: true,
        output: {
          audioBuffer,
          s3Path,
          tempDir
        }
      };
    } catch (error) {
      logger.error("Error in audio extraction task", {
        error: error.message,
        videoUrl: payload.videoUrl
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

async function extractAudioFromVideo(videoPath: string, outputPath: string): Promise<void> {
  if (!videoPath) throw new Error('Video path is required');
  if (!outputPath) throw new Error('Output path is required');

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .toFormat('mp3')
      .addOutputOptions([
        '-vn',                   // Disable video
        '-acodec', 'libmp3lame', // Use MP3 codec
        '-ab', '128k',           // Audio bitrate
        '-ar', '44100',          // Audio sample rate
        '-map', '0:a:0',         // Map first audio stream
        '-y'                     // Overwrite output
      ])
      .on('start', (commandLine) => {
        logger.info('FFmpeg started', { commandLine });
      })
      .on('end', () => {
        logger.info('FFmpeg finished');
        resolve();
      })
      .on('error', (err) => {
        logger.error('FFmpeg error', { error: err.message });
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .save(outputPath);
  });
} 