---

# electron/private-address.mjs

Source: [`electron/private-address.mjs`](../../../electron/private-address.mjs)

Which network addresses the assistant and the agents may not reach with the app's browser. One rule for the interface ([webAddress.js](../src/lib/webAddress.js.md) re-exports it) and for the main process (loaded with `import()`).

- `isPrivateAddress(address)`: an IP address, written in any form, that is not public. IPv4: `0/8`, `10/8`, `100.64/10` (CGNAT), `127/8`, `169.254/16` (link-local and cloud metadata), `172.16/12`, `192.168/16`, `192.0.0/24`, `198.18/15`, and everything from `224` up. IPv6: `::`, `::1`, unique local `fc00::/7`, link-local `fe80::/10`, site-local `fec0::/10`, multicast, and the addresses that carry an IPv4 (mapped `::ffff:a.b.c.d` in the hex form `URL` produces, compatible, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`), judged by that IPv4. A text that is not an IP gives `false`.
- `isPrivateHost(hostname)`: a host name as in `URL.hostname`: `localhost` (also with a trailing dot) and the suffixes `.localhost`, `.local`, `.internal`, `.localdomain`, `.home.arpa`, an empty host, or a private IP.

The main process ([main.cjs](main.cjs.md), `browser:guard-agent`) applies it also to what a name resolves to in the DNS and to every redirect of the page, while the assistant or an agent drives a tab. A name that changes its answer between the check and the load (DNS rebinding) is not covered.
