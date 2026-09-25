import { createReferenceRunner } from "./reference-runner.js";

const port = Number(process.env.SPECOPS_REFERENCE_PORT ?? 3002);
const host = process.env.SPECOPS_HOST ?? "127.0.0.1";
const server = createReferenceRunner();
server.listen(port, host, () => {
  console.log(`SpecOps reference runner on http://${host}:${port}`);
});
