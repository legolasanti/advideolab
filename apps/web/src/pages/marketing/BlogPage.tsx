import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';

interface BlogPost {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    image: string;
    category: string;
    createdAt: string;
}

const BlogPage = () => {
    const { data: posts, isLoading } = useQuery<BlogPost[]>({
        queryKey: ['blog-posts'],
        queryFn: async () => {
            const { data } = await api.get('/public/blog');
            return data;
        },
    });

    return (
        <div className="bg-slate-950 min-h-screen pt-32 pb-20 px-6">
            <Seo
                title="Blog – UGC Studio"
                description="Guides and updates for generating high-converting UGC videos from a single image."
                url={getSiteUrl('/blog')}
            />

            <div className="mx-auto max-w-7xl">
                <div className="text-center mb-16">
                    <p className="text-sm uppercase tracking-widest text-emerald-300 font-semibold mb-4">Blog</p>
                    <h1 className="text-5xl font-bold text-white mb-6">Guides &amp; updates</h1>
                    <p className="text-xl text-slate-400 max-w-2xl mx-auto">
                        Tips on hooks, languages, and platform-ready UGC formats—so you can ship faster from a single image.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <Link
                            to="/new-video"
                            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300"
                        >
                            Generate your first UGC video
                        </Link>
                        <Link
                            to="/pricing"
                            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
                        >
                            View pricing
                        </Link>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center text-slate-500">Loading contents...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {posts?.map((post) => (
                            <Link key={post.id} to={`/blog/${post.slug}`} className="group block rounded-3xl bg-slate-900 border border-white/10 overflow-hidden hover:border-emerald-400/40 transition-all hover:-translate-y-1">
                                {post.image && (
                                    <div className="aspect-video bg-slate-800 overflow-hidden">
                                        <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                    </div>
                                )}
                                <div className="p-8">
                                    <div className="text-xs font-semibold text-emerald-200 uppercase tracking-wider mb-3">
                                        {post.category || 'Update'}
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-emerald-200 transition-colors">
                                        {post.title}
                                    </h3>
                                    <p className="text-slate-400 line-clamp-3">
                                        {post.excerpt}
                                    </p>
                                    <div className="mt-6 flex items-center text-sm font-medium text-white">
                                        Read article <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BlogPage;
