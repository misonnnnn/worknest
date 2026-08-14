import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

const SIGNED_URL_EXPIRES_IN_SECONDS = 5 * 60;

let r2Client: S3Client | null = null;

function getR2Settings() {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = env.R2_BUCKET_NAME?.trim() || 'worknestfiles';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new AppError(
      'INTERNAL_ERROR',
      'File storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.',
      500,
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

function getR2Client() {
  if (r2Client) return r2Client;

  const { accountId, accessKeyId, secretAccessKey } = getR2Settings();

  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return r2Client;
}

export async function uploadToR2(input: {
  storageKey: string;
  body: Buffer;
  contentType: string;
}) {
  const { bucketName } = getR2Settings();

  try {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: input.storageKey,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('R2 upload failed:', err);
    throw new AppError('INTERNAL_ERROR', 'Failed to upload file to storage', 500);
  }
}

export async function deleteFromR2(storageKey: string) {
  const { bucketName } = getR2Settings();

  try {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
      }),
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    const name = (err as { name?: string }).name;
    if (name === 'NoSuchKey' || name === 'NotFound') return;
    console.error('R2 delete failed:', err);
    throw new AppError('INTERNAL_ERROR', 'Failed to delete file from storage', 500);
  }
}

export async function getR2SignedDownloadUrl(storageKey: string) {
  const { bucketName } = getR2Settings();

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
    });
    return await getSignedUrl(getR2Client(), command, {
      expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('R2 signed URL failed:', err);
    throw new AppError('INTERNAL_ERROR', 'Failed to create file download URL', 500);
  }
}
