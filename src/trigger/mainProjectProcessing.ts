import { batch, logger, task, tasks } from "@trigger.dev/sdk/v3";
import { audioExtractorTask } from "./audioExtractor";
import { audioTranscriptionTask } from "./audioTranscription";
import { voiceExtractorTask } from "./voiceExtractor";
import { generateProcessFolder } from "../../utils/s3";
import { slackNotificationTask } from "./slackNotification";
import { emailNotificationTask } from "./emailNotification";

export const mainProjectProcessingTask = task({
  id: "main-project-processing",
  maxDuration: 600000,
  run: async (payload: { videoUrl: string; email: string, slackWebhookUrl: string, voiceId: string }, { ctx }) => {
    try {
      if (!payload.videoUrl) {
        throw new Error('Video URL is required');
      }

      // const jobStatus = await tasks.trigger("get-job-status", { });

      logger.info("Starting main project processing", { payload });

      const processFolder = generateProcessFolder();
      logger.info("Created process folder", { processFolder });

      // Step 1: Run audio extraction and voice extraction in parallel using batch
      const results = await batch.triggerAndWait<typeof audioExtractorTask | typeof voiceExtractorTask>([
        {
          id: "audio-extractor",
          payload: { videoUrl: payload.videoUrl, processFolder }
        },
        {
          id: "voice-extractor",
          payload: { videoUrl: payload.videoUrl, processFolder, voiceId: payload.voiceId }
        }
      ]);

      let audioBuffer: Buffer | undefined;
      let audioUrl: string | undefined;
      let voiceData: any;
      let voiceDataPath: string | undefined;

      // Update to handle the correct batch results structure
      for (const run of results.runs) {
        if (run.ok) {
          switch (run.taskIdentifier) {
            case "audio-extractor":
              if (run.output.success) {
                audioBuffer = run.output.output.audioBuffer;
                audioUrl = run.output.output.s3Path;
              }
              break;
            case "voice-extractor":
              if (run.output.success) {
                voiceData = run.output.output.voiceData;
                voiceDataPath = run.output.output.s3Path;
              }
              break;
          }
        } else {
          throw new Error(`Task ${run.taskIdentifier} failed: ${run.error}`);
        }
      }

      if (!audioBuffer) {
        throw new Error('Audio extraction failed or buffer is missing');
      }

      // Step 2: Transcribe the audio
      const transcriptionResult = await audioTranscriptionTask.triggerAndWait({
        audioUrl: audioUrl!,
        videoUrl: payload.videoUrl,
        processFolder
      });

      if (!transcriptionResult.ok || !transcriptionResult.output.success) {
        throw new Error(`Transcription failed: ${JSON.stringify(transcriptionResult)}`);
      }

      const response = {
        success: true,
        transcription: transcriptionResult.output.output.transcription,
        transcriptionPath: transcriptionResult.output.output.s3Path,
        audioPath: audioUrl,
        voiceData,
        voiceDataPath
      }

      logger.info("Main project processing response", { response });

      // After getting all results, send notifications
      const notificationPayload = {
        videoUrl: payload.videoUrl,
        audioUrl: audioUrl!,
        transcriptionUrl: transcriptionResult.output.output.s3Path,
        voiceUrl: voiceDataPath!,
        processFolder,
      };

      const notificationResults = await batch.triggerAndWait<typeof slackNotificationTask | typeof emailNotificationTask>([
        {
          id: "slack-notification",
          payload: { ...notificationPayload, slackWebhookUrl: payload.slackWebhookUrl }
        },
        {
          id: "email-notification",
          payload: { ...notificationPayload, email: payload.email }
        }
      ]);


      for (const run of notificationResults.runs) {
        if (run.ok) {
          switch (run.taskIdentifier) {
            case "slack-notification":
              if (run.output.success) {
                logger.info("Slack notification success", { run });
              }
              break;
            case "email-notification":
              if (run.output.success) {
                logger.info("Email notification success", { run });
              }
              break;
          }
        } else {
          throw new Error(`Task ${run.taskIdentifier} failed: ${run.error}`);
        }
      }

      return response;
    } catch (error) {
      logger.error("Main project processing failed", {
        error: error.message,
        payload
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },
});