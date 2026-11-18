// Compile AgentWall + MockAgentID with solc (standard JSON), optimizer on.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const sources = {};
for (const f of ["AgentWall.sol", "MockAgentID.sol"]) {
  sources[f] = { content: fs.readFileSync(path.join(__dirname, "contracts", f), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    evmVersion: "paris",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors) {
  for (const e of out.errors) {
    console.log(e.severity.toUpperCase() + ": " + e.formattedMessage);
    if (e.severity === "error") process.exitCode = 1;
  }
  if (process.exitCode) process.exit(1);
}

fs.mkdirSync(path.join(__dirname, "artifacts"), { recursive: true });
for (const file of Object.keys(out.contracts)) {
  for (const name of Object.keys(out.contracts[file])) {
    const c = out.contracts[file][name];
    if (!c.evm.bytecode.object) continue; // interfaces have no bytecode
    fs.writeFileSync(
      path.join(__dirname, "artifacts", name + ".json"),
      JSON.stringify({ abi: c.abi, bytecode: c.evm.bytecode.object, deployedSize: (c.evm.deployedBytecode.object.length - 2) / 2 }, null, 2)
    );
    console.log(name + ": bytecode " + c.evm.bytecode.object.length / 2 + " B, runtime " + (c.evm.deployedBytecode.object.length - 2) / 2 + " B");
  }
}
console.log("solc version:", solc.version());
