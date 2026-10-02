# Polaris

Polaris is a Node-served, invite-gated proxy portal. Its account database is stored in `data/polaris.json`; that directory is excluded from version control and static web access.

## Start

```sh
npm install
npm run all-in-one
```

On first startup, the server creates the `admin` username and prints a randomly generated password once in the server output. To choose the initial username or password yourself, set `POLARIS_ADMIN_USERNAME` or `POLARIS_ADMIN_PASSWORD` before the first startup. `POLARIS_PUBLIC_URL` can override the detected public origin; `POLARIS_DATA_DIR` can set the data directory. Keep the data directory backed up and private.

The all-in-one command checks for and installs the Rammerhead, Ultraviolet, Scramjet, and Bare Server packages if they are missing. Admin Settings > Proxy > Auto configure detects the active Codespaces forwarded hostname, the IP used to open Polaris, or the VM's public IPv4 and updates localhost/private launch URLs. It checks routes server-side and prioritizes the fastest healthy route. Configure health and launch URLs in admin Settings. The engine packages provide proxy implementations; a deployment still needs reachable launch routes and must follow the engines' own hosting requirements.

The HTML interface is a single file, but authentication and server-side route checks require `server.js`; opening `index.html` directly with `file://` does not provide the API. For single-file deployments, serve it through Polaris using the machine's IP address.

## Access

Accounts use usernames only; no email address is required or used to sign in. Admins can manage accounts in Accounts and configure domain routes, proxy auto-configuration, invitation codes, and the shared game catalog in Settings. The Games page starts with a catalog of portals; admins can add, edit, and remove each game's name, destination URL, and icon. Each invitation has an expiry in hours (or no expiry) and a maximum number of redemptions. Every account created with an invitation is a member. Members can search and open Games, use the auto-picking Proxy page, and manage their own username and password in User settings.

This lightweight server is intended for a trusted local demo. Use HTTPS and a production-grade identity/database setup before exposing it to untrusted networks.