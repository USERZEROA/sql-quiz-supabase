# Apply the extra-credit update

The full instructions are in [docs/upgrade-extra-credit.md](docs/upgrade-extra-credit.md). Keep the existing `.env.local`, CA file and lockfile. No new credentials or package dependencies are needed.

Apply database migration 04 before using the updated API. Run verification 05, then the three npm checks. Only deploy after those checks pass.
