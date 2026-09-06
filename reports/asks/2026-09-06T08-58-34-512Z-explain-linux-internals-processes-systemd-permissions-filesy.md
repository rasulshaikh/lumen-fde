# Lumen Ask

Date: 2026-09-06T08:58:34.512Z

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

What you will build

You will write a small FastAPI app, package it as a systemd service, lock it down with sandbox directives, cap its memory with a cgroup, and then prove you can debug it from `/proc` when it breaks. The point is not the app. The point is the chain from boot to PID 1 to your socket accepting traffic, and the tools you reach for when something in that chain is wrong.

Concrete example we will use

A "hello" endpoint at `:8000` that reads a file `/var/lib/helloapp/data.txt` on every request. We will start it as root with no limits, watch it work, then convert it to a hardened systemd unit with a dedicated user, read-only filesystem, a 200 MB memory cap, and a watchdog. Then we will misconfigure one thing on purpose and show the symptom, the log line, and the `/proc` file that proves the cause.

Prerequisites check

You need a Linux box you can root. A Hetzner CX22 or any VPS works. You need Python 3.11 plus `venv` and `pip`. You need comfort with pipes, redirection, exit codes, and job control. If `Ctrl-Z`, `bg`, `fg`, and reading `man systemd.service` feel foreign, stop and finish topic 0 first.

Definitions you will use all hour

PID 1 is the first process the kernel starts. On modern Linux it is systemd. Every other process is a child of it.

A unit is a text file that tells systemd how to run one thing. A `.service` unit is one program.

A cgroup is a kernel feature that groups processes and applies limits to the group. Think rent control for CPU and RAM.

A journal is systemd's log store. `journalctl` reads it.

`/proc` is a fake filesystem the kernel exposes. Reading `/proc/1234/status` tells you about process 1234 right now.

The 20 minute exercise

Minutes 0 to 3, create the app

```
mkdir -p /var/lib/helloapp
echo "hello from disk" | sudo tee /var/lib/helloapp/data.txt
python3 -m venv ~/helloapp-venv
source ~/helloapp-venv/bin/activate
pip install fastapi uvicorn
```

Save this as `~/helloapp/main.py`:

```
from fastapi import FastAPI
app = FastAPI()
@app.get("/")
def root():
    with open("/var/lib/helloapp/data.txt") as f:
        return {"msg": f.read().strip()}
```

Run it once by hand: `uvicorn main:app --host 0.0.0.0 --port 8000`. Hit `curl http://localhost:8000/` and confirm the JSON reply. Press `Ctrl-C`. This proves your code works before systemd enters the picture.

Minutes 3 to 7, package it as a service

Save this as `/etc/systemd/system/helloapp.service`:

```
[Unit]
Description=Hello FDE demo
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=helloapp
Group=helloapp
WorkingDirectory=/opt/helloapp
ExecStart=/opt/helloapp/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Create the user and the install dir, then enable and start:

```
sudo useradd --system --no-create-home --shell /usr/sbin/nologin helloapp
sudo mkdir -p /opt/helloapp
sudo cp -r ~/helloapp-venv /opt/helloapp/venv
sudo cp ~/helloapp/main.py /opt/helloapp/main.py
sudo cp /var/lib/helloapp/data.txt /var/lib/helloapp/data.txt
sudo chown -R helloapp:helloapp /opt/helloapp /var/lib/helloapp
sudo systemctl daemon-reload
sudo systemctl enable --now helloapp
```

Now run the three read commands. They are your ground truth for the whole rest of the hour.

```
systemctl status helloapp --no-pager
systemctl cat helloapp
journalctl -u helloapp --no-pager -n 20
```

You should see `active (running)`, the unit file you wrote, and uvicorn's startup line in the journal.

Minutes 7 to 11, harden it and observe the cgroup

Edit the unit with `sudo systemctl edit helloapp`. The `edit` command creates a drop-in override at `/etc/systemd/system/helloapp.service.d/override.conf`. Paste:

```
[Service]
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
MemoryMax=200M
MemoryHigh=150M
Environment=PYTHONUNBUFFERED=1
ReadWritePaths=/var/lib/helloapp
```

Then `sudo systemctl daemon-reload && sudo systemctl restart helloapp`. Hit `curl` again. It should still work. Now look at the kernel view:

```
ls /sys/fs/cgroup/system.slice/helloapp.service/
cat /sys/fs/cgroup/system.slice/helloapp.service/memory.max
cat /sys/fs/cgroup/system.slice/helloapp.service/memory.current
cat /sys/fs/cgroup/system.slice/helloapp.service/memory.events
```

`memory.max` is your 200 MB cap. `memory.current` is what the process is using right now. `memory.events` shows `oom` as zero. This is the cgroup proof.

Score yourself: `systemd-analyze security helloapp`. The score should drop compared to before the drop-in. Below 3.0 is the rule of thumb.

Minutes 11 to 15, debug a stuck process from `/proc`

Make it stuck. `sudo systemctl edit helloapp` and add `MemoryMax=50M` to the drop-in. Reload and restart. Hit `curl` in a loop: `while true; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/; done`. After a few seconds the service dies. Now read the trail:

```
journalctl -u helloapp --no-pager -n 30
systemctl status helloapp --no-pager
```

You will see `code=killed, status=9/KILL` or `code=exited, status=1/FAILURE`. The journal alone does not say OOM. Go to `/proc`:

```
MAINPID=$(systemctl show -p MainPID helloapp | cut -d= -f2)
echo "PID is $MAINPID"
cat /proc/$MAINPID/status | grep -E "VmRSS|Name"
```

If the service was restarted, check the kernel ring buffer for the OOM line:

```
journalctl -k --since '-2m' | grep -i oom
```

The OOM killer leaves a line in `dmesg` with the cgroup path. That line is the smoking gun. Notice that `Restart=on-failure` restarted it for you, which is why a silent memory leak can hide for hours in production.

Minutes 15 to 18, prove the sandbox is real

Replace `ReadWritePaths=` with nothing and reload. Now `/var/lib/helloapp/data.txt` is on a read-only filesystem for the service. `curl` will return `{"detail":"Internal Server Error"}`. The journal will show a `PermissionError` because Python cannot open the file
