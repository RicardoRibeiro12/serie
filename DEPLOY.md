# Deploy: Netlify (site + app) and Fly.io (API)

```
browser ──► Netlify  /            public pages (landing/)
                     /app/        the app (frontend/), noindex
                     /app/api/*  ──signed proxy──►  Fly.io  serie-api  (api/, data on a volume)
```

Every request Netlify forwards carries a signature made with `EDGE_PROXY_SECRET`. The API
refuses anything unsigned, so the `fly.dev` address is not a way in. No secret is in the
repository: both platforms keep it as an environment variable.

## One time

1. **Secret.** Make one long random value and keep it in your password manager:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
2. **Netlify.** Add new site → Import from GitHub → this repository. Build settings come from
   `netlify.toml`. In Site configuration → Environment variables add `EDGE_PROXY_SECRET`.
   Note the site address (`something.netlify.app`).
3. **Fly.io.** Install `flyctl`, then from `api/`:
   ```bash
   fly launch --no-deploy --copy-config
   ```
   ```bash
   fly volumes create serie_data --size 1 --region cdg
   ```
   ```bash
   fly secrets set EDGE_PROXY_SECRET=the-same-value
   ```
   In `api/fly.toml` replace `SITE.netlify.app` (twice) with the Netlify address, then:
   ```bash
   fly deploy
   ```
4. **Your admin account.** Open `https://<site>/app/`, create your profile with a password. As
   the first profile it becomes the admin (`FIRST_USER_ADMIN`).
5. **Close signup.** Now only invite codes (yours or a trainer's) create accounts:
   ```bash
   fly secrets set INVITE_ONLY=1
   ```
6. **Trainers.** Admin dashboard → the person → Make trainer.

## Every change

Push to `main`: Netlify rebuilds the site and app. API changes: `cd api && fly deploy`.

## Checks after a deploy

- `https://<site>/` and `/sobre/` load; `/app/` opens the sign-in screen.
- `https://serie-api.fly.dev/api/me` answers 403 (unsigned), `https://<site>/app/api/health` answers 200.
- No `.map` files are served under `/app/assets/`.
