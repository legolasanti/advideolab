import { useEffect, useMemo, useState } from 'react';

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  avatarUrl?: string;
};

const SLIDE_DURATION = 6000;

const TestimonialSlider = ({ items }: { items: Testimonial[] }) => {
  const safeItems = useMemo(() => items.filter(Boolean), [items]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (safeItems.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % safeItems.length);
    }, SLIDE_DURATION);
    return () => window.clearInterval(id);
  }, [safeItems.length]);

  if (safeItems.length === 0) {
    return null;
  }

  const active = safeItems[index];

  return (
    <div className="relative rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-left text-slate-100 backdrop-blur">
      <p className="text-base leading-relaxed text-slate-100">“{active.quote}”</p>
      <div className="mt-6 flex items-center gap-4">
        {active.avatarUrl ? (
          <img
            src={active.avatarUrl}
            alt={active.name}
            className="h-12 w-12 rounded-full border border-white/10 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 text-sm font-semibold">
            {active.name
              .split(' ')
              .map((word) => word[0])
              .join('')
              .slice(0, 2)}
          </div>
        )}
        <div>
          <p className="font-semibold text-white">{active.name}</p>
          <p className="text-xs uppercase tracking-widest text-slate-400">{active.role}</p>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-center gap-2" aria-label="Testimonials" role="tablist">
        {safeItems.map((item, idx) => (
          <button
            key={item.name}
            onClick={() => setIndex(idx)}
            aria-label={`Show testimonial from ${item.name}`}
            aria-pressed={idx === index}
            role="tab"
            className={`h-2.5 w-8 rounded-full transition ${
              idx === index ? 'bg-sky-400' : 'bg-white/20 hover:bg-white/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default TestimonialSlider;
