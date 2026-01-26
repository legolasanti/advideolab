import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  heroContent,
  featureGrid,
  testimonials,
  pricingSubtitle,
  contactDefaults,
  showcaseExamples,
  howItWorks as howItWorksFallback,
  productSections as productSectionsFallback,
  aboutContent,
  contactCopy,
  legalDefaults,
} from '../content/marketing';

type FeatureItem = { title: string; description: string; icon?: string };
type TestimonialItem = { name: string; role: string; quote: string; avatarUrl?: string };
type ShowcaseVideo = { title: string; description: string; videoUrl: string };
type HowItWorksItem = { title: string; description: string; step: string; imageUrl?: string };
type ProductSection = { title: string; description: string; image: string };
type LegalContent = typeof legalDefaults;

const sections = [
  { id: 'hero', label: 'Landing hero' },
  { id: 'features', label: 'Features' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'pricing', label: 'Pricing subtitle' },
  { id: 'contact', label: 'Contact settings' },
  { id: 'showcase', label: 'Featured examples' },
  { id: 'how', label: 'How it works' },
  { id: 'product', label: 'Product page' },
  { id: 'about', label: 'About page' },
  { id: 'legal', label: 'Legal & footer' },
];

const OwnerCmsPage = () => {
  const [activeSection, setActiveSection] = useState('hero');
  const queryClient = useQueryClient();

  const heroQuery = useQuery({
    queryKey: ['ownerCms', 'landingHero'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/landingHero');
      return data;
    },
  });
  const featuresQuery = useQuery({
    queryKey: ['ownerCms', 'features'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/features');
      return data;
    },
  });
  const testimonialsQuery = useQuery({
    queryKey: ['ownerCms', 'testimonials'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/testimonials');
      return data;
    },
  });
  const pricingQuery = useQuery({
    queryKey: ['ownerCms', 'pricing'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/pricing');
      return data;
    },
  });
  const contactQuery = useQuery({
    queryKey: ['ownerCms', 'contact'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/contact');
      return data;
    },
  });
  const showcaseQuery = useQuery({
    queryKey: ['ownerCms', 'showcase'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/showcase');
      return data;
    },
  });
  const howQuery = useQuery({
    queryKey: ['ownerCms', 'howItWorks'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/howItWorks');
      return data;
    },
  });
  const productQuery = useQuery({
    queryKey: ['ownerCms', 'product'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/product');
      return data;
    },
  });
  const aboutQuery = useQuery({
    queryKey: ['ownerCms', 'about'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/about');
      return data;
    },
  });
  const legalQuery = useQuery({
    queryKey: ['ownerCms', 'legal'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cms/legal');
      return data;
    },
  });

  const [toast, setToast] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ section, key, value }: { section: string; key: string; value: unknown }) =>
      api.put(`/owner/cms/${section}/${key}`, { value }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ownerCms', variables.section] });
      setToast(`Saved ${variables.section}`);
    },
  });

  const heroFallback = useMemo(() => ({ ...heroContent }), []);
  const [heroForm, setHeroForm] = useState(heroFallback);
  useEffect(() => {
    const cmsHero = (heroQuery.data?.content as typeof heroContent | undefined) ?? heroFallback;
    setHeroForm((prev) => ({ ...prev, ...cmsHero }));
  }, [heroQuery.data, heroFallback]);

  const featuresFallback = useMemo<FeatureItem[]>(
    () => featureGrid.map((feature) => ({ title: feature.title, description: feature.description, icon: feature.icon })),
    [],
  );
  const [featuresForm, setFeaturesForm] = useState<FeatureItem[]>(featuresFallback);
  useEffect(() => {
    const cms = (featuresQuery.data?.items as FeatureItem[] | undefined) ?? featuresFallback;
    setFeaturesForm(cms);
  }, [featuresQuery.data, featuresFallback]);

  const testimonialsFallback = useMemo<TestimonialItem[]>(
    () =>
      testimonials.map((item) => ({
        name: item.name,
        role: item.role,
        quote: item.quote,
        avatarUrl: (item as any).avatarUrl ?? '',
      })),
    [],
  );
  const [testimonialsForm, setTestimonialsForm] = useState<TestimonialItem[]>(testimonialsFallback);
  useEffect(() => {
    const cms = (testimonialsQuery.data?.items as TestimonialItem[] | undefined) ?? testimonialsFallback;
    setTestimonialsForm(cms);
  }, [testimonialsQuery.data, testimonialsFallback]);

  const showcaseFallback = useMemo<ShowcaseVideo[]>(
    () => showcaseExamples.map((item) => ({ title: item.title, description: item.description, videoUrl: item.videoUrl })),
    [],
  );
  const [showcaseForm, setShowcaseForm] = useState<ShowcaseVideo[]>(showcaseFallback);
  useEffect(() => {
    const cms = (showcaseQuery.data?.videos as ShowcaseVideo[] | undefined) ?? showcaseFallback;
    setShowcaseForm(cms);
  }, [showcaseQuery.data, showcaseFallback]);

  const howFallback = useMemo<HowItWorksItem[]>(
    () => howItWorksFallback.map((item) => ({ ...item, imageUrl: undefined })),
    [],
  );
  const [howForm, setHowForm] = useState<HowItWorksItem[]>(howFallback);
  useEffect(() => {
    const cms = (howQuery.data?.items as HowItWorksItem[] | undefined) ?? howFallback;
    setHowForm(cms);
  }, [howQuery.data, howFallback]);

  const productFallback = useMemo<ProductSection[]>(
    () => productSectionsFallback.map((item) => ({ ...item })),
    [],
  );
  const [productForm, setProductForm] = useState<ProductSection[]>(productFallback);
  useEffect(() => {
    const cms = (productQuery.data?.sections as ProductSection[] | undefined) ?? productFallback;
    setProductForm(cms);
  }, [productQuery.data, productFallback]);

  const aboutFallback = useMemo(() => ({ ...aboutContent }), []);
  const [aboutForm, setAboutForm] = useState(aboutFallback);
  useEffect(() => {
    const cms = (aboutQuery.data?.content as typeof aboutContent | undefined) ?? aboutFallback;
    setAboutForm((prev) => ({ ...prev, ...cms }));
  }, [aboutQuery.data, aboutFallback]);

  const legalFallback = useMemo<LegalContent>(() => ({ ...legalDefaults }), []);
  const [legalForm, setLegalForm] = useState<LegalContent>(legalFallback);
  useEffect(() => {
    const cms = (legalQuery.data?.content as LegalContent | undefined) ?? legalFallback;
    setLegalForm((prev) => ({
      ...prev,
      ...cms,
      company: { ...prev.company, ...(cms.company ?? {}) },
      social: { ...prev.social, ...(cms.social ?? {}) },
    }));
  }, [legalQuery.data, legalFallback]);

  const [pricingForm, setPricingForm] = useState(pricingSubtitle);
  useEffect(() => {
    const cms = (pricingQuery.data?.subtitle as string | undefined) ?? pricingSubtitle;
    setPricingForm(cms);
  }, [pricingQuery.data]);

  const [contactTarget, setContactTarget] = useState(contactDefaults.targetEmail);
  const [contactDescription, setContactDescription] = useState(contactCopy.description);
  useEffect(() => {
    const cms =
      (contactQuery.data?.settings as { targetEmail?: string } | undefined)?.targetEmail ?? contactDefaults.targetEmail;
    setContactTarget(cms);
    const description = (contactQuery.data?.description as string | undefined) ?? contactCopy.description;
    setContactDescription(description);
  }, [contactQuery.data]);

  const saveHero = () => mutation.mutate({ section: 'landingHero', key: 'content', value: heroForm });
  const saveFeatures = () => mutation.mutate({ section: 'features', key: 'items', value: featuresForm });
  const saveTestimonials = () => mutation.mutate({ section: 'testimonials', key: 'items', value: testimonialsForm });
  const savePricing = () => mutation.mutate({ section: 'pricing', key: 'subtitle', value: pricingForm });
  const saveContact = () =>
    mutation.mutate({
      section: 'contact',
      key: 'settings',
      value: { targetEmail: contactTarget, description: contactDescription },
    });
  const saveShowcase = () => mutation.mutate({ section: 'showcase', key: 'videos', value: showcaseForm });
  const saveHow = () => mutation.mutate({ section: 'howItWorks', key: 'items', value: howForm });
  const saveProduct = () => mutation.mutate({ section: 'product', key: 'sections', value: productForm });
  const saveAbout = () => mutation.mutate({ section: 'about', key: 'content', value: aboutForm });
  const saveLegal = () => mutation.mutate({ section: 'legal', key: 'content', value: legalForm });

  const isSaving = mutation.isPending;

  const renderContent = () => {
    switch (activeSection) {
      case 'hero':
        return (
          <div className="space-y-4">
            <InputField label="Headline" value={heroForm.headline} onChange={(value) => setHeroForm((prev) => ({ ...prev, headline: value }))} />
            <InputField
              label="Subheadline"
              value={heroForm.subheadline}
              onChange={(value) => setHeroForm((prev) => ({ ...prev, subheadline: value }))}
              textarea
            />
            <InputField
              label="Primary CTA label"
              value={heroForm.primaryCtaLabel}
              onChange={(value) => setHeroForm((prev) => ({ ...prev, primaryCtaLabel: value }))}
            />
            <InputField
              label="Secondary CTA label"
              value={heroForm.secondaryCtaLabel}
              onChange={(value) => setHeroForm((prev) => ({ ...prev, secondaryCtaLabel: value }))}
            />
            <InputField
              label="Hero video URL"
              value={heroForm.videoUrl}
              onChange={(value) => setHeroForm((prev) => ({ ...prev, videoUrl: value }))}
            />
            <InputField
              label="Video poster/thumbnail URL (optional)"
              value={heroForm.videoPoster ?? ''}
              onChange={(value) => setHeroForm((prev) => ({ ...prev, videoPoster: value }))}
            />
            <button
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={saveHero}
              disabled={isSaving}
            >
              Save hero
            </button>
          </div>
        );
      case 'features':
        return (
          <div className="space-y-4">
            {featuresForm.map((feature, index) => (
              <div key={index} className="rounded-2xl border border-white/10 p-4">
                <InputField
                  label="Title"
                  value={feature.title}
                  onChange={(value) =>
                    setFeaturesForm((prev) => prev.map((item, i) => (i === index ? { ...item, title: value } : item)))
                  }
                />
                <InputField
                  label="Description"
                  value={feature.description}
                  onChange={(value) =>
                    setFeaturesForm((prev) => prev.map((item, i) => (i === index ? { ...item, description: value } : item)))
                  }
                  textarea
                />
                <button
                  type="button"
                  className="text-xs text-rose-400"
                  onClick={() => setFeaturesForm((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded-full border border-white/20 px-4 py-2 text-sm"
              onClick={() => setFeaturesForm((prev) => [...prev, { title: 'New feature', description: '' }])}
            >
              Add feature
            </button>
            <button
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={saveFeatures}
              disabled={isSaving}
            >
              Save features
            </button>
          </div>
        );
      case 'testimonials':
        return (
          <div className="space-y-4">
            {testimonialsForm.map((testimonial, index) => (
              <div key={index} className="rounded-2xl border border-white/10 p-4">
                <InputField
                  label="Name"
                  value={testimonial.name}
                  onChange={(value) =>
                    setTestimonialsForm((prev) => prev.map((item, i) => (i === index ? { ...item, name: value } : item)))
                  }
                />
                <InputField
                  label="Role / company"
                  value={testimonial.role}
                  onChange={(value) =>
                    setTestimonialsForm((prev) => prev.map((item, i) => (i === index ? { ...item, role: value } : item)))
                  }
                />
                <InputField
                  label="Quote"
                  value={testimonial.quote}
                  onChange={(value) =>
                    setTestimonialsForm((prev) => prev.map((item, i) => (i === index ? { ...item, quote: value } : item)))
                  }
                  textarea
                />
                <InputField
                  label="Avatar URL"
                  value={testimonial.avatarUrl ?? ''}
                  onChange={(value) =>
                    setTestimonialsForm((prev) => prev.map((item, i) => (i === index ? { ...item, avatarUrl: value } : item)))
                  }
                />
                <button
                  type="button"
                  className="text-xs text-rose-400"
                  onClick={() => setTestimonialsForm((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded-full border border-white/20 px-4 py-2 text-sm"
              onClick={() =>
                setTestimonialsForm((prev) => [...prev, { name: 'New person', role: '', quote: '', avatarUrl: '' }])
              }
            >
              Add testimonial
            </button>
            <button
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={saveTestimonials}
              disabled={isSaving}
            >
              Save testimonials
            </button>
          </div>
        );
      case 'pricing':
        return (
          <div className="space-y-4">
            <InputField
              label="Pricing subtitle"
              value={pricingForm}
              onChange={(value) => setPricingForm(value)}
              textarea
            />
            <button
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={savePricing}
              disabled={isSaving}
            >
              Save pricing text
            </button>
          </div>
        );
      case 'contact':
        return (
          <div className="space-y-4">
            <InputField
              label="Contact destination email"
              value={contactTarget}
              onChange={(value) => setContactTarget(value)}
            />
            <InputField
              label="Contact description"
              value={contactDescription}
              onChange={(value) => setContactDescription(value)}
              textarea
            />
            <p className="text-xs text-slate-400">
              Update the on-page contact copy and destination email shown on the marketing site.
            </p>
            <button
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={saveContact}
              disabled={isSaving}
            >
              Save contact settings
            </button>
          </div>
        );
      case 'showcase':
        return (
          <div className="space-y-4">
            {showcaseForm.map((example, index) => (
              <div key={index} className="space-y-3 rounded-2xl border border-white/10 p-4">
                <InputField
                  label="Title"
                  value={example.title}
                  onChange={(value) =>
                    setShowcaseForm((prev) => prev.map((item, i) => (i === index ? { ...item, title: value } : item)))
                  }
                />
                <InputField
                  label="Description"
                  value={example.description}
                  onChange={(value) =>
                    setShowcaseForm((prev) =>
                      prev.map((item, i) => (i === index ? { ...item, description: value } : item)),
                    )
                  }
                  textarea
                />
                <InputField
                  label="Video embed URL (YouTube, Vimeo, etc.)"
                  value={example.videoUrl}
                  onChange={(value) =>
                    setShowcaseForm((prev) => prev.map((item, i) => (i === index ? { ...item, videoUrl: value } : item)))
                  }
                />
                <button
                  type="button"
                  className="text-xs text-rose-400"
                  onClick={() => setShowcaseForm((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:opacity-40"
              onClick={() => setShowcaseForm((prev) => [...prev, { title: 'New example', description: '', videoUrl: '' }])}
              disabled={showcaseForm.length >= 5}
            >
              Add example (max 5)
            </button>
            <button
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={saveShowcase}
              disabled={isSaving}
            >
              Save showcase
            </button>
          </div>
        );
      case 'how':
        return (
          <div className="space-y-4">
            {howForm.map((item, index) => (
              <div key={index} className="rounded-2xl border border-white/10 p-4">
                <InputField
                  label="Step label"
                  value={item.title}
                  onChange={(value) => setHowForm((prev) => prev.map((entry, i) => (i === index ? { ...entry, title: value } : entry)))}
                />
                <InputField
                  label="Description"
                  value={item.description}
                  onChange={(value) =>
                    setHowForm((prev) => prev.map((entry, i) => (i === index ? { ...entry, description: value } : entry)))
                  }
                  textarea
                />
                <InputField
                  label="Step number"
                  value={item.step}
                  onChange={(value) =>
                    setHowForm((prev) => prev.map((entry, i) => (i === index ? { ...entry, step: value } : entry)))
                  }
                />
                <InputField
                  label="Image URL (optional)"
                  value={item.imageUrl ?? ''}
                  onChange={(value) =>
                    setHowForm((prev) => prev.map((entry, i) => (i === index ? { ...entry, imageUrl: value || undefined } : entry)))
                  }
                />
                <button
                  type="button"
                  className="text-xs text-rose-400"
                  onClick={() => setHowForm((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full border border-white/20 px-4 py-2 text-sm"
                onClick={() => setHowForm((prev) => [...prev, { title: 'New step', description: '', step: String(prev.length + 1).padStart(2, '0'), imageUrl: undefined }])}
              >
                Add step
              </button>
              <button
                className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={saveHow}
                disabled={isSaving}
              >
                Save steps
              </button>
            </div>
          </div>
        );
      case 'product':
        return (
          <div className="space-y-4">
            {productForm.map((section, index) => (
              <div key={index} className="rounded-2xl border border-white/10 p-4">
                <InputField
                  label="Title"
                  value={section.title}
                  onChange={(value) => setProductForm((prev) => prev.map((item, i) => (i === index ? { ...item, title: value } : item)))}
                />
                <InputField
                  label="Description"
                  value={section.description}
                  onChange={(value) => setProductForm((prev) => prev.map((item, i) => (i === index ? { ...item, description: value } : item)))}
                  textarea
                />
                <InputField
                  label="Image URL"
                  value={section.image}
                  onChange={(value) => setProductForm((prev) => prev.map((item, i) => (i === index ? { ...item, image: value } : item)))}
                />
                <button
                  type="button"
                  className="text-xs text-rose-400"
                  onClick={() => setProductForm((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full border border-white/20 px-4 py-2 text-sm"
                onClick={() => setProductForm((prev) => [...prev, { title: 'New section', description: '', image: '' }])}
              >
                Add section
              </button>
              <button
                className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={saveProduct}
                disabled={isSaving}
              >
                Save product content
              </button>
            </div>
          </div>
        );
      case 'about':
        return (
          <div className="space-y-4">
            <InputField label="Mission" value={aboutForm.mission} onChange={(value) => setAboutForm((prev) => ({ ...prev, mission: value }))} textarea />
            <InputField label="Origin story" value={aboutForm.founder} onChange={(value) => setAboutForm((prev) => ({ ...prev, founder: value }))} textarea />
            <InputField label="Focus" value={aboutForm.focus} onChange={(value) => setAboutForm((prev) => ({ ...prev, focus: value }))} textarea />
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Values</p>
              {aboutForm.values.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm"
                    value={value}
                    onChange={(e) =>
                      setAboutForm((prev) => ({
                        ...prev,
                        values: prev.values.map((entry, i) => (i === index ? e.target.value : entry)),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="text-xs text-rose-400"
                    onClick={() => setAboutForm((prev) => ({ ...prev, values: prev.values.filter((_, i) => i !== index) }))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="rounded-full border border-white/20 px-4 py-2 text-sm"
                onClick={() => setAboutForm((prev) => ({ ...prev, values: [...prev.values, 'New value'] }))}
              >
                Add value
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Timeline</p>
              {aboutForm.timeline.map((entry, index) => (
                <div key={`${entry.year}-${index}`} className="grid gap-2 rounded-2xl border border-white/10 p-3 md:grid-cols-[1fr_3fr]">
                  <input
                    className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm"
                    value={entry.year}
                    onChange={(e) =>
                      setAboutForm((prev) => ({
                        ...prev,
                        timeline: prev.timeline.map((item, i) => (i === index ? { ...item, year: e.target.value } : item)),
                      }))
                    }
                  />
                  <input
                    className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm"
                    value={entry.text}
                    onChange={(e) =>
                      setAboutForm((prev) => ({
                        ...prev,
                        timeline: prev.timeline.map((item, i) => (i === index ? { ...item, text: e.target.value } : item)),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="text-xs text-rose-400 md:col-span-2 text-left"
                    onClick={() =>
                      setAboutForm((prev) => ({ ...prev, timeline: prev.timeline.filter((_, i) => i !== index) }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="rounded-full border border-white/20 px-4 py-2 text-sm"
                onClick={() =>
                  setAboutForm((prev) => ({ ...prev, timeline: [...prev.timeline, { year: 'New', text: 'Detail' }] }))
                }
              >
                Add milestone
              </button>
            </div>
            <button
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={saveAbout}
              disabled={isSaving}
            >
              Save about content
            </button>
          </div>
        );
      case 'legal':
        return (
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Company</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InputField
                  label="Company name"
                  value={legalForm.company.name}
                  onChange={(value) => setLegalForm((prev) => ({ ...prev, company: { ...prev.company, name: value } }))}
                />
                <InputField
                  label="Country"
                  value={legalForm.company.country}
                  onChange={(value) =>
                    setLegalForm((prev) => ({ ...prev, company: { ...prev.company, country: value } }))
                  }
                />
                <InputField
                  label="City (optional)"
                  value={legalForm.company.city}
                  onChange={(value) => setLegalForm((prev) => ({ ...prev, company: { ...prev.company, city: value } }))}
                />
                <InputField
                  label="Address (optional)"
                  value={legalForm.company.address}
                  onChange={(value) =>
                    setLegalForm((prev) => ({ ...prev, company: { ...prev.company, address: value } }))
                  }
                  textarea
                  rows={3}
                />
                <InputField
                  label="Legal contact email"
                  value={legalForm.company.contactEmail}
                  onChange={(value) =>
                    setLegalForm((prev) => ({ ...prev, company: { ...prev.company, contactEmail: value } }))
                  }
                />
                <InputField
                  label="Last updated (YYYY-MM-DD)"
                  value={legalForm.lastUpdated}
                  onChange={(value) => setLegalForm((prev) => ({ ...prev, lastUpdated: value }))}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Footer social links</p>
              <p className="mt-2 text-sm text-slate-300">Add full URLs. Leave blank to hide the link.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <InputField
                  label="LinkedIn URL"
                  value={legalForm.social.linkedin}
                  onChange={(value) =>
                    setLegalForm((prev) => ({ ...prev, social: { ...prev.social, linkedin: value } }))
                  }
                />
                <InputField
                  label="X (Twitter) URL"
                  value={legalForm.social.x}
                  onChange={(value) => setLegalForm((prev) => ({ ...prev, social: { ...prev.social, x: value } }))}
                />
                <InputField
                  label="Instagram URL"
                  value={legalForm.social.instagram}
                  onChange={(value) =>
                    setLegalForm((prev) => ({ ...prev, social: { ...prev.social, instagram: value } }))
                  }
                />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Legal pages (Markdown)</p>
              <p className="mt-2 text-sm text-slate-300">
                You can use placeholders: <span className="font-mono text-slate-200">{'{{companyName}}'}</span>,{' '}
                <span className="font-mono text-slate-200">{'{{companyCountry}}'}</span>,{' '}
                <span className="font-mono text-slate-200">{'{{contactEmail}}'}</span>,{' '}
                <span className="font-mono text-slate-200">{'{{lastUpdated}}'}</span>.
              </p>
              <div className="mt-5 space-y-4">
                <InputField
                  label="Privacy Policy (Markdown)"
                  value={legalForm.privacyMarkdown}
                  onChange={(value) => setLegalForm((prev) => ({ ...prev, privacyMarkdown: value }))}
                  textarea
                  rows={18}
                />
                <InputField
                  label="Terms of Service (Markdown)"
                  value={legalForm.termsMarkdown}
                  onChange={(value) => setLegalForm((prev) => ({ ...prev, termsMarkdown: value }))}
                  textarea
                  rows={18}
                />
                <InputField
                  label="Cookie Policy (Markdown)"
                  value={legalForm.cookieMarkdown}
                  onChange={(value) => setLegalForm((prev) => ({ ...prev, cookieMarkdown: value }))}
                  textarea
                  rows={16}
                />
              </div>

              <button
                className="mt-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                onClick={saveLegal}
                disabled={isSaving}
              >
                Save legal & footer
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="grid gap-8 rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-slate-100 md:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        {sections.map((section) => (
          <button
            key={section.id}
            className={`w-full rounded-2xl border px-4 py-2 text-left text-sm font-semibold transition ${
              activeSection === section.id
                ? 'border-emerald-400 bg-emerald-500/15 text-white'
                : 'border-white/10 text-slate-300'
            }`}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </aside>
      <section>
        {renderContent()}
        {mutation.isPending && <p className="mt-2 text-xs text-slate-400">Saving…</p>}
        {toast && !mutation.isPending && (
          <p className="mt-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {toast}
          </p>
        )}
      </section>
    </div>
  );
};

const InputField = ({
  label,
  value,
  onChange,
  textarea,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
  rows?: number;
}) => (
  <label className="block text-sm">
    <span className="text-slate-300">{label}</span>
    {textarea ? (
      <textarea
        className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows ?? 4}
      />
    ) : (
      <input
        className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )}
  </label>
);

export default OwnerCmsPage;
