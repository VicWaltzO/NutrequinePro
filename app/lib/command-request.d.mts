export function createCommandRequest(): {
  begin(fingerprint: string): string | null;
  reset(): void;
  finish(): void;
};
