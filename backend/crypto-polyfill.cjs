const { webcrypto } = require("node:crypto");
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = webcrypto;
}
