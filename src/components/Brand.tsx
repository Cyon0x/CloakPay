import Link from "next/link";

/**
 * The CloakPay lockup.
 *
 * Every asset here is generated from the supplied master artwork by
 * `scripts/brand.py`. The symbol and the lettering are the original pixels,
 * cropped to their measured bounds. The `-light` files are the same pixels
 * lightened tonally for dark surfaces, not a different drawing and not a CSS
 * inversion, which would flatten the shading the artwork depends on.
 *
 * The theme is only known in the browser, so `tone="auto"` renders both
 * variants and CSS shows the one that belongs to the active theme. Deciding in
 * React would either flash the wrong asset or desynchronise the server render
 * from the live DOM.
 *
 * Intrinsic width and height are always set, so the artwork never causes a
 * layout shift while it loads.
 */
const WORDMARK_RATIO = 643 / 63;

export type BrandTone = "auto" | "dark" | "light";

function classes(...names: (string | false | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

/** One variant on its own, for surfaces whose tone is already decided. */
function Single({
  src,
  width,
  height,
  style,
  className,
  alt,
}: {
  src: string;
  width: number;
  height: number;
  style?: React.CSSProperties;
  className?: string;
  alt: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={width}
      height={height}
      className={classes("brand-img", className)}
      decoding="async"
      style={style}
    />
  );
}

function Pair({
  darkSrc,
  lightSrc,
  width,
  height,
  style,
  className,
  alt,
}: {
  darkSrc: string;
  lightSrc: string;
  width: number;
  height: number;
  style?: React.CSSProperties;
  className?: string;
  alt: string;
}) {
  return (
    <>
      <Single
        src={darkSrc}
        width={width}
        height={height}
        style={style}
        className={classes("brand-on-light", className)}
        alt={alt}
      />
      <Single
        src={lightSrc}
        width={width}
        height={height}
        style={style}
        className={classes("brand-on-dark", className)}
        alt={alt}
      />
    </>
  );
}

export function Mark({
  size = 32,
  tone = "auto",
  className,
  alt = "",
  fluid = false,
}: {
  size?: number;
  tone?: BrandTone;
  className?: string;
  alt?: string;
  /**
   * Lets CSS own the rendered size. The intrinsic `width`/`height` attributes
   * stay, so the box is still reserved before the file loads and the square
   * aspect ratio is preserved while the class sets a responsive width.
   */
  fluid?: boolean;
}) {
  const style = fluid ? undefined : { height: size, width: size };
  const common = { width: size, height: size, style, className, alt };

  if (tone === "dark") return <Single src="/brand/mark.png" {...common} />;
  if (tone === "light") return <Single src="/brand/mark-light.png" {...common} />;
  return <Pair darkSrc="/brand/mark.png" lightSrc="/brand/mark-light.png" {...common} />;
}

export function Wordmark({
  height = 18,
  tone = "auto",
  className,
}: {
  height?: number;
  tone?: BrandTone;
  className?: string;
}) {
  const width = Math.round(height * WORDMARK_RATIO);
  const style = { height, width: height * WORDMARK_RATIO };
  const common = { width, height, style, className, alt: "CloakPay" };

  if (tone === "dark") return <Single src="/brand/wordmark.png" {...common} />;
  if (tone === "light") return <Single src="/brand/wordmark-light.png" {...common} />;
  return <Pair darkSrc="/brand/wordmark.png" lightSrc="/brand/wordmark-light.png" {...common} />;
}

/**
 * Mark plus wordmark. The symbol is rendered at the cap height of the lettering
 * so the two read as one mark rather than as two stacked logos.
 */
export function Lockup({
  markSize = 30,
  tone = "auto",
}: {
  markSize?: number;
  tone?: BrandTone;
}) {
  return (
    <span className="lockup">
      <Mark size={markSize} tone={tone} />
      <Wordmark height={Math.round(markSize * 0.42)} tone={tone} />
    </span>
  );
}

export function BrandLink({
  tone = "auto",
  markSize = 28,
}: {
  tone?: BrandTone;
  markSize?: number;
}) {
  return (
    <Link href="/" className="brand-link" aria-label="CloakPay home">
      <Lockup markSize={markSize} tone={tone} />
    </Link>
  );
}
