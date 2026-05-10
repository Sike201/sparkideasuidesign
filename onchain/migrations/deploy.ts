// Migrations are an early feature. Currently they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.
const anchor = require("@coral-xyz/anchor");

module.exports = async function (provider) {
  const programId = anchor.workspace.SparkIdeaVault.programId;
  console.log("Program ID:", programId.toString());
};
