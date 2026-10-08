/** Keep the same operation ID on retries and block overlapping submissions. */
export function createCommandRequest() {
  let request = null;
  let pending = false;
  return {
    begin(fingerprint) {
      if (pending) return null;
      pending = true;
      if (request?.fingerprint !== fingerprint) request = { fingerprint, id: crypto.randomUUID() };
      return request.id;
    },
    reset() { request = null; },
    finish() { pending = false; },
  };
}
