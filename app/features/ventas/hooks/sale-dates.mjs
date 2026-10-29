export function initialSaleDates(record, today) {
  const saleDate = record?.sale_date ?? today;
  return {
    sale_date: saleDate,
    delivery_date: record?.delivery_date ?? saleDate,
    delivery_date_manual_override: record?.delivery_date_manual_override ?? !!record?.delivery_date,
  };
}

export function changeSaleDateFields(values, field, value) {
  if (field === "delivery_date") {
    return { ...values, delivery_date: value, delivery_date_manual_override: true };
  }
  if (field === "delivery_date_manual_override") {
    return {
      ...values,
      delivery_date_manual_override: value,
      delivery_date: value ? values.delivery_date : values.sale_date,
    };
  }
  if (field === "sale_date" && !values.delivery_date_manual_override) {
    return { ...values, sale_date: value, delivery_date: value };
  }
  return { ...values, [field]: value };
}
