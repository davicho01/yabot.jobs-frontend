import { useState, type CSSProperties } from "react";
import "./CompanyLogo.css";

// A company's logo (crawled from its own site and served from our domain —
// see the backend's app.services.company_logos), shown inline right before
// the company name wherever one appears. Falls back to a letter avatar when
// there's no logo URL (not crawled yet / nothing usable on the site) or the
// image fails to load.
export default function CompanyLogo({
  name,
  logoUrl,
  size = 18,
}: {
  name: string | null | undefined;
  logoUrl: string | null | undefined;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.55) };

  if (logoUrl && failedUrl !== logoUrl) {
    return (
      <img
        className="company-logo"
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={style}
        onError={() => setFailedUrl(logoUrl)}
      />
    );
  }

  const letter = name?.trim().charAt(0).toUpperCase();
  if (!letter) return null;
  return (
    <span className="company-logo company-logo--avatar" aria-hidden="true" style={{ ...style, "--avatar-hue": hue(name!) } as CSSProperties}>
      {letter}
    </span>
  );
}

function hue(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}
