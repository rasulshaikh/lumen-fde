# Lumen Ask

Date: 2026-09-10T07:58:01.607Z

## Question

Explain Performance and troubleshooting on a single box with a practical example and a 20-minute exercise.

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

# Performance and troubleshooting on a single box

## The idea in plain English

Performance work on one machine is the job of answering one question fast: which resource is full, and what is making it full. The standard method is called USE, which stands for Utilization, Saturation, Errors. For every resource on the box (each CPU, the RAM, each disk, each network card) you check three things in this order: how busy it is, how much work is queuing behind it, and how many errors it produced. Errors are checked first because they are cheap to read and often decisive. Utilization alone is a liar because 50% averaged over a second can be 100% for 500 ms, and that is exactly the burst that hurts users. Saturation is the honest signal: the queue length, the wait time, or the fraction of the interval something was stalled.

A saturated box also tells you about itself in ways the average hides. A single core can be pinned at 100% by a GIL-bound Python worker or a single NIC RX queue while fifteen cores idle, so the summary CPU line says 7% busy. Kubernetes CPU limits can throttle a worker every 100 ms even though the node looks 70% idle. A rotated log can be deleted while a service still holds the file descriptor, so the filesystem shows 100% used but the directory shows 40%. You find these by sampling fast (every 1 s), reading the right column in the right tool, and being willing to look at a single core, a single device, and a single inode table instead of trusting the headline number.

Jargon to keep straight:
- Utilization: the fraction of a time interval the resource was busy. A 0 to 1 number, or a percent.
- Saturation: the degree to which there is more work than the resource can handle. A queue length, a wait time, or a pressure-stall percentage.
- Errors: a count of error events. Hard to fake and often the answer by itself.
- r and b in vmstat: r is the number of runnable processes (compare to the CPU count). b is the number blocked in uninterruptible sleep, almost always waiting on disk, NFS or a lock.
- si and so: swap in and swap out in KB/s. Any sustained non-zero value is memory pressure, not normal.
- iostat await and aqu-sz: await is the average milliseconds each I/O took. aqu-sz is the average queue depth. Either one being high means the disk is the bottleneck.
- PSI (Pressure Stall Information): the kernel's "/proc/pressure/" files. "some avg10" is the percent of the last 10 seconds in which at least one task was stalled. "full avg10" is when every non-idle task was stalled.

## Concrete technical example

Picture a customer FastAPI service on a 4-vCPU VM. The complaint: "the model is slow, p99 tripled after launch." You log in. You run the 60-second checklist.

`uptime` shows load average 40, 38, 30 on a 4-core box, rising.
`dmesg -T | tail` shows repeated lines like `cgroup: pod/cpu-cfs_throttled` and `CPU throttled`.
`vmstat 1` shows `r` (runnable) sitting at 16 and `us` at 60%, but `id` is 30% so the cores are not truly maxed.
`mpstat -P ALL 1` shows every core at ~95%, but the cgroup view (`/sys/fs/cgroup/cpu.stat` of the pod, or `cat /sys/fs/cgroup/kubepods/.../cpu.stat | grep throttled`) shows `nr_throttled_periods 42871` and `throttled_usec 1.8e+09`.

Diagnosis in one sentence you can repeat to the customer's CTO: the worker is CFS-throttled, not CPU-starved. The Kubernetes limit is `500m` (half a core), and every 100 ms accounting period the CFS scheduler is stealing time back because the worker tries to use more than its share. The fix is not "give it more CPU" first. The fix is remove the limit or raise it, set the request equal to a sensible steady-state, and re-test. Raising the limit is half the fix because if the request stays at 500m, Kubernetes can pack more pods onto the node and the same throttle returns under the same burst.

This is the production failure mode #3 from the plan: a 500m CPU limit, a traffic bump, p99 10x worse, the node dashboard says 70% idle, the customer blames the model. The evidence line is the `cpu.stat` throttled counters, not the node CPU chart.

## How this connects to production systems and FDE interviews

In production you will live inside three patterns:

1. The deleted-but-open log. `df -h` says 100%. `du -sh /var/log/` says 40%. Writes return `ENOSPC`. `lsof +L1` (files with link count zero, i.e. deleted but still open) finds the rotated journal the service is still appending to. Restarting the service frees the space without losing data.
2. Inode exhaustion. `df -h` says 30% used. Writes fail with "No space left on device". `df -i` shows 100% inodes used because a cache directory holds millions of tiny session files. Fix by deleting or rotating, not by resizing the disk.
3. CFS throttling under a limit. The example above. Evidence lives in the pod's `cpu.stat`, not in node-level dashboards.

In an FDE interview, the question that maps to this topic is "load average is 60 on an 8-vCPU host, CPU is 10% busy, iostat %util is 5%, walk me through your first three minutes." The expected answer is the USE order, the 60-second checklist, and the specific moves: check `r` against `nproc`, check D-state processes with `ps -eo pid,stat,wchan:32,comm`, read `/proc/pressure/`, and only then reach for `strace`, `perf`, or `py-spy` because each one has a cost and a blast radius you have to name before you use it.

## 20-minute exercise: the 60-second checklist, blind

Setup (one time, before you start the clock):
On your Hetzner VPS or local VM, install the tools: `sudo apt install sysstat strace linux-tools-generic bcc-tools` and `pip install py-spy`. Make sure `stress-ng` is available (`sudo apt install stress-ng`). Have your own uvicorn or gunicorn Python service running on a known port.

The exercise (20 minutes total):

Minutes 0 to 2: read the brief. You will run three blind diagnoses. A friend (or your future self on a timer) picks three of these failures and starts exactly one without telling you which:

- A. Fill the disk through a deleted-but-open log. Run `truncate -s 0 /var/log/syslog` while a long-running `tail -f` holds the fd, then `rm /var/log/syslog`, then write 5 GB to a file in the same filesystem until `df -h` reads above 95%.
- B. Pin one core with `stress-ng --cpu 1 --timeout 600` while your Python service runs on the same box.
- C. Throttle the worker. Create a systemd drop-in for your service with `CPUQuota=20%`, `systemctl daemon-reload`, `systemctl restart your.service`. The drop-in only sets a quota; the worker still tries to use more.

Minutes 2 to 17: for each of the three rounds, start the failure and the clock at the same moment, then run the checklist cold. Type the commands from memory. For each one, say out loud which field you read first and what threshold means "saturated":

```
uptime                          # load avg, rising or falling
dmesg -T | tail                 # OOM, I/O errors, throttled, conntrack full
vmstat 1                        # r vs nproc, si/so, us sy id wa st
mpstat -P ALL 1                 # single hot core
pidstat 1                       # which PID, %usr vs %system
iostat -xz 1                    # await, aqu-sz, %util (with the SSD caveat)
free -m                         # MemAvailable, not just "free"
sar -n DEV 1                    # rxkB/s vs link speed
sar -n TCP,ETCP 1               # active, passive, retrans
top                             # confirm what you already know
```

For each round, stop the moment you have the evidence line and write it down. A is in `dmesg` and `lsof +L1`. B is in `mpstat -P ALL` (one core at 100%) and `pidstat 1` (stress-ng at 100% user). C is in the pod or service's `cpu.stat` (`nr_throttled_periods`, `throttled_usec`) or, for a systemd unit, in `/sys/fs/cgroup/.../cpu.stat` for the slice.

Minutes 17 to 20: write a one-page triage card in markdown. Ten commands, one field each, the threshold that means saturated, the follow-up tool (strace, perf, py-spy, bcc). Format it so a customer engineer with no Linux performance background can follow it on a call with you. Check it into your runbooks folder.

What "done" looks like:
You diagnosed each of the three failures inside two minutes using only the checklist. You named the saturated resource in one sentence per failure. You never reached for a follow-up tool before the checklist gave you the evidence line. You can defend why `iostat %util` was not enough on the disk round and why the node CPU chart was not enough on the throttle round.

What you will probably get wrong the first time:
You will read `top`'s summary line and trust it instead of `mpstat -P ALL` on the pin-one-core round. You will look at `df -h` on the disk round and trust it instead of `lsof +L1`. You will look at node CPU on the throttle round instead of the cgroup's `cpu.stat`. Each of those is the lesson.

## Practical next step

Block 20 minutes tonight. Pick the failure you find easiest (the throttled worker is the most reproducible). Start it, run the ten commands from memory, write down the evidence line, and stop. Then read Brendan Gregg's Linux Performance page, specifically the USE method section and the cpu, memory, disk, network pages, to compare your evidence line against his. The gap between what you noticed and what he lists is the gap you close in the next session. If you want a longer companion, the resources row for this topic points at the same page plus the SadServers medium and hard scenarios, which are graded failures you can run blind the same way.

Sources to read next, named not quoted:
- Brendan Gregg, Linux Performance page and USE method (the canonical checklist).
- Brendan Gregg, "Linux Performance Tools" talk (the diagram of which tool answers which question).
- SadServers medium and hard scenarios (graded blind-diagnosis practice).
- High Performance Browser Networking chapters 1 to 4 and 12 to 13, for the network half of USE if you want to go deeper than the 20-minute exercise covers.

The market signal behind this topic is indirect: nothing in the current FDE corpus asks for "USE method" or "iostat" by name, but row 27 ("Supporting a deployment you cannot log into") and rows 70 and 79 (Kubernetes security games, releasing to a fleet) all assume you can do this on a customer box at 2 a.m. without a dashboard. The skill is what makes the rest of the runbook track credible.
