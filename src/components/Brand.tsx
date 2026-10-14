import Link from "next/link";

/**
 * The CloakPay lockup.
 *
 * Every asset here is generated from the supplied master artwork by
 * `scripts/brand.py`. The symbol and the lettering are the original pixels,
 * cropped to their measured bounds and, for dark surfaces only, lightened
 * tonally. Nothing is redrawn or re-typeset.
 *
 * Intrinsic width and height are always set, so the artwork never causes a
 * layout shift while it loads.
 */
const WORDMARK_RATIO = 643 / 63;

export function Mark({
  size = 32,
  tone = "dark",
  className,
  alt = "",
}: {
  size?: number;
  tone?: "dark" | "light";
  className?: string;
  alt?: string;
}) {
  const src = tone === "light" ? "/brand/mark-light.png" : "/brand/mark.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={size}
      height={size}
      className={className}
      decoding="async"
      style={{ display: "block", height: size, width: size }}
    />
  );
}

export function Wordmark({
  height = 18,
  tone = "dark",
  className,
}: {
  height?: number;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === "light" ? "/brand/wordmark-light.png" : "/brand/wordmark.png"}
      alt="CloakPay"
      width={Math.round(height * WORDMARK_RATIO)}
      height={height}
      className={className}
      decoding="async"
      style={{ display: "block", height, width: height * WORDMARK_RATIO }}
    />
  );
}

/**
 * Mark plus wordmark. The symbol is rendered at the cap height of the lettering
 * so the two read as one mark rather than as two stacked logos.
 */
export function Lockup({
  markSize = 30,
  tone = "dark",
}: {
  markSize?: number;
  tone?: "dark" | "light";
}) {
  return (
    <span className="lockup">
      <Mark size={markSize} tone={tone} />
      <Wordmark height={Math.round(markSize * 0.42)} tone={tone} />
    </span>
  );
}

export function BrandLink({
  tone = "dark",
  markSize = 28,
}: {
  tone?: "dark" | "light";
  markSize?: number;
}) {
  return (
    <Link href="/" className="brand-link" aria-label="CloakPay home">
      <Lockup markSize={markSize} tone={tone} />
    </Link>
  );
}
