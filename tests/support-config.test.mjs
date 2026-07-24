import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORT_ETH_ADDRESS,
  SUPPORT_EXPLORER_URL,
} from "../app/support-config.mjs";

test("the support portal retains the original Legend Nexus address", () => {
  assert.equal(
    SUPPORT_ETH_ADDRESS,
    "0x1963149B1bFf4f43aF1e6aF1E32392e0Ec95A315",
  );
  assert.match(SUPPORT_ETH_ADDRESS, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(SUPPORT_ETH_ADDRESS.length, 42);
  assert.equal(
    SUPPORT_EXPLORER_URL,
    `https://etherscan.io/address/${SUPPORT_ETH_ADDRESS}`,
  );
});
