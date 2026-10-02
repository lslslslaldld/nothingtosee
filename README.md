# Polaris

Polaris is a Node-served, invite-gated proxy portal. Its account database is stored in `data/polaris.json`; that directory is excluded from version control and static web access.

## Start

```sh
npm install
npm run all-in-one
```

On first startup, the server creates the `admin` username and prints a randomly generated password once in the server output. To choose the initial username or password yourself, set `POLARIS_ADMIN_USERNAME` or `POLARIS_ADMIN_PASSWORD` before the first startup. `POLARIS_DATA_DIR` can also be set. Keep the data directory backed up and private.

The all-in-one command checks for and installs the Rammerhead, Ultraviolet, Scramjet, and Bare Server packages if they are missing. The portal's Proxy page checks all configured engine routes concurrently and opens the fastest healthy route. Configure health and launch URLs in admin Settings. The engine packages provide proxy implementations; a deployment still needs reachable launch routes and must follow the engines' own hosting requirements.

## Access

Accounts use usernames only; no email address is required or used to sign in. Admins can manage accounts in Accounts and configure domain routes, proxy auto-configuration, invitation codes, and the shared game catalog in Settings. The Games page starts with a catalog of portals; admins can add, edit, and remove each game's name, destination URL, and icon. Each invitation has an expiry in hours (or no expiry) and a maximum number of redemptions. Every account created with an invitation is a member. Members can search and open Games, use the auto-picking Proxy page, and manage their own username and password in User settings.

This lightweight server is intended for a trusted local demo. Use HTTPS and a production-grade identity/database setup before exposing it to untrusted networks.