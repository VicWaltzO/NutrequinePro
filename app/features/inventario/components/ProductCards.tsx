import type { AppState } from "@/lib/domain-types";
import { stock } from "@/lib/domain-preview.mjs";
import { ProductImage, kg, num } from "@/shared/ui";

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
                {num(a.quantity)} <span>sacos</span>
              </strong>
              <p>{kg(a.weight_kg)} kg físicos</p>
              <small>{num(a.committed)} sacos comprometidos</small>
            </div>
          </article>
        );
      })}
    </div>
  );
}
