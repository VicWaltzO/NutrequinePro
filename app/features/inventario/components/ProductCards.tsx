import type { AppState } from "@/lib/domain-types";
import { stock } from "@/lib/domain-preview.mjs";
import { ProductImage, weight, num } from "@/shared/ui";
import { unitLabels } from "@/shared/domain/presentation.mjs";

export default function ProductCards({ s: state }: { s: AppState }) {
  return (
    <div className="product-grid">
      {state.products.map((p) => {
        const a = stock(state, p.id);
        return (
          <article className="product-card" key={p.id}>
            <ProductImage image={p.image} name={p.name} />
            <div>
              <h3>{p.name}</h3>
              <span className="product-kind">{p.is_sellable ? "Comercial" : "Consumo interno"}</span>
              <strong>
                {num(a.quantity)} <span>{unitLabels(p).plural}</span>
              </strong>
              <p>{weight(a.weight_kg)} físicos</p>
              <small>
                {num(a.committed)} {unitLabels(p).plural} comprometidos
              </small>
            </div>
          </article>
        );
      })}
    </div>
  );
}
