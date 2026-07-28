# Authentication & Security — audit notes

## What's in place (verified with tests)
- **Passwords**: hashed with scrypt + a per-user random salt. Plain passwords are
  never stored. Comparison uses a timing-safe check.
- **Sessions**: random 24-byte token in an **HttpOnly**, **SameSite=Lax** cookie
  (not readable by page scripts; basic CSRF mitigation).
- **Role gates** (all return 403 to the wrong role — tested):
  - `/api/admin/*` → Super Admin only
  - `/api/faculty` (results) → admin or sub-admin, and sub-admins are **scoped**
    to their assigned batches
  - student actions (submit, dashboard, tests, 100-days, solutions) → require login
- **Solution viewing**: gated — a student must have attempted a problem first.
- **Input validation**: name/email/password required; password min length 4;
  duplicate emails rejected.
- **First-user bootstrap**: only the first account becomes admin; public sign-ups
  are always students.

## Known limitations → production hardening
- **Sessions are in memory**: everyone must log in again after a server restart,
  and it won't work across multiple server instances. Move sessions to the DB or
  Redis for scale.
- **Add `Secure` cookie flag** once served over HTTPS (on deploy).
- **Add login rate-limiting** to slow brute-force attempts.
- **Self-service password reset** needs an email provider (SendGrid/Resend/etc.).
  Today an **admin resets** any user's password from the Students / Sub-Admins
  screens; the login page tells users to ask their admin.
- **Untrusted code isolation**: for a large public rollout, run each submission in
  its own container (see docs/deployment.md).
