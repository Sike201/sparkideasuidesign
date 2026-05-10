import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
}

const DEFAULT_TITLE = "JustSpark";
const DEFAULT_DESCRIPTION =
  "Community-driven platform to submit ideas, vote on the best ones, and help bring them to life on Solana.";
const BASE_URL = "https://justspark.fun";
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

export function SEO({ title, description, path, image }: SEOProps) {
  const fullTitle = title ? `${title} | ${DEFAULT_TITLE}` : `${DEFAULT_TITLE} — Submit Ideas, Vote & Build Together`;
  const desc = description || DEFAULT_DESCRIPTION;
  const url = path ? `${BASE_URL}${path}` : BASE_URL;
  const img = image || DEFAULT_IMAGE;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
    </Helmet>
  );
}
