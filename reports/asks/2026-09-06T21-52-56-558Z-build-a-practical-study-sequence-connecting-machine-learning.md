# Lumen Ask

Date: 2026-09-06T21:52:56.558Z

## Question

Build a practical study sequence connecting Machine Learning for Absolute Beginners to my Senior FDE plan.

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

Your indexed learning map has 16 sources. None of them are listed in the senior FDE plan. The plan covers Linux, networking, shell, containers, and Kubernetes. Machine Learning for Absolute Beginners is a book you have indexed, not a planned resource. There is no ML topic in the visible plan blocks A and B.

I cannot invent a connection that the plan does not show. The honest answer is that your current senior FDE plan has no ML content. The book sits outside the plan.

Here are three real options.

Option 1. Add an ML block to the plan. Decide where ML fits in your FDE work. If you build AI features for customers, ML is core. Add a block like C. Machine Learning foundations. Put Machine Learning for Absolute Beginners at the top, since it is the gentlest source. Follow it with Mathematics for Machine Learning for the math, then Hands-On Machine Learning with Scikit-Learn and PyTorch for the implementation.

Option 2. Keep the plan pure and shelve the book. Stay focused on Linux, containers, and Kubernetes. ML is a separate path. Come back to the book when you start an ML block.

Option 3. Use the book as a warm-up, not a study target. Read it for vocabulary and intuition. Then return to the FDE plan. This is the lightest touch.

A practical next step. Look at your real work for the next 90 days. Are you shipping AI features or platform features. If AI, draft block C with Machine Learning for Absolute Beginners as the first source. If platform, close this tab and finish block A. Pick based on your job, not on what looks interesting.
