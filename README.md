# 🌾 Git Granary

**Git Granary** is a [Git Large File Storage](https://git-lfs.com) (LFS) server implementation written in TypeScript (sorry).

Git Granary was designed for self-hosted personal use. See my [introduction blog post](https://dbushell.com/2024/07/25/git-granary/).

⚠️ Work in progress! ⚠️

## Security and Configuration

[Basic HTTP authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication#basic_authentication_scheme) is used for initial requests. Running behind a HTTPS proxy like [Caddy](https://caddyserver.com) or [Traefik](https://traefik.io/traefik/) is *strongly recommended*. Short-lived single use tokens are generated for each download & upload operation.

### Server Configuration

Basic auth username and password are configured using `GGLFS_USERNAME` and `GGLFS_PASSWORD` environment variables.

For HTTPS reverse proxies set `GGLFS_ORIGIN` to a full URL, e.g. `https://lfs.example.com`. If defined the server will only respond to proxies that set `x-forwarded` headers.

See `.env.example` for all config options.

### Client Configuration

Git clients can be configured with `.lfsconfig`:

```ini
[lfs]
	url = http://user:pass@localhost:8000/repo
```

Or `git config` command:

```shell
git config lfs.url 'http://user:pass@localhost:8000/repo'
```

See the [Git LFS documentation](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.adoc) for full client configuration.

## JavaScript Runtimes

Git Granary is coded with cross-runtime JavaScript where possible. Adapters are used for runtime specific APIs like filesystem access and HTTP servers.

Deno is the primary full featured implementation. Bun and Node adapters are minimum viable implementations.

## Notes

No Windows support because the server assumes posix paths. It might run under WSL. I don't know, I don't care.

No affordances are made for Git clients that fail to conform to the specification.

* * *

[MIT License](/LICENSE) | Copyright © 2024 [David Bushell](https://dbushell.com)
