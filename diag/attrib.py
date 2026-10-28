#!/usr/bin/env python3
"""Attribute each CC subprocess query in the bridge log to an outcome.

Pairs every `provider: fresh query` with the `consumeQuery` line that closes it
(LIFO per session id, so reentrant subagent queries nest correctly), carries
account state forward from `rate_limit_event`, and cross-tabulates the
"out of extra usage" 400 against the subagent lifecycle boundary.

See EXTRA-USAGE-400.md. Usage: python3 diag/attrib.py [logfile]

Finding occurrences by hand
---------------------------
Do not text-match the error string. Two false positives bit during the original
investigation: a session *discussing* the bug matches itself, and a tool result
that dumped `strings` from the CC binary contains the message verbatim, because
it is baked into the client. Match on shape, and require two log families to
agree before believing an occurrence:

  * `message.stopReason == "error"` with a matching `errorMessage`, under
    ~/.omp/agent/sessions/**
  * a `toolResult` beginning `Agent failed: API Error: 400` — subagent failures,
    easy to undercount
  * `consumeQuery: error result, subtype=success` in ~/.omp/agent/claude-bridge.log
  * `[ERROR] API error (attempt 1/11): 400` in ~/.omp/agent/cc-cli-logs/, which
    carries the server request_id

Account state per request comes from `rate_limit_event` in the bridge log, which
carries `overageStatus` and `overageDisabledReason`.
"""
import datetime as dt
import os
import re
import sys
from collections import Counter, defaultdict

LINE = re.compile(r'^\[([^\]]+)\] \[(\w+)\] (.*)$')
SETUP = re.compile(r'fresh query setup, isReentrant=(\w+)')
FRESH = re.compile(r'provider: fresh query model=(\S+) msgs=(\d+) tools=(\d+) '
                   r'resume=(\S+).*?prompt=(.*)$')
RLE = re.compile(r'rate_limit_event (\{.*)')
# Prompts pi injects to report subagent lifecycle back to the parent turn.
AGENT_PROMPTS = ("<task-notification>", "Background agent group completed")
ONSET = dt.datetime(2026, 7, 29)


def parse(path):
    queries, stacks, pending = [], defaultdict(list), {}
    overage = None
    for raw in open(path, errors="replace"):
        m = LINE.match(raw.rstrip("\n"))
        if not m:
            continue
        ts, sid, rest = m.groups()

        r = RLE.search(rest)
        if r:
            st = re.search(r'"overageStatus":"(\w+)"', r.group(1))
            dr = re.search(r'"overageDisabledReason":"(\w+)"', r.group(1))
            overage = (st.group(1) if st else "?") + \
                      ("/" + dr.group(1) if dr else "")
            continue

        s = SETUP.search(rest)
        if s:
            pending[sid] = s.group(1) == "true"
            continue

        f = FRESH.search(rest)
        if f:
            prompt, resume = f.group(5), f.group(4)
            reentrant = pending.pop(sid, False)
            queries.append(q := {
                "t0": dt.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ"),
                "sid": sid, "model": f.group(1), "resume": resume,
                "reentrant": reentrant, "prompt": prompt, "overage": overage,
                "outcome": None,
                # The subagent's own first call, or a parent turn carrying an
                # agent lifecycle notification.
                "agentish": (reentrant and resume == "none")
                or prompt.startswith(AGENT_PROMPTS),
            })
            stacks[sid].append(q)
            continue

        done = None
        if "consumeQuery: error result" in rest:
            done = "EXTRA_USAGE" if "extra usage" in rest else "other_error"
        elif "result: served" in rest or "for-await loop exited" in rest:
            done = "ok"
        if done and stacks[sid]:
            q = stacks[sid].pop()
            if q["outcome"] is None:
                q["outcome"] = done
    return queries


def tab(title, rows, key):
    counts = defaultdict(Counter)
    for q in rows:
        counts[key(q)][q["outcome"]] += 1
    print(f"\n{title}")
    print(f"  {'bucket':<32} {'n':>5} {'fail':>5} {'rate':>8}")
    for k in sorted(counts, key=str):
        n = sum(counts[k].values())
        fails = counts[k]["EXTRA_USAGE"]
        print(f"  {str(k):<32} {n:>5} {fails:>5} {100 * fails / n:>7.1f}%")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else \
        os.path.expanduser("~/.omp/agent/claude-bridge.log")
    queries = parse(path)
    resolved = [q for q in queries if q["outcome"]]
    fails = [q for q in resolved if q["outcome"] == "EXTRA_USAGE"]
    print(f"parsed {len(queries)} queries, {len(resolved)} resolved, "
          f"{len(fails)} extra-usage failures")

    unfunded = [q for q in resolved if q["t0"] >= ONSET
                and q["overage"] and q["overage"] != "allowed"]
    print(f"unfunded era (>= {ONSET.date()}): {len(unfunded)}")

    tab("by subagent lifecycle boundary:", unfunded,
        lambda q: "agent lifecycle" if q["agentish"] else "ordinary turn")
    tab("by reentrancy (same bridge process, parent query live):", unfunded,
        lambda q: f"reentrant={q['reentrant']}")
    tab("by CC session freshness:", unfunded,
        lambda q: f"fresh_session={q['resume'] == 'none'}")
    tab("by model:", unfunded, lambda q: q["model"])

    print("\nall failures:")
    for q in fails:
        print(f"  {q['t0']}  {q['sid']}  reentrant={str(q['reentrant']):<5} "
              f"agentish={str(q['agentish']):<5} {q['model']:<22} "
              f"{q['overage']}")


if __name__ == "__main__":
    main()
