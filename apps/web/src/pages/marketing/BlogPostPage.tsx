import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import api from '../../lib/api';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';
import MarkdownRenderer from '../../components/MarkdownRenderer';

interface BlogPost {
    title: string;
    slug: string;
    content: string;
    image?: string;
    category?: string;
    createdAt: string;
}

const BlogPostPage = () => {
    const { slug } = useParams<{ slug: string }>();

    const { data: post, isLoading } = useQuery<BlogPost>({
        queryKey: ['blog-post', slug],
        queryFn: async () => {
            const { data } = await api.get(`/public/blog/${slug}`);
            return data;
        },
        enabled: !!slug,
    });

    if (isLoading) return <div className="pt-32 pb-20 text-center text-slate-500">Loading...</div>;
    if (!post) return <div className="pt-32 pb-20 text-center text-red-500">Post not found</div>;

    return (
        <article className="bg-slate-950 min-h-screen pt-32 pb-20 px-6">
            <Seo
                title={`${post.title} – UGC Studio`}
                description={post.content.slice(0, 150)}
                url={getSiteUrl(`/blog/${slug}`)}
                image={post.image}
            />

            <div className="mx-auto max-w-3xl">
                <Link to="/blog" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200 mb-8 inline-block">
                    ← Back to Hub
                </Link>

                <div className="text-center mb-12">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                        {post.category || 'Update'} — {new Date(post.createdAt).toLocaleDateString()}
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-8 leading-tight">{post.title}</h1>
                    {post.image && (
                        <div className="rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                            <img src={post.image} alt={post.title} className="w-full" />
                        </div>
                    )}
                </div>

                <MarkdownRenderer className="mt-10">{post.content}</MarkdownRenderer>
            </div>
        </article>
    );
};

export default BlogPostPage;
