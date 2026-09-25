import { createAppServer, HOST, PORT } from "./http.js";

const server = createAppServer();

server.listen(PORT, HOST, () => {
  console.log(`SpecOps core listening on http://${HOST}:${PORT}`);
});
