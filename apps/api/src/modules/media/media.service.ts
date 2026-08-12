import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { deletePhysicalFile } from './media.storage';

export type MediaFolderDTO = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type MediaFileDTO = {
  id: string;
  name: string;
  folderId: string | null;
  storageKey: string;
  url: string;
  mimeType: string;
  size: number;
  alt: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapFolder(folder: {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): MediaFolderDTO {
  return folder;
}

function mapFile(file: {
  id: string;
  name: string;
  folderId: string | null;
  storageKey: string;
  url: string;
  mimeType: string;
  size: number;
  alt: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MediaFileDTO {
  return file;
}

async function getFolderByName(name: string, parentId: string | null) {
  return prisma.mediaFolder.findFirst({
    where: { name, parentId },
  });
}

async function getFileByName(name: string, folderId: string | null) {
  return prisma.mediaFile.findFirst({
    where: { name, folderId },
  });
}

function collectFolderIdsInSubtree(allFolders: MediaFolderDTO[], rootId: string | null) {
  if (!rootId) {
    return new Set(allFolders.map((folder) => folder.id));
  }

  const ids = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const parentId = queue.shift() as string;
    for (const folder of allFolders) {
      if (folder.parentId === parentId && !ids.has(folder.id)) {
        ids.add(folder.id);
        queue.push(folder.id);
      }
    }
  }

  return ids;
}

async function isFolderInside(possibleDescendantId: string, ancestorId: string) {
  let currentId: string | null = possibleDescendantId;

  while (currentId) {
    if (currentId === ancestorId) return true;
    const folder: { parentId: string | null } | null = await prisma.mediaFolder.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!folder) return false;
    currentId = folder.parentId;
  }

  return false;
}

async function assertFolderPasteTargetIsSafe(sourceFolderId: string, targetParentId: string | null) {
  if (!targetParentId) return;
  if (targetParentId === sourceFolderId) {
    throw badRequest('Cannot paste a folder inside itself');
  }
  if (await isFolderInside(targetParentId, sourceFolderId)) {
    throw badRequest('Cannot paste a folder inside one of its own subfolders');
  }
}

async function getUniqueFileName(name: string, folderId: string | null) {
  let candidate = name;
  let n = 2;

  while (await getFileByName(candidate, folderId)) {
    const lastDot = name.lastIndexOf('.');
    const hasExtension = lastDot > 0;
    const base = hasExtension ? name.slice(0, lastDot) : name;
    const ext = hasExtension ? name.slice(lastDot) : '';

    candidate = n === 2 ? `${base} (copy)${ext}` : `${base} (copy ${n})${ext}`;
    n += 1;
    if (n > 100) {
      candidate = `${base} (copy ${Date.now()})${ext}`;
      break;
    }
  }

  return candidate;
}

async function getUniqueFolderName(name: string, parentId: string | null) {
  let candidate = name;
  let n = 2;

  while (await getFolderByName(candidate, parentId)) {
    candidate = n === 2 ? `${name} (copy)` : `${name} (copy ${n})`;
    n += 1;
    if (n > 100) {
      candidate = `${name} (copy ${Date.now()})`;
      break;
    }
  }

  return candidate;
}

export const mediaService = {
  async listFolders(parentId: string | null) {
    const folders = await prisma.mediaFolder.findMany({
      where: { parentId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return folders.map(mapFolder);
  },

  async listAllFolders() {
    const folders = await prisma.mediaFolder.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return folders.map(mapFolder);
  },

  async getFolder(id: string) {
    const folder = await prisma.mediaFolder.findUnique({ where: { id } });
    if (!folder) throw notFound('Folder not found');
    return mapFolder(folder);
  },

  async createFolder(input: { name: string; parentId?: string | null; sortOrder?: number }) {
    const name = input.name.trim();
    if (!name) throw badRequest('Folder name is required');

    const parentId = input.parentId ?? null;
    if (parentId) await this.getFolder(parentId);

    if (await getFolderByName(name, parentId)) {
      throw conflict('Folder with this name already exists here');
    }

    const folder = await prisma.mediaFolder.create({
      data: {
        name,
        parentId,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    return mapFolder(folder);
  },

  async updateFolder(id: string, input: { name?: string; parentId?: string | null; sortOrder?: number }) {
    const existing = await prisma.mediaFolder.findUnique({ where: { id } });
    if (!existing) throw notFound('Folder not found');

    if (input.parentId !== undefined && input.parentId) {
      await this.getFolder(input.parentId);
      await assertFolderPasteTargetIsSafe(id, input.parentId);
    }

    const name = input.name?.trim();
    if (name) {
      const parentId = input.parentId !== undefined ? input.parentId : existing.parentId;
      const clash = await prisma.mediaFolder.findFirst({
        where: { name, parentId, NOT: { id } },
      });
      if (clash) throw conflict('Folder with this name already exists here');
    }

    const folder = await prisma.mediaFolder.update({
      where: { id },
      data: {
        name,
        parentId: input.parentId,
        sortOrder: input.sortOrder,
      },
    });

    return mapFolder(folder);
  },

  async deleteFolder(id: string) {
    const existing = await prisma.mediaFolder.findUnique({ where: { id } });
    if (!existing) throw notFound('Folder not found');

    const children = await this.listFolders(id);
    for (const child of children) {
      await this.deleteFolder(child.id);
    }

    const files = await this.listFiles(id);
    for (const file of files) {
      await this.deleteFile(file.id);
    }

    await prisma.mediaFolder.delete({ where: { id } });
    return { id };
  },

  async listFiles(folderId: string | null) {
    const files = await prisma.mediaFile.findMany({
      where: { folderId },
      orderBy: { name: 'asc' },
    });
    return files.map(mapFile);
  },

  async getFile(id: string) {
    const file = await prisma.mediaFile.findUnique({ where: { id } });
    if (!file) throw notFound('File not found');
    return mapFile(file);
  },

  async createFile(input: {
    name: string;
    folderId?: string | null;
    storageKey: string;
    url: string;
    mimeType: string;
    size: number;
    alt?: string | null;
  }) {
    const folderId = input.folderId ?? null;
    if (folderId) await this.getFolder(folderId);

    const file = await prisma.mediaFile.create({
      data: {
        name: input.name,
        folderId,
        storageKey: input.storageKey,
        url: input.url,
        mimeType: input.mimeType,
        size: input.size,
        alt: input.alt ?? null,
      },
    });

    return mapFile(file);
  },

  async updateFile(id: string, input: { name?: string; folderId?: string | null; alt?: string | null }) {
    const existing = await prisma.mediaFile.findUnique({ where: { id } });
    if (!existing) throw notFound('File not found');

    if (input.folderId) await this.getFolder(input.folderId);

    const name = input.name?.trim();
    if (name) {
      const folderId = input.folderId !== undefined ? input.folderId : existing.folderId;
      const clash = await prisma.mediaFile.findFirst({
        where: { name, folderId, NOT: { id } },
      });
      if (clash) throw conflict('File with this name already exists here');
    }

    const file = await prisma.mediaFile.update({
      where: { id },
      data: {
        name,
        folderId: input.folderId,
        alt: input.alt,
      },
    });

    return mapFile(file);
  },

  async deleteFile(id: string) {
    const existing = await prisma.mediaFile.findUnique({ where: { id } });
    if (!existing) throw notFound('File not found');

    await prisma.mediaFile.delete({ where: { id } });

    const remaining = await prisma.mediaFile.count({
      where: { storageKey: existing.storageKey },
    });
    if (remaining === 0) {
      await deletePhysicalFile(existing.storageKey);
    }

    return { id };
  },

  async search(query: string, folderId: string | null) {
    const q = query.trim().toLowerCase();
    if (!q) return { folders: [] as MediaFolderDTO[], files: [] as MediaFileDTO[] };

    const allFolders = await this.listAllFolders();
    const scopeIds = collectFolderIdsInSubtree(allFolders, folderId);
    const searchingFromRoot = !folderId;

    const folders = allFolders.filter((folder) => {
      if (!scopeIds.has(folder.id)) return false;
      if (!searchingFromRoot && folder.id === folderId) return false;
      return folder.name.toLowerCase().includes(q);
    });

    const allFiles = (await prisma.mediaFile.findMany()).map(mapFile);
    const files = allFiles.filter((file) => {
      const fileFolderId = file.folderId;
      if (!searchingFromRoot) {
        if (fileFolderId === null || !scopeIds.has(fileFolderId)) return false;
      }
      return file.name.toLowerCase().includes(q);
    });

    return { folders, files };
  },

  async copyFileToFolder(sourceId: string, targetFolderId: string | null) {
    const source = await this.getFile(sourceId);
    if (targetFolderId) await this.getFolder(targetFolderId);

    const name = await getUniqueFileName(source.name, targetFolderId);

    return this.createFile({
      name,
      folderId: targetFolderId,
      storageKey: source.storageKey,
      url: source.url,
      mimeType: source.mimeType,
      size: source.size,
      alt: source.alt,
    });
  },

  async copyFolderToParent(sourceId: string, targetParentId: string | null) {
    const source = await this.getFolder(sourceId);
    if (targetParentId) await this.getFolder(targetParentId);
    await assertFolderPasteTargetIsSafe(sourceId, targetParentId);

    const name = await getUniqueFolderName(source.name, targetParentId);

    const created = await prisma.mediaFolder.create({
      data: {
        name,
        parentId: targetParentId,
        sortOrder: source.sortOrder,
      },
    });

    const files = await this.listFiles(source.id);
    for (const file of files) {
      await this.copyFileToFolder(file.id, created.id);
    }

    const children = await this.listFolders(source.id);
    for (const child of children) {
      await this.copyFolderToParent(child.id, created.id);
    }

    return mapFolder(created);
  },

  async moveFileToFolder(sourceId: string, targetFolderId: string | null) {
    const source = await this.getFile(sourceId);
    if (targetFolderId) await this.getFolder(targetFolderId);

    if ((source.folderId ?? null) === (targetFolderId ?? null)) {
      return source;
    }

    const duplicate = await getFileByName(source.name, targetFolderId);
    if (duplicate && duplicate.id !== source.id) {
      throw conflict(`A file named "${source.name}" already exists here`);
    }

    return this.updateFile(source.id, { folderId: targetFolderId });
  },

  async moveFolderToParent(sourceId: string, targetParentId: string | null) {
    const source = await this.getFolder(sourceId);
    if (targetParentId) await this.getFolder(targetParentId);
    await assertFolderPasteTargetIsSafe(sourceId, targetParentId);

    if ((source.parentId ?? null) === (targetParentId ?? null)) {
      return source;
    }

    const duplicate = await getFolderByName(source.name, targetParentId);
    if (duplicate && duplicate.id !== source.id) {
      throw conflict(`A folder named "${source.name}" already exists here`);
    }

    return this.updateFolder(source.id, { parentId: targetParentId });
  },

  getUniqueFileNameForUpload(name: string, folderId: string | null) {
    return getUniqueFileName(name, folderId);
  },
};
