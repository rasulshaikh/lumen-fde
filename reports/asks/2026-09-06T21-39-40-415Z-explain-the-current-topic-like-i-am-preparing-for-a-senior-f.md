# Lumen Ask

Date: 2026-09-06T21:39:40.415Z

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

Today's topic from the plan: Linux internals.

This is the part of an operating system that handles processes, memory, disks, and the system manager.

I will use simple words and one concrete example, and connect it to a real system.

Let's start with what happens when a Linux machine turns on.

The computer runs firmware code stored on the motherboard. This code is called BIOS on older machines and UEFI on newer machines. Its job is simple. It tests the hardware, then finds a bootable disk, then loads a small program from that disk into memory and runs it. This small program is the boot loader. On most Linux systems the boot loader is GRUB. GRUB's job is to load the Linux kernel into memory and start it.

The kernel is the core of the operating system. It is the first program that runs. It initializes the CPU, the memory, the disks, and the network. It mounts the root filesystem, which is the top folder of the disk. After the kernel finishes setting up the hardware, it starts the first user space process. That process is called init or systemd, with process id 1. Everything else on the system is a child of this process.

In a modern Linux server, the init system is almost always systemd. systemd is a service manager. It reads configuration files called unit files from /etc/systemd/system and /lib/systemd/system. Each unit file describes a service, a mount point, or a target. When systemd starts a service, it runs the command written in the unit file. systemd also supervises the process. If the process crashes, systemd can restart it, which is why most servers stay running for years without rebooting.

Now let's say a user wants to host a small website. They install nginx. They run systemctl start nginx. systemd reads the nginx unit file, which contains the command line to launch nginx, such as /usr/sbin/nginx. systemd forks a child process, runs the command, and stores the process id in a PID file or in its own database. nginx opens port 80 or 443 on the network interface. Now the server is ready to accept traffic.

When a client connects, the kernel receives the packet on the network card. The kernel uses iptables or nftables rules to decide whether to accept or drop the packet. If accepted, the kernel creates a socket and passes the bytes to nginx. nginx reads the HTTP request, finds the file or runs the application, writes a response back to the socket, and the kernel sends the packet out. This is the end to end flow from boot to a service serving traffic.

Now let's talk about permissions. Every file in Linux has an owner, a group, and a set of permission bits. The bits control read, write, and execute for the owner, the group, and everyone else. You see them with ls -l, which prints something like -rwxr-xr--. The owner can read, write, and execute. The group can read and execute. Everyone else can only read. This is how Linux enforces who can do what. The root user, with user id 0, bypasses all permission checks. Regular processes run as a non-root user to limit blast radius if the process is compromised. This is why production containers run as non-root. It is the same idea.

Now let's talk about debugging a stuck process. Every running process has a folder under /proc. /proc is a virtual filesystem that exposes kernel data as files. If a process has id 1234, its data lives in /proc/1234. You can read /proc/1234/status to see memory and state. You can read /proc/1234/wchan to see what kernel function the process is waiting in. You can read /proc/1234/fd to see every open file descriptor. A stuck process is usually waiting on disk I/O, a network call, or a lock. You can attach to it with strace -p 1234 and watch every system call live. If it is stuck on a futex, it is waiting for a lock inside the application. If it is stuck on read or write on a socket, the other side is not responding. If it is stuck on read or write on a disk file, the disk is slow or hung. The /proc folder is your window into the kernel's view of that process.

Now connect this to a senior FDE interview. The interviewer wants to know if you can reason about a running system, not just write code. You should be able to describe boot, services, and permissions without reading notes. You should be able to walk in, look at a stuck process, and find the cause in minutes. Real examples help. For instance, if a customer's background job is hung, you ssh in, find the process id with ps, look at /proc/<pid>/fd and /proc/<pid>/wchan, run strace, and discover it is blocked on a deadlocked database connection. You unstick the lock and document the fix. This is the kind of story interviewers remember.

A practical next step. Boot a small Linux VM or use a sandbox. Install nginx. Write a simple systemd unit file for a Python script that serves on a port. Start it, check its status with systemctl, then intentionally stop the Python process with kill. Watch systemd restart it. Then run ps, find the process id, look inside /proc, and run strace -p on it. Seeing the kernel call trace live is the fastest way to make these ideas feel real.
