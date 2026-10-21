# Kanflow

Kanflow is a Kanban task board built with ASP.NET Core and vanilla JavaScript. One page, no build step — boards, cards, collaboration, and auth run through JSON API calls to MVC controllers.

**Live:** [kanflow.online](https://kanflow.online)

## Features

### Boards & cards
- Drag-and-drop cards between columns (SortableJS)
- Rich card descriptions (Quill), due dates, highlight/calendar colors, assignees
- Calendar view for cards with due dates (FullCalendar)
- Card search (`/`) and quick new-card shortcut (`N`)
- Optimistic drag-and-drop with rollback on failure
- A card can be moved, edited, or deleted only by its assignee (or by its creator while unassigned)
- Board owners manage columns, the board title, and members; other members can leave the board
- Last opened board remembered in `localStorage`
- Live board and notification updates over SignalR (`/hubs/board`), with polling as a fallback while disconnected

### Collaboration
- Shared boards with member list, invites, and owner promotion
- Email invitations with signed JWT links (72 h); opening a link shows a confirmation, accepting is a separate POST
- In-app notifications
- Card comments (stored as plain text, HTML-encoded on output)

### Account
- Register and password reset via email OTP
- Login with BCrypt password hashing
- Change or reset password (signs out every session of the account)
- Cloudflare Turnstile on login, OTP request, register, and reset flows
- Quick notes (personal scratchpad, up to 50 notes per user)
- Avatar picker from a server-side whitelist
- Sample board created automatically on first registration

### UX & reliability
- Responsive layout for desktop and mobile
- Light and dark theme: System / Light / Dark switch in the profile menu; "System" follows `prefers-color-scheme`. The choice is stored in the `kanflow-theme` cookie and rendered on the server as `<html data-theme>`, so the page never flashes the wrong theme
- SVG icons (Lucide sprite) instead of emoji, so icons look the same on every platform
- Due-date chips on cards ("Due tomorrow", "2 days overdue"); columns load more cards automatically while scrolling
- Installable PWA (`manifest.json`, theme color, app icons incl. a padded maskable icon)
- Service worker (`wwwroot/sw.js`): caches static assets (libraries, versioned CSS/JS, icons) and shows `offline.html` when the app is opened without a connection; pages, API calls, SignalR and auth are never cached. Bump `CACHE` in `sw.js` to clear old caches
- Offline detection toasts (connection lost / back online)
- Central exception handler (`ApiExceptionHandler`): errors are logged and API calls get a JSON `{ success, errorMessage }` response

### Limits

| Item | Limit |
|------|-------|
| Boards created per user | 10 |
| Columns per board | 10 |
| Cards per board | 200 |
| Members per board | 10 |
| Invitations | 10 per board and 20 per sender per day |
| Verification codes | 3 per email address per day |
| Outgoing emails (all types) | `EmailSettings:DailyLimit` per day (default 250), counted from the database so restarts do not reset it |
| Comment length | 400 characters |
| Quick notes | 50 per user, 5000 characters each |

## Tech stack

| Layer | Choices |
|-------|---------|
| Runtime | .NET 10, ASP.NET Core MVC |
| Data | SQL Server, Entity Framework Core |
| Auth | Cookie authentication + security stamp validation |
| Realtime | ASP.NET Core SignalR |
| Email | Azure Communication Email |
| Frontend | Vanilla JS (ES6+), SweetAlert2, Quill, FullCalendar, SortableJS, DOMPurify, SignalR client |
| Security | CSRF (antiforgery), HSTS, CSP, host filtering, rate limiting, HtmlSanitizer, DOMPurify |

## Project structure

```
Kanban/
├── Controllers/       Home, Auth, Kanban, Error
├── Entities/          EF Core entities and KanbanDbContext
├── Hubs/              SignalR BoardHub (live board/notification updates)
├── Models/            DTOs, view models, ServiceResult
├── Repositories/      Data access
├── Services/          Business logic (Kanban, User, Email, Turnstile, BoardNotifier)
├── Security/          Input sanitization, OTP/login limits, avatar whitelist
├── Views/Home/        SPA shell (Index.cshtml)
├── wwwroot/           site.js, site.css, icons, manifest.json
│   └── lib/           Self-hosted third-party libraries (pinned versions)
├── ApiExceptionHandler.cs   Global exception handling and logging
└── AuthRecovery.cs          Stale-session cleanup and JSON/HTML auth responses
```

Avatar filenames are whitelisted in `Security/AvatarNames.cs` and loaded from `wwwroot/avatars/{name}.svg`. Add the matching SVG files under `wwwroot/avatars/` for the picker to render correctly.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- SQL Server (local or remote)
- Azure Communication Email connection string (for OTP and invites)
- Cloudflare Turnstile site key + secret key

## Configuration

The committed `appsettings.json` only sets `AllowedHosts` and lists the other settings as commented placeholders. Create `Kanban/appsettings.Development.json` (gitignored) or set values in your deployment environment:

```json
{
  "AllowedHosts": "localhost",
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
    "InviteExpireHours": 72
  },
  "ForwardedHeaders": {
    "KnownNetworks": [ "<proxy-cidr>" ]
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
| `AllowedHosts` | Accepted `Host` headers; production uses `kanflow.online;www.kanflow.online`, development `localhost` |
| `ConnectionStrings:DefaultConnection` | SQL Server database |
| `EmailSettings` | OTP codes and board invite emails |
| `EmailSettings:Domain` | Hostname used in invite email links and in the CSP `connect-src` for the SignalR WebSocket |
| `JwtSettings` | Signing key for board invite links (not session auth); `InviteExpireHours` defaults to 72 |
| `ForwardedHeaders:KnownNetworks` | Extra proxy CIDRs whose `X-Forwarded-For` is trusted (loopback is always trusted) |
| `TurnstileSettings:SiteKey` | Rendered in the login/register/OTP modals |
| `TurnstileSettings:SecretKey` | Server-side Turnstile verification |
| `DataProtection:KeysPath` | Persistent antiforgery/auth cookie keys (see below) |

Board invite JWTs expire after `JwtSettings:InviteExpireHours` (default **72 hours**).

## Getting started

```bash
git clone <repo-url>
cd Kanban/Kanban
dotnet restore
dotnet run
```

Open `https://localhost:7281` (or the URL printed in the console). The default HTTPS profile also listens on `http://localhost:5199`.

The repository has no migrations; the app expects a SQL Server schema matching the entities in `Entities/`. For an empty database you can generate one from the model:

```bash
dotnet tool restore
dotnet ef migrations add InitialCreate
dotnet ef database update
```

### Frontend development

Edit assets directly — no Node.js or npm required:

- `wwwroot/js/site.js` — application logic
- `wwwroot/css/site.css` — styles

Static files are cache-busted in production via `asp-append-version`.

Third-party libraries are self-hosted with pinned versions under `wwwroot/lib` (the CSP allows no script CDNs). To upgrade one, download the new version into a new versioned folder and update the tag in `Views/Home/Index.cshtml`:

| Library | Version | File |
|---------|---------|------|
| SweetAlert2 | 11.26.25 | `lib/sweetalert2-11.26.25/sweetalert2.all.min.js` |
| Quill | 1.3.6 | `lib/quill-1.3.6/quill.min.js`, `quill.snow.css` |
| FullCalendar | 6.1.11 | `lib/fullcalendar-6.1.11/index.global.min.js` |
| SortableJS | 1.15.0 | `lib/sortablejs-1.15.0/Sortable.min.js` |
| DOMPurify | 3.1.6 | `lib/dompurify-3.1.6/purify.min.js` |
| SignalR client | 10.0.11 | `lib/signalr-10.0.11/signalr.min.js` |
| Lucide icons | 1.51.0 | `lib/lucide-1.51.0/sprite.svg` (only the icons the app uses; add a `<symbol>` from `lucide-static` to use another, then bump `CACHE` in `sw.js` because `/lib/` files are served cache-first) |

## Production deployment

### WebSockets on IIS

Live updates use SignalR. Enable the **WebSocket Protocol** feature in IIS (Server Manager → Web Server → Application Development); without it SignalR falls back to Server-Sent Events or long polling, which still works but is less efficient.

### Reverse proxy / IIS

The app calls `UseForwardedHeaders()` so `X-Forwarded-Proto` and `X-Forwarded-For` from a reverse proxy are honored. Without this, HTTPS requests can be treated as HTTP and cookies may be set incorrectly.

These headers are trusted **only from known proxies**: loopback by default (IIS/ANCM, a local reverse proxy), plus any CIDR in `ForwardedHeaders:KnownNetworks`. Behind Cloudflare or another remote proxy, add its published IP ranges there; otherwise every request appears to come from the proxy and per-IP rate limits apply to all users together. Trusting every source would let clients spoof their IP and bypass the limits.

Ensure your proxy forwards:

- `X-Forwarded-Proto: https`
- `X-Forwarded-For` (client IP, for rate limiting)

`www` hostnames are permanently redirected to the bare domain via `UseRewriter`.

### Data Protection keys

Auth and antiforgery cookies depend on persisted Data Protection keys. By default they are stored under `App_Data/DataProtection-Keys` inside the content root.

For production, set `DataProtection:KeysPath` to a **writable folder outside the publish directory** (for example `C:\ProgramData\Kanflow\DataProtection-Keys`). If keys are lost on every app pool recycle, all users are logged out and CSRF tokens become invalid until they refresh.

## Security

| Area | Behavior |
|------|----------|
| Rate limits | Login: 10/min (sliding); OTP send: 5/15 min; register/reset complete: 8/min; general auth: 30/min — per IP. API and Home endpoints: 120/min each per signed-in user (per IP when anonymous) |
| OTP generation | `RandomNumberGenerator` (6-digit codes) |
| OTP at rest | SHA-256 hash; compared with timing-safe `FixedTimeEquals` |
| OTP brute force | 5 failed attempts per email within 15 minutes |
| Login brute force | 5 failed attempts per email within 15 minutes |
| Turnstile | Verified on login and OTP flows; register/reset require a prior verified session cached per email + purpose |
| Passwords | BCrypt hashing |
| Sessions | HttpOnly `Kanflow.Auth` cookie, 7-day sliding expiration, Secure in production, SameSite=Strict; security stamp checked on each request (cached up to 5 minutes, invalidated immediately on password change) |
| CSRF | Double-submit: `XSRF-TOKEN` cookie, `X-XSRF-TOKEN` request header; token refreshed before every mutating request |
| Content | Card descriptions sanitized on save (HtmlSanitizer) and on display (DOMPurify, Quill formats only); other text stored as typed and HTML-encoded on output; colors validated as `#RRGGBB`; avatar filenames whitelisted |
| Account privacy | Password reset gives the same answer whether or not the email has an account |
| Invites | Opening an invite link only previews it; joining requires an explicit confirmation (POST) |
| Headers | CSP (no third-party script origins except Turnstile), HSTS, `Referrer-Policy`, `Permissions-Policy`; `AllowedHosts` host filtering |

Auth endpoints (`Login`, `VerifyWork`, `Register`, `ResetPassword`, `Logout`) and `Home/AcceptInvite` are marked `[AllowAnonymous]` so unauthenticated clients are not rejected before CSRF validation.

## License

Developed by [Bedirhan Alşan](https://bedirhanalsan.com).
