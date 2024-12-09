import { logger, task } from "@trigger.dev/sdk/v3";
import { S3Client } from "@aws-sdk/client-s3";
import axios from "axios";
import { uploadToS3 } from "../../utils/s3";

// Define response types
export type VoiceExtractionSuccess = {
  success: true;
  output: {
    voiceData: any;
    s3Path: string;
  }
};

export type VoiceExtractionError = {
  success: false;
  error: string;
};

export type VoiceExtractionResult = VoiceExtractionSuccess | VoiceExtractionError;

export const voiceExtractorTask = task({
  id: "voice-extractor",
  maxDuration: 600000,
  run: async (payload: { videoUrl: string, processFolder: string, voiceId: string }, { ctx }): Promise<VoiceExtractionResult> => {
    try {
      logger.info("Starting voice data extraction");

      // Fetch voice data from API
      const voiceData = await fetchVoiceData(payload.voiceId);
      logger.info("Voice data fetched successfully");

      // Upload to S3
      logger.info("Uploading voice data to S3");
      const s3Path = await uploadVoiceDataToS3(voiceData, payload.videoUrl, payload.processFolder);

      logger.info("Voice data uploaded to S3", { s3Path });

      return {
        success: true,
        output: {
          voiceData,
          s3Path
        }
      };
    } catch (error) {
      logger.error("Error in voice extraction task", { 
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

async function fetchVoiceData(voiceId: string): Promise<any> {
  try {
    const response = await axios.get(`${process.env.VOICES_API_URL}/${voiceId}`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.data) {
      throw new Error('No data received from voice API');
    }

    return response.data;
  } catch (error: any) {
    logger.error("Failed to fetch voice data", {
      error: error.message,
      status: error.response?.status
    });
    throw new Error(`Voice API request failed: ${error.message}`);
  }
}

async function uploadVoiceDataToS3(voiceData: any, videoUrl: string, processFolder: string): Promise<string> {
  return await uploadToS3(
    Buffer.from(JSON.stringify(voiceData, null, 2)),
    processFolder,
    'voice',
    'application/json'
  );
} 