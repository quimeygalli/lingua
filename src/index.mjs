import { CHAT_HTML } from "./chat-page.mjs";
import { answerWith } from "./agent.mjs";

export const handler = awslambda.streamifyResponse(
  async (event, responseStream) => {
    const method = event.httpMethod;
    const path = event.path || event.rawPath || "/";

    // GET / → chat page
    if (method === "GET" && (path === "/" || path === "")) {
      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      stream.write(CHAT_HTML);
      stream.end();
      return;
    }

    // POST /chat → stream agent answer as NDJSON
    if (method === "POST" && (path === "/chat" || path === "chat")) {
      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: { "Content-Type": "application/x-ndjson", "Transfer-Encoding": "chunked" },
      });
      const send = (obj) => stream.write(JSON.stringify(obj) + "\n");
      try {
        const { message, sessionId, userId } = JSON.parse(event.body ?? "{}");
        for await (const chunk of answerWith(
          message ?? "Hello!",
          sessionId ?? "no-session",
          userId ?? "anonymous"
        )) {
          send(chunk);
        }
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", text: err.name + ": " + err.message });
      }
      stream.end();
      return;
    }

    const stream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
    });
    stream.write(JSON.stringify({ error: "Not found" }));
    stream.end();
  }
);
