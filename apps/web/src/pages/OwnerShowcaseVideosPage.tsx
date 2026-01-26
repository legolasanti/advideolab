import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import api from '../lib/api';

interface ShowcaseVideo {
  id: string;
  title: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

const OwnerShowcaseVideosPage = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', videoUrl: '', thumbnailUrl: '', sortOrder: 0, isActive: true });
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: videos, isLoading } = useQuery<ShowcaseVideo[]>({
    queryKey: ['owner-showcase-videos'],
    queryFn: async () => {
      const { data } = await api.get('/owner/showcase-videos');
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (newVideo: any) => api.post('/owner/showcase-videos', newVideo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-showcase-videos'] });
      resetForm();
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const payload = (error.response?.data as any)?.error;
        setFormError(typeof payload === 'string' ? payload : 'Video could not be created.');
        return;
      }
      setFormError('Video could not be created.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/owner/showcase-videos/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-showcase-videos'] });
      resetForm();
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const payload = (error.response?.data as any)?.error;
        setFormError(typeof payload === 'string' ? payload : 'Video could not be updated.');
        return;
      }
      setFormError('Video could not be updated.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/owner/showcase-videos/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-showcase-videos'] }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/owner/showcase-videos/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-showcase-videos'] }),
  });

  const resetForm = () => {
    setForm({ title: '', videoUrl: '', thumbnailUrl: '', sortOrder: 0, isActive: true });
    setFormError(null);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload = {
      title: form.title || null,
      videoUrl: form.videoUrl,
      thumbnailUrl: form.thumbnailUrl || null,
      sortOrder: Number(form.sortOrder),
      isActive: form.isActive,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (video: ShowcaseVideo) => {
    setForm({
      title: video.title || '',
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl || '',
      sortOrder: video.sortOrder,
      isActive: video.isActive,
    });
    setEditingId(video.id);
    setFormError(null);
  };

  return (
    <div className="p-6 text-slate-100">
      <h1 className="text-2xl font-bold mb-2">Showcase Videos</h1>
      <p className="text-slate-400 mb-6">Manage videos displayed on the landing page carousel.</p>

      <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/10 mb-8 max-w-3xl">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? 'Edit Video' : 'Add New Video'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-400 mb-1">Video URL *</label>
              <input
                type="url"
                required
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                placeholder="https://cdn.example.com/video.mp4"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Title (Optional)</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                placeholder="Product Demo"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Thumbnail URL (Optional)</label>
              <input
                type="url"
                value={form.thumbnailUrl}
                onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                placeholder="https://cdn.example.com/thumb.jpg"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Sort Order</label>
              <input
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-800 border-white/10"
                />
                <span className="text-sm text-slate-300">Active (visible on landing page)</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editingId
                  ? 'Update Video'
                  : 'Add Video'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10 bg-slate-800/50">
          <h3 className="font-semibold">All Videos ({videos?.length ?? 0})</h3>
          <p className="text-sm text-slate-400">Recommended: 10-20 videos for the carousel</p>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : videos?.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No videos yet. Add your first showcase video above.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {videos?.map((video) => (
              <div
                key={video.id}
                className={`relative rounded-xl overflow-hidden border ${
                  video.isActive ? 'border-white/10' : 'border-rose-500/30 opacity-60'
                } bg-slate-800/50`}
              >
                <div className="aspect-[9/16] bg-slate-900 relative">
                  <video
                    src={video.videoUrl}
                    poster={video.thumbnailUrl ?? undefined}
                    className="absolute inset-0 w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0;
                    }}
                  />
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
                      #{video.sortOrder}
                    </span>
                    {!video.isActive && (
                      <span className="bg-rose-500/80 text-white text-xs px-2 py-1 rounded font-medium">
                        Hidden
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-white truncate">
                    {video.title || '(No title)'}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-1">{video.videoUrl}</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleEdit(video)}
                      className="flex-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 py-1.5 rounded transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: video.id, isActive: !video.isActive })}
                      className={`flex-1 text-xs py-1.5 rounded transition ${
                        video.isActive
                          ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                          : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                      }`}
                    >
                      {video.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this video?')) {
                          deleteMutation.mutate(video.id);
                        }
                      }}
                      className="flex-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 py-1.5 rounded transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerShowcaseVideosPage;
