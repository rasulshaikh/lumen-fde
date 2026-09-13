/**
 * From power on to a service accepting traffic.
 *
 * Explains plan row 1, "Linux internals: processes, systemd, permissions, filesystems, packaging".
 *
 * Most of this sequence is invisible until something in it breaks, and then it is the only thing
 * that matters. The part worth genuinely understanding is the end: systemd does not start units in
 * the order they are listed, it starts everything it can in parallel and uses declared dependencies
 * to hold things back. That is why a unit with no After= works on a fast machine and fails on a slow
 * one, and why "it works on my laptop" has a specific technical meaning here.
 *
 * The third fault is the subtle one. Socket activation makes systemd hold the listening socket
 * itself, so a client connects successfully before the service behind it exists. When the service is
 * dead, the connection is still accepted - and a client that is accepted and then hangs is much
 * harder to diagnose than one that is refused.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const MISSING_AFTER = "missing-after";
const RESTART_STORM = "restart-storm";
const SOCKET_MASKS = "socket-masks";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["fw", "Firmware", 30, 40, "service"],
  ["kern", "Kernel", 112, 40, "service"],
  ["init", "PID 1 systemd", 206, 40, "service"],
  ["dep", "postgres.service", 268, 116, "service"],
  ["svc", "api.service", 150, 132, "service"],
  ["sock", "api.socket", 42, 116, "store"],
];

const EDGES = [
  { from: "fw", to: "kern", dashed: true },
  { from: "kern", to: "init", dashed: true },
  { from: "init", to: "dep", dashed: true },
  { from: "init", to: "svc", dashed: true },
  { from: "dep", to: "svc", dashed: true },
  { from: "init", to: "sock", dashed: true },
  { from: "sock", to: "svc", dashed: true },
  { from: "svc", to: "sock", dashed: true },
];

export const systemdBoot: Machine = {
  id: "systemd-boot",
  title: "From power on to a service accepting traffic",
  short: "Boot to serving",
  subtitle: "systemd starts everything at once and uses dependencies to hold things back. That is the opposite of what the file order suggests.",
  topicIndices: [1],
  steps: ["Firmware and bootloader", "Kernel and initramfs", "PID 1 takes over", "Units start in parallel", "Socket activation", "Ready"],
  faults: [
    { id: MISSING_AFTER, label: "No After= on the database", blurb: "Works on the machine it was written on, fails on a slower one. The difference is a race, and the file looks identical on both." },
    { id: RESTART_STORM, label: "Restart=always at the default 100ms", blurb: "systemd gives up permanently after five attempts in ten seconds, and the unit is left dead with no further retries." },
    { id: SOCKET_MASKS, label: "Socket activation over a dead service", blurb: "The connection is accepted because systemd owns the socket. The client waits instead of failing, which is worse." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const noAfter = faults.includes(MISSING_AFTER);
    const storm = faults.includes(RESTART_STORM);
    const masked = faults.includes(SOCKET_MASKS);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      return { ...base, nodes: nodes({ fw: "UEFI, then the boot entry" }),
        tokens: [{ id: "b", from: "fw", to: "kern", at: p, label: "load vmlinuz", tone: "normal" }],
        caption: "Firmware finds a bootloader, the bootloader finds a kernel.",
        detail: "Worth knowing exists, rarely worth debugging. The one thing from here that reaches everyday work is the kernel command line, because that is where root= and any early parameters live - and a machine that will not boot after a change is usually a bad entry here rather than anything in userspace." };
    }

    if (s === 1) {
      return { ...base, nodes: nodes({ kern: "initramfs, then pivot" }),
        tokens: [{ id: "k", from: "kern", to: "init", at: p, label: "exec /sbin/init", tone: "normal" }],
        caption: "A temporary root filesystem exists just long enough to mount the real one.",
        detail: "The initramfs carries the drivers needed to reach the real root - LVM, encryption, a network block device - and then gets out of the way. A container does the same thing one syscall over: the kernel refuses pivot_root on the initial ramfs, so boot uses switch_root - empty the rootfs, overmount it with the real root, then exec the real init - while a container runtime calls pivot_root outright. Same mount machinery either way, which is the first hint that a container is not a machine: it reuses the mechanisms a machine already had." };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ init: "default.target" }),
        tokens: [{ id: "i", from: "init", to: "dep", at: p, label: "resolve the graph", tone: "normal" }],
        caption: "PID 1 reads every unit file and builds a dependency graph.",
        detail: "A target is not a runlevel, it is a synchronisation point - a named node in the graph that other units can be ordered against. Nothing is started yet; the entire ordering is computed from what the unit files declare, which is why an undeclared dependency is invisible to systemd rather than merely undocumented." };
    }

    if (s === 3) {
      if (noAfter) {
        return { ...base, nodes: nodes({ svc: "started before the database", dep: "still starting" }, ["svc"]),
          tokens: [{ id: "st", from: "init", to: "svc", at: p, label: "start (unordered)", tone: "fault" }],
          caption: "The service starts at the same time as the database it needs.",
          detail: "systemd starts everything it can in parallel, so with no After= the two units race, and the one that wins depends on disk speed and what else is booting. Requires= only says the other unit must be started - not that it must be started first, which is the pair of directives people conflate. And neither says the database is accepting connections: a unit being active means its process launched. For anything that has to be ready rather than merely running, use Type=notify in the dependency, or make the dependant retry - the ordering gets you close and the retry is what makes it correct.",
          fault: `A start-order race, decided by disk speed.${storm ? " The restart configuration is also wrong, and you will not see it here: the race is what fails first, and its retries are what will hit the start limit." : ""}` };
      }
      if (storm) {
        return { ...base, nodes: nodes({ svc: "5 restarts in 10s, gave up" }, ["svc"]),
          tokens: [{ id: "st", from: "init", to: "svc", at: Math.min(p, 0.5), label: "start-limit-hit", tone: "fault" }],
          caption: "The service crashed, restarted instantly, and systemd stopped trying.",
          detail: "RestartSec defaults to 100ms, so Restart=always retries about ten times a second and five failures land well inside the default ten-second window, which is the start limit. systemd then leaves the unit in the failed state - `Active: failed (Result: start-limit-hit)` - and does not try again - which is the correct behaviour for a crash loop and surprises everyone the first time, because the logs show five failures and then nothing at all, as though the problem stopped. Raise RestartSec well above its 100ms default so the retries are spread out, and read `systemctl status` for start-limit-hit before concluding the service recovered.",
          fault: "Rate limited, then abandoned." };
      }
      return { ...base, nodes: nodes({ dep: "active", svc: "After=postgres.service" }),
        tokens: [{ id: "st", from: "dep", to: "svc", at: p, label: "ordered start", tone: "normal" }],
        caption: "Units start in parallel except where a dependency holds them back.",
        detail: "Parallel by default is what makes a modern boot fast, and declared ordering is the only brake. Requires= expresses that one unit needs another; After= expresses order. They are independent, you almost always want both, and forgetting the second is the fault that hides on fast hardware." };
    }

    if (s === 4) {
      if (masked) {
        return { ...base, nodes: nodes({ sock: "listening", svc: "dead" }, ["svc"]),
          tokens: [{ id: "so", from: "sock", to: "svc", at: Math.min(p, 0.6), label: "connection accepted", tone: "fault" }],
          caption: "The socket accepts the connection. There is nothing behind it.",
          detail: "systemd holds the listening socket itself, which is what lets it start a service on first use and what removes the start-order problem for anything socket-activated - a client can connect before the service exists and the connection simply waits. When the service is genuinely dead, that same property turns a connection refused, which is instant and unambiguous, into a hang, which is neither. Health checks that only test connectivity pass. Check the service, not the port.",
          fault: "Accepted, then nothing. Worse than refused." };
      }
      return { ...base, nodes: nodes({ sock: "listening", svc: "started on first connection" }),
        tokens: [{ id: "so", from: "sock", to: "svc", at: p, label: "first connection", tone: "normal" }],
        caption: "systemd holds the socket and starts the service when something connects.",
        detail: "This is the neat part of the design: because PID 1 owns the socket from the start, a client can connect before the service is up and no connection is lost. It also means a service can be restarted without dropping anything that is mid-connect, which is how a socket-activated daemon gets upgraded without a window." };
    }

    return { ...base, nodes: nodes({ svc: "active (running)", dep: "active" }),
      tokens: [{ id: "up", from: "svc", to: "sock", at: p, label: "serving", tone: "normal" }],
      caption: "The service is serving. systemd now holds it and its children in a cgroup.",
      detail: "Every unit that owns processes gets a cgroup - services, scopes, slices, sockets, mounts, swaps - which is how systemd can reliably stop a service that forks: it kills the cgroup rather than chasing PIDs, and it is the same kernel feature a container runtime uses for limits. To see what the boot actually waited on, use `systemd-analyze critical-chain`, which walks the ordering graph. `blame` only ranks units by how long each took to initialise, and its own manual warns that a unit can be slow precisely because it was waiting - so the top of `blame` is usually not the thing to fix." };
  },
};
