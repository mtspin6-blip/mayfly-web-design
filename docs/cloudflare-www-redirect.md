# One-time: redirect www to the bare domain (Cloudflare)

STATUS 2026-09-30: `curl -sI https://www.mayflywebdesign.com/blog/` already returned `301` to the bare domain, so this
may already be set up (check Cloudflare **Rules -> Redirect Rules**, or Pages **Custom domains**). If the curl check
below passes, skip the steps.

Why: Google was indexing both `www.mayflywebdesign.com` and `mayflywebdesign.com`, which splits
ranking signals. The site now canonicalizes everything to `https://mayflywebdesign.com/`, but a
real 301 redirect finishes the job. Cloudflare Pages can't do host-level redirects from
`_redirects`, so this is a dashboard setting (about 3 minutes, free).

## Steps

1. Cloudflare dashboard → your `mayflywebdesign.com` zone → **DNS** → **Records**.
   Make sure a record exists for `www` (type **CNAME**, target `mayflywebdesign.com`, **Proxied** = orange cloud).
   If it's missing, add it. Without the orange cloud, the redirect can't run.
2. **Rules** → **Redirect Rules** → **Create rule** → *Custom filter expression*.
3. Name: `www to apex`.
4. When incoming requests match: **Hostname** *equals* `www.mayflywebdesign.com`
   (or, in the expression editor: `(http.host eq "www.mayflywebdesign.com")`).
5. Then: **Dynamic** redirect.
   - Expression: `concat("https://mayflywebdesign.com", http.request.uri.path)`
   - Status code: **301**
   - Turn on **Preserve query string**.
6. **Deploy**.

## Verify

```bash
curl -sI https://www.mayflywebdesign.com/blog/ | grep -iE "^HTTP|^location"
```

Expected: `HTTP/2 301` and `location: https://mayflywebdesign.com/blog/`.

## Search Console

- Use a **Domain property** for `mayflywebdesign.com` (covers www and non-www together).
- After the redirect is live, in the old `www` URL-prefix property (if you have one), nothing else is needed.
  Google will consolidate over a few weeks.
