# Lumen Ask

Date: 2026-09-05T16:03:39.836Z

## Question

In two sentences: when should an FDE choose SSE over WebSockets for streaming LLM tokens?

## Plan context

Real-time transports: SSE, WebSockets, streaming at scale (Track E, Month 4)

## Answer

An FDE should pick SSE when the client only needs one-way token streaming from the server, the environment forces plain HTTP (like restrictive proxies, CDNs, or serverless platforms that do not support persistent WebSocket connections), and reconnect-on-failure behavior is acceptable for the user experience. Choose WebSockets instead when you need true bidirectional traffic, such as live tool calls or cancel signals, because SSE only streams server to client and resubscribes after a dropped connection.

Concrete technical example: an FDE building a chat completion endpoint on AWS API Gateway or a serverless function uses `text/event-stream` SSE responses so each token is pushed as an `data:` frame, avoiding the WebSocket connection limits and infrastructure overhead that API Gateway would impose.

Production connection: SSE rides on standard HTTP, so it works behind CDNs, ALBs, and most load balancers without extra configuration, and it auto-resubscribes from the last event id, which simplifies retries during token streaming failures.

FDE interview angle: interview questions often test whether you know that SSE is simpler, HTTP-native, and one-way only, while WebSockets give you full duplex channels for richer agent interactions.

Practical next step: prototype one endpoint in your Track E repo with FastAPI's `StreamingResponse(media_type="text/event-stream")` and stream tokens from a sample LLM call, then confirm the behavior through an HTTP-only client like `curl` or a server log tail.
