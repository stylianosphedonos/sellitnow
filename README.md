# Sellitnow

E-commerce MVP - Node.js/Express API with SQLite (zero config).

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite (file-based, no server needed)
- **Auth:** JWT, bcrypt
- **Payments:** Stripe
- **Email:** Nodemailer

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start server

```bash
npm start
# or
npm run dev
```

The server auto-creates the database in `data/sellitnow.db`, runs migrations, and seeds sample products. No PostgreSQL needed.

API and website: `http://localhost:3000`

## Deploy on Render

This project is now Render-ready with persistent disk storage for SQLite and uploads.

### Option A: Blueprint (recommended)

1. Push this repo to GitHub.
2. In Render, create a new **Blueprint** and select this repository.
3. Render will use `render.yaml` to provision:
   - a Node web service
   - persistent disk mounted at `/var/data`
   - health check on `/health`
4. Set these environment variables in Render:
   - `API_BASE_URL` (your public Render URL/custom domain)
   - `CORS_ALLOWED_ORIGINS` (comma-separated frontend origins that can call the API)
   - Stripe/email variables if you use those features

### Option B: Manual Web Service

- **Build command:** `npm ci`
- **Start command:** `npm start`
- **Health check path:** `/health`
- Add a persistent disk mounted at `/var/data`
- Set env vars:
  - `NODE_ENV=production`
  - `STORAGE_ROOT=/var/data`
  - `UPLOAD_DIR=/var/data/uploads`
  - `SQLITE_DB_PATH=/var/data/data/sellitnow.db`
  - `UPLOAD_URL_PREFIX=/uploads`
  - `TRUST_PROXY=1`
  - `JWT_SECRET=<strong-random-secret>`
  - `CORS_ALLOWED_ORIGINS=https://your-domain`

The app listens on `PORT` automatically (provided by Render).

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/register | Register |
| GET | /api/v1/auth/verify-email?token= | Verify email |
| POST | /api/v1/auth/login | Login |
| POST | /api/v1/auth/logout | Logout (Bearer token required) |
| POST | /api/v1/auth/forgot-password | Request password reset |
| POST | /api/v1/auth/reset-password | Reset password (body: token, password) |
| GET | /api/v1/auth/me | Profile (auth required) |
| PATCH | /api/v1/auth/me | Update profile (auth required) |
| DELETE | /api/v1/auth/me | Delete account (auth required) |
| GET | /api/v1/auth/addresses | List addresses (auth required) |
| POST | /api/v1/auth/addresses | Add address (auth required) |
| PATCH | /api/v1/auth/addresses/:id | Update address (auth required) |
| DELETE | /api/v1/auth/addresses/:id | Delete address (auth required) |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/products | List products (pagination: page, limit) |
| GET | /api/v1/products/:id | Product by id or slug |

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/categories | List categories |
| GET | /api/v1/categories/:id | Category by id |
| GET | /api/v1/categories/:id/products | Products in category (pagination) |

### Cart

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/cart | Get cart |
| POST | /api/v1/cart/items | Add item (body: product_id, quantity) |
| PATCH | /api/v1/cart/items/:id | Update quantity (body: quantity) |
| DELETE | /api/v1/cart/items/:id | Remove item |

Use `X-Cart-Session` header for guest carts (UUID).

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/orders | Create order (body: shipping_address, guest_email?) Returns `guest_order_token` for guest checkouts |
| GET | /api/v1/orders | User orders (auth required) |
| GET | /api/v1/orders/:id | Order details (auth user, or guest order + `guest_token` query param) |

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/payments/process | Process payment (must belong to authenticated user, or guest order + guest_token) |
| POST | /api/v1/payments/create-intent | Create PaymentIntent (same ownership rules as above) |
| POST | /api/v1/payments/webhook | Stripe webhook |

### Admin (Bearer token, admin role)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/admin/products | Create product |
| PUT | /api/v1/admin/products/:id | Update product |
| DELETE | /api/v1/admin/products/:id | Delete product |
| POST | /api/v1/admin/categories | Create category |
| PUT | /api/v1/admin/categories/:id | Update category |
| GET | /api/v1/admin/orders | List orders (search by order_number/email) |
| GET | /api/v1/admin/orders/:id | Order details |
| PATCH | /api/v1/admin/orders/:id/status | Update status (body: status, tracking_number?) |
| GET | /api/v1/admin/orders/:id/invoice | Download invoice PDF |
| GET | /api/v1/admin/customers | List customers |
| GET | /api/v1/admin/customers/:id | Customer details |
| POST | /api/v1/admin/customers/:id/reset-password | Reset password (body: new_password) |
| POST | /api/v1/admin/users/:id/reset-password | Reset admin user password, including your own (body: new_password) |
| PATCH | /api/v1/admin/users/:id/status | Enable/disable any other user (body: is_active: boolean) |

## Cart Session

For guest checkout, send `X-Cart-Session` header with a UUID. The cart persists for 7 days. On login, merge guest cart with user cart by sending `X-Cart-Session` on login.

## Stripe Webhook

Configure webhook in Stripe Dashboard for `https://your-domain/api/v1/payments/webhook` and set `STRIPE_WEBHOOK_SECRET` in `.env`.

## License

MIT
