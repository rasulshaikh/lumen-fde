# Lumen Ask

Date: 2026-09-06T21:50:32.034Z

## Question

Explain the current topic like I am preparing for a senior FDE interview.

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

Topic: Kubernetes core objects (Pod, Deployment, Service, Ingress, ConfigMap, Secret, namespaces). Below is a senior FDE interview answer in simple language with exact technical meaning, one concrete example, production links, and a next step.

Plain language goal: a Kubernetes cluster is a factory that runs your code for you. The objects below are the forms you fill out to tell the factory what to run, how many copies, how to reach them, and how to keep secrets.

Jargon and exact meaning:

Pod. A Pod is the smallest thing the cluster can run. It is one or more containers that share a network name and storage. A Pod is meant to be short lived. If it dies, the cluster throws it away and makes a new one. Production link: in a Kubernetes cluster, each Pod gets its own IP, so containers inside the same Pod can talk over localhost.

Deployment. A Deployment is the controller that owns a set of Pods. You tell it how many copies you want and what container image to run. It watches the cluster and replaces any Pod that disappears. It also lets you roll out a new image a few Pods at a time. This is the heart of self healing.

Service. A Service gives a stable address to a group of Pods that come and go. It uses label selectors to pick which Pods receive traffic. The Service has a cluster IP that never changes, even when the Pods behind it are replaced. Production link: when a Pod restarts and gets a new IP, the Service still routes to the new Pod.

Ingress. An Ingress is a rule book that sends outside HTTP and HTTPS traffic to the right Services inside the cluster. It usually runs an edge proxy like NGINX or a cloud load balancer. It handles host names, paths, and TLS termination.

ConfigMap. A ConfigMap is a key value bag for settings that are not secret. Things like feature flags, log levels, or a list of cities. Pods load it as environment variables or files.

Secret. A Secret is like a ConfigMap but for sensitive data, like database passwords or API tokens. By default it is only base64 encoded, not encrypted, so production clusters must enable encryption at rest. In real systems FDEs mount Secrets as files and never print them.

Namespace. A Namespace is a folder inside one cluster. It is a boundary for names and for resource quotas. Common layout: dev, staging, prod, plus team or product namespaces.

Concrete technical example. Imagine a customer wants a small API that returns the weather for a city. You build a container image called weather-api:v3 and push it to a registry. You write a Deployment that says run 3 copies of weather-api:v3. You write a Service called weather-svc that targets Pods with label app=weather-api. You write an Ingress rule that maps https://weather.example.com/ to weather-svc. You put the OpenWeather API key in a Secret called weather-key and mount it as /etc/secrets/key. All of this lives in the namespace prod. When a user hits https://weather.example.com/london, traffic flows: user to DNS, to the cloud load balancer, to the Ingress controller, to weather-svc, to one of the three Pods, into the container, which reads the Secret and calls the upstream weather API.

Production and FDE interview framing. Interviewers want to see that you can sketch this whole chain from memory. They will ask follow ups like: what happens when a Pod dies, how does a rolling update avoid downtime, why is the Service IP stable, where does TLS terminate, how do you swap a Secret without restarting, and how do you set resource requests and limits to stop one noisy Pod from starving the node. Strong answers mention readiness probes so traffic only goes to Pods that are warm, liveness probes so the controller restarts stuck containers, and PodDisruptionBudget so voluntary maintenance cannot take down all replicas at once.

Senior signals to add in your answer. Talk about the control loop. The Deployment controller watches the actual state and the desired state and converges. Talk about selectors and labels as the loose coupling that makes Services and Deployments work. Talk about the difference between ClusterIP, NodePort, and LoadBalancer Service types and why most prod traffic should use Ingress plus ClusterIP, not raw LoadBalancer. Mention that Secrets should be pulled from an external KMS or secrets manager in serious systems, and that etcd holds all this state, so backup and encryption of etcd is part of real production work.

Practical next step. Open a free Killercoda Kubernetes scenario, create the namespace prod, deploy a small nginx with 2 replicas using a Deployment, expose it with a ClusterIP Service, add an Ingress rule, store a fake API key in a Secret, mount it as an env var, and then delete a Pod by name and watch the Deployment replace it. This builds the muscle memory interviewers are testing for.
