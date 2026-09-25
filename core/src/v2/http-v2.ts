import type { IncomingMessage, ServerResponse } from "node:http";
import { SpecOpsError } from "../errors.js";
import { importSpecText, listSpecs } from "./specs-library.js";
import { getMissionService } from "./mission-service.js";
import { isProviderConfigured } from "./provider.js";

type SendJson = (
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
) => void;

type ParseJson = (req: IncomingMessage) => Promise<unknown>;

export function matchV2Route(
  method: string,
  path: string,
): { name: string; params: Record<string, string> } | null {
  if (path === "/api/v2/specs" && method === "GET") {
    return { name: "specs.list", params: {} };
  }
  if (path === "/api/v2/specs/import" && method === "POST") {
    return { name: "specs.import", params: {} };
  }
  if (path === "/api/v2/missions" && method === "POST") {
    return { name: "missions.create", params: {} };
  }
  if (path === "/api/v2/health" && method === "GET") {
    return { name: "v2.health", params: {} };
  }

  const missionMatch = path.match(/^\/api\/v2\/missions\/([^/]+)(.*)$/);
  if (!missionMatch) return null;
  const id = decodeURIComponent(missionMatch[1]!);
  const rest = missionMatch[2] ?? "";

  const table: Array<[string, string]> = [
    ["", "missions.get"],
    ["/events", "missions.events"],
    ["/confirm-rules", "missions.confirmRules"],
    ["/start", "missions.start"],
    ["/answers", "missions.answers"],
    ["/control", "missions.control"],
    ["/spec", "missions.spec"],
    ["/reanalyze", "missions.reanalyze"],
    ["/brief", "missions.brief"],
  ];

  for (const [suffix, name] of table) {
    if (rest === suffix) {
      const expectedMethod =
        name === "missions.get" ||
        name === "missions.events" ||
        name === "missions.brief"
          ? "GET"
          : name === "missions.spec"
            ? "PUT"
            : "POST";
      if (method !== expectedMethod) {
        return { name: "method_mismatch", params: { id, expected: expectedMethod } };
      }
      return { name, params: { id } };
    }
  }
  return null;
}

export async function handleV2(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  helpers: { sendJson: SendJson; parseJson: ParseJson; setCors: () => void },
): Promise<boolean> {
  const matched = matchV2Route(method, path);
  if (!matched) {
    if (path.startsWith("/api/v2/")) {
      if (method === "OPTIONS") {
        helpers.setCors();
        res.writeHead(204);
        res.end();
        return true;
      }
      // Let caller decide 404 vs method — check if path exists with other method
      const methods = ["GET", "POST", "PUT"];
      for (const m of methods) {
        if (m !== method && matchV2Route(m, path)) {
          throw new SpecOpsError(
            "METHOD_NOT_ALLOWED",
            `Metodo ${method} non consentito su ${path}.`,
            405,
          );
        }
      }
      throw new SpecOpsError("NOT_FOUND", "Rotta non trovata.", 404);
    }
    return false;
  }

  if (matched.name === "method_mismatch") {
    throw new SpecOpsError(
      "METHOD_NOT_ALLOWED",
      `Metodo ${method} non consentito.`,
      405,
    );
  }

  const service = getMissionService();
  const { sendJson, parseJson } = helpers;

  switch (matched.name) {
    case "v2.health": {
      sendJson(req, res, 200, {
        ok: true,
        providerConfigured: isProviderConfigured(),
        modes: { demo: true, connected: isProviderConfigured() },
      });
      return true;
    }
    case "specs.list": {
      sendJson(req, res, 200, { specs: listSpecs() });
      return true;
    }
    case "specs.import": {
      const body = (await parseJson(req)) as { title?: string; text?: string };
      try {
        const doc = importSpecText(String(body.title ?? ""), String(body.text ?? ""));
        sendJson(req, res, 201, {
          id: doc.id,
          title: doc.title,
          version: doc.version,
          preview: doc.text.slice(0, 180),
        });
      } catch (err) {
        const reason = (err as Error).message;
        throw new SpecOpsError(
          "INVALID_INPUT",
          reason === "too_long"
            ? "Spec oltre 20.000 caratteri."
            : "Testo spec non valido.",
          400,
        );
      }
      return true;
    }
    case "missions.create": {
      const body = (await parseJson(req)) as {
        specId?: string;
        specVersion?: number;
        mode?: string;
        runnerId?: string;
      };
      const snap = service.createMission({
        specId: String(body.specId ?? ""),
        specVersion: Number(body.specVersion ?? 1),
        mode: body.mode as "demo" | "connected",
        runnerId: body.runnerId,
      });
      sendJson(req, res, 201, snap);
      return true;
    }
    case "missions.get": {
      sendJson(req, res, 200, service.getSnapshot(matched.params.id!));
      return true;
    }
    case "missions.events": {
      await handleSse(req, res, matched.params.id!, service, helpers.setCors);
      return true;
    }
    case "missions.confirmRules": {
      const body = (await parseJson(req)) as {
        specVersion?: number;
        rules?: unknown;
      };
      const snap = service.confirmRules(matched.params.id!, {
        specVersion: Number(body.specVersion),
        rules: body.rules as never,
      });
      sendJson(req, res, 200, snap);
      return true;
    }
    case "missions.start": {
      sendJson(req, res, 200, service.startMission(matched.params.id!));
      return true;
    }
    case "missions.answers": {
      const body = (await parseJson(req)) as {
        questionId?: string;
        choiceId?: string;
        specVersion?: number;
        idempotencyKey?: string;
        assessment?: unknown;
      };
      const result = service.answer(matched.params.id!, {
        questionId: String(body.questionId ?? ""),
        choiceId: String(body.choiceId ?? ""),
        specVersion: Number(body.specVersion),
        idempotencyKey: String(body.idempotencyKey ?? ""),
        assessment: body.assessment,
      });
      sendJson(req, res, 200, result);
      return true;
    }
    case "missions.control": {
      const body = (await parseJson(req)) as {
        kind?: string;
        idempotencyKey?: string;
      };
      const result = service.control(matched.params.id!, {
        kind: body.kind as "pause" | "resume",
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
      sendJson(req, res, 202, result);
      return true;
    }
    case "missions.spec": {
      const body = (await parseJson(req)) as {
        baseVersion?: number;
        text?: string;
        changeReason?: string;
      };
      const snap = service.updateSpec(matched.params.id!, {
        baseVersion: Number(body.baseVersion),
        text: String(body.text ?? ""),
        changeReason: String(body.changeReason ?? ""),
      });
      sendJson(req, res, 200, snap);
      return true;
    }
    case "missions.reanalyze": {
      sendJson(req, res, 200, service.reanalyze(matched.params.id!));
      return true;
    }
    case "missions.brief": {
      sendJson(req, res, 200, service.brief(matched.params.id!));
      return true;
    }
    default:
      return false;
  }
}

async function handleSse(
  req: IncomingMessage,
  res: ServerResponse,
  missionId: string,
  service: ReturnType<typeof getMissionService>,
  setCors: () => void,
): Promise<void> {
  setCors();
  const lastEventIdHeader = req.headers["last-event-id"];
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const fromQuery = url.searchParams.get("after");
  let after = 0;
  if (lastEventIdHeader) after = Number(lastEventIdHeader) || 0;
  else if (fromQuery) after = Number(fromQuery) || 0;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const events = service.listEvents(missionId, after);
  // If client asks for ancient history we don't have (sequence gap), request snapshot.
  if (after > 0) {
    const available = service.listEvents(missionId, 0);
    const minSeq = available[0]?.sequence;
    if (minSeq !== undefined && after + 1 < minSeq) {
      res.write(
        `event: snapshot.required\ndata: ${JSON.stringify({ after })}\n\n`,
      );
    }
  }

  for (const event of events) {
    res.write(
      `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    );
  }

  const unsubscribe = service.subscribeSse(missionId, {
    write: (chunk) => {
      res.write(chunk);
    },
    close: () => {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    },
  });

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}
