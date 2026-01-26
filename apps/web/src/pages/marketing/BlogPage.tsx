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
    <div className="bg-white min-h-screen pt-24 pb-20 px-6">
      <Seo
        title="Blog – UGC Studio"
        description="Guides and updates for generating high-converting UGC videos from a single image."
        url={getSiteUrl('/blog')}
      />

      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 mb-6">
            Blog
          </span>
          <h1 className="text-4xl font-bold text-slate-900 mb-6 md:text-5xl">Guides &amp; updates</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Tips on hooks, languages, and platform-ready UGC formats—so you can ship faster from a single image.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/new-video"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2e90fa] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-[#1a7ae8]"
            >
              Generate your first UGC video
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View pricing
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-slate-500">Loading contents...</div>
        ) : posts?.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <p className="text-slate-500">No blog posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts?.map((post) => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="group block rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-[#2e90fa]/30 transition-all hover:-translate-y-1"
              >
                {post.image && (
                  <div className="aspect-video bg-slate-100 overflow-hidden">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  </div>
                )}
                <div className="p-6">
                  <div className="text-xs font-semibold text-[#2e90fa] uppercase tracking-wider mb-3">
                    {post.category || 'Update'}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-[#2e90fa] transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-slate-600 line-clamp-3 text-sm">{post.excerpt}</p>
                  <div className="mt-4 flex items-center text-sm font-medium text-[#2e90fa]">
                    Read article{' '}
                    <svg className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
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
