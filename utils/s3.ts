import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION_FILE_STACK,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_FILE_STACK!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_FILE_STACK!,
  },
});

export function generateProcessFolder(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `vatsal-automation/process_${timestamp}`;
}

export async function uploadToS3(
  buffer: Buffer,
  processFolder: string,
  fileType: 'audio' | 'transcription' | 'voice',
  contentType: string
): Promise<string> {
  const fileName = `${fileType}_${Date.now()}.${getFileExtension(fileType)}`;
  const key = `${processFolder}/${fileType}/${fileName}`;

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_FILE_STACK,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read',
    CacheControl: 'max-age=31536000',
  }));

  return `https://${process.env.AWS_BUCKET_FILE_STACK}.s3.${process.env.AWS_DEFAULT_REGION_FILE_STACK}.amazonaws.com/${key}`;
}

function getFileExtension(fileType: 'audio' | 'transcription' | 'voice'): string {
  switch (fileType) {
    case 'audio':
      return 'mp3';
    case 'transcription':
      return 'txt';
    case 'voice':
      return 'json';
  }
} 