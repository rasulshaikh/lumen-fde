/**
 * What `docker run` actually does, without the words "lightweight VM".
 *
 * Explains plan row 5, "Docker internals: namespaces, cgroups, layers, networking".
 *
 * A container is not a small machine. It is one ordinary Linux process that has been lied to about
 * what it can see, and metered on what it can use. Those are two separate kernel features doing two
 * separate jobs - namespaces do the lying, cgroups do the metering - and almost every confusing
 * container behaviour comes from mixing them up. A process that cannot see the host's other
 * processes is namespaces. A process killed at 512MB is cgroups. A JVM that sized its heap from the
 * host's 64GB while living in a 512MB cgroup is what happens when the two disagree.
 *
 * The faults are the three that get filed. An OOM kill that reads as a crash because the exit code
 * is the only evidence left. A missing capability, which looks like a permissions bug and is not
 * about the user. And a cache miss at the wrong line of the Dockerfile, which is not a failure at
 * all - just every build from now on being four minutes slower than it needs to be.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const OOM_KILL = "oom-kill";
const NO_CAPABILITY = "no-capability";
const CACHE_MISS = "cache-miss";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["cli", "docker run", 26, 88, "actor"],
  ["registry", "Registry", 100, 38, "store"],
  ["layers", "Overlay mount", 186, 38, "service"],
  ["ns", "Namespaces", 262, 88, "service"],
  ["cg", "cgroup", 186, 136, "service"],
  ["proc", "PID 1", 100, 136, "service"],
];

const EDGES = [
  { from: "cli", to: "registry", dashed: true },
  { from: "registry", to: "layers", dashed: true },
  { from: "layers", to: "ns", dashed: true },
  { from: "ns", to: "cg", dashed: true },
  { from: "cg", to: "proc", dashed: true },
  { from: "proc", to: "cli", dashed: true },
];

export const containerStart: Machine = {
  id: "container-start",
  title: "What docker run actually does",
  short: "docker run",
  subtitle: "One ordinary process, lied to about what it can see and metered on what it can use. Those are two different features.",
  topicIndices: [5],
  steps: ["Pull the manifest", "Pull the layers", "Assemble the filesystem", "Unshare the namespaces", "Attach the cgroup", "exec the entrypoint"],
  faults: [
    { id: CACHE_MISS, label: "COPY . . before npm install", blurb: "Nothing fails. Every build after this line re-runs, forever, because one character changed in a README." },
    { id: NO_CAPABILITY, label: "Drop CAP_NET_BIND_SERVICE", blurb: "The process is root and still cannot bind port 80, on any runtime that leaves low ports privileged. Capabilities are not the user, which is why this reads as impossible." },
    { id: OOM_KILL, label: "Memory limit below the heap", blurb: "Exit code 137 and an empty log. The kernel does not negotiate and the process gets no chance to say anything." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const cold = faults.includes(CACHE_MISS);
    const noCap = faults.includes(NO_CAPABILITY);
    const oom = faults.includes(OOM_KILL);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      return { ...base, nodes: nodes({ registry: "manifest + digests" }),
        tokens: [{ id: "man", from: "cli", to: "registry", at: p, label: "GET manifest", tone: "normal" }],
        caption: "The manifest is a list of layer digests, not an image.",
        detail: "An image is content-addressed all the way down: the manifest names layers by their SHA-256, so a tag is just a mutable pointer at an immutable thing. That is why `latest` is not a version and why pinning a digest is the only way to say what you actually ran." };
    }

    if (s === 1) {
      if (cold) {
        return { ...base, nodes: nodes({ registry: "4 of 6 layers cold" }, ["registry"]),
          tokens: [{ id: "lay", from: "registry", to: "layers", at: p, label: "312MB re-pulled", tone: "slow" }],
          caption: "Four layers are new, because one line in the Dockerfile invalidated everything under it.",
          detail: "A layer is keyed on the instruction text plus the layer beneath it, and only COPY and ADD also checksum the files they copy - a RUN never looks at what the command changed, which is why `RUN apt-get update` keeps serving a stale layer until something above it moves. The cache is strictly ordered - invalidate one line and every line after it rebuilds. `COPY . .` above `npm install` means any change to any file, including a README, throws away the dependency install. Copy the lockfile, install, then copy the source: the ordering is the whole optimisation and it is worth minutes on every build for the rest of the project's life.",
          fault: "Cache invalidated near the top." };
      }
      return { ...base, nodes: nodes({ registry: "5 of 6 cached" }),
        tokens: [{ id: "lay", from: "registry", to: "layers", at: p, label: "8MB pulled", tone: "normal" }],
        caption: "Only the layers you do not already have are pulled.",
        detail: "Layers are shared between images by digest, so ten services on the same base image store that base once. This is the real reason containers are cheap to ship, and it is a property of content addressing rather than of anything container-specific." };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ layers: "lower dirs + upper" }),
        tokens: [{ id: "mnt", from: "layers", to: "ns", at: p, label: "overlayfs mount", tone: "normal" }],
        caption: "The layers are stacked read-only, with one thin writable layer on top.",
        detail: "Writes go to the upper layer, and modifying a file that lives in a lower one copies the whole file up first. That copy-up is why writing to a large file inside a container is slow the first time and why a database in a container without a volume performs strangely - the storage driver is doing work a filesystem normally would not." };
    }

    if (s === 3) {
      return { ...base, nodes: nodes({ ns: "pid, net, mnt, uts, ipc" }),
        tokens: [{ id: "un", from: "ns", to: "cg", at: p, label: "unshare", tone: "normal" }],
        caption: "New namespaces: the process now sees a different world, not a smaller one.",
        detail: "Each namespace narrows one kind of visibility. A PID namespace means the process sees itself as 1 and cannot see the host's processes; a network namespace gives it its own interfaces and its own port space, which is why two containers can both bind 8080. Nothing is being emulated and nothing is virtualised - the host kernel is simply answering the same questions differently depending on who asks." };
    }

    if (s === 4) {
      if (noCap) {
        return { ...base, nodes: nodes({ cg: "memory 512M", ns: "no NET_BIND_SERVICE" }, ["ns"]),
          tokens: [{ id: "cap", from: "cg", to: "proc", at: p, label: "capabilities dropped", tone: "fault" }],
          caption: "The process is root and has had the capability to bind low ports taken away.",
          detail: "Root is not one thing. The kernel splits it into about forty capabilities and a container runtime drops most of them by default - but not this one. NET_BIND_SERVICE is in the fourteen Docker keeps, which is how the stock nginx image binds 80 as root at all. Drop it explicitly, which is what a restricted Pod Security profile does when it drops ALL, and a process running as uid 0 gets EACCES binding port 80 and the error looks like it is about permissions on a file. Checking the user will not explain it. The fix is to listen on a high port and map it, which is better practice anyway, rather than to add the capability back.",
          fault: "Root without CAP_NET_BIND_SERVICE." };
      }
      return { ...base, nodes: nodes({ cg: oom ? "memory.max 512M" : "memory 512M, cpu 1.0" }, oom ? ["cg"] : []),
        tokens: [{ id: "cap", from: "cg", to: "proc", at: p, label: "limits attached", tone: oom ? "slow" : "normal" }],
        caption: oom
          ? "A 512MB memory limit is attached. The process has not been told."
          : "Memory and CPU limits are attached to the cgroup.",
        detail: oom
          ? "The limit is enforced by the kernel and is invisible from inside unless the process goes looking for it. A runtime that reads the host's total memory to size a cache or a heap will pick a number that is wrong by two orders of magnitude, which is the JVM container problem in one sentence. The JVM itself has read the cgroup by default since JDK 10 and 8u191, so a 64GB heap inside a 512MB limit now means an ancient JVM, or one too old for cgroup v2, where the detection silently falls back to the host. Node and Go still have to be told: --max-old-space-size, GOMEMLIMIT."
          : "cgroups meter; namespaces hide. A CPU limit does not make a process see fewer cores, it makes the scheduler throttle it, which is why a thread pool sized from the visible core count can be four times too big in a container." };
    }

    if (oom) {
      return { ...base, nodes: nodes({ proc: "killed, exit 137", cg: "memory.max exceeded" }, ["proc"]),
        tokens: [{ id: "run", from: "proc", to: "cli", at: Math.min(p, 0.5), label: "exit 137", tone: "fault" }],
        caption: "The heap grew past the limit and the kernel killed the process immediately.",
        detail: "137 is 128 + 9: killed by SIGKILL, which cannot be caught, so there is no shutdown hook, no flush and no final log line. From the outside it looks exactly like a crash, and the application logs end mid-sentence with nothing wrong in them. The evidence is in the kernel, not the app - `dmesg` or the container's OOMKilled flag. This is also why raising the limit to make it go away can be right and is worth being suspicious of: a leak just takes longer to hit a bigger number.",
        fault: "OOM killed by the kernel." };
    }

    return { ...base, nodes: nodes({ proc: "PID 1, running" }),
      tokens: [{ id: "run", from: "proc", to: "cli", at: p, label: "running", tone: "normal" }],
      caption: "pivot_root, then exec. The entrypoint becomes PID 1 in its own namespace.",
      detail: "Being PID 1 is a real job: it reaps orphaned children and it does not get the kernel's default signal handlers, so a shell script as an entrypoint will ignore SIGTERM and your container will take the full grace period to stop, every time. Use the exec form of ENTRYPOINT or an init that forwards signals - a ten-second delay per container multiplied across a rolling deploy is the difference between a fast rollback and a slow one." };
  },
};
