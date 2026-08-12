# WorkNest ERP

Production-oriented ERP portfolio project. **Phase 1** delivers the foundation: monorepo setup, PostgreSQL + Prisma, JWT auth, RBAC, organization structure, employees, audit logs, and an admin dashboard.

## Stack

| Area | Technology |
|------|------------|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript, Zod, Swagger |
| Database | PostgreSQL, Prisma |
| Auth | JWT access + refresh tokens, Argon2 password hashing |
| Tooling | npm workspaces, ESLint, Prettier, Vitest, Docker Compose |

## Monorepo layout

```
worknest/
├── apps/api          # Express REST API
├── apps/web          # Next.js admin UI
├── packages/types    # Shared TypeScript contracts
├── packages/config   # Shared TS/ESLint config
├── docker/           # Postgres init scripts
└── docker-compose.yml
```

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (local install **or** Docker)
- npm 10+

## Quick start

### 1. Environment

```bash
cp .env.example .env
cp .env.example apps/api/.env
```

Update `DATABASE_URL` to match your PostgreSQL credentials.

Seed admin credentials (defaults in `.env.example`):

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

### 2. Database

**Option A — Docker**

```bash
docker compose up -d
```

**Option B — Local PostgreSQL**

```sql
CREATE DATABASE worknest;
```

Then set `DATABASE_URL` accordingly, for example:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/worknest?schema=public
```

### 3. Install & migrate

```bash
npm install
npm run db:generate
npm run db:migrate:dev -- --name init
npm run db:seed
```

### 4. Run

```bash
# terminal 1
npm run dev:api

# terminal 2
npm run dev:web
```

- Web: http://localhost:3000
- API: http://localhost:4000/api
- Swagger: http://localhost:4000/api/docs

Login with the seeded admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## Phase 1 modules

- Authentication (`/api/auth/*`)
- Users, Roles, Permissions (RBAC)
- Departments, Positions, Employees
- Audit logs

## Phase 2 — Admin CRUD

Complete admin UI for foundation modules:

- Create / edit / delete for users, roles, departments, positions, employees
- Assign roles to users
- Assign permissions to roles
- Permissions remain a read-only catalog (assign via roles)
- Delete guards (self-delete, Super Admin role, departments/positions in use)

**Not in Phase 2:** inventory, purchasing, sales, invoices, payments, accounting.

## Phase 3 — Procurement & Inventory

Simple buy-and-stock flow (no invoices, payments, sales, or multi-warehouse transfers):

1. Products, Suppliers, Warehouses
2. **Purchase requisition** (Draft → Submit → Approve / Reject)
3. **Convert approved requisition** → draft Purchase Order (pick supplier + prices)
4. Submit PO (Ordered) → Receive goods → stock goes up + movement logged
5. Manual stock adjust when needed

API routes: `/api/products`, `/api/suppliers`, `/api/warehouses`, `/api/inventory/*`, `/api/purchase-requisitions/*`, `/api/purchase-orders/*`

After pulling, run:

```bash
npx prisma migrate deploy
npm run db:seed
```

(from `apps/api`, or use the workspace scripts). Re-seed so Super Admin gets the new permissions.

**Skipped for later:** AP/accounting, sales/SO, multi-level approvals, transfers between warehouses.

## Typing Test (Training)

Minimal typing speed game integrated into the ERP:

- **Typing Test** — time (15/30/60/120s) or word (25/50/100) modes, virtual keyboard
- **Leaderboard** — global / weekly / monthly with filters
- **My Statistics** — personal bests, averages, recent tests

Flow: client-side typing → submit final result only → PostgreSQL via `/api/typing-tests/*`

Permissions: `typing-tests.view`, `typing-tests.play`

After pulling:

```bash
npx prisma migrate deploy
npm run db:seed
```

Log out/in to refresh permissions.

## File Manager

Media library at `/file-manager` with nested folders, image uploads, search, copy/cut/paste, and RBAC (`media.view`, `media.create`, `media.update`, `media.delete`).

After pulling, run:

```bash
npm run db:migrate:dev -- --name media_library
npm run db:seed
```

Set `UPLOAD_DIR` and `MEDIA_PUBLIC_BASE_URL` in `.env` (see `.env.example`).

## RBAC

Permissions use `resource.action` keys (for example `employees.view`, `roles.assign`).

- Backend: `requireAuth()` + `requirePermission('…')` middleware
- Frontend: sidebar visibility only — **not** security

## API response shape

Success:

```json
{ "success": true, "data": {} }
```

Error:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "details": {} }
}
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:api` | API watch mode |
| `npm run dev:web` | Next.js dev server |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | Lint workspaces |
| `npm test` | API unit + integration tests |
| `npm run db:seed` | Idempotent seed |

## Testing

```bash
npm test
```

Covers password hashing, audit redaction, login, permission enforcement, employee creation, role assignment, and audit logging.

## Security notes

- Never commit `.env`
- Passwords are hashed with Argon2id
- Refresh tokens are stored hashed
- Audit logs redact passwords/tokens
