"use client";
import type { AppState } from "@/lib/domain-types";
import { stock } from "@/lib/domain.mjs";
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
              <span className="eyebrow">{p.is_sellable ? "COMERCIAL" : "CONSUMO INTERNO"}</span>
              <h3>{p.name}</h3>
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
