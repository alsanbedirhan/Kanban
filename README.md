# Kanflow

Kanflow is a Kanban task board built with ASP.NET Core and vanilla JavaScript. One page, no build step — boards, cards, collaboration, and auth run through JSON API calls to MVC controllers.

**Live:** [kanflow.online](https://www.kanflow.online)

## Features

### Boards & cards
- Drag-and-drop columns and cards (SortableJS)
- Rich card descriptions (Quill), due dates, highlight/calendar colors, assignees
- Card search (`/`) and quick new-card shortcut (`N`)
- Optimistic drag-and-drop with rollback on failure
- Last opened board remembered in `localStorage`
- Polling for board updates and notification badges

### Collaboration
- Shared boards with member list, invites, and owner promotion
- Email invitations with signed JWT activation links
- In-app notifications
- Card comments with server-side HTML sanitization

### Account
- Register and password reset via email OTP
- Login with BCrypt password hashing
- Cloudflare Turnstile on login, OTP request, register, and reset flows
- Quick notes (personal scratchpad)
- Avatar picker from a server-side whitelist

### UX & reliability
- Responsive layout for desktop and mobile
- Offline detection toasts
- Centralized JSON error handling for API calls

## Tech stack

| Layer | Choices |
|-------|---------|
| Runtime | .NET 10, ASP.NET Core MVC |
| Data | SQL Server, Entity Framework Core |
| Auth | Cookie authentication + security stamp validation |
| Email | Azure Communication Email |
| Frontend | Vanilla JS (ES6+), SweetAlert2, Quill, FullCalendar, SortableJS |
| Security | CSRF (antiforgery), HSTS, CSP, rate limiting, HtmlSanitizer |

## Project structure

```
Kanban/
├── Controllers/       Home, Auth, Kanban, Error
├── Entities/          EF Core entities and KanbanDbContext
├── Models/            DTOs, view models, ServiceResult
├── Repositories/      Data access
├── Services/          Business logic (Kanban, User, Email, Turnstile)
├── Security/          Input sanitization, OTP/login limits, avatar whitelist
├── Views/Home/        SPA shell (Index.cshtml)
└── wwwroot/           site.js, site.css, avatars
```

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- SQL Server (local or remote)
- Azure Communication Email connection string (for OTP and invites)
- Cloudflare Turnstile site key + secret key

## Configuration

Create `Kanban/appsettings.Development.json` (gitignored) or set values in your deployment environment:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=.;Database=KanbanDB;Trusted_Connection=True;TrustServerCertificate=True;"
  },
  "EmailSettings": {
    "ConnectionString": "<azure-communication-email-connection-string>",
    "SenderEmail": "noreply@yourdomain.com",
    "Domain": "kanflow.online"
  },
  "JwtSettings": {
    "Key": "<secret-key-min-32-chars>",
    "Issuer": "kanflow",
    "Audience": "kanflow",
    "ExpireMinutes": 60
  },
  "TurnstileSettings": {
    "SiteKey": "<cloudflare-turnstile-site-key>",
    "SecretKey": "<cloudflare-turnstile-secret-key>"
  },
  "DataProtection": {
    "KeysPath": "C:\\ProgramData\\Kanflow\\DataProtection-Keys"
  }
}
```

| Setting | Purpose |
|---------|---------|
| `ConnectionStrings:DefaultConnection` | SQL Server database |
| `EmailSettings` | OTP codes and board invite emails |
| `JwtSettings` | Signed tokens in board invite links (not session auth) |
| `TurnstileSettings:SiteKey` | Rendered in the login/register/OTP modals |
| `TurnstileSettings:SecretKey` | Server-side Turnstile verification |
| `DataProtection:KeysPath` | Persistent antiforgery/auth cookie keys (see below) |

## Getting started

```bash
git clone <repo-url>
cd Kanban/Kanban
dotnet restore
dotnet run
```

Open `https://localhost:7281` (or the URL printed in the console).

The app expects an existing SQL Server schema matching the EF entities in `Entities/`. There are no bundled migrations in this repository.

### Frontend development

Edit assets directly — no Node.js or npm required:

- `wwwroot/js/site.js` — application logic
- `wwwroot/css/site.css` — styles

Static files are cache-busted in production via `asp-append-version`.

## Production deployment

### Reverse proxy / IIS

The app calls `UseForwardedHeaders()` so `X-Forwarded-Proto` and `X-Forwarded-For` from IIS, Cloudflare, or another reverse proxy are honored. Without this, HTTPS requests can be treated as HTTP and cookies may be set incorrectly.

Ensure your proxy forwards:

- `X-Forwarded-Proto: https`
- `X-Forwarded-For` (client IP, for rate limiting)

### Data Protection keys

Auth and antiforgery cookies depend on persisted Data Protection keys. By default they are stored under `App_Data/DataProtection-Keys` inside the content root.

For production, set `DataProtection:KeysPath` to a **writable folder outside the publish directory** (for example `C:\ProgramData\Kanflow\DataProtection-Keys`). If keys are lost on every app pool recycle, all users are logged out and CSRF tokens become invalid until they refresh.

### OTP storage

Verification codes are stored as SHA-256 hashes (Base64, 44 characters). The `UserVerifications.Code` column must allow at least 44 characters:

```sql
ALTER TABLE UserVerifications ALTER COLUMN Code NVARCHAR(44) NOT NULL;
```

## Security

| Area | Behavior |
|------|----------|
| Rate limits | Login/reset: 10/min (sliding); OTP send: 5/15 min; register/reset complete: 8/min; general auth: 30/min; API: 120/min — all per IP |
| OTP generation | `RandomNumberGenerator` (6-digit codes) |
| OTP at rest | SHA-256 hash; compared with timing-safe `FixedTimeEquals` |
| OTP brute force | 5 failed attempts per email within 15 minutes |
| Turnstile | Verified on login and OTP flows; register/reset require a prior verified session cached per email + purpose |
| Passwords | BCrypt hashing |
| Sessions | HttpOnly `Kanflow.Auth` cookie, Secure in production, SameSite=Strict; stamp revalidated against DB on each request |
| CSRF | Double-submit cookie (`XSRF-TOKEN` header); token refreshed before every mutating request |
| Content | Card descriptions sanitized (HtmlSanitizer); colors validated as `#RRGGBB`; avatar filenames whitelisted |
| Headers | CSP, HSTS, `Referrer-Policy`, `Permissions-Policy` |

Auth endpoints (`Login`, `VerifyWork`, `Register`, `ResetPassword`, `Logout`) are marked `[AllowAnonymous]` so unauthenticated clients are not rejected before CSRF validation.

## License

Developed by [Bedirhan Alşan](https://bedirhanalsan.com).
