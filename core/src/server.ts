const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
  console.error(
    `SpecOps core richiede Node.js >= 22.5 (modulo node:sqlite). In uso: ${process.version} (${process.execPath}).`,
  );
  process.exit(1);
}

const { createAppServer, HOST, PORT } = await import("./http.js");

const server = createAppServer();

server.listen(PORT, HOST, () => {
  console.log(`SpecOps core listening on http://${HOST}:${PORT}`);
});
