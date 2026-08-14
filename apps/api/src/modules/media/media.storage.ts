import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { deleteFromR2, getR2SignedDownloadUrl, uploadToR2 } from './r2';

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export function getUploadDir() {
  return path.resolve(process.cwd(), env.UPLOAD_DIR);
}

export function buildPublicUrl(storageKey: string) {
  return `${env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')}/uploads/${storageKey}`;
}

export function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** New R2 keys look like documents/2026/08/uuid-name.ext. Old local keys have no slash. */
export function isR2StorageKey(storageKey: string) {
  return storageKey.includes('/');
}

function buildStorageKey(originalName: string) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `documents/${year}/${month}/${randomUUID()}-${sanitizeFilename(originalName)}`;
}

export async function saveUploadedFile(originalName: string, buffer: Buffer, mimeType: string) {
  const storageKey = buildStorageKey(originalName);
  await uploadToR2({
    storageKey,
    body: buffer,
    contentType: mimeType,
  });
  return { storageKey };
}

export async function getFileAccessUrl(storageKey: string) {
  if (isR2StorageKey(storageKey)) {
    return getR2SignedDownloadUrl(storageKey);
  }
  return buildPublicUrl(storageKey);
}

export async function deleteStoredFile(storageKey: string) {
  if (isR2StorageKey(storageKey)) {
    await deleteFromR2(storageKey);
    return;
  }

  try {
    await fs.unlink(path.join(getUploadDir(), storageKey));
  } catch {
    // local file may already be removed
  }
}
