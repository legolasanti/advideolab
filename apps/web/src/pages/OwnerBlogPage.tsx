import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

interface BlogPost {
    id: string;
    title: string;
    slug: string;
    category: string;
    published: boolean;
    createdAt: string;
}

const OwnerBlogPage = () => {
    const queryClient = useQueryClient();
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState({
        title: '',
        slug: '',
        content: '',
        excerpt: '',
        image: '',
        category: 'News',
        published: false
    });

    const { data: posts, isLoading } = useQuery<BlogPost[]>({
        queryKey: ['owner-blog'],
        queryFn: async () => {
            const { data } = await api.get('/owner/blog');
            return data;
        },
    });

    const createMutation = useMutation({
        mutationFn: (newPost: any) => api.post('/owner/blog', newPost),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['owner-blog'] });
            setIsEditing(false);
            resetForm();
        },
    });

    const resetForm = () => {
        setForm({ title: '', slug: '', content: '', excerpt: '', image: '', category: 'News', published: false });
    };

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/owner/blog/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-blog'] }),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(form);
    };

    if (isEditing) {
        return (
            <div className="p-6 text-slate-100 max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">New Blog Post</h1>
                    <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-white">Cancel</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 bg-slate-900/50 p-6 rounded-2xl border border-white/10">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Title</label>
                            <input
                                required
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value, slug: e.target.value.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '') })}
                                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Slug</label>
                            <input
                                required
                                value={form.slug}
                                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Category</label>
                        <input
                            value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Cover Image URL</label>
                        <input
                            value={form.image}
                            onChange={(e) => setForm({ ...form, image: e.target.value })}
                            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white"
                            placeholder="https://..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Excerpt (Short description)</label>
                        <textarea
                            value={form.excerpt}
                            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white h-20"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Content (Markdown supported)</label>
                        <textarea
                            required
                            value={form.content}
                            onChange={(e) => setForm({ ...form, content: e.target.value })}
                            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white h-64 font-mono"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="published"
                            checked={form.published}
                            onChange={(e) => setForm({ ...form, published: e.target.checked })}
                            className="w-4 h-4 rounded bg-slate-800 border-white/10"
                        />
                        <label htmlFor="published" className="text-sm text-slate-300">Publish immediately</label>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <button
                            type="submit"
                            disabled={createMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold"
                        >
                            {createMutation.isPending ? 'Saving...' : 'Save Post'}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="p-6 text-slate-100">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold">Manage Blog</h1>
                <button
                    onClick={() => setIsEditing(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold"
                >
                    + New Post
                </button>
            </div>

            <div className="grid gap-4">
                {isLoading && <p className="text-slate-500">Loading posts...</p>}
                {posts?.map((post) => (
                    <div key={post.id} className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-white/10">
                        <div>
                            <h3 className="font-bold text-lg mb-1">{post.title}</h3>
                            <div className="text-sm text-slate-400 flex gap-3">
                                <span className="uppercase text-xs font-bold tracking-wider text-blue-400">{post.category}</span>
                                <span>•</span>
                                <span>/{post.slug}</span>
                                <span>•</span>
                                <span className={post.published ? 'text-emerald-400' : 'text-amber-400'}>
                                    {post.published ? 'Published' : 'Draft'}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={() => deleteMutation.mutate(post.id)}
                                className="text-rose-400 hover:text-rose-300 text-sm font-medium"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
                {posts?.length === 0 && <p className="text-slate-500">No blog posts yet.</p>}
            </div>
        </div>
    );
};

export default OwnerBlogPage;
