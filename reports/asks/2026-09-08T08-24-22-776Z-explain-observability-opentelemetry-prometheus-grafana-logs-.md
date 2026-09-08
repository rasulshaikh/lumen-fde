# Lumen Ask

Date: 2026-09-08T08:24:22.776Z

## Question

Explain Observability: OpenTelemetry, Prometheus, Grafana, logs, traces, metrics with a practical example and a 20-minute exercise.

## Plan context

A. Linux, Networking, Shell | Shell mastery and scripting | Write a 200-line bash tool with set -euo pipefail, traps, getopts, logging and tests, without looking anything up | resources: The Linux Command Line (William Shotts), MIT The Missing Semester (lectures 1-5, 7), OverTheWire Bandit (levels 0-33)
A. Linux, Networking, Shell | Linux internals: processes, systemd, permissions, filesystems, packaging | Explain what happens from boot to a systemd service serving traffic; diagnose a stuck process from /proc | resources: Linux Journey (all of Grasshopper and Journeyman), freeCodeCamp.org: Linux Server Course - System Configuration and Operation, SadServers (scenarios, easy to medium)
A. Linux, Networking, Shell | Networking: TCP/IP, DNS, TLS, HTTP/2, load balancers, firewalls | Trace a request from DNS to TLS handshake to response and name every hop; debug a failed webhook with tcpdump | resources: High Performance Browser Networking (ch 1-4, 12-13), Hussein Nasser: Network Engineering, Protohackers (network programming challenges)
A. Linux, Networking, Shell | Performance and troubleshooting on a single box | Use the USE method; read top, vmstat, iostat, strace and perf output and say what is wrong | resources: Brendan Gregg: Linux Performance page and USE method, Brendan Gregg: Linux Performance Tools (talk), SadServers (hard scenarios)
A. Linux, Networking, Shell | Git at depth: rebase, bisect, reflog, hooks, monorepo hygiene | Recover a lost commit, bisect a regression, rewrite history safely | resources: Pro Git (ch 1-3, 7), Missing Semester: Version Control (git) lecture, Learn Git Branching (all levels)
B. Containers and Kubernetes | Docker internals: namespaces, cgroups, layers, networking | Explain a container without the word 'lightweight VM'; draw the layer cache; debug a bridge network issue | resources: Docker docs: Get started and Engine concepts, TechWorld with Nana: Docker Tutorial for Beginners [FULL COURSE in 3 Hours], Play with Docker
B. Containers and Kubernetes | Production images and supply chain: multi-stage, non-root, SBOM, scanning, signing | Ship an image under 200 MB, non-root, zero HIGH CVEs, with an SBOM | resources: Docker: Building best practices, Civo: Mastering Container and Image Security with Bret Fisher@BretFisher, Trivy (scan, SBOM) on your own images
B. Containers and Kubernetes | Kubernetes core: Pod, Deployment, Service, Ingress, ConfigMap, Secret, namespaces | Draw the object model from memory; explain how a request reaches a Pod through Ingress and Service | resources: Kubernetes docs: Concepts, TechWorld with Nana: Kubernetes Tutorial for Beginners [FULL COURSE in 4 Hours], Killercoda Kubernetes scenarios

## Answer

Observability, in plain English, is the ability to answer "what is the system doing right now, and why" from the outside, without adding new code.

The three signals are metrics, traces, and logs. Each answers one question.

Metrics are pre-aggregated numbers with a small, bounded set of labels. They answer, "is something wrong, and by how much." Think of a counter that ticks every time the classifier is called, or a histogram that records how long each call took.

Traces are per-request trees showing the path a single request took through your services. They answer, "where in this request did the time or the error go." A span is one unit of work in that tree.

Logs are arbitrary events with free-form context. They answer, "what exactly happened here." A log line can hold the full HubSpot response body or the webhook payload id.

The most important rule is cardinality. A Prometheus time series costs memory for every unique label set. Putting `hubspot_contact_id` or `tenant_email` as a metric label explodes your memory bill. Those values belong on spans and logs, where they cost little.

Practical example for the DefenderMate webhook path:

1. A HubSpot webhook hits FastAPI. You open a SERVER span called `POST /webhooks/hubspot`. The span gets a trace_id (16 bytes) and span_id (8 bytes), and you read the incoming `traceparent` header, or start a new root if there is none.

2. The handler enqueues the lead. You open a PRODUCER span called `enqueue.lead`, link it to a CONSUMER span on the worker, and carry the trace context through the queue payload.

3. The worker calls the classifier. You open a CLIENT span called `classify_lead`. Inside, an INTERNAL span holds the model call. You record latency as a histogram, classification outcome as a counter label, and any exception as a span event with `exception.type`, `exception.message`, `exception.stacktrace`.

4. The worker writes to HubSpot. You open another CLIENT span, set its status to ERROR on a 4xx/5xx, and log the response body.

5. Three signals describe the same flow:

   - Metrics: `webhook_requests_total{source="hubspot",status_class="2xx"}`, `classifier_duration_seconds` histogram, `hubspot_writes_total{outcome="ok"}`.
   - Traces: one tree per webhook, branches at classify and HubSpot, trace_id propagates through the queue.
   - Logs: one structured JSON line per state change, holding `webhook_id`, `trace_id`, `span_id`, `hubspot_body`.

In production, exporters ship spans to an OpenTelemetry Collector over OTLP gRPC on port 4317, the Collector fans them out to Tempo or Jaeger, and Grafana joins everything by trace_id. Prometheus scrapes the `/metrics` endpoint that the OTel SDK exposes. Grafana dashboards bind a latency panel to a trace exemplar, so clicking a spike opens the slowest trace, then the matching log line.

FDE interview framing:

A hiring manager asks, "A customer's classifier went from 300ms to 4 seconds last Tuesday, then recovered. What did you do?" The FDE who talks cardinality, sampling, trace propagation through a queue, and reading a histogram's bucket shift has the answer. The one who asks to redeploy logs has already lost the room. Tie this back to the SLOs from topic 21, because the metrics you add here are how those SLOs become real.

One concrete gotcha to remember: a load balancer or WAF that strips unknown headers will silently break `traceparent` propagation. Always dump a raw request and confirm the header arrived before blaming the SDK.

20-minute exercise:

Goal: stand up metrics, one trace, and one log line for the DefenderMate webhook.

1. Minutes 0 to 3. Install the SDK.
   `pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-grpc prometheus-client`.

2. Minutes 3 to 7. Wire the providers.
   Create one `TracerProvider` with a `Resource` carrying `service.name=defendermate-api`, `service.version=0.1.0`, `deployment.environment=local`. Attach a `BatchSpanProcessor` with an `OTLPSpanExporter` pointing at `http://localhost:4317` and `insecure=True`. Call `trace.set_tracer_provider(provider)`. Start a Prometheus meter provider on port 9464.

3. Minutes 7 to 11. Instrument the webhook handler.
   Get a tracer with `trace.get_tracer("defendermate.webhook")`. Open a SERVER span named `POST /webhooks/hubspot`. Add a counter `webhook_requests_total` and a histogram `classifier_duration_seconds`. Wrap the classifier call in a `with tracer.start_as_current_span("classify_lead"):` block and observe the duration into the histogram on exit.

4. Minutes 11 to 15. Test it.
   `docker compose up otel-collector prometheus grafana`. Start the API, send one curl webhook. Check `curl localhost:9464/metrics` for `webhook_requests_total 1`. If you wired Tempo or a logging exporter, confirm the span and log arrive.

5. Minutes 15 to 20. Write the rule.
   In a notebook, write down three things: the exact metric name and label set, the span name template (`POST /webhooks/{source}`, low cardinality), and the trace context propagation path through the queue. That one page is the design artifact you will hand to the customer's SRE.

Next step: take the metric and the trace you just produced and bind them in Grafana. Click the latency spike, jump to the slowest trace, then to the log line. That one click path is what you will defend in an LLM system design mock on this topic.
