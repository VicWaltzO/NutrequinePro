const identities: Record<string, { tone: string; color: string }> = {
  "nutrelin adulto": { tone: "nutrelin", color: "amarillo" },
  "hi-performance": { tone: "performance", color: "verde" },
  potripregnant: { tone: "potripregnant", color: "rosa" },
  base: { tone: "base", color: "blanco cálido" },
};

export function ProductMarker({ name }: { name: string }) {
  const identity = identities[name.trim().toLowerCase()];
  if (!identity) return null;
  return (
    <span
      className={"product-marker product-marker-" + identity.tone}
      aria-hidden="true"
      title={"Identificación de " + name + ": " + identity.color}
    />
  );
}

export function ProductName({ name }: { name: string }) {
  return (
    <span className="product-name">
      {name}
      <ProductMarker name={name} />
    </span>
  );
}
