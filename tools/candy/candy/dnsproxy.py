"""A real DNS filtering resolver, running inside Candy.

The hosts file has three hard limits: it only matches exact names, it slows
Windows down once it holds tens of thousands of entries, and it can only block
things somebody already put on a list. A resolver has none of those problems.

Candy runs one on 127.0.0.1:53, points the system at it, and then sees **every
name every process on the machine looks up**, before any connection is made.
That means:

* **Wildcard and suffix blocking** — one rule covers ``*.bad-executor.gg``.
* **Live phishing analysis on names nobody has ever reported.** A lookup for
  ``roblox.com.claim-robux.xyz`` is scored by shape at resolution time and
  refused, with no feed involved.
* **A complete query log** — the earliest possible signal that something on the
  machine is trying to reach somewhere it should not.
* **No size limit** — blocklists live in memory, not in a file Windows parses
  on every lookup.

Failure modes are the thing that matters in a resolver, so: upstream failures
return SERVFAIL rather than hanging, the proxy never blocks its own listener
thread on a slow upstream, and stopping Candy restores the system DNS setting.
If the proxy cannot bind, Candy says so and leaves DNS alone rather than
half-configuring it.
"""
from __future__ import annotations

import ipaddress
import socket
import socketserver
import struct
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .config import Config
from .events import Detection

Sink = Callable[[Detection], None]

DNS_PORT = 53
MAX_PACKET = 4096

# Response codes
RCODE_OK = 0
RCODE_SERVFAIL = 2
RCODE_NXDOMAIN = 3
RCODE_REFUSED = 5

QTYPE_A = 1
QTYPE_AAAA = 28
QTYPE_HTTPS = 65      # carries ECH/IP hints; must be refused for a blocked name too


@dataclass
class Question:
    name: str
    qtype: int
    transaction_id: int
    question_end: int


def parse_question(data: bytes) -> Question | None:
    """Read the first question from a DNS query.

    Deliberately strict and bounded: this parses attacker-reachable bytes on
    every lookup the machine makes, so a malformed packet must return None
    rather than raise or loop.
    """
    if len(data) < 12:
        return None
    try:
        transaction_id, flags, qdcount = struct.unpack_from(">HHH", data, 0)
        if qdcount < 1:
            return None
        offset = 12
        labels: list[str] = []
        for _ in range(128):                     # hard cap: no label loops
            if offset >= len(data):
                return None
            length = data[offset]
            if length == 0:
                offset += 1
                break
            if length & 0xC0:                    # compression pointer in a question
                return None
            offset += 1
            if offset + length > len(data) or length > 63:
                return None
            # latin-1 never raises, and punycode labels are already ASCII —
            # the phishing analyser wants to see the xn-- form anyway.
            labels.append(data[offset:offset + length].decode("latin-1"))
            offset += length
        else:
            return None
        if offset + 4 > len(data):
            return None
        qtype, _qclass = struct.unpack_from(">HH", data, offset)
        name = ".".join(labels).lower().rstrip(".")
        if len(name) > 253:
            return None
        return Question(name=name, qtype=qtype, transaction_id=transaction_id,
                        question_end=offset + 4)
    except (struct.error, UnicodeDecodeError):
        return None


def build_response(query: bytes, question: Question, *, rcode: int = RCODE_OK,
                   sinkhole: str | None = "0.0.0.0", ttl: int = 60) -> bytes:
    """Build an answer for a blocked name.

    A sinkholed A/AAAA answer fails faster than NXDOMAIN for a browser, while
    NXDOMAIN is the honest answer for every other record type.
    """
    header_flags = 0x8180 if rcode == RCODE_OK else (0x8180 | rcode)
    answers = b""
    ancount = 0

    if rcode == RCODE_OK and sinkhole is not None:
        if question.qtype == QTYPE_A:
            rdata = ipaddress.IPv4Address(sinkhole).packed
        elif question.qtype == QTYPE_AAAA:
            rdata = ipaddress.IPv6Address("::").packed
        else:
            rdata = b""
        if rdata:
            answers = (b"\xc0\x0c"                                  # pointer to the question
                       + struct.pack(">HHIH", question.qtype, 1, ttl, len(rdata)) + rdata)
            ancount = 1
        else:
            header_flags = 0x8180 | RCODE_NXDOMAIN

    header = struct.pack(">HHHHHH", question.transaction_id, header_flags, 1, ancount, 0, 0)
    return header + query[12:question.question_end] + answers


@dataclass
class FilterVerdict:
    blocked: bool
    reason: str = ""
    rule: str = ""
    severity: str = "medium"


class DnsFilter:
    """The decision half of the resolver — pure, so it is fully unit-tested."""

    def __init__(self, config: Config, db: Any = None, analyzer: Any = None) -> None:
        self.config = config
        self.db = db
        self.analyzer = analyzer
        self._blocked: set[str] = set()
        self._suffixes: set[str] = set()
        self._lock = threading.Lock()

    # ------------------------------------------------------------- lists
    def load(self, domains: list[str], *, suffix_match: bool = True) -> int:
        """Replace the in-memory blocklist. Returns how many were loaded."""
        with self._lock:
            self._blocked = {d.lower().lstrip(".") for d in domains if d}
            self._suffixes = set(self._blocked) if suffix_match else set()
        return len(self._blocked)

    def add(self, domain: str) -> None:
        with self._lock:
            self._blocked.add(domain.lower().lstrip("."))
            self._suffixes.add(domain.lower().lstrip("."))

    @property
    def size(self) -> int:
        return len(self._blocked)

    def _listed(self, name: str) -> str | None:
        """Exact match, or any parent domain — one rule covers every subdomain."""
        with self._lock:
            if name in self._blocked:
                return name
            parts = name.split(".")
            for index in range(1, len(parts) - 1):
                parent = ".".join(parts[index:])
                if parent in self._suffixes:
                    return parent
        return None

    # ------------------------------------------------------------ decide
    def decide(self, name: str) -> FilterVerdict:
        """Should this lookup be answered or refused?"""
        name = (name or "").lower().rstrip(".")
        if not name:
            return FilterVerdict(False)

        from .netblock import is_protected

        # Protected infrastructure is never blocked, whatever any list says.
        if is_protected(name) or self.config.is_domain_whitelisted(name):
            return FilterVerdict(False, "protected or whitelisted")

        listed = self._listed(name)
        if listed:
            return FilterVerdict(True, f"on the blocklist ({listed})", listed, "medium")

        if self.config.domain_blacklisted(name):
            return FilterVerdict(True, "on your personal blacklist", name, "high")

        if self.db is not None and self.db.endpoint_info(name):
            return FilterVerdict(True, "in the threat database", name, "critical")

        if self.config.get("dns.phishing_analysis", True):
            from .phishing import analyze_host

            verdict = analyze_host(name)
            threshold = int(self.config.get("dns.phishing_block_score", 70))
            if verdict.score >= threshold:
                return FilterVerdict(
                    True,
                    f"scored {verdict.score} as {verdict.verdict}: "
                    f"{verdict.findings[0]['detail'] if verdict.findings else 'suspicious shape'}",
                    "phishing-heuristic", "critical")
        return FilterVerdict(False)


class _Handler(socketserver.BaseRequestHandler):
    def handle(self) -> None:  # pragma: no cover - exercised via the live test
        data, sock = self.request
        proxy: DnsProxy = self.server.proxy       # type: ignore[attr-defined]
        proxy.handle_packet(data, sock, self.client_address)


class _Server(socketserver.ThreadingUDPServer):
    allow_reuse_address = True
    daemon_threads = True


def is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(str(host).strip()).is_loopback
    except ValueError:
        return str(host).strip().lower() in ("localhost", "")


def public_bind_problem(host: str, *, allowed: bool = False) -> str | None:
    """Why binding here would be dangerous, or None if it is fine.

    A DNS resolver that answers the network is an open resolver, and an open
    resolver is a UDP amplifier: a spoofed 40-byte query becomes a 500-byte
    answer aimed at whoever the attacker names. Candy's resolver exists to
    filter *this* machine's lookups, so anything but loopback is refused
    unless the user has explicitly said otherwise.
    """
    if allowed or is_loopback(host):
        return None
    return (f"refusing to bind the DNS resolver to {host}: anything but a loopback "
            f"address makes this an open resolver, which can be abused to amplify "
            f"traffic at someone else. Set dns.allow_public_bind if you genuinely "
            f"intend to serve other machines, and firewall it yourself.")


class DnsProxy:
    """UDP DNS proxy: filter locally, forward the rest upstream."""

    def __init__(self, config: Config, dns_filter: DnsFilter, sink: Sink | None = None) -> None:
        self.config = config
        self.filter = dns_filter
        self.sink = sink
        self._server: _Server | None = None
        self._thread: threading.Thread | None = None
        self._cache: dict[tuple[str, int], tuple[float, bytes]] = {}
        self._cache_lock = threading.Lock()
        self._reported: set[str] = set()
        self.queries = 0
        self.blocked = 0
        self.forwarded = 0
        self.errors = 0
        self.mode = "idle"
        self.last_error: str | None = None

    # ------------------------------------------------------------ lifecycle
    def start(self, host: str = "127.0.0.1", port: int = DNS_PORT) -> tuple[bool, str]:
        problem = public_bind_problem(host, allowed=bool(
            self.config.get("dns.allow_public_bind", False)))
        if problem:
            self.last_error = problem
            self.mode = "refused"
            return False, problem
        try:
            server = _Server((host, port), _Handler)
        except OSError as exc:
            self.last_error = str(exc)
            self.mode = "unavailable"
            return False, (f"could not bind {host}:{port} — {exc}. "
                           f"Port 53 needs administrator, and nothing else may be using it.")
        server.proxy = self  # type: ignore[attr-defined]
        self._server = server
        self._thread = threading.Thread(target=server.serve_forever, name="dnsproxy",
                                        daemon=True)
        self._thread.start()
        self.mode = f"listening on {host}:{port}"
        return True, (f"DNS filtering resolver listening on {host}:{port} with "
                      f"{self.filter.size} blocked domain(s)")

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread:
            self._thread.join(timeout=4)
            self._thread = None
        self.mode = "idle"

    @property
    def address(self) -> tuple[str, int] | None:
        return self._server.server_address if self._server else None

    # -------------------------------------------------------------- serving
    def handle_packet(self, data: bytes, sock: Any, client: Any) -> None:
        self.queries += 1
        question = parse_question(data)
        if question is None:
            self.errors += 1
            return

        verdict = self.filter.decide(question.name)
        if verdict.blocked:
            self.blocked += 1
            self._report(question, verdict)
            sock.sendto(build_response(data, question), client)
            return

        response = self._resolve_upstream(data, question)
        if response is None:
            self.errors += 1
            sock.sendto(build_response(data, question, rcode=RCODE_SERVFAIL,
                                       sinkhole=None), client)
            return
        self.forwarded += 1
        sock.sendto(response, client)

    def _resolve_upstream(self, data: bytes, question: Question) -> bytes | None:
        key = (question.name, question.qtype)
        now = time.time()
        with self._cache_lock:
            cached = self._cache.get(key)
            if cached and cached[0] > now:
                # Rewrite the transaction id: the cached answer belongs to a
                # different query.
                return struct.pack(">H", question.transaction_id) + cached[1][2:]

        upstream = self._upstream_servers()
        timeout = float(self.config.get("dns.upstream_timeout_seconds", 3.0))
        for server in upstream:
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as forwarder:
                    forwarder.settimeout(timeout)
                    forwarder.sendto(data, (server, 53))
                    response, _ = forwarder.recvfrom(MAX_PACKET)
                if response:
                    ttl = int(self.config.get("dns.cache_seconds", 300))
                    with self._cache_lock:
                        if len(self._cache) > 5000:
                            self._cache.clear()
                        self._cache[key] = (now + ttl, response)
                    return response
            except (socket.timeout, OSError):
                continue
        return None

    def _upstream_servers(self) -> list[str]:
        configured = self.config.get("dns.upstream", []) or []
        if configured:
            return [str(server) for server in configured]
        from .netharden import RESOLVERS

        choice = str(self.config.get("dns.upstream_resolver", "quad9"))
        return list(RESOLVERS.get(choice, RESOLVERS["quad9"])["v4"])

    def _report(self, question: Question, verdict: FilterVerdict) -> None:
        if self.sink is None or question.name in self._reported:
            return
        self._reported.add(question.name)
        if len(self._reported) > 5000:
            self._reported.clear()
        self.sink(Detection(
            source="dns", kind="dns_blocked", subject=question.name,
            message=f"Blocked DNS lookup of {question.name} — {verdict.reason}.",
            severity=verdict.severity, remote=question.name,
            signature_id=f"dns.{verdict.rule or 'blocked'}",
            evidence={"qtype": question.qtype, "rule": verdict.rule},
        ))

    # --------------------------------------------------------------- status
    def status(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "blocklist_size": self.filter.size,
            "queries": self.queries,
            "blocked": self.blocked,
            "forwarded": self.forwarded,
            "errors": self.errors,
            "upstream": self._upstream_servers(),
            "last_error": self.last_error,
        }
