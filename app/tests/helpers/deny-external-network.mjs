// Test-only preload, deliberately excluded from the distributable backend.
import net from "node:net";
import dns from "node:dns";
import dgram from "node:dgram";
import Module, { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";

const allowed = (host) => host === "127.0.0.1" || host === "::1";
function denied() {
  throw new Error("TEST_EXTERNAL_NETWORK_DENIED");
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options =
    first && typeof first === "object"
      ? first
      : { host: typeof args[1] === "string" ? args[1] : "localhost" };
  if (!allowed(options.host) || options.path) denied();
  return Reflect.apply(connect, this, args);
};
const lookup = dns.lookup;
dns.lookup = function (host, ...args) {
  if (!allowed(host)) denied();
  return Reflect.apply(lookup, this, [host, ...args]);
};
for (const name of Object.keys(dns))
  if (name.startsWith("resolve") || ["reverse", "lookupService"].includes(name)) dns[name] = denied;
for (const name of Object.keys(dns.promises)) dns.promises[name] = async () => denied();
dgram.createSocket = denied;
const fetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!allowed(url.hostname)) return Promise.reject(new Error("TEST_EXTERNAL_NETWORK_DENIED"));
  return fetch(input, options);
};
const load = Module._load;
Module._load = function (name, ...args) {
  if (/cloudflare|wrangler|vinext|miniflare|sites-worker/.test(name))
    throw new Error("TEST_PLATFORM_IMPORT_DENIED");
  return Reflect.apply(load, this, [name, ...args]);
};
syncBuiltinESMExports();
assert.throws(() => net.connect({ host: "203.0.113.1", port: 443 }), /TEST_EXTERNAL_NETWORK_DENIED/);
assert.throws(() => dns.lookup("example.com", () => {}), /TEST_EXTERNAL_NETWORK_DENIED/);
await assert.rejects(globalThis.fetch("https://example.com"), /TEST_EXTERNAL_NETWORK_DENIED/);
console.log("TEST_NETWORK_GUARD_ACTIVE");
