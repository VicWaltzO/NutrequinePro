export function ProductImage({ image, name }: { image?: string | null; name: string }) {
  if (image?.startsWith("data:image/"))
    return <img className="product-photo product-upload" src={image} alt={`Presentación real de ${name}`} />;
  return image ? (
    <div role="img" aria-label={`Presentación real de ${name}`} className={"product-photo " + image} />
  ) : (
    <div className="product-photo base-product">
      NP<span>{name}</span>
    </div>
  );
}
