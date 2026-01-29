import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

type MediaAsset = {
  id: string;
  type: 'image' | 'video';
  name: string;
  altText: string | null;
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
};

const formatBytes = (value?: number | null) => {
  if (!value || value <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[idx]}`;
};

const OwnerMediaLibraryPage = () => {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [altText, setAltText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAltText, setEditAltText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: assets, isLoading } = useQuery<MediaAsset[]>({
    queryKey: ['owner-media-library'],
    queryFn: async () => {
      const { data } = await api.get('/owner/media-library');
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error('Select a file first.');
      }
      const form = new FormData();
      form.append('file', file);
      if (name.trim().length > 0) form.append('name', name.trim());
      if (altText.trim().length > 0) form.append('altText', altText.trim());
      const { data } = await api.post('/owner/media-library', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data as MediaAsset;
    },
    onSuccess: () => {
      setFile(null);
      setName('');
      setAltText('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['owner-media-library'] });
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error ?? err?.message ?? 'Upload failed.';
      setError(String(message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, altText }: { id: string; name: string; altText: string }) => {
      const { data } = await api.put(`/owner/media-library/${id}`, { name, altText });
      return data as MediaAsset;
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['owner-media-library'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/owner/media-library/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-media-library'] }),
  });

  const sortedAssets = useMemo(() => assets ?? [], [assets]);

  const handleCopy = async (asset: MediaAsset) => {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch (_err) {
      setCopiedId(null);
    }
  };

  const beginEdit = (asset: MediaAsset) => {
    setEditingId(asset.id);
    setEditName(asset.name);
    setEditAltText(asset.altText ?? '');
  };

  return (
    <div className="space-y-6 text-slate-100">
      <div>
        <h1 className="text-3xl font-semibold text-white">Media Library</h1>
        <p className="text-sm text-slate-400">Upload images and videos once, then reuse the links anywhere in CMS.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Upload new asset</h2>
        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-2">File</label>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-2">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white"
              placeholder="Product hero video"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-2">Alt text</label>
            <input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white"
              placeholder="Short description"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending || !file}
            className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload asset'}
          </button>
          {file && (
            <span className="text-xs text-slate-400">{file.name} · {formatBytes(file.size)}</span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Library</h2>
        {isLoading && <p className="text-sm text-slate-400">Loading assets…</p>}
        {!isLoading && sortedAssets.length === 0 && (
          <p className="text-sm text-slate-400">No assets uploaded yet.</p>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedAssets.map((asset) => (
            <div key={asset.id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
                {asset.type === 'image' ? (
                  <img src={asset.url} alt={asset.altText ?? asset.name} className="h-full w-full object-cover" />
                ) : (
                  <video src={asset.url} muted loop autoPlay playsInline className="h-full w-full object-cover" />
                )}
              </div>

              <div className="mt-3 space-y-2">
                {editingId === asset.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                    <input
                      value={editAltText}
                      onChange={(e) => setEditAltText(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                      placeholder="Alt text"
                    />
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-white">{asset.name}</p>
                    <p className="text-xs text-slate-400">Alt: {asset.altText ?? '—'}</p>
                  </>
                )}
                <p className="text-xs text-slate-500">{asset.mimeType} · {formatBytes(asset.sizeBytes)}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => window.open(asset.url, '_blank')}
                    className="rounded-lg border border-white/10 px-3 py-1 text-slate-200 hover:bg-white/5"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(asset)}
                    className="rounded-lg border border-white/10 px-3 py-1 text-slate-200 hover:bg-white/5"
                  >
                    {copiedId === asset.id ? 'Copied' : 'Copy URL'}
                  </button>
                  {editingId === asset.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          updateMutation.mutate({ id: asset.id, name: editName.trim() || asset.name, altText: editAltText })
                        }
                        className="rounded-lg bg-blue-600 px-3 py-1 text-white hover:bg-blue-500"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-white/10 px-3 py-1 text-slate-200 hover:bg-white/5"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => beginEdit(asset)}
                      className="rounded-lg border border-white/10 px-3 py-1 text-slate-200 hover:bg-white/5"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(asset.id)}
                    className="rounded-lg border border-rose-500/40 px-3 py-1 text-rose-200 hover:bg-rose-500/10"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-2 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-400 break-all">
                  {asset.url}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OwnerMediaLibraryPage;
