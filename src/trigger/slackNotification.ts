import { logger, task } from "@trigger.dev/sdk/v3";
import axios from "axios";

export type SlackNotificationSuccess = {
  success: true;
  output: {
    messageTs: string;
  }
};

export type SlackNotificationError = {
  success: false;
  error: string;
};

export type SlackNotificationResult = SlackNotificationSuccess | SlackNotificationError;

export const slackNotificationTask = task({
  id: "slack-notification",
  maxDuration: 600000,
  run: async (payload: {
    slackWebhookUrl: string;
    videoUrl: string;
    audioUrl: string;
    transcriptionUrl: string;
    voiceUrl: string;
    processFolder: string;
  }, { ctx }): Promise<SlackNotificationResult> => {
    try {
      const message = {
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🎥 New Video Processing Complete!",
              emoji: true
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Process folder: \`${payload.processFolder}\``
            }
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Video URL:*\n<${payload.videoUrl}|Click to view>`
              },
              {
                type: "mrkdwn",
                text: `*Audio URL:*\n<${payload.audioUrl}|Click to download>`
              }
            ]
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Transcription:*\n<${payload.transcriptionUrl}|Click to view>`
              },
              {
                type: "mrkdwn",
                text: `*Voice Data:*\n<${payload.voiceUrl}|Click to view>`
              }
            ]
          }
        ]
      };

      const response = await axios.post(payload.slackWebhookUrl, message);

      if (response.status !== 200) {
        throw new Error(`Slack API returned status ${response.status}`);
      }

      return {
        success: true,
        output: {
          messageTs: response.data.ts
        }
      };
    } catch (error) {
      logger.error("Error sending Slack notification", { 
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },
}); 