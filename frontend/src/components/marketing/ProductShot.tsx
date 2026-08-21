import Image, { type StaticImageData } from "next/image";

/**
 * A real screenshot framed as a dark "plate", the same treatment the homepage
 * product tour uses (see landing/home/ProductTour.tsx).
 *
 * Why this exists: until now every page except the homepage shipped with zero
 * product imagery. Someone landing on /products/tickets from a search never
 * saw the product before being asked to sign up — the page argued for itself
 * entirely in prose. A screenshot is the cheapest proof a product page has.
 *
 * Pass a **static import** of the WebP, never a string path: static imports
 * carry width/height/blurDataURL, so the frame reserves its space and the page
 * has no layout shift. Capture new plates with
 * e2e/tools/capture-marketing-shots.ts.
 *
 * `figure`/`caption` render the mono slug line the brand uses on product
 * imagery ("FIG. 01 — Service desk, email-intake").
 *
 * Every shot is lazy. These sit below a text hero on each page, so none is the
 * LCP element; if one ever is, add `fetchPriority="high"` rather than the
 * `priority` prop, which Next 16 deprecated in favour of `preload`.
 */
export function ProductShot({
  src,
  alt,
  figure,
  caption,
  className = "",
}: {
  src: StaticImageData;
  alt: string;
  figure: string;
  caption: string;
  className?: string;
}) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">
            {figure} — {caption}
          </span>
          <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">Live</span>
        </div>
        <Image
          src={src}
          alt={alt}
          placeholder="blur"
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="w-full"
        />
      </div>
      <figcaption className="mt-2.5 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/45">
        {caption}
      </figcaption>
    </figure>
  );
}
