# Deployment status

- Production runs `main` (`8318b9e`) on Render, deployed manually. **Not changed in this session.**
- Phases 02–10 and the consolidation are **not deployed**.
- How to deploy (after owner approval only): `docs/DEPLOY.md`, `docs/phase-10/RELEASE_CANDIDATE.md` (checklist, new
  environment variables, rollback), `render.yaml`.
- Rollback: redeploy the previous Render deploy or `8318b9e`. Database changes are additive. Before deploying, take a
  manual Render disk snapshot and make sure Litestream is current.
- After deploying: `npm run deploy:check -- <url>`, `/readyz`, Founder Console > Reliability, and T-053, T-055, T-057
  and T-060.
