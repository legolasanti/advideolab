import { useEffect } from 'react';

type Props = {
  title: string;
  description: string;
  url: string;
  image?: string;
};

const Seo = ({ title, description, url, image }: Props) => {
  useEffect(() => {
    document.title = title;
    const descTag = document.querySelector('meta[name="description"]');
    if (descTag) {
      descTag.setAttribute('content', description);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = description;
      document.head.appendChild(meta);
    }

    const ogTitle = document.querySelector('meta[property="og:title"]') ?? document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.setAttribute('content', title);
    if (!ogTitle.parentNode) document.head.appendChild(ogTitle);

    const ogDesc = document.querySelector('meta[property="og:description"]') ?? document.createElement('meta');
    ogDesc.setAttribute('property', 'og:description');
    ogDesc.setAttribute('content', description);
    if (!ogDesc.parentNode) document.head.appendChild(ogDesc);

    const ogUrl = document.querySelector('meta[property="og:url"]') ?? document.createElement('meta');
    ogUrl.setAttribute('property', 'og:url');
    ogUrl.setAttribute('content', url);
    if (!ogUrl.parentNode) document.head.appendChild(ogUrl);

    if (image) {
      const ogImage = document.querySelector('meta[property="og:image"]') ?? document.createElement('meta');
      ogImage.setAttribute('property', 'og:image');
      ogImage.setAttribute('content', image);
      if (!ogImage.parentNode) document.head.appendChild(ogImage);
    }
  }, [title, description, url, image]);

  return null;
};

export default Seo;
