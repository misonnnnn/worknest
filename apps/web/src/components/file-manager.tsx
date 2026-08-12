'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eye,
  Folder,
  FolderOpen,
  FolderPlus,
  Info,
  Link as LinkIcon,
  Pencil,
  Scissors,
  Trash2,
  Upload,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/components/auth-provider';
import { apiRequest, apiUpload, ApiClientError, mediaUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type MediaFolder = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

type MediaFile = {
  id: string;
  name: string;
  folderId: string | null;
  url: string;
  mimeType: string;
  size: number;
  alt: string | null;
};

type ClipboardItem = { type: 'folder' | 'file'; id: string; name: string };
type Clipboard = { mode: 'copy' | 'cut'; items: ClipboardItem[] };

function formatFileSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(1)} KB`;
  return `${bytes} B`;
}

export function FileManager() {
  const { can } = useAuth();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [allFolders, setAllFolders] = useState<MediaFolder[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [renameTarget, setRenameTarget] = useState<ClipboardItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [detailsFolder, setDetailsFolder] = useState<MediaFolder | null>(null);
  const [viewFile, setViewFile] = useState<MediaFile | null>(null);
  const [selectedItems, setSelectedItems] = useState<ClipboardItem[]>([]);
  const selectedItemsRef = useRef<ClipboardItem[]>([]);
  const suppressClickRef = useRef(false);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  function updateSelectedItems(items: ClipboardItem[] | ((prev: ClipboardItem[]) => ClipboardItem[])) {
    setSelectedItems((prev) => {
      const next = typeof items === 'function' ? items(prev) : items;
      selectedItemsRef.current = next;
      return next;
    });
  }

  const canView = can('media.view');
  const canCreate = can('media.create');
  const canUpdate = can('media.update');
  const canDelete = can('media.delete');

  const fetchContents = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!canView) return;
      if (showLoading) setIsLoading(true);
      try {
        const parentQuery = currentFolderId ? { parent_id: currentFolderId } : {};
        const folderQuery = currentFolderId ? { folder_id: currentFolderId } : {};
        const [folderData, fileData, treeData] = await Promise.all([
          apiRequest<MediaFolder[]>('/media/folders', { query: parentQuery }),
          apiRequest<MediaFile[]>('/media/files', { query: folderQuery }),
          apiRequest<MediaFolder[]>('/media/folders', { query: { all: true } }),
        ]);
        setFolders(folderData);
        setFiles(fileData);
        setAllFolders(treeData);
      } catch (err) {
        toast.error(err instanceof ApiClientError ? err.message : 'Failed to load file manager');
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [canView, currentFolderId],
  );

  useEffect(() => {
    void fetchContents({ showLoading: true });
  }, [fetchContents]);

  useEffect(() => {
    updateSelectedItems([]);
  }, [currentFolderId]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setIsSearching(false);
      void fetchContents();
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const query: Record<string, string> = { q };
        if (currentFolderId) query.folder_id = currentFolderId;
        const result = await apiRequest<{ folders: MediaFolder[]; files: MediaFile[] }>(
          '/media/search',
          { query },
        );
        setFolders(result.folders);
        setFiles(result.files);
        updateSelectedItems([]);
      } catch (err) {
        toast.error(err instanceof ApiClientError ? err.message : 'Search failed');
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, currentFolderId, fetchContents]);

  useEffect(() => {
    setExpandedIds((prev) => {
      const next = { ...prev };
      for (const item of folderPath) next[item.id] = true;
      return next;
    });
  }, [folderPath]);

  const getChildFolders = (parentId: string | null) =>
    allFolders.filter((f) => (parentId ? f.parentId === parentId : !f.parentId));

  const navigateToFolder = (folder: MediaFolder) => {
    const byId = Object.fromEntries(allFolders.map((f) => [f.id, f]));
    const chain: Array<{ id: string; name: string }> = [];
    let current: MediaFolder | undefined = folder;
    while (current) {
      chain.unshift({ id: current.id, name: current.name });
      current = current.parentId ? byId[current.parentId] : undefined;
    }
    setFolderPath(chain);
    setCurrentFolderId(folder.id);
    setSearchQuery('');
    setRenameTarget(null);
    setDetailsFolder(null);
    setViewFile(null);
    updateSelectedItems([]);
  };

  const goToRoot = () => {
    setFolderPath([]);
    setCurrentFolderId(null);
    setSearchQuery('');
  };

  const isItemSelected = (type: string, id: string) =>
    selectedItems.some((item) => item.type === type && item.id === id);

  const isItemCut = (type: string, id: string) =>
    clipboard?.mode === 'cut' && clipboard.items.some((item) => item.type === type && item.id === id);

  const handleSelectItem = (e: React.MouseEvent, item: ClipboardItem) => {
    // Right-click (and the click some browsers fire after it) must not
    // collapse a multi-selection before Copy/Cut/Delete.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (e.button !== 0) return;

    if (e.ctrlKey || e.metaKey) {
      updateSelectedItems((prev) => {
        const exists = prev.some((s) => s.type === item.type && s.id === item.id);
        return exists
          ? prev.filter((s) => !(s.type === item.type && s.id === item.id))
          : [...prev, item];
      });
    } else {
      updateSelectedItems([item]);
    }
  };

  const handleItemContextMenu = (item: ClipboardItem) => {
    suppressClickRef.current = true;
    const prev = selectedItemsRef.current;
    const alreadySelected = prev.some((s) => s.type === item.type && s.id === item.id);
    if (!alreadySelected) {
      updateSelectedItems([item]);
    }
  };

  const getItemsForAction = (clicked: ClipboardItem) => {
    const selection = selectedItemsRef.current;
    const inSelection = selection.some((s) => s.type === clicked.type && s.id === clicked.id);
    return inSelection && selection.length > 1 ? selection : [clicked];
  };

  const copyItems = (items: ClipboardItem[]) => {
    setClipboard({ mode: 'copy', items });
    toast.success(`Copied ${items.length} item(s)`);
  };

  const cutItems = (items: ClipboardItem[]) => {
    setClipboard({ mode: 'cut', items });
    toast.success(`Cut ${items.length} item(s)`);
  };

  async function handleCreateFolder(e: FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/media/folders', {
        method: 'POST',
        body: { name: folderName, parent_id: currentFolderId },
      });
      toast.success('Folder created');
      setCreateFolderOpen(false);
      setFolderName('');
      void fetchContents();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to create folder');
    }
  }

  async function handleUpload() {
    if (!selectedFiles.length) {
      toast.error('Choose at least one image');
      return;
    }
    try {
      const formData = new FormData();
      for (const file of selectedFiles) formData.append('files', file);
      if (currentFolderId) formData.append('folder_id', currentFolderId);
      await apiUpload('/media/files', formData);
      toast.success(`Uploaded ${selectedFiles.length} file(s)`);
      setUploadOpen(false);
      setSelectedFiles([]);
      void fetchContents();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Upload failed');
    }
  }

  async function handleSaveRename() {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      if (renameTarget.type === 'folder') {
        await apiRequest(`/media/folders/${renameTarget.id}`, {
          method: 'PATCH',
          body: { name: renameValue.trim() },
        });
        setFolderPath((prev) =>
          prev.map((item) =>
            item.id === renameTarget.id ? { ...item, name: renameValue.trim() } : item,
          ),
        );
      } else {
        await apiRequest(`/media/files/${renameTarget.id}`, {
          method: 'PATCH',
          body: { name: renameValue.trim() },
        });
      }
      toast.success('Renamed');
      setRenameTarget(null);
      setRenameValue('');
      void fetchContents();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Rename failed');
    }
  }

  async function handleDeleteItems(items: ClipboardItem[]) {
    if (!items.length) return;
    if (
      !window.confirm(
        `Delete ${items.length} item(s)? Folders will be deleted with their contents.`,
      )
    ) {
      return;
    }

    let ok = 0;
    let fail = 0;
    let firstError = '';
    for (const item of items.filter((i) => i.type === 'file')) {
      try {
        await apiRequest(`/media/files/${item.id}`, { method: 'DELETE' });
        ok += 1;
      } catch (err) {
        fail += 1;
        if (!firstError) {
          firstError = err instanceof ApiClientError ? err.message : 'Failed to delete file';
        }
      }
    }
    for (const item of items.filter((i) => i.type === 'folder')) {
      try {
        await apiRequest(`/media/folders/${item.id}`, { method: 'DELETE' });
        ok += 1;
      } catch (err) {
        fail += 1;
        if (!firstError) {
          firstError = err instanceof ApiClientError ? err.message : 'Failed to delete folder';
        }
      }
    }
    updateSelectedItems([]);
    if (fail === 0) {
      toast.success(`Deleted ${ok} item(s)`);
    } else {
      toast.error(firstError || `Deleted ${ok}, failed ${fail}`);
    }
    void fetchContents();
  }

  async function handlePaste(targetFolderId: string | null = currentFolderId) {
    if (!clipboard?.items.length) {
      toast.error('Nothing to paste');
      return;
    }
    const isCut = clipboard.mode === 'cut';
    let ok = 0;
    let fail = 0;
    for (const item of clipboard.items) {
      if (
        item.type === 'folder' &&
        (item.id === targetFolderId || folderPath.some((pathItem) => pathItem.id === item.id))
      ) {
        fail += 1;
        toast.error(`Cannot paste folder "${item.name}" inside itself`);
        continue;
      }
      try {
        if (item.type === 'folder') {
          await apiRequest(isCut ? '/media/folders/move' : '/media/folders/copy', {
            method: 'POST',
            body: { source_id: item.id, parent_id: targetFolderId },
          });
        } else {
          await apiRequest(isCut ? '/media/files/move' : '/media/files/copy', {
            method: 'POST',
            body: { source_id: item.id, folder_id: targetFolderId },
          });
        }
        ok += 1;
      } catch (err) {
        fail += 1;
        if (err instanceof ApiClientError) toast.error(err.message);
      }
    }
    if (isCut && fail === 0) setClipboard(null);
    fail === 0
      ? toast.success(isCut ? `Moved ${ok} item(s)` : `Pasted ${ok} item(s)`)
      : toast.error(`Done ${ok}, failed ${fail}`);
    void fetchContents();
  }

  function renderFolderTreeNode(folder: MediaFolder, depth: number) {
    const children = getChildFolders(folder.id);
    const isExpanded = !!expandedIds[folder.id];
    const isActive = currentFolderId === folder.id;
    const item: ClipboardItem = { type: 'folder', id: folder.id, name: folder.name };

    return (
      <div key={folder.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={`flex cursor-pointer select-none items-center gap-1 rounded-md py-1.5 pr-2 text-sm ${
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'hover:bg-muted'
              } ${isItemCut('folder', folder.id) ? 'opacity-40' : ''}`}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              onClick={() => navigateToFolder(folder)}
            >
              <button
                type="button"
                className="flex h-4 w-4 shrink-0 items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  if (children.length) toggleExpand(folder.id);
                }}
              >
                {children.length ? (
                  isExpanded ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )
                ) : (
                  <span className="w-3.5" />
                )}
              </button>
              <Folder className="size-3.5 shrink-0" />
              <span className="truncate">{folder.name}</span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => navigateToFolder(folder)}>
              <FolderOpen className="size-4" /> Open
            </ContextMenuItem>
            {canUpdate ? (
              <ContextMenuItem
                onSelect={() => {
                  setRenameTarget(item);
                  setRenameValue(folder.name);
                }}
              >
                <Pencil className="size-4" /> Rename
              </ContextMenuItem>
            ) : null}
            {canCreate ? (
              <ContextMenuItem onSelect={() => copyItems([item])}>
                <Copy className="size-4" /> Copy
              </ContextMenuItem>
            ) : null}
            {canUpdate ? (
              <ContextMenuItem onSelect={() => cutItems([item])}>
                <Scissors className="size-4" /> Cut
              </ContextMenuItem>
            ) : null}
            {canDelete ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={() => void handleDeleteItems([item])}>
                  <Trash2 className="size-4" /> Delete
                </ContextMenuItem>
              </>
            ) : null}
          </ContextMenuContent>
        </ContextMenu>
        {isExpanded ? children.map((child) => renderFolderTreeNode(child, depth + 1)) : null}
      </div>
    );
  }

  function toggleExpand(folderId: string) {
    setExpandedIds((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }

  if (!canView) {
    return (
      <div>
        <PageHeader title="File Manager" description="Media library" />
        <p className="text-sm text-destructive">You do not have permission to view the media library.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="File Manager"
        description="Upload and organize images. Ctrl/Cmd+click for multi-select, right-click for actions."
      />

      <Card className="overflow-hidden py-0">
        <div className="flex min-h-[560px]">
          <div className="w-64 shrink-0 overflow-auto border-r bg-muted/30 p-3">
            <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">Folders</p>
            <div
              className={`mb-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                currentFolderId === null ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
              onClick={goToRoot}
            >
              <FolderOpen className="size-3.5" />
              Root
            </div>
            {getChildFolders(null).map((folder) => renderFolderTreeNode(folder, 0))}
          </div>

          <div className="min-w-0 flex-1 p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {canCreate ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setCreateFolderOpen(true)}>
                    <FolderPlus className="size-4" />
                  </Button>
                  <Button size="sm" onClick={() => setUploadOpen(true)}>
                    <Upload className="size-4" />
                  </Button>
                </>
              ) : null}
              {canUpdate ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!clipboard?.items.length}
                  onClick={() => void handlePaste()}
                >
                  <ClipboardPaste className="size-4" />
                  Paste
                  {clipboard?.items.length ? ` (${clipboard.items.length})` : ''}
                </Button>
              ) : null}
              {selectedItems.length > 1 ? (
                <span className="text-xs text-muted-foreground">{selectedItems.length} selected</span>
              ) : null}
              <div className="ml-auto w-full sm:w-64">
                <Input
                  placeholder="Search files and folders…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <button type="button" className="hover:text-foreground" onClick={goToRoot}>
                Root
              </button>
              {folderPath.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className="hover:text-foreground"
                  onClick={() => {
                    const next = folderPath.slice(0, index + 1);
                    setFolderPath(next);
                    setCurrentFolderId(next[next.length - 1].id);
                    setSearchQuery('');
                  }}
                >
                  / {item.name}
                </button>
              ))}
            </div>

            {isLoading || isSearching ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-md" />
                ))}
              </div>
            ) : folders.length === 0 && files.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {searchQuery.trim() ? 'No matching files or folders' : 'No folders or images here'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {folders.map((folder) => {
                  const item: ClipboardItem = { type: 'folder', id: folder.id, name: folder.name };
                  const selected = isItemSelected('folder', folder.id);
                  return (
                    <ContextMenu key={folder.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={`cursor-pointer select-none rounded-md p-4 hover:bg-muted ${
                            selected ? 'ring-2 ring-primary' : ''
                          } ${isItemCut('folder', folder.id) ? 'opacity-40' : ''}`}
                          onClick={(e) => handleSelectItem(e, item)}
                          onContextMenu={() => handleItemContextMenu(item)}
                          onDoubleClick={() => navigateToFolder(folder)}
                        >
                          <Folder className="size-14 text-muted-foreground" />
                          <p className="mt-2 max-w-[120px] truncate text-sm">{folder.name}</p>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => navigateToFolder(folder)}>
                          <FolderOpen className="size-4" /> Open
                        </ContextMenuItem>
                        {canUpdate ? (
                          <ContextMenuItem
                            onSelect={() => {
                              setRenameTarget(item);
                              setRenameValue(folder.name);
                            }}
                          >
                            <Pencil className="size-4" /> Rename
                          </ContextMenuItem>
                        ) : null}
                        <ContextMenuItem onSelect={() => setDetailsFolder(folder)}>
                          <Info className="size-4" /> Details
                        </ContextMenuItem>
                        {canCreate ? (
                          <ContextMenuItem onSelect={() => copyItems(getItemsForAction(item))}>
                            <Copy className="size-4" /> Copy
                            {selected && selectedItems.length > 1 ? ` (${selectedItems.length})` : ''}
                          </ContextMenuItem>
                        ) : null}
                        {canUpdate ? (
                          <ContextMenuItem onSelect={() => cutItems(getItemsForAction(item))}>
                            <Scissors className="size-4" /> Cut
                            {selected && selectedItems.length > 1 ? ` (${selectedItems.length})` : ''}
                          </ContextMenuItem>
                        ) : null}
                        {canUpdate && clipboard?.items.length ? (
                          <ContextMenuItem onSelect={() => void handlePaste(folder.id)}>
                            <ClipboardPaste className="size-4" /> Paste inside
                          </ContextMenuItem>
                        ) : null}
                        {canDelete ? (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              variant="destructive"
                              onSelect={() => void handleDeleteItems(getItemsForAction(item))}
                            >
                              <Trash2 className="size-4" /> Delete
                            </ContextMenuItem>
                          </>
                        ) : null}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}

                {files.map((file) => {
                  const item: ClipboardItem = { type: 'file', id: file.id, name: file.name };
                  const selected = isItemSelected('file', file.id);
                  return (
                    <ContextMenu key={file.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={`cursor-pointer select-none rounded-md p-3 hover:bg-muted ${
                            selected ? 'ring-2 ring-primary' : ''
                          } ${isItemCut('file', file.id) ? 'opacity-40' : ''}`}
                          onClick={(e) => handleSelectItem(e, item)}
                          onContextMenu={() => handleItemContextMenu(item)}
                          onDoubleClick={() => setViewFile(file)}
                        >
                          <img
                            src={mediaUrl(file.url)}
                            alt={file.alt ?? file.name}
                            className="max-h-[100px] max-w-[150px] object-contain"
                          />
                          <p className="mt-2 max-w-[150px] truncate text-sm">{file.name}</p>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => setViewFile(file)}>
                          <Eye className="size-4" /> View
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => {
                            void navigator.clipboard.writeText(mediaUrl(file.url));
                            toast.success('URL copied');
                          }}
                        >
                          <LinkIcon className="size-4" /> Copy URL
                        </ContextMenuItem>
                        {canUpdate ? (
                          <ContextMenuItem
                            onSelect={() => {
                              setRenameTarget(item);
                              setRenameValue(file.name);
                            }}
                          >
                            <Pencil className="size-4" /> Rename
                          </ContextMenuItem>
                        ) : null}
                        {canCreate ? (
                          <ContextMenuItem onSelect={() => copyItems(getItemsForAction(item))}>
                            <Copy className="size-4" /> Copy
                            {selected && selectedItems.length > 1 ? ` (${selectedItems.length})` : ''}
                          </ContextMenuItem>
                        ) : null}
                        {canUpdate ? (
                          <ContextMenuItem onSelect={() => cutItems(getItemsForAction(item))}>
                            <Scissors className="size-4" /> Cut
                            {selected && selectedItems.length > 1 ? ` (${selectedItems.length})` : ''}
                          </ContextMenuItem>
                        ) : null}
                        {canDelete ? (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              variant="destructive"
                              onSelect={() => void handleDeleteItems(getItemsForAction(item))}
                            >
                              <Trash2 className="size-4" /> Delete
                            </ContextMenuItem>
                          </>
                        ) : null}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreateFolder}>
            <div className="space-y-1.5">
              <Label htmlFor="folderName">Folder name</Label>
              <Input
                id="folderName"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateFolderOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload images</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setSelectedFiles(e.target.files ? Array.from(e.target.files) : [])}
            />
            {selectedFiles.length > 0 ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {selectedFiles.map((file) => (
                  <li key={file.name}>
                    {file.name} ({formatFileSize(file.size)})
                  </li>
                ))}
              </ul>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleUpload()}>
                Upload
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameTarget)} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.type}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveRename()}>
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailsFolder)} onOpenChange={() => setDetailsFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Folder details</DialogTitle>
          </DialogHeader>
          {detailsFolder ? (
            <div className="space-y-1 text-sm">
              <p>
                <span className="font-medium">Name:</span> {detailsFolder.name}
              </p>
              <p>
                <span className="font-medium">Parent:</span>{' '}
                {detailsFolder.parentId ?? 'Root'}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewFile)} onOpenChange={() => setViewFile(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewFile?.name}</DialogTitle>
          </DialogHeader>
          {viewFile ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground break-all">{mediaUrl(viewFile.url)}</p>
              <p className="text-sm">
                {viewFile.mimeType} · {formatFileSize(viewFile.size)}
              </p>
              <img
                src={mediaUrl(viewFile.url)}
                alt={viewFile.alt ?? viewFile.name}
                className="max-h-[400px] w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
