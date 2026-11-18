// Local tests for AgentWall against an in-process Ganache chain + MockAgentID.
const fs = require("fs");
const path = require("path");
const ganache = require("ganache");
const { ethers } = require("ethers");

function artifact(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "artifacts", name + ".json"), "utf8"));
}

let failures = 0;
function check(label, cond) {
  console.log((cond ? "PASS" : "FAIL") + "  " + label);
  if (!cond) failures++;
}
async function expectRevert(label, promise, needle) {
  try {
    const resp = await promise;
    if (resp && typeof resp.wait === "function") await resp.wait();
    check(label + " (should have reverted)", false);
  } catch (e) {
    check(label, true); // any throw/revert is the assertion
  }
}

(async () => {
  const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
  const accounts = await provider.listAccounts();
  const [deployer, alice, bob, carol] = accounts;

  const mockArt = artifact("MockAgentID");
  const wallArt = artifact("AgentWall");
  const mock = await new ethers.ContractFactory(mockArt.abi, mockArt.bytecode, deployer).deploy();
  await mock.waitForDeployment();
  const wall = await new ethers.ContractFactory(wallArt.abi, wallArt.bytecode, deployer).deploy(await mock.getAddress());
  await wall.waitForDeployment();
  console.log("MockAgentID:", await mock.getAddress());
  console.log("AgentWall:  ", await wall.getAddress());

  // Alice holds an Agent ID; Bob and Carol do not.
  await (await mock.connect(deployer).mint(alice.address)).wait();

  check("signerCount starts 0", (await wall.signerCount()) === 0n);
  await expectRevert("non-holder Bob cannot sign", wall.connect(bob).sign("hello from bob"), "NotAgentIDHolder");

  const tx1 = await wall.connect(alice).sign("Hello from Alice, the first agent!");
  const rc1 = await tx1.wait();
  const ev = rc1.logs.map((l) => { try { return wall.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "Signed");
  check("holder Alice signs", !!ev);
  check("event firstTime=true", ev && ev.args.firstTime === true);
  check("signerCount = 1", (await wall.signerCount()) === 1n);
  check("totalSigns = 1", (await wall.totalSigns()) === 1n);
  const e1 = await wall.entryOf(alice.address);
  check("entry stored", e1[0] === "Hello from Alice, the first agent!" && e1[2] === 1n);
  check("hasSigned(alice)", (await wall.hasSigned(alice.address)) === true);
  check("hasSigned(bob) false", (await wall.hasSigned(bob.address)) === false);

  await expectRevert("empty message rejected", wall.connect(alice).sign(""), "EmptyMessage");
  await expectRevert("281-byte message rejected", wall.connect(alice).sign("x".repeat(281)), "MessageTooLong");
  await (await wall.connect(alice).sign("y".repeat(280), { gasLimit: 1000000 })).wait();
  check("280-byte message accepted", (await wall.entryOf(alice.address))[0].length === 280);

  await (await wall.connect(alice).sign("Updated message")).wait();
  const e2 = await wall.entryOf(alice.address);
  check("re-sign updates message", e2[0] === "Updated message");
  check("signCount = 3 after 3 signs", e2[2] === 3n);
  check("signerCount still 1", (await wall.signerCount()) === 1n);
  check("totalSigns = 3", (await wall.totalSigns()) === 3n);

  await (await mock.connect(deployer).mint(carol.address)).wait();
  await (await wall.connect(carol).sign("Carol was here")) .wait();
  check("signerCount = 2 after Carol", (await wall.signerCount()) === 2n);
  const page = await wall.signers(0, 10);
  check("signers(0,10) = [alice, carol]", page.length === 2 && page[0] === alice.address && page[1] === carol.address);
  const page2 = await wall.signers(1, 1);
  check("signers(1,1) = [carol]", page2.length === 1 && page2[0] === carol.address);
  const page3 = await wall.signers(5, 10);
  check("signers(5,10) = []", page3.length === 0);

  // Losing the mock ID is not possible (no burn), but gate re-checks balance every call:
  // a fresh non-holder stays blocked even after others signed.
  await expectRevert("Bob still blocked", wall.connect(bob).sign("bob again"), "NotAgentIDHolder");

  console.log(failures === 0 ? "\nALL TESTS PASSED" : "\n" + failures + " FAILURES");
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(2); });
