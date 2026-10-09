"use client";

export function ProductImage({ image, name }: { image?: string | null; name: string }) {
  return image ? (
    <div role="img" aria-label={`Presentación real de ${name}`} className={"product-photo " + image} />
  ) : (
    <div className="product-photo base-product">
      NP<span>BASE</span>
    </div>
  );
}
