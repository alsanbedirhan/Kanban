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
- **Security:** CSRF (antiforgery), HSTS, CSP, rate limiting

### Frontend

- **Type:** Single Page Application (SPA)
- **Libraries:** Vanilla JavaScript (ES6+), SweetAlert2, Quill, FullCalendar, SortableJS
- **Communication:** JSON API calls to MVC controller actions

## Project Structure

```
Kanban/
├── Controllers/     # MVC controllers (Home, Auth, Kanban, Error)
├── Entities/        # EF Core entities and DbContext
├── Models/          # DTOs and view models
├── Repositories/    # Data access layer
├── Services/        # Business logic (Kanban, User, Email, Turnstile)
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

## Security Notes

- Auth endpoints are rate-limited per IP (login/reset: 10/min, OTP: 5/15 min)
- OTP codes are generated with `RandomNumberGenerator` (cryptographically secure)
- Session cookies are HttpOnly, Secure, and SameSite=Strict
- Content Security Policy restricts script and frame sources to trusted origins

## License

Developed by [Bedirhan Alşan](https://bedirhanalsan.com).
