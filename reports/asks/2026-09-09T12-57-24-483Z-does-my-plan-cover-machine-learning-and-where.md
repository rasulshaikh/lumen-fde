# Lumen Ask

Date: 2026-09-09T12:57:24.483Z

## Question

Does my plan cover machine learning, and where?

## Plan context

Sandbox — a hands-on terminal for practising commands against this plan.

## Answer

Yes, your plan covers machine learning, and the coverage lives across several tracks. Here is where each ML topic sits in the plan, with the row numbers you already use.

Mathematical Foundations, Track M
This is the math that makes ML click.
Row 94, Linear algebra for ML: vectors, matrices, eigendecomposition, SVD, 14h, month 2.
Row 95, Calculus and optimisation: gradients, chain rule, convexity, gradient descent variants, 13.5h, month 4.
Row 96, Probability: distributions, Bayes, conditional independence, the CLT, 11h, month 5.
Row 97, Statistical inference: estimation, confidence intervals, hypothesis testing, ANOVA, 11.5h, month 6.
Row 98, Experimentation and causality: A/B design, power, sequential testing, confounding, 11.5h, month 8.
Row 99, Information theory and loss functions: entropy, KL, cross-entropy, maximum likelihood, 12h, month 11.
Row 100, Numerical computing: NumPy vectorisation, floating point, numerical stability, 11h, month 11.

Machine Learning Systems, Track N
This is the classic ML core, the part every FDE interview touches.
Row 101, Supervised learning I: linear and logistic regression, regularisation, the bias-variance trade-off, 11.5h, month 18.
Row 102, Supervised learning II: decision trees, random forests, gradient boosting with XGBoost and LightGBM, 13.5h, month 20.
Row 103, SVM, k-NN and Naive Bayes: margins, kernels, and when each still wins, 10.5h, month 20.
Row 104, Model evaluation: cross-validation, data leakage, metric choice, calibration, 13h, month 20.
Row 105, Feature engineering, selection, and imbalanced data: SMOTE, class weights, target encoding, 11.5h, month 21.
Row 106, Hyperparameter optimisation: grid, random, Bayesian search with Optuna, 10.5h, month 21.
Row 107, Unsupervised learning: k-means, DBSCAN, hierarchical clustering, PCA, t-SNE, UMAP, 12.5h, month 21.
Row 108, Explainability: SHAP, LIME, permutation importance, partial dependence, 11.5h, month 21.
Row 109, Time series forecasting: decomposition, ARIMA, Prophet, honest backtesting, 13.5h, month 21.
Row 110, Recommenders and anomaly detection: collaborative filtering, matrix factorisation, isolation forests, 13.5h, month 22.

Deep Learning and Multimodal, Track O
This is the neural network side, ending with modern fine-tuning and multimodal work.
Row 111, Neural network foundations: backpropagation, activations, initialisation, regularisation, 13.5h, month 22.
Row 112, Training deep networks: optimisers, batch norm, schedules, mixed precision, debugging a bad loss curve, 13h, month 22.
Row 113, PyTorch at depth: tensors, autograd, Dataset and DataLoader, training loop, profiling, 13.5h, month 22.
Row 114, Computer vision: CNNs, ResNet and EfficientNet, transfer learning, augmentation, detection, 15.5h, month 22.
Row 115, Sequence models: RNNs, LSTMs, GRUs, seq2seq and the road to attention, 13.5h, month 23.
Row 116, Transformers from scratch: attention maths, positional encoding, build a small GPT, 17h, month 23.
Row 117, Fine-tuning at depth: full fine-tune vs LoRA, QLoRA and PEFT, DPO, evaluating the result, 16h, month 23.
Row 118, Multimodal learning: CLIP, vision-language models, shared embedding spaces, 13.5h, month 23.
Row 119, Graph neural networks: message passing, GCN/GAT, enterprise graph use cases, 13.5h, month 23.

AI Engineering and AI in Production, Tracks G and H
These rows apply ML inside LLM systems, which is where most FDE work now happens.
Row 50, LLM fundamentals: tokens, attention, pretraining, RLHF, scaling, limits, 15.5h, month 12.
Row 51, Prompt engineering as code: versioning, regression sets, structured outputs, 11.5h, month 12.
Row 52, Tool use, structured outputs and MCP servers, 14h, month 12.
Row 53, Agents: workflows vs agents, planning, memory, multi-agent, human-in-the-loop, 16h, month 13.
Row 54, RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching, 16h, month 13.
Row 55, Fine-tuning vs prompting: LoRA, PEFT, when not to, 14h, month 13.
Row 56, Guardrails, prompt injection, red-teaming, 12h, month 13.
Row 57, Hermes Agent in production, 13.5h, month 13.
Row 58, Permission-aware retrieval: mirroring customer ACLs into RAG and agent tools, 11.5h, month 14.
Row 59, Evals as infrastructure: eval sets, LLM-as-judge, human review, CI gates, 18h, month 14.
Row 60, LLM observability: traces, cost, latency, datasets, 11.5h, month 15.
Row 61, Model gateway, routing, fallbacks, canaries, 11h, month 15.
Row 62, Serving at scale: vLLM, quantisation, KV cache, batching, GPU maths, 15.5h, month 15.
Row 63, Drift, feedback loops, registries, rollout, 11h, month 15.
Row 64, Experiment tracking and prompt versioning as CI, 11h, month 15.
Row 65, Cost and latency engineering: prompt caching, batching, smaller models, 12h, month 15.
Row 66, Platform fluency for take-homes: Anthropic and OpenAI APIs side by side, 11h, month 16.

What is skipped
Only two rows are skipped, and neither is an ML core row. Row 43, PySpark, is for Databricks or Palantir style roles only. Row 46, MIT 6.824 Raft lab, is an optional deep dive in distributed systems. Every ML row above is active.

How the coverage stacks up in plain English
Think of ML coverage in three layers. The first layer is the math in Track M, which is the language ML is written in. The second layer is the modelling craft in Track N, the algorithms and the ways we judge them. The third layer is the deployment layer in Tracks G and H, where ML meets real users through LLMs, RAG, agents, and evals. A working FDE needs all three.

Concrete technical example
Say you join a customer call where support tickets need to be routed to the right team using their own historical labels. From Track M, row 95 gives you gradient descent and the chain rule, which is what the optimiser does under the hood. From Track N, row
