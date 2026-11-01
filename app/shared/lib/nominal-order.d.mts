export function orderNominal<T>(
  options: readonly T[],
  text: (option: T) => string,
  id?: (option: T) => string,
  fixedLast?: readonly string[],
): T[];
