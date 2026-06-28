# Kanflow

Kanflow is a modern Single Page Application (SPA) for task management using Kanban methodology. It is built with ASP.NET Core and a vanilla JavaScript frontend.

**Live demo:** [www.kanflow.online](https://www.kanflow.online)

Teams and individuals can visualize work, collaborate on shared boards, and track tasks with due dates, comments, and calendar views.

## Key Features

- **Kanban boards** — Drag-and-drop cards across columns (SortableJS)
- **Secure authentication** — Cookie-based auth with BCrypt password hashing, email OTP verification, and Cloudflare Turnstile bot protection
- **SPA architecture** — Single-page experience powered by ASP.NET Core MVC and fetch API
- **Email integration** — Verification codes and board invitations via Azure Communication Email
- **Collaboration** — Board invites, member management, notifications, and card comments
- **Quick notes** — Personal notes alongside board work
- **Responsive design** — Works on desktop and mobile

## Tech Stack

### Backend

- **Framework:** ASP.NET Core (.NET 10)
- **Architecture:** N-layer (Controllers → Services → Repositories)
- **ORM:** Entity Framework Core
- **Database:** SQL Server
- **Authentication:** Custom cookie auth with security stamp validation
- **Security:** CSRF (antiforgery), HSTS, CSP, rate limiting, HTML sanitization, OTP encryption at rest

### Frontend

- **Type:** Single Page Application (SPA)
- **Libraries:** Vanilla JavaScript (ES6+), SweetAlert2, Quill, FullCalendar, SortableJS
- **Assets:** `wwwroot/js/site.js`, `wwwroot/css/site.css` (no build step)
- **Communication:** JSON API calls to MVC controller actions

### Frontend features

- Card search with `/` keyboard shortcut
- New card shortcut (`N`)
- Offline detection toasts
- Optimistic drag-and-drop with rollback on error
- Last opened board remembered in `localStorage`

## Project Structure

```
Kanban/
├── Controllers/     # MVC controllers (Home, Auth, Kanban, Error)
├── Entities/        # EF Core entities and DbContext
├── Models/          # DTOs and view models
├── Repositories/    # Data access layer
├── Services/        # Business logic (Kanban, User, Email, Turnstile)
├── Security/        # OTP encryption, input sanitization, avatar whitelist
└── wwwroot/         # Static assets (site.js, site.css)
```

## Configuration

Copy settings into `appsettings.Development.json` (gitignored) or your deployment environment:

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
    "SecretKey": "<cloudflare-turnstile-secret>"
  }
}
```

## Getting Started

```bash
cd Kanban
dotnet restore
dotnet run
```

Open `https://localhost:5001` (or the URL shown in the console).

### Frontend development

Edit static assets directly under `Kanban/wwwroot/`:

- `js/site.js` — application logic
- `css/site.css` — styles

No Node.js or npm is required. Changes are picked up on refresh (or after restart in production with cache busting via `asp-append-version`).

## Security Notes

- Auth endpoints are rate-limited per IP (login/reset: 10/min, OTP: 5/15 min, general API: 120/min)
- OTP codes are generated with `RandomNumberGenerator` (cryptographically secure)
- **OTP at rest:** Codes are encrypted with ASP.NET Data Protection (`Kanflow.OtpCode.v1`) before being stored in the database; validation decrypts them with timing-safe comparison. Legacy plaintext rows (6-digit) remain readable until they expire.
- OTP brute-force protection: 5 failed attempts per email within 15 minutes
- Turnstile verification is cached per email/purpose for 10 minutes; consumed only after successful register or password reset
- Card descriptions are sanitized server-side (HtmlSanitizer); highlight/calendar colors must be valid `#RRGGBB` hex
- Avatar filenames are validated against a server-side whitelist
- Session cookies are HttpOnly, Secure, and SameSite=Strict
- Content Security Policy restricts script, frame, and image sources; `Referrer-Policy` and `Permissions-Policy` headers are set
- **IIS / app pool recycle:** Data Protection keys are persisted under `App_Data/DataProtection-Keys` so auth cookies and OTP encryption survive process restarts. On production, ensure the app pool identity has read/write access to this folder (or set `DataProtection:KeysPath` in config to a fixed path such as `C:\ProgramData\Kanflow\DataProtection-Keys`).

## License

Developed by [Bedirhan Alşan](https://bedirhanalsan.com).
