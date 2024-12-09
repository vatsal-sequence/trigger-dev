import { logger, task } from "@trigger.dev/sdk/v3";
import { ServerClient } from "postmark";

export type EmailNotificationSuccess = {
  success: true;
  output: {
    messageId: string;
  }
};

export type EmailNotificationError = {
  success: false;
  error: string;
};

export type EmailNotificationResult = EmailNotificationSuccess | EmailNotificationError;

const postmark = new ServerClient(process.env.POSTMARK_API_TOKEN!);

export const emailNotificationTask = task({
  id: "email-notification",
  maxDuration: 600000,
  run: async (payload: {
    email: string;
    videoUrl: string;
    audioUrl: string;
    transcriptionUrl: string;
    voiceUrl: string;
    processFolder: string;
  }, { ctx }): Promise<EmailNotificationResult> => {
    try {
      const response = await postmark.sendEmail({
        From: process.env.POSTMARK_FROM_EMAIL!,
        To: payload.email,
        Subject: "Video Processing Complete",
        HtmlBody: `
          <h1>🎥 Video Processing Complete</h1>
          <p>Process folder: <code>${payload.processFolder}</code></p>
          <h2>Generated Files:</h2>
          <ul>
            <li><strong>Video:</strong> <a href="${payload.videoUrl}">View Video</a></li>
            <li><strong>Audio:</strong> <a href="${payload.audioUrl}">Download Audio</a></li>
            <li><strong>Transcription:</strong> <a href="${payload.transcriptionUrl}">View Transcription</a></li>
            <li><strong>Voice Data:</strong> <a href="${payload.voiceUrl}">View Voice Data</a></li>
          </ul>
        `,
        TextBody: `
          Video Processing Complete
          
          Process folder: ${payload.processFolder}
          
          Generated Files:
          - Video: ${payload.videoUrl}
          - Audio: ${payload.audioUrl}
          - Transcription: ${payload.transcriptionUrl}
          - Voice Data: ${payload.voiceUrl}
        `,
        MessageStream: "outbound"
      });

      return {
        success: true,
        output: {
          messageId: response.MessageID
        }
      };
    } catch (error) {
      logger.error("Error sending email notification", { 
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },
}); 