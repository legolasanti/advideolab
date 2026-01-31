import type { JSX, ReactNode } from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';
import { PLAN_DEFINITIONS } from '../../lib/plans';
import api from '../../lib/api';
import {
  heroContent as defaultHeroContent,
  testimonials as defaultTestimonials,
  howItWorks as defaultHowItWorks,
} from '../../content/marketing';

// ============================================================================
// Style Constants
// ============================================================================
const sectionSpacing = 'mx-auto max-w-7xl px-6 py-24';
const baseCard = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[#2e90fa] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#1a7ae8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400';
const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-400';

// ============================================================================
// Types
// ============================================================================
type IconProps = {
  className?: string;
};

type FaqItem = {
  question: string;
  answer: string;
};

type StatItem = {
  value: string;
  label: string;
  description: string;
  gradient: string;
};

type StepItem = {
  title: string;
  description: string;
  icon: JSX.Element;
};

type FeatureItem = {
  title: string;
  description: string;
  icon: JSX.Element;
};

type ShowcaseVideo = {
  id: string;
  title?: string | null;
  videoUrl: string;
  thumbnailUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

type CmsHeroContent = {
  headline: string;
  subheadline: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  primaryCtaHref?: string;
  secondaryCtaHref?: string;
  videoUrl?: string;
  videoPoster?: string;
};

type CmsTestimonial = {
  name: string;
  role: string;
  quote: string;
  avatarUrl?: string;
};

type CmsHowItWorksItem = {
  title: string;
  description: string;
  step: string;
  imageUrl?: string;
};

type CmsFeatureItem = {
  title: string;
  description: string;
  icon?: string;
};

// ============================================================================
// Icon Components
// ============================================================================
const IconCheck = ({ className = 'h-5 w-5 text-[#2e90fa]' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const IconArrowRight = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

const IconChevronDown = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const IconUpload = ({ className = 'h-6 w-6 text-[#2e90fa]' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconSliders = ({ className = 'h-6 w-6 text-[#2e90fa]' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

const IconSparkles = ({ className = 'h-6 w-6 text-[#2e90fa]' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
    <path d="M19 3l.7 2.1L22 6l-2.3.9L19 9l-.7-2.1L16 6l2.3-.9L19 3z" />
  </svg>
);

const IconPlay = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IconGlobe = ({ className = 'h-6 w-6 text-[#2e90fa]' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const IconLayers = ({ className = 'h-6 w-6 text-[#2e90fa]' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const IconZap = ({ className = 'h-6 w-6 text-[#2e90fa]' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconShield = ({ className = 'h-6 w-6 text-[#2e90fa]' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 4v5c0 5-3.5 9-7 11-3.5-2-7-6-7-11V7l7-4z" />
  </svg>
);

const IconVolume = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

const IconVolumeOff = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

// ============================================================================
// Data
// ============================================================================
const logos = ['TikTok', 'Meta', 'YouTube', 'Shopify', 'Amazon', 'Stripe'];

const stats: StatItem[] = [
  { value: '50+', label: 'Languages', description: 'Localized scripts and voices', gradient: 'from-blue-500 to-cyan-400' },
  { value: '3', label: 'Platforms', description: 'TikTok, Reels, Shorts ready', gradient: 'from-purple-500 to-pink-500' },
  { value: '5+', label: 'Variations', description: 'Per generation run', gradient: 'from-green-500 to-emerald-400' },
];

const howItWorks: StepItem[] = [
  {
    title: 'Upload a product image',
    description: 'Drag and drop one photo of your product. Our AI analyzes the image to understand what you are selling.',
    icon: <IconUpload />,
  },
  {
    title: 'Set voice and vibe',
    description: 'Choose language, platform format, voice profile, tone, and call-to-action. Control every creative lever.',
    icon: <IconSliders />,
  },
  {
    title: 'Generate and download',
    description: 'Render multiple UGC variations optimized for each platform. Download MP4s ready to publish.',
    icon: <IconSparkles />,
  },
];

const defaultFeatures: FeatureItem[] = [
  {
    title: 'Multi-language support',
    description: 'Generate UGC in 50+ languages with native-sounding voices and localized scripts.',
    icon: <IconGlobe />,
  },
  {
    title: 'Platform optimization',
    description: 'Automatic formatting for TikTok, Instagram Reels, and YouTube Shorts specifications.',
    icon: <IconLayers />,
  },
  {
    title: 'Fast generation',
    description: 'From upload to download in minutes. No waiting for creators or editing timelines.',
    icon: <IconZap />,
  },
  {
    title: 'Commercial rights',
    description: 'Full commercial usage rights included. Your content, your campaigns, no restrictions.',
    icon: <IconShield />,
  },
];

const faqs: FaqItem[] = [
  { question: 'What do I need to start?', answer: 'Just one product image. Upload a photo and our AI handles the rest—script writing, voice generation, and video creation.' },
  { question: 'Can I upload a human photo instead of a product image?', answer: 'No. Human photos are not supported and will be rejected. Please upload a clean, product-only image with a clear background whenever possible.' },
  { question: 'How long does generation take?', answer: 'Most videos are ready in 2-5 minutes depending on length and current queue. Batch generations may take slightly longer.' },
  { question: 'Can I control the script and CTA?', answer: 'Yes. You can provide custom prompts, select from different tones and vibes, and specify your exact call-to-action.' },
  { question: 'Which platforms are supported?', answer: 'We optimize for TikTok, Instagram Reels, and YouTube Shorts with proper aspect ratios and durations for each.' },
  { question: 'Do you support multiple languages?', answer: 'Yes, we support 50+ languages including English (US/UK), Spanish, French, German, Portuguese, and many more.' },
  { question: 'What about commercial usage rights?', answer: 'All generated content includes full commercial rights. Use it for ads, organic posts, or any marketing purpose.' },
];

const pricingPlans = [
  { ...PLAN_DEFINITIONS.starter, popular: false },
  { ...PLAN_DEFINITIONS.growth, popular: true },
  { ...PLAN_DEFINITIONS.scale, popular: false },
];

const getYouTubeId = (value: string) => {
  try {
    const url = new URL(value);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.replace('/', '');
    }
    if (url.pathname.startsWith('/shorts/')) {
      return url.pathname.split('/shorts/')[1]?.split('/')[0] ?? null;
    }
    if (url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/embed/')[1]?.split('/')[0] ?? null;
    }
    return url.searchParams.get('v');
  } catch (_err) {
    return null;
  }
};

const getVimeoId = (value: string) => {
  try {
    const url = new URL(value);
    if (!url.hostname.includes('vimeo.com')) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  } catch (_err) {
    return null;
  }
};

const resolveHeroEmbedUrl = (value: string) => {
  const youtubeId = getYouTubeId(value);
  if (youtubeId) {
    return `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&playsinline=1&controls=0&rel=0&modestbranding=1&enablejsapi=1`;
  }
  const vimeoId = getVimeoId(value);
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&loop=1&playsinline=1&controls=0&title=0&byline=0&portrait=0`;
  }
  return null;
};

// ============================================================================
// Subcomponents
// ============================================================================
const PillBadge = ({ children, variant = 'blue' }: { children: ReactNode; variant?: 'blue' | 'purple' | 'green' }) => {
  const variants = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
};

const StatCard = ({ value, label, description, gradient }: StatItem) => (
  <div className={`${baseCard} p-8 text-center`}>
    <p className={`text-5xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>{value}</p>
    <p className="mt-2 text-lg font-semibold text-slate-900">{label}</p>
    <p className="mt-1 text-sm text-slate-500">{description}</p>
  </div>
);

const FaqAccordion = ({ items }: { items: FaqItem[] }) => {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {items.map((item, idx) => (
        <div key={item.question}>
          <button
            onClick={() => setOpen(open === idx ? null : idx)}
            className="flex w-full items-center justify-between px-6 py-5 text-left transition hover:bg-slate-50"
          >
            <span className="font-semibold text-slate-900">{item.question}</span>
            <IconChevronDown
              className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${open === idx ? 'rotate-180' : ''}`}
            />
          </button>
          <div
            className={`overflow-hidden transition-all duration-200 ${
              open === idx ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-6 pb-5 text-slate-600">{item.answer}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper to resolve YouTube/Vimeo embed URLs for showcase videos
const resolveShowcaseEmbedUrl = (value: string) => {
  const youtubeId = getYouTubeId(value);
  if (youtubeId) {
    return `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&playsinline=1&controls=0&rel=0&modestbranding=1`;
  }
  const vimeoId = getVimeoId(value);
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&loop=1&title=0&byline=0&portrait=0&background=1`;
  }
  return null;
};

const loadVimeoPlayerScript = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    const win = window as any;
    if (win.Vimeo?.Player) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[data-vimeo-player="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject());
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://player.vimeo.com/api/player.js';
    script.async = true;
    script.dataset.vimeoPlayer = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject();
    document.body.appendChild(script);
  });

const VideoCarousel = () => {
  const [videos, setVideos] = useState<ShowcaseVideo[]>([]);
  const [mutedState, setMutedState] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res = await api.get('/public/showcase-videos');
        const data = res.data as ShowcaseVideo[];
        const seen = new Set<string>();
        const unique = data.filter((video) => {
          const key = video.videoUrl ?? video.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setVideos(unique);
        // Initialize all videos as muted
        const initialMuted: Record<string, boolean> = {};
        unique.forEach((v) => {
          initialMuted[v.id] = true;
        });
        setMutedState(initialMuted);
      } catch (err) {
        console.error('Failed to fetch showcase videos:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, []);

  // Auto-scroll animation
  useEffect(() => {
    if (!scrollRef.current || videos.length === 0) return;
    const container = scrollRef.current;
    let animationId: number;
    let scrollPosition = 0;
    const scrollSpeed = 0.5; // pixels per frame

    const animate = () => {
      scrollPosition += scrollSpeed;
      const maxScroll = container.scrollWidth - container.clientWidth;
      if (scrollPosition >= maxScroll) {
        scrollPosition = 0;
      }
      container.scrollLeft = scrollPosition;
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    // Pause on hover
    const handleMouseEnter = () => cancelAnimationFrame(animationId);
    const handleMouseLeave = () => {
      scrollPosition = container.scrollLeft;
      animationId = requestAnimationFrame(animate);
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationId);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [videos]);

  const toggleMute = useCallback((videoId: string) => {
    setMutedState((prev) => {
      const newState = { ...prev };
      // Mute all other videos first
      Object.keys(newState).forEach((id) => {
        if (id !== videoId) {
          newState[id] = true;
          if (videoRefs.current[id]) {
            videoRefs.current[id]!.muted = true;
          }
        }
      });
      // Toggle the clicked video
      newState[videoId] = !prev[videoId];
      if (videoRefs.current[videoId]) {
        videoRefs.current[videoId]!.muted = newState[videoId];
      }
      return newState;
    });
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <div className="flex justify-center items-center gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-64 md:w-72 aspect-[9/16] rounded-2xl bg-slate-200 animate-pulse flex-shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return null;
  }

  const displayVideos = videos;

  return (
    <div className="py-12 overflow-hidden">
      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-hidden px-6"
        style={{ scrollBehavior: 'auto' }}
      >
        {displayVideos.map((video, idx) => {
          const embedUrl = resolveShowcaseEmbedUrl(video.videoUrl);
          const isEmbed = Boolean(embedUrl);

          return (
            <div
              key={`${video.id}-${idx}`}
              className="relative flex-shrink-0 w-64 md:w-72 aspect-[9/16] rounded-2xl overflow-hidden bg-slate-900 shadow-xl group"
            >
              {isEmbed ? (
                <iframe
                  src={embedUrl!}
                  title={video.title ?? 'Showcase video'}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              ) : (
                <video
                  ref={(el) => {
                    if (idx < videos.length) {
                      videoRefs.current[video.id] = el;
                    }
                  }}
                  src={video.videoUrl}
                  poster={video.thumbnailUrl ?? undefined}
                  loop
                  muted
                  autoPlay
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              {/* Sound toggle button - only for native videos */}
              {!isEmbed && (
                <button
                  onClick={() => toggleMute(video.id)}
                  className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                  aria-label={mutedState[video.id] ? 'Unmute video' : 'Mute video'}
                >
                  {mutedState[video.id] ? (
                    <IconVolumeOff className="h-4 w-4" />
                  ) : (
                    <IconVolume className="h-4 w-4" />
                  )}
                </button>
              )}
              {/* Optional title overlay */}
              {video.title && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
                  <p className="text-xs font-medium text-white truncate">{video.title}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// Testimonial Carousel Component
// ============================================================================
const TestimonialCarousel = ({ testimonials }: { testimonials: CmsTestimonial[] }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (testimonials.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  if (testimonials.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto text-center">
      <div className={`${baseCard} p-10 relative overflow-hidden`}>
        {/* Stars */}
        <div className="flex justify-center gap-1 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <svg key={star} className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>

        {/* Testimonial content with fade animation */}
        <div className="relative min-h-[180px]">
          {testimonials.map((testimonial, idx) => (
            <div
              key={`${testimonial.name}-${idx}`}
              className={`absolute inset-0 transition-all duration-500 ${
                idx === activeIndex ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'
              }`}
            >
              <blockquote className="text-xl text-slate-700 leading-relaxed">
                "{testimonial.quote}"
              </blockquote>
              <div className="mt-8 flex items-center justify-center gap-4">
                {testimonial.avatarUrl ? (
                  <img
                    src={testimonial.avatarUrl}
                    alt={testimonial.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-400" />
                )}
                <div className="text-left">
                  <p className="font-semibold text-slate-900">{testimonial.name}</p>
                  <p className="text-sm text-slate-500">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Dots indicator */}
        {testimonials.length > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {testimonials.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === activeIndex ? 'w-6 bg-[#2e90fa]' : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
                aria-label={`Go to testimonial ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================
const LandingPage = () => {
  // Fetch CMS content
  const { data: heroData } = useQuery({
    queryKey: ['cms', 'landingHero'],
    queryFn: async () => {
      const { data } = await api.get('/public/cms/landingHero');
      return data?.content as CmsHeroContent | undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: testimonialsData } = useQuery({
    queryKey: ['cms', 'testimonials'],
    queryFn: async () => {
      const { data } = await api.get('/public/cms/testimonials');
      return data?.items as CmsTestimonial[] | undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: featuresData } = useQuery({
    queryKey: ['cms', 'features'],
    queryFn: async () => {
      const { data } = await api.get('/public/cms/features');
      return data?.items as CmsFeatureItem[] | undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: howItWorksData } = useQuery({
    queryKey: ['cms', 'howItWorks'],
    queryFn: async () => {
      const { data } = await api.get('/public/cms/howItWorks');
      return data?.items as CmsHowItWorksItem[] | undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Use CMS data with fallbacks
  const heroContent = heroData ?? defaultHeroContent;
  const heroHeadline = heroContent.headline?.trim() || defaultHeroContent.headline;
  const heroSubheadline = heroContent.subheadline?.trim() || defaultHeroContent.subheadline;
  const primaryCtaLabel = heroContent.primaryCtaLabel?.trim() || defaultHeroContent.primaryCtaLabel;
  const secondaryCtaLabel = heroContent.secondaryCtaLabel?.trim() || defaultHeroContent.secondaryCtaLabel;
  const primaryCtaHref = heroContent.primaryCtaHref?.trim() || defaultHeroContent.primaryCtaHref || '/new-video';
  const secondaryCtaHref = heroContent.secondaryCtaHref?.trim() || defaultHeroContent.secondaryCtaHref || '/pricing';
  const heroVideoUrl = heroContent.videoUrl?.trim();
  const heroVimeoId = heroVideoUrl ? getVimeoId(heroVideoUrl) : null;
  const heroYoutubeId = heroVideoUrl ? getYouTubeId(heroVideoUrl) : null;
  const heroEmbedUrl = heroVideoUrl && (heroVimeoId || heroYoutubeId) ? resolveHeroEmbedUrl(heroVideoUrl) : null;
  const heroProvider = heroVimeoId ? 'vimeo' : heroYoutubeId ? 'youtube' : heroVideoUrl ? 'file' : null;

  const legacyHeadline = 'Create High-Converting UGC Videos from a Single Image';
  const headlineTemplate = heroHeadline === legacyHeadline ? 'Create UGC Videos for {{platform}}' : heroHeadline;
  const headlineToken =
    headlineTemplate.includes('{{platform}}')
      ? '{{platform}}'
      : headlineTemplate.includes('{platform}')
      ? '{platform}'
      : headlineTemplate.includes('[platform]')
      ? '[platform]'
      : null;
  const headlineParts = headlineToken ? headlineTemplate.split(headlineToken) : null;
  const rotatingPlatforms = ['Instagram Reels', 'TikTok', 'YouTube Shorts'];
  const shouldRotateHeadline = Boolean(headlineToken && headlineParts && headlineParts.length === 2);
  const [platformIndex, setPlatformIndex] = useState(0);
  const [headlineCharIndex, setHeadlineCharIndex] = useState(0);
  const [headlineDeleting, setHeadlineDeleting] = useState(false);

  const [heroMuted, setHeroMuted] = useState(true);
  const heroMutedRef = useRef(true);
  const heroIframeRef = useRef<HTMLIFrameElement | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const vimeoPlayerRef = useRef<any>(null);

  useEffect(() => {
    if (!shouldRotateHeadline) return;
    const currentWord = rotatingPlatforms[platformIndex] ?? '';
    const atEnd = headlineCharIndex >= currentWord.length;
    const atStart = headlineCharIndex <= 0;
    let delay = headlineDeleting ? 45 : 80;
    if (!headlineDeleting && atEnd) delay = 1200;
    if (headlineDeleting && atStart) delay = 350;

    const timer = window.setTimeout(() => {
      if (!headlineDeleting && atEnd) {
        setHeadlineDeleting(true);
        return;
      }
      if (headlineDeleting && atStart) {
        setHeadlineDeleting(false);
        setPlatformIndex((prev) => (prev + 1) % rotatingPlatforms.length);
        return;
      }
      setHeadlineCharIndex((prev) => prev + (headlineDeleting ? -1 : 1));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [headlineDeleting, headlineCharIndex, platformIndex, rotatingPlatforms.length, shouldRotateHeadline]);

  useEffect(() => {
    setHeroMuted(true);
    if (heroVideoRef.current) {
      heroVideoRef.current.muted = true;
    }
  }, [heroProvider, heroVideoUrl]);

  useEffect(() => {
    heroMutedRef.current = heroMuted;
  }, [heroMuted]);

  useEffect(() => {
    if (heroProvider !== 'vimeo' || !heroEmbedUrl) return;
    let cancelled = false;
    loadVimeoPlayerScript()
      .then(() => {
        if (cancelled) return;
        const win = window as any;
        if (!heroIframeRef.current || !win?.Vimeo?.Player) return;
        const player = new win.Vimeo.Player(heroIframeRef.current);
        vimeoPlayerRef.current = player;
        player.setMuted(heroMutedRef.current).catch(() => undefined);
        if (!heroMutedRef.current) {
          player.setVolume?.(1).catch?.(() => undefined);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (vimeoPlayerRef.current?.unload) {
        vimeoPlayerRef.current.unload().catch?.(() => undefined);
      }
      vimeoPlayerRef.current = null;
    };
  }, [heroEmbedUrl, heroProvider]);

  useEffect(() => {
    if (heroProvider !== 'vimeo' || !vimeoPlayerRef.current) return;
    vimeoPlayerRef.current.setMuted(heroMuted).catch?.(() => undefined);
    if (!heroMuted) {
      vimeoPlayerRef.current.setVolume?.(1).catch?.(() => undefined);
    }
  }, [heroMuted, heroProvider]);

  const toggleHeroMute = useCallback(() => {
    setHeroMuted((prev) => {
      const next = !prev;
      if (heroProvider === 'file' && heroVideoRef.current) {
        heroVideoRef.current.muted = next;
        if (!next) heroVideoRef.current.volume = 1;
      }
      if (heroProvider === 'vimeo' && vimeoPlayerRef.current) {
        vimeoPlayerRef.current.setMuted(next).catch?.(() => undefined);
        if (!next) vimeoPlayerRef.current.setVolume?.(1).catch?.(() => undefined);
      }
      return next;
    });
  }, [heroProvider]);

  const activePlatform = rotatingPlatforms[platformIndex] ?? '';
  const animatedPlatform =
    shouldRotateHeadline && activePlatform ? activePlatform.slice(0, headlineCharIndex) : activePlatform;
  const testimonialsList: CmsTestimonial[] = testimonialsData ?? defaultTestimonials.map((t) => ({
    ...t,
    avatarUrl: undefined,
  }));
  const howItWorksSteps: CmsHowItWorksItem[] = howItWorksData ?? defaultHowItWorks.map((s) => ({
    ...s,
    imageUrl: undefined,
  }));
  const featuresSource = Array.isArray(featuresData) && featuresData.length > 0 ? featuresData : defaultFeatures;
  const featuresList: FeatureItem[] = featuresSource.map((item, idx) => ({
    title: item.title,
    description: item.description,
    icon: defaultFeatures[idx]?.icon ?? <IconSparkles />,
  }));

  return (
    <div>
      <Seo
        title="Advideolab - Create UGC AI Videos for TikTok, Reels & Shorts"
        description="Create high-converting UGC videos from a single image. Upload one photo, choose language & platform, and generate TikTok, Reels & Shorts-ready videos in minutes."
        url={getSiteUrl('/')}
      />

      {/* ================================================================== */}
      {/* 1) HERO SECTION */}
      {/* ================================================================== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Left: Copy */}
            <div>
              <PillBadge variant="blue">
                <IconSparkles className="h-3.5 w-3.5" />
                AI-Powered UGC Generation
              </PillBadge>

              <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
                {shouldRotateHeadline && headlineParts ? (
                  <>
                    {headlineParts[0]}
                    <span className="relative inline-block min-w-[16ch] align-baseline whitespace-nowrap bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7] bg-clip-text text-transparent">
                      <span className="inline-block align-baseline">{animatedPlatform}</span>
                      <span
                        className="ml-1 inline-block h-[1em] w-[2px] animate-pulse bg-gradient-to-b from-[#6366f1] to-[#a855f7] align-baseline"
                        aria-hidden="true"
                      />
                    </span>
                    {headlineParts[1]}
                  </>
                ) : (
                  heroHeadline
                )}
              </h1>

              <p className="mt-6 text-lg text-slate-600 max-w-xl">
                {heroSubheadline}
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link to={primaryCtaHref} className={primaryButton}>
                  {primaryCtaLabel}
                  <IconArrowRight className="h-4 w-4" />
                </Link>
                <a href={secondaryCtaHref} className={secondaryButton}>
                  {secondaryCtaLabel}
                </a>
              </div>

              <ul className="mt-10 space-y-3">
                {['No filming required', '50+ languages supported', 'Download MP4 instantly'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-slate-600">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100">
                      <IconCheck className="h-3 w-3 text-[#2e90fa]" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: Video Preview */}
            <div className="relative">
              <div className="relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-blue-50 to-purple-50 shadow-2xl shadow-blue-500/10 group">
                {heroVideoUrl ? (
                  heroEmbedUrl ? (
                    <iframe
                      src={heroEmbedUrl}
                      title="Hero video"
                      ref={heroIframeRef}
                      className="absolute inset-0 h-full w-full pointer-events-none"
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      src={heroVideoUrl}
                      poster={heroContent.videoPoster}
                      playsInline
                      autoPlay
                      loop
                      muted={heroMuted}
                      ref={heroVideoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg">
                      <IconPlay className="h-8 w-8 text-[#2e90fa]" />
                    </div>
                  </div>
                )}
                {heroVideoUrl && heroProvider !== 'youtube' && (
                  <button
                    type="button"
                    onClick={toggleHeroMute}
                    className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                    aria-label={heroMuted ? 'Unmute video' : 'Mute video'}
                  >
                    {heroMuted ? <IconVolumeOff className="h-4 w-4" /> : <IconVolume className="h-4 w-4" />}
                  </button>
                )}
                {/* Decorative elements (only show if no video) */}
                {!heroVideoUrl && (
                  <>
                    <div className="absolute top-4 left-4 right-4">
                      <div className="h-2 w-16 rounded-full bg-white/50" />
                    </div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="space-y-2">
                        <div className="h-2 w-3/4 rounded-full bg-white/50" />
                        <div className="h-2 w-1/2 rounded-full bg-white/50" />
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* Floating badges */}
              <div className="absolute -left-4 top-1/4 rounded-xl bg-white px-4 py-2 shadow-lg border border-slate-100">
                <p className="text-xs text-slate-500">Platform</p>
                <p className="font-semibold text-slate-900">TikTok</p>
              </div>
              <div className="absolute -right-4 top-1/2 rounded-xl bg-white px-4 py-2 shadow-lg border border-slate-100">
                <p className="text-xs text-slate-500">Language</p>
                <p className="font-semibold text-slate-900">English</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 2) SOCIAL PROOF */}
      {/* ================================================================== */}
      <section className="bg-slate-50 py-16 border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-center text-sm font-medium text-slate-500 mb-10">
            Trusted by 500+ brands and marketing teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {logos.map((logo) => (
              <span
                key={logo}
                className="text-xl font-bold text-slate-300 transition hover:text-slate-500"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>

        {/* Video Showcase Carousel */}
        <div className="mt-12">
          <h2 className="text-center text-3xl md:text-4xl font-semibold text-slate-600 mb-4">
            See what others are creating
          </h2>
          <VideoCarousel />
        </div>
      </section>

      {/* ================================================================== */}
      {/* 3) STATS SECTION */}
      {/* ================================================================== */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-16">
            <PillBadge>Platform Capabilities</PillBadge>
            <h2 className="mt-4 text-3xl font-bold text-slate-900">Built for scale</h2>
            <p className="mt-3 text-slate-600">Everything you need to create UGC at volume</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {stats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 4) HOW IT WORKS */}
      {/* ================================================================== */}
      <section id="how-it-works" className="bg-slate-50 py-24 scroll-mt-20">
        <div className={sectionSpacing}>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <PillBadge variant="purple">How It Works</PillBadge>
            <h2 className="mt-4 text-3xl font-bold text-slate-900">Three steps to UGC at scale</h2>
            <p className="mt-3 text-slate-600">From product image to publish-ready video in minutes</p>
          </div>

          <div className="space-y-16">
            {howItWorksSteps.map((step, idx) => {
              const iconComponent = howItWorks[idx]?.icon ?? <IconSparkles />;
              return (
                <div
                  key={step.title}
                  className={`flex flex-col lg:flex-row items-center gap-12 ${idx % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}
                >
                  {/* Image or placeholder */}
                  <div className="flex-1 w-full">
                    {step.imageUrl ? (
                      <div className="aspect-video rounded-2xl overflow-hidden border border-slate-200 shadow-lg">
                        <img
                          src={step.imageUrl}
                          alt={step.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 border border-slate-200 flex items-center justify-center">
                        <div className="text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg">
                            {iconComponent}
                          </div>
                          <p className="text-sm font-medium text-slate-500">Step {idx + 1}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Text */}
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2e90fa] text-white font-bold text-lg">
                        {idx + 1}
                      </span>
                      <h3 className="text-xl font-bold text-slate-900">{step.title}</h3>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5) FEATURES */}
      {/* ================================================================== */}
      <section className="py-24">
        <div className={sectionSpacing}>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <PillBadge variant="green">Features</PillBadge>
            <h2 className="mt-4 text-3xl font-bold text-slate-900">Everything you need for UGC at scale</h2>
            <p className="mt-3 text-slate-600">Powerful features designed for performance marketers and brands</p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {featuresList.map((feature) => (
              <div key={feature.title} className={`${baseCard} p-8`}>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                  {feature.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 6) TESTIMONIALS CAROUSEL */}
      {/* ================================================================== */}
      <section className="bg-slate-50 py-24">
        <div className={sectionSpacing}>
          <TestimonialCarousel testimonials={testimonialsList} />
        </div>
      </section>

      {/* ================================================================== */}
      {/* 7) PRICING PREVIEW */}
      {/* ================================================================== */}
      <section className="py-24">
        <div className={sectionSpacing}>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <PillBadge>Pricing</PillBadge>
            <h2 className="mt-4 text-3xl font-bold text-slate-900">Simple, transparent pricing</h2>
            <p className="mt-3 text-slate-600">Choose the plan that fits your creative volume</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`${baseCard} p-8 text-center relative ${plan.popular ? 'ring-2 ring-[#2e90fa] shadow-lg scale-105' : ''}`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-block rounded-full bg-[#2e90fa] px-4 py-1 text-xs font-semibold text-white shadow-lg">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                <div className="mt-6">
                  <span className="text-5xl font-bold text-slate-900">${plan.priceUsd}</span>
                  <span className="text-slate-500">/month</span>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  or ${plan.annualPriceUsd}/year <span className="text-green-600 font-medium">(save 17%)</span>
                </div>
                <div className="mt-6 py-4 border-t border-slate-100">
                  <p className="text-3xl font-bold text-[#2e90fa]">{plan.quota}</p>
                  <p className="text-sm text-slate-600 mt-1">videos per month</p>
                </div>
                <ul className="mt-6 space-y-3 text-left">
                  <li className="flex items-center gap-3 text-sm text-slate-600">
                    <IconCheck className="h-4 w-4 text-green-500 flex-shrink-0" />
                    Full commercial rights
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-600">
                    <IconCheck className="h-4 w-4 text-green-500 flex-shrink-0" />
                    50+ languages supported
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-600">
                    <IconCheck className="h-4 w-4 text-green-500 flex-shrink-0" />
                    All platforms (TikTok, Reels, Shorts)
                  </li>
                  <li className="flex items-center gap-3 text-sm text-slate-600">
                    <IconCheck className="h-4 w-4 text-green-500 flex-shrink-0" />
                    Priority rendering queue
                  </li>
                </ul>
                <Link
                  to="/pricing"
                  className={`mt-8 block w-full rounded-full py-3 text-center text-sm font-semibold transition ${
                    plan.popular
                      ? 'bg-[#2e90fa] text-white hover:bg-[#1a7ae8] shadow-lg shadow-blue-500/20'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Get Started
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-12 text-center text-slate-500">
            Need more volume?{' '}
            <Link to="/contact" className="text-[#2e90fa] font-medium hover:underline">
              Contact us for enterprise pricing
            </Link>
          </p>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 8) FAQ */}
      {/* ================================================================== */}
      <section className="bg-slate-50 py-24">
        <div className={sectionSpacing}>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:items-start">
            <div>
              <PillBadge>FAQ</PillBadge>
              <h2 className="mt-4 text-3xl font-bold text-slate-900">Frequently asked questions</h2>
              <p className="mt-3 text-slate-600">Everything you need to know about the platform</p>
              <Link to="/contact" className="mt-6 inline-flex items-center gap-2 text-[#2e90fa] font-medium hover:underline">
                Contact support
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <FaqAccordion items={faqs} />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 9) FINAL CTA */}
      {/* ================================================================== */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rounded-3xl bg-gradient-to-r from-[#2e90fa] to-blue-600 px-8 py-20 text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl">Ready to generate your first UGC video?</h2>
            <p className="mt-4 text-lg text-blue-100 max-w-2xl mx-auto">
              Plans start at $69/month with credits included. Pick a plan and start generating UGC videos in minutes.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link
                to="/new-video"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-semibold text-[#2e90fa] shadow-lg transition hover:bg-blue-50"
              >
                Generate your first UGC video
                <IconArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/examples"
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white/30 px-8 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                View Examples
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
