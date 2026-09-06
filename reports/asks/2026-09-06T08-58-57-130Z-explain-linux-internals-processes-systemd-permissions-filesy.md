# Lumen Ask

Date: 2026-09-06T08:58:57.130Z

## Question

Explain Linux internals: processes, systemd, permissions, filesystems, packaging with a practical example and a 20-minute exercise.

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

# Linux Internals: Processes, systemd, Permissions, Filesystems, Packaging

## The Big Idea in Plain Words

Linux is a program that runs other programs. The kernel (the core boss of the system) hands out memory, files, and network sockets. systemd (the boss of bosses for background programs) makes sure your web server is always running, restarts it if it crashes, and writes down what it did in a log called the journal. Permissions are the rules that decide who can read, write, or run each file. A filesystem is how those files are stored on a disk. Packaging is how you install software cleanly. As an FDE (Forward Deployed Engineer, meaning a developer sent to work at a customer site), you need all four because production bugs hide here: a service that crashed at 3am, a log file that was deleted but still locked, a port you cannot bind because you forgot one flag, or a permission that quietly breaks reads.

## Core Concepts, One at a Time

### 1. The Boot Chain: Power Button to Your Service

The journey from cold metal to a running web server is a chain of trust.

Step 1: Firmware. When you press power, the motherboard firmware (UEFI or BIOS, which are tiny built-in programs) wakes up and looks at the disk for a bootloader. On UEFI systems, it reads the ESP (EFI System Partition), a small FAT32 partition that holds the next stage. GRUB (a bootloader) lives there.

Step 2: GRUB. GRUB's job is simple: load the kernel and an initramfs into memory. GRUB reads a config file and shows you a menu (or skips it). It then loads two things:
- vmlinuz: the compressed Linux kernel (a tiny program that controls everything).
- initramfs: a temporary mini-filesystem in RAM that has the kernel modules (loadable pieces of the kernel) needed to find your real root disk (drivers for your disk controller, filesystem, etc.).

Step 3: Kernel command line. GRUB passes a command line string to the kernel. You can read it any time with:
```bash
cat /proc/cmdline
```
You'll see fields like:
- `root=UUID=abcd-1234`: which partition holds the real root filesystem.
- `ro`: mount it read-only first (safety measure so fsck can repair).
- `console=ttyS0`: where to print early boot messages.
- `quiet`: hide most messages.

Step 4: initramfs to switch_root. The kernel unpacks the initramfs and runs `/init` inside it. That script loads modules, finds the disk described by `root=`, runs `fsck` to check the disk, then mounts the real root filesystem. Finally it calls `switch_root`, which throws away the initramfs and makes the real root become `/`.

Step 5: PID 1. The kernel then `exec`s (replaces the current process with a new one) `/sbin/init`, which on modern systems is systemd. This becomes PID 1, which means it is the first process and the ancestor of everything else. If PID 1 ever dies, the kernel panics.

Step 6: systemd walks the target graph. systemd reads its config and figures out what to start. It pulls in `default.target`, which usually links to `multi-user.target` (multi-user, no GUI), which then pulls in your service units through dependencies.

Step 7: Your service. Eventually systemd executes your unit's `ExecStart=` command. Your web server is now running.

Practical tools to read this chain:
```bash
systemd-analyze                # total boot time
systemd-analyze blame           # which units took longest
systemd-analyze critical-chain nginx.service  # path to start nginx
journalctl -b -1 -p err         # errors from the previous boot
```

Production connection: A wrong `root=UUID=...` (say, the disk was remounted on a new VM and the UUID changed) drops you into `emergency.target` with no network and no shell you can reach. Knowing how to read `cat /proc/cmdline` from a rescue ISO (a bootable recovery disk) and fix `root=` saves a 2am outage.

### 2. systemd Units, Targets, and the Dependency Graph

Everything systemd manages is a unit. A unit is one text file that describes one thing (a service, a mount point, a timer). Unit files live in three directories, and the order matters because later ones override earlier ones:

1. `/usr/lib/systemd/system/`  -  the defaults shipped with packages. Never edit these; they get overwritten on upgrades.
2. `/etc/systemd/system/`  -  your local changes. Edit or create files here.
3. `/run/systemd/system/`  -  runtime overrides, lost on reboot.

You can also drop in a small override file using `systemctl edit`, which creates `/etc/systemd/system/foo.service.d/override.conf`. This is the safest way to tweak a packaged service.

Targets are groups of units. A target is like a tag that says "we're at this stage of boot". `multi-user.target` means "we want a multi-user system with networking but no GUI". You do not start a target's units directly; you make your unit `WantedBy=multi-user.target`, which means it joins the target.

Dependencies come in two flavors:
- Requirement (Wants=, Requires=, BindsTo=, PartOf=): systemd will try to start the listed unit too. `Requires=` is hard (if it fails, yours fails). `Wants=` is soft (if it fails, yours still tries). `BindsTo=` is even stronger (if the required unit stops with `StopPropagated`, yours stops too).
- Ordering (After=, Before=): just tells systemd the sequence; it does not actually pull the unit in. A classic trap: writing `After=network-online.target` without `Wants=network-online.target`. systemd will wait for the target only if something else already pulled it in. Your service starts before the network is ready, and then fails to bind a port.

What `systemctl enable` actually does: It creates a symlink (a shortcut file) from `/etc/systemd/system/multi-user.target.wants/your.service` to the unit file. That symlink is what causes the unit to be pulled into the target at boot.

Always run `systemctl daemon-reload` after editing any unit file, otherwise systemd keeps reading the old version from its cache.

Inspection tools:
```bash
systemctl cat nginx.service          # show the merged unit file (defaults + overrides)
systemctl show -p Restart nginx      # show one property
systemctl list-dependencies --reverse nginx   # what depends on nginx
systemd-analyze verify nginx.service # static syntax + dependency checks
```

### 3. Writing a Production Service Unit

A service unit file has sections: `[Unit]`, `[Service]`, `[Install]`. The `[Service]` section is where the runtime details live.

Type= controls when systemd considers the service "started":
- `simple`: systemd fires "started" the instant it `fork`s and `exec`s the process. Fast but unsafe, because a missing binary looks like a successful start.
- `exec`: systemd waits for the `execve()` call (the kernel call that loads the new program) to actually succeed. If the binary path is wrong, you get a loud failure. The default for most modern services.
- `notify`: the
