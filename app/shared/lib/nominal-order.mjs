const collator = new Intl.Collator("es-PE", { sensitivity: "base", numeric: true });
const normalized = (text) => text.normalize("NFC").toLocaleLowerCase("es-PE");
const compareExact = (a, b) => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

/** Sort presentation options only. Objects and source order are never mutated. */
export function orderNominal(options, text, id = () => "", fixedLast = []) {
  return options
    .map((option, index) => ({ option, index, text: text(option), id: id(option) }))
    .sort((a, b) => {
      const aFixed = fixedLast.includes(a.id);
      const bFixed = fixedLast.includes(b.id);
      if (aFixed !== bFixed) return aFixed ? 1 : -1;
      if (aFixed) return a.index - b.index;
      return (
        collator.compare(a.text, b.text) ||
        compareExact(normalized(a.text), normalized(b.text)) ||
        compareExact(a.id, b.id) ||
        a.index - b.index
      );
    })
    .map(({ option }) => option);
}
