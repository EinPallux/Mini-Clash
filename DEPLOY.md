# Deploying Mini Clash

Target: **one Ubuntu 24.04 LTS VPS**, domain **`moba.pathlands.cc`**.

This box is assumed to be **shared with other services**. Everything below is
built for that: nothing here stops, removes, prunes or reconfigures anything it
does not own. Read [§ Sharing the box](#sharing-the-box) before the first deploy.

---

## 0. Before you start

**Point the DNS at the box.** Add an `A` record for `moba.pathlands.cc` at your
server's public IPv4 (and `AAAA` if it has IPv6). Let's Encrypt validates over
port 80, so a certificate cannot be issued until the record resolves here.

```bash
dig +short moba.pathlands.cc      # should print your server's IP
```

**Get the code onto the box.**

```bash
sudo mkdir -p /srv && sudo chown "$USER" /srv
git clone <your repo url> /srv/mini-clash
cd /srv/mini-clash
git checkout claude/mini-clash-design-plan-arx5zw
```

---

## 1. Prepare the host

```bash
sudo ./deploy/setup.sh
```

Installs Docker Engine and the compose plugin from Docker's own apt repository,
adds you to the `docker` group, and writes `.env` with generated secrets and
`DOMAIN=moba.pathlands.cc` already filled in.

**About the firewall.** `setup.sh` only ever *adds* ufw rules — it never
deletes, resets or reorders one. If ufw is currently **inactive** and something
is listening on a port it would not allow, it **stops and shows you the list**
rather than enabling and cutting that service off. That is almost certainly your
other game, so read what it prints. To proceed after that:

```bash
sudo ufw allow <port>/tcp     # for each port your other service needs
sudo ufw enable
```

Or skip the firewall entirely — nothing else depends on it.

Log out and back in once (for the `docker` group), then:

```bash
./deploy/preflight.sh
```

---

## 2. Preflight — read this output

`preflight.sh` **changes nothing.** It reports what else is on the box, which
ports Mini Clash wants, whether they are taken and by what, whether your DNS
points here, and whether there is enough RAM and disk. It exits non-zero on a
conflict, and `deploy.sh` refuses to run until it passes.

It is the one thing to run whenever something surprises you.

---

## 3. Deploy

### If ports 80 and 443 are free

```bash
./deploy/deploy.sh
```

Caddy takes the edge, gets a certificate for `moba.pathlands.cc`, and serves the
client with `/api/*` and `/ws/*` on the same origin.

### If your other game already owns 80/443

```bash
./deploy/deploy.sh --behind-proxy
```

Nothing else — no extra argument. Preflight knows about this mode and stops
checking `:80`/`:443`, because in it Mini Clash never asks for them.

If `8090` is also busy, pick another: `EDGE_PORT=8091 ./deploy/deploy.sh
--behind-proxy`, or set `EDGE_PORT` in `.env` so it sticks.

Mini Clash's Caddy then binds **`127.0.0.1:8090` only** and never touches the
public ports, so **both games run at once**. Point your existing proxy at it:

**nginx**

```nginx
server {
  server_name moba.pathlands.cc;
  location / {
    proxy_pass http://127.0.0.1:8090;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;       # /ws/* is websockets —
    proxy_set_header Connection "upgrade";        # both lines are required
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

**Caddy**

```caddyfile
moba.pathlands.cc {
  reverse_proxy 127.0.0.1:8090
}
```

Your proxy terminates TLS; Mini Clash's Caddy speaks plain HTTP behind it. Two
things trying to get a certificate for one hostname would fight, and only the
one holding port 80 can win — so in this mode Mini Clash does not try.

### If you would rather they take turns

Stop the other stack yourself, then deploy normally:

```bash
docker compose -p <their-project-name> stop   # preflight prints the names
./deploy/deploy.sh
```

`stop` keeps their containers and volumes; `docker compose -p <name> start`
brings them back. **No script in `deploy/` will ever stop another project for
you** — that decision stays yours.

---

## 4. Day to day

```bash
./deploy/status.sh                # health, accounts, and a live ledger check
./deploy/logs.sh api              # follow one service (api|game|web|db|status)
./deploy/deploy.sh --pull         # git pull, rebuild, roll out
./deploy/backup.sh                # dump the database now
./deploy/start.sh                 # after a reboot
./deploy/stop.sh                  # stop, keeping all data
```

**Back up nightly.** Add to your crontab (`crontab -e`):

```cron
15 4 * * * cd /srv/mini-clash && ./deploy/backup.sh >> /var/log/mc-backup.log 2>&1
```

Keeps the newest 14 dumps in `backups/`, gzipped, and verifies each one is not
empty before trusting it. Copy them off the box if the data matters to you.

**Restore:**

```bash
./deploy/restore.sh backups/miniclash-20260726T041500Z.sql.gz
```

Stops the writers, takes a safety dump of what it is about to replace, then
loads the file. It asks you to type `RESTORE`.

**Status page** (uptime-kuma) is bound to loopback and needs no open port:

```bash
ssh -L 3001:localhost:3001 you@your-vps    # then open http://localhost:3001
```

---

## Sharing the box

### What Mini Clash creates

Everything runs under the compose project **`mini-clash`** — containers,
volumes and the network are all prefixed with it. Every `docker compose` call in
`deploy/` is scoped to that project, so none of them can see, stop or remove
another stack's anything.

| Resource | Name |
|---|---|
| Containers | `mini-clash-{api,db,game,web,status}-1` |
| Volumes | `mini-clash_{pg-data,caddy-data,caddy-config,kuma-data}` |
| Network | `mini-clash_default` |
| Host ports | `80` + `443` (or `127.0.0.1:8090` behind a proxy), plus `127.0.0.1:3001` |

### What it will never do

- No `docker system prune`, no `docker volume prune`, no unfiltered image prune.
  `deploy.sh` reclaims space with `docker image prune --filter
  label=com.docker.compose.project=mini-clash` — only its own dangling layers.
- No stopping, restarting or removing another project's containers.
- No deleting or resetting ufw rules; it only adds, and it will not enable ufw
  while that would cut off a listening port.
- No writing outside `/srv/mini-clash` except the Docker volumes above.

`./deploy/selftest.sh` checks these mechanically — 66 checks, including that the
project name is pinned, that no unscoped prune exists anywhere in `deploy/`, and
that the behind-proxy override really does bind neither 80 nor 443.

### The one genuinely destructive command

```bash
./deploy/stop.sh --destroy
```

Deletes **Mini Clash's** volumes — its database, its certificates. Scoped to the
`mini-clash` project, so it cannot reach your other game's data, but it is
unrecoverable for this one. It makes you type `DESTROY`. There is no flag
anywhere in `deploy/` that touches anything outside the project.

---

## When something is wrong

| Symptom | What to do |
|---|---|
| `port is already allocated` | `./deploy/preflight.sh` names the holder. Use `--behind-proxy`, or stop the other stack yourself. |
| No certificate / HTTPS fails | `dig +short moba.pathlands.cc` must return this box, and port 80 must reach Caddy. `./deploy/logs.sh web`. |
| The api will not start | `./deploy/logs.sh api`. Usually `DATABASE_URL` or a `db` container that has not finished starting — deploy waits 90 s for it. |
| Matches do not pay out | `MC_INTERNAL_SECRET` differs between the `api` and `game` containers, or is under 16 characters. `./deploy/logs.sh api` logs a rejected internal request with the reason. |
| Coins look wrong | `./deploy/status.sh` re-derives every balance from the transaction ledger and reports any that disagree. |
| Build killed (no error, just stops) | Out of memory — the asset pipeline and three bundles are the hungry step. Check `free -h`, then add swap and re-run: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`. Make it survive a reboot with `echo '/swapfile none swap sw 0 0' \| sudo tee -a /etc/fstab`. |
| `ENOENT not found: git`, or `Permission denied (publickey)`, during the build | Fixed — nothing in the dependency tree resolves over git any more. `git pull` and retry. If it comes back, `pnpm lockfile` names the package that reintroduced it. |
| Out of disk | `docker builder prune` clears build cache only and is safe on a shared box. |

---

## The two secrets

`.env` holds `POSTGRES_PASSWORD` and `MC_INTERNAL_SECRET`. **Neither is
recoverable.** Losing the first locks you out of your own database; losing the
second breaks the signed link between the game server and the api, and matches
stop paying out. `.env` is gitignored — keep a copy somewhere safe.

`MC_INTERNAL_SECRET` must be at least 16 characters. Below that the api
**refuses** to record matches rather than accepting unsigned ones: a
misconfigured deploy pays nobody, instead of letting anybody on the internet
post fabricated match results into your economy.
