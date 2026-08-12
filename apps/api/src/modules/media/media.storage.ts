import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';

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

export async function ensureUploadDir() {
  await fs.mkdir(getUploadDir(), { recursive: true });
}

export async function saveUploadedFile(originalName: string, buffer: Buffer) {
  await ensureUploadDir();
  const storageKey = `${randomUUID()}-${sanitizeFilename(originalName)}`;
  const absolutePath = path.join(getUploadDir(), storageKey);
  await fs.writeFile(absolutePath, buffer);
  return {
    storageKey,
    url: buildPublicUrl(storageKey),
  };
}

export async function deletePhysicalFile(storageKey: string) {
  try {
    await fs.unlink(path.join(getUploadDir(), storageKey));
  } catch {
    // file may already be removed
  }
}
