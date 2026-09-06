# Lumen Ask

Date: 2026-09-06T16:39:04.805Z

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

What "current topic" means here

The plan has many topics under track A (Linux, Networking, Shell). There is no single "current" topic marked. I will pick the highest-leverage topic for a senior Forward Deployed Engineer interview: networking from DNS to TLS to HTTP, and debugging a failed webhook with tcpdump. FDEs debug customer webhooks almost every week, and this question tests it directly.

If you wanted a different topic from the plan (for example, Docker internals or systemd boot), tell me which one and I will switch.

---

What the interviewer is actually testing

They want to know if you can picture a request moving through the network as a chain of named hops, and if you can prove it with packet evidence. Saying "DNS resolves, then HTTPS, then the server responds" is not enough. They want the names of the records, the socket states, the handshake steps, and how you confirm each step on a real box.

---

The hops, in order, with the exact names

1. DNS resolve. The client asks the system resolver (a C library, often glibc or musl) which reads `/etc/resolv.conf`. The resolver sends a UDP query to port 53 of the nameserver. The query is recursive for stub resolvers. The wire format is defined by RFC 1035.
2. DNS answer. The nameserver returns an A record (IPv4) or AAAA record (IPv6). If the answer is a CNAME chain, the resolver follows it. TTL controls caching.
3. TCP three-way handshake. The client opens a socket to the returned IP on port 443. SYN, SYN-ACK, ACK. The kernel tracks this socket in the TIME_WAIT and ESTABLISHED states.
4. TLS handshake. The client sends ClientHello with the SNI (Server Name Indication) extension, so the server knows which cert to use. The server replies with ServerHello, its certificate chain, and (for TLS 1.3) an encrypted extension block. Key exchange happens with X25519 or similar. Finished messages confirm the handshake.
5. HTTP request. Inside the encrypted TLS record, the client sends `GET /webhook HTTP/1.1` (or HTTP/2 frames, which speak HPACK and binary frames over the same TLS tunnel).
6. Server response. The server returns status, headers, and body. The TLS session keys may be written to an `SSLKEYLOGFILE` so you can decrypt the capture later.

Total hops from your laptop to the webhook: DNS resolver, authoritative DNS, your default gateway, the ISP, often a CDN edge, the load balancer, the backend pod. Each one can break the call.

---

Concrete technical example: debugging a failed webhook with tcpdump

Imagine the customer's webhook URL is `https://api.example.com/hook` and the call hangs forever.

Step 1. Capture with the right flags.

```
tcpdump -i any -s 0 -w /tmp/webhook.pcap \
  host 203.0.113.42 and port 443
```

The `-s 0` flag captures full packets, not just headers. `-w` writes to a file so you open it in Wireshark later. If you do not know the server IP yet, filter by the customer subdomain.

Step 2. Run the call in another shell and wait.

If the request never returns, open the capture. Look for SYN with no SYN-ACK: the server never accepted the connection. That means a firewall, an NACL, or a security group is dropping traffic. Look for SYN-ACK followed by RST: the server reached a port that nothing listens on. Look for TLS alerts: in Wireshark, filter `tls.alert_message`. Alert 40 means the hostname in the SNI did not match the certificate. Alert 112 means the cert is untrusted.

Step 3. Decrypt with the SSLKEYLOGFILE trick.

Export the variable on the client:

```
export SSLKEYLOGFILE=/tmp/keys.log
```

Replay the call. Wireshark reads that file and decrypts the TLS stream. Now you can see the exact HTTP request and response, including status 401 or 502 that the application layer returned.

---

How this connects to production systems and FDE interviews

In production, every customer integration is a webhook: Stripe billing events, Salesforce lead sync, Datadog alerts. When the customer's HTTPS POST never lands, you need the same chain to reason about it. Was the DNS stale because of a low TTL during a migration. Did the SNI mismatch because the customer hard-coded a hostname that the new ingress does not present. Did the load balancer's health check pass but the target's TLS cert expire. The candidate who can name each hop and back it with a packet capture becomes the engineer the customer trusts.

In the interview, the answer format is: state the hops, draw them, then say how you prove each one. `dig` for DNS. `ss -tnp` for sockets. `tcpdump` and Wireshark for the wire. `openssl s_client` for the cert chain. Naming these tools up front signals that you debug for real, not from memory.

---

One practical next step

Spin up a small box and run:

```
tcpdump -i any -w out.pcap port 443 & curl -v https://example.com > /dev/null
```

Open `out.pcap` in Wireshark, right-click a TCP stream, choose Follow, and read the DNS query, TLS ServerHello, and HTTP request. If the SSLKEYLOGFILE is set, you can read the encrypted body too. Thirty minutes of this builds the mental model an interview expects.
