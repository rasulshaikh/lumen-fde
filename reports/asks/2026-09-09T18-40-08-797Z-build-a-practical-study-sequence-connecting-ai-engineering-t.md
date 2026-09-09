# Lumen Ask

Date: 2026-09-09T18:40:08.797Z

## Question

Build a practical study sequence connecting AI Engineering to my Senior FDE plan.

## Plan context

Library - the 16 indexed books and 2 build references that make up your study context, which is the same context given to me, plus the 16 external roadmaps used as scaffolding around the plan.

## Answer

## Practical sequence: AI Engineering to Senior FDE

This sequence connects the AI Engineering track to the later FDE, production, interview, and customer-delivery work.

The goal is not only to learn how an AI system works. You should also learn how to:

- Put it inside a customer’s system.
- Prove that it works.
- Measure its business value.
- Control its cost and risk.
- Explain it to technical and executive audiences.
- Hand it to a customer without depending on you forever.

The measured market supports this order. Python is the top listed skill, evals are the third, prototype-to-production is fourth, and agents are sixth. Agent engineering is also the segment with 3 of its 42 roles currently reachable from Pune.

No shipped artifacts or study sessions are recorded yet. Recall is not waiting.

---

## 1. Build the base in month 7

### Start with row 28: Production Python architecture

Learn how to turn Python code into a service that a team can operate.

Focus on:

- Domain models: Objects that represent the important business rules.  
  Example: a `Customer` and `Ticket` should contain real rules, not only stored values.

- Repositories: A layer that stores and retrieves objects.  
  This keeps database code out of business logic.

- Dependency injection: Giving an object the tools it needs from outside.  
  Example: pass a database client into a service instead of creating it inside every method.

- Packaging: Putting the service and its version information into an installable format.

Production connection: an FDE integration may begin as a notebook and become a customer API, worker, or package. Packaging is the step that makes the result maintainable.

Interview connection: expect a Python design question about testability, configuration, ownership, and failure behavior.

Supporting sources: `AI Engineering`, `Applied Machine Learning and AI for Engineers`, `Hands-On Machine Learning with Scikit-Learn and PyTorch`, and `AI Engineering from Scratch`.

### Then complete row 29: FastAPI in production

Build a small AI service with:

- Typed settings.
- A health endpoint.
- Background work.
- Proper startup and shutdown.
- Structured error responses.
- A versioned API.

Technical example:

```text
POST /v1/support/search
request:  tenant_id, question, user_role
response: answer, source_ids, latency_ms, model_version
```

This is close to a real customer integration.

---

## 2. Learn the model’s operating model

### Row 50: LLM fundamentals

Learn these before building complex agents:

- Token: A small piece of text processed by the model.
- Context window: The tokens the model can use at one time.
- Attention: The mechanism that decides which tokens matter to one another.
- Pretraining: Learning general patterns from a large dataset.
- RLHF: Human feedback used to shape model behavior.
- Scaling: How model size, data, and compute affect capability and cost.
- Hallucination: A plausible answer that is not supported by the facts.

Concrete example: a 2,000-token support answer is not automatically better. It may cost more, increase latency, and include unnecessary explanation.

Production connection: model limits affect context design, latency, and architecture.

Interview connection: explain why a larger model is not always the right production choice.

### Row 51: Prompt engineering as code

Treat prompts and model settings like source code.

A prompt package should include:

```text
system_prompt.txt
retrieval_policy.json
tool_schema.json
expected_outputs.json
regression_cases.json
version
model
temperature
```

Example: a support agent should output structured JSON with `answer`, `sources`, and `confidence`. Do not accept free text that a parser must guess how to interpret.

Production connection: prompt changes need the same care as code changes.

Interview connection: show how you would test a prompt change against known examples before release.

---

## 3. Add retrieval and controlled tool use

### Row 54: RAG at depth

RAG means retrieval-augmented generation. It lets a model use selected external information while producing an answer.

Learn this pipeline:

```text
question
→ rewrite the question
→ search for candidate passages
→ filter by tenant and permission
→ rerank the best passages
→ place them into the model context
→ generate an answer
→ attach source references
```

Important terms:

- Chunking: Splitting documents into useful pieces.
- Embedding: A numerical representation used to find similar content.
- Hybrid retrieval: Combining semantic search with keyword search.
- Reranking: Rechecking the strongest candidates with another scoring method.
- Contextual retrieval: Adding document or section context to each chunk.

Technical example: retrieve 30 passages, rerank them, and send only the top 5 to the model. This can improve evidence quality while controlling token cost.

Production connection: RAG is often an FDE’s fastest path to a useful customer-specific AI application.

Interview connection: explain retrieval quality, latency, permissions, and failure behavior as one system.

### Row 52: Tool use, structured outputs, and MCP servers

A tool is an operation the model may request, but not perform without safeguards.

Example:

```json
{
  "tool": "create_ticket",
  "arguments": {
    "customer_id": "C123",
    "title": "Refund not received",
    "priority": "high"
  }
}
```

The application must:

1. Validate the request.
2. Check the user’s permission.
3. Enforce business rules.
4. Execute the operation.
5. Record what happened.

MCP means Model Context Protocol. It gives AI applications a common way to discover and use tools or context.

Production connection: customer work often fails at the boundary between a plausible model request and a safe business action.

Interview connection: demonstrate that the model proposes actions, while application policy decides whether they are allowed.

---

## 4. Build agents only after workflows are reliable

### Row 53: Agents

An agent chooses its next actions toward a goal.

A workflow follows a path chosen by the developer.

```text
Workflow:
classify request → retrieve policy → draft answer

Agent:
inspect request → choose a tool → inspect result → choose next step → stop
```

Learn:

- When a workflow is enough.
- When an agent is useful.
- Planning and tool loops.
- Short-term and long-term memory.
- Multi-agent design.
- Human approval gates.
- Stop conditions and retry limits.
- Budgets for steps, tokens, time, and money.

Concrete example: an agent may be allowed three tool calls to investigate a failed payment. After that, it must ask a human for help.

Production connection: an FDE must explain where autonomy helps and where it creates unacceptable risk.

Interview connection: draw the state machine, not just the agent diagram. Include failure paths and approval points.

### Row 58: Permission-aware retrieval

A RAG system must respect the same access rules as the main application.

Bad design:

```text
User asks a question
→ retrieve from every customer document
→ generate an answer
```

Better design:

```text
User asks a question
→ identify allowed document groups
→ filter candidates by permission
→ retrieve only authorized passages
→ generate an answer
```

Technical example: a user may search public manuals, but a finance document must require the `finance-read` permission.

Production connection: leaking one tenant’s data can become a serious security and trust event.

Interview connection: treat authorization as part of the retrieval architecture, not an extra filter added at the end.

---

## 5.
