# Lumen Ask

Date: 2026-09-12T08:02:11.229Z

## Question

Explain Training deep networks: optimisers, batch norm, schedules, mixed precision, debugging a bad loss curve with a practical example and a 20-minute exercise.

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

# Training deep networks, with a worked example

## What the topic actually is

Training a neural network is the loop: look at a batch, compute a loss, push the loss backwards through the network to get a number for every weight, then nudge every weight using that number. The word "deep" just means the network has many layers, so the chain of derivatives is long. The whole topic is about what can go wrong inside that loop and how to recognise the failure from numbers, not vibes.

In plain terms: the network is a function with millions of knobs. Training is the process of turning the knobs so the function's answers match the answers you want. An optimiser is the rule for how far to turn each knob on each step. A schedule is the rule for how that turning slows down over time. Batch normalisation is a small re-centring that keeps the numbers flowing through the layers from drifting. Mixed precision is doing the arithmetic in a faster but less exact number format. Debugging the loss curve is reading a plot of "how wrong is the model" against time and naming the cause.

## The five knobs that decide whether training works

1. Optimiser: SGD with momentum, Adam, AdamW. The rule that turns the knobs.
2. Learning rate: how big each turn is. The single most important number.
3. Schedule: how the learning rate shrinks over time. Often warmup then cosine.
4. Batch normalisation: a re-centring inside the network that lets you use larger learning rates.
5. Precision: fp32 (safe, slow), fp16 (fast, can overflow), bf16 (fast, wide range, slightly less exact).

Get any of these wrong and the loss curve tells you a story you have to be able to read.

## Concrete technical example: Adam on a quadratic

A quadratic is the simplest curved surface. The Hessian (a matrix of second derivatives) is 2 everywhere, so the maximum eigenvalue lambda_max = 2. The bound for gradient descent to converge is eta < 2 / lambda_max, so eta must be below 1.0. The optimal step size is 1 / lambda_max = 0.5. The convergence rate depends on the condition number, which is 1 here (perfectly round bowl), so gradient descent reaches the minimum in one step at the optimum.

If you run Adam with eta = 2.0 on this quadratic, the parameter oscillates and grows: the stability bound is violated by a factor of 4. If you set eta = 0.5, the parameter lands on the minimum in two or three steps. This is the simplest version of the production failure where a customer's run "looks like it is training but the loss never drops" - the learning rate is above the stability bound, and the fix is to lower it, not to add more layers.

To connect this to production: in a 7B-parameter transformer the Hessian is not a scalar and lambda_max is not directly observable, so you estimate the safe learning rate with an LR range test (run the model for a few hundred steps with a linearly increasing learning rate, pick the steepest loss-drop point, divide by 3 or 4). The mechanism is the same; the arithmetic is just hidden inside the network.

## How this connects to FDE work

When a customer's model stops improving, the room turns to you. The difference between a senior AI/FDE and a framework user is whether you can look at a loss curve plus a grad-norm log and name the cause in one sentence: "that is BatchNorm still in train mode at eval" or "that is a learning rate above the 2/lambda_max stability bound." Every knob in this topic is a small piece of arithmetic you can derive on a whiteboard, and deriving it is what lets you defend a fix on the spot instead of promising a week of sweeps.

In interview loops, the system-design mocks for LLM serving (row 48 in your plan) and the take-home rehearsals (row 83) both probe this: "your fine-tune diverged, walk me through your triage." The answer that lands is "LR range test, check BatchNorm mode, check scheduler step ordering, check scaler state on resume" - four checks, in that order, each one a specific number to read.

## Which of your indexed books helps

Row 116, "Transformers from scratch: attention maths, positional encoding, build a small GPT," is the companion topic and the right next read; it builds the network that this row trains. Inside the library:

- Hands-On Machine Learning with Scikit-Learn and PyTorch, by Géron. Look at Chapter 11, "Training Deep Neural Networks." It covers the optimiser zoo (SGD, momentum, Nesterov, Adam), the learning rate schedule, BatchNorm's train-versus-eval asymmetry, and a practical note on mixed precision. This is the implementation-level reference.
- Deep Learning, by Goodfellow, Bengio and Courville. Look at Chapter 8, "Optimization for Training Deep Models." It covers SGD, momentum, adaptive methods and the convergence conditions in more mathematical depth.
- AI Engineering, by Chip Huyen. Look at Chapter 7, on adapting a model to an application. It covers when fine-tuning (the topic that uses this material) is worth its cost and how to evaluate the result.
- Pattern Recognition and Machine Learning, by Christopher Bishop. Look at Chapter 5, "Neural Networks," for the backpropagation derivation that the rest of this topic assumes you have done.
- Mathematics for Machine Learning, by Deisenroth, Faisal and Ong. Look at Chapter 5, "Vector Calculus," and Chapter 7, "Continuous Optimization," for the gradient descent convergence argument.

## The 20-minute exercise

Build a from-scratch Adam update in NumPy and prove it matches PyTorch's torch.optim.Adam to within 1e-6.

Setup. Create a file adam_parity.py. Import numpy and torch.

Step 1 (3 minutes). Define a fixed-seed two-layer network: an input of dimension 4, a hidden layer of dimension 8 with ReLU, and an output of dimension 3. Use small random weights. Wrap the same network in a torch.nn.Module so you can run torch.optim.Adam against it.

Step 2 (5 minutes). Write Adam from memory as five update rules, each in two lines of NumPy. The five rules are: m = beta1 * m + (1 - beta1) * g; v = beta2 * v + (1 - beta2) * g^2; m_hat = m / (1 - beta1^t); v_hat = v / (1 - beta2^t); theta = theta - eta * m_hat / (sqrt(v_hat) + eps). State eps inside the square root, where PyTorch puts it.

Step 3 (5 minutes). Run 100 optimiser steps with learning rate 1e-3, betas (0.9, 0.999), eps 1e-8, on a fixed random target. On each step, compute your NumPy update and PyTorch's update on the same gradient, and assert max absolute difference < 1e-6. If it fails, the usual cause is beta1^t bias correction being one step ahead or behind.

Step 4 (5 minutes). Re-run with learning rate 1e-1 and watch the parameter blow up; re-run with learning rate 1e-4 and watch it crawl. Record the boundary learning rate where parameters start to oscillate, and state it as eta_collapse.

Step 5 (2 minutes). Print the final loss and the LR at which the loss was lowest. Write a one-line comment: "If eta > eta_collapse, the loss diverges because the update exceeds the 2/lambda_max stability bound."

Pass condition: the parity assertion holds for learning rate 1e-3 across betas (0.9, 0.999) and (0.5, 0.999), and you can name the eta_collapse from step 4 to one significant figure. Time budget: 20 minutes. If you finish in 12, repeat the run with AdamW (decoupled weight decay) and assert parity against torch.optim.AdamW.

## Practical next step

Open adam_parity.py in your repo and run step 1 to step 3 tonight. Twenty minutes from now you will have a from-scratch Adam that you can defend on a whiteboard and a PyTorch parity test that proves it. Tomorrow, add the LR range test from Part 8 of this topic (200 steps, eta from 1e-6 to 1e-0 on a logarithmic schedule, pick the steepest drop) and save the plot. That pair, the parity test and the range-test plot, is the smallest credible evidence you can show a customer's ML team when their fine-tune is diverging.

One thing this answer does not cover: the full BF16-versus-FP16 numerics from Part 13, and the checkpoint-resume state machine from Part 18. Say the word and I will do those next, same format.
