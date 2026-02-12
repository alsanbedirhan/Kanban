using Kanban;
using Kanban.Entities;
using Kanban.Repositories;
using Kanban.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<KanbanDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<IUserSecurityService, UserSecurityService>();
builder.Services.AddScoped<IDBDateTimeProvider, DBDateTimeProvider>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IKanbanRepository, KanbanRepository>();
builder.Services.AddScoped<IKanbanService, KanbanService>();
builder.Services.AddScoped<IEmailService, EmailService>();

builder.Services.AddHttpClient<ITurnstileService, TurnstileService>();

builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-XSRF-TOKEN";
    options.SuppressXFrameOptionsHeader = false;
    options.Cookie.Name = "Kanflow.Antiforgery";
    options.Cookie.HttpOnly = false;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
});

builder.Services.AddHsts(options =>
{
    options.Preload = true;
    options.IncludeSubDomains = true;
    options.MaxAge = TimeSpan.FromDays(365);
});

builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
})
.AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
{
    options.Cookie.Name = "Kanflow.Auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromDays(7);
    options.SlidingExpiration = true;

    options.LoginPath = "/";
    options.AccessDeniedPath = "/Error/403";

    options.Events = new CookieAuthenticationEvents
    {
        OnValidatePrincipal = async context =>
        {
            var path = context.Request.Path.Value?.ToLower() ?? "";

            if ((path == "/" || path == "/home/index") && context.Request.Query.ContainsKey("logout") && context.Request.Query["logout"] == "true")
            {
                return;
            }

            if (path.StartsWith("/avatars") || path.Contains(".svg") ||
                path.Contains(".png") || path.StartsWith("/css") ||
                path.StartsWith("/js") || path.StartsWith("/lib") ||
                path.Contains(".ico") || path.StartsWith("/error"))
            {
                return;
            }

            var userIdClaim = context.Principal.FindFirst(ClaimTypes.NameIdentifier);
            var stampClaim = context.Principal.FindFirst("SecurityStamp");

            if (userIdClaim == null || stampClaim == null)
            {
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync();
                if (IsApiRequest(context.Request))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                }
                else
                {
                    context.Response.Redirect("/Error/401");
                }
                return;
            }

            var securityService = context.HttpContext.RequestServices.GetRequiredService<IUserSecurityService>();
            var isValid = await securityService.IsUserValidAsync(int.Parse(userIdClaim.Value), stampClaim.Value);

            if (!isValid)
            {
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync();
                if (IsApiRequest(context.Request))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                }
                else
                {
                    context.Response.Redirect("/Error/403");
                }
            }
        },

        OnRedirectToLogin = async context =>
        {
            if (IsApiRequest(context.Request))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            }
            else
            {
                context.Response.Redirect("/Error/401");
            }
        },

        OnRedirectToAccessDenied = async context =>
        {
            if (IsApiRequest(context.Request))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
            }
            else
            {
                context.Response.Redirect("/Error/403");
            }
        }
    };
});

builder.Services.AddControllersWithViews(options =>
{
    options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute());
});

var app = builder.Build();

bool IsApiRequest(HttpRequest request)
{
    var path = request.Path.Value?.ToLower() ?? "";

    if (path.StartsWith("/auth") || path.StartsWith("/kanban"))
        return true;

    if (request.Headers["X-Requested-With"] == "XMLHttpRequest")
        return true;

    if (request.Headers.Accept.Any(x => x != null && x.Contains("application/json")))
        return true;

    return false;
}

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseCors(x => x
    .WithOrigins("https://kanflow.online", "https://www.kanflow.online")
    .AllowCredentials()
    .AllowAnyMethod()
    .AllowAnyHeader()
    .SetPreflightMaxAge(TimeSpan.FromHours(24)));

app.UseHttpsRedirection();

app.Use(async (context, next) =>
{
    var csp = new StringBuilder();

    csp.Append("default-src 'self'; ");

    csp.Append("script-src 'self' 'unsafe-inline' 'unsafe-eval' ");
    csp.Append("https://challenges.cloudflare.com ");
    csp.Append("https://cdn.jsdelivr.net ");
    csp.Append("https://cdn.quilljs.com; ");

    csp.Append("script-src-elem 'self' 'unsafe-inline' ");
    csp.Append("https://challenges.cloudflare.com ");
    csp.Append("https://cdn.jsdelivr.net ");
    csp.Append("https://cdn.quilljs.com; ");

    csp.Append("style-src 'self' 'unsafe-inline' ");
    csp.Append("https://cdn.quilljs.com; ");

    csp.Append("style-src-elem 'self' 'unsafe-inline' ");
    csp.Append("https://cdn.quilljs.com; ");

    csp.Append("frame-src 'self' ");
    csp.Append("https://challenges.cloudflare.com; ");

    csp.Append("connect-src 'self' ");
    csp.Append("https://challenges.cloudflare.com");
    if (app.Environment.IsDevelopment())
    {
        csp.Append(" ws://localhost:* http://localhost:*");
    }
    csp.Append("; ");

    csp.Append("img-src 'self' data: blob: https:; ");

    csp.Append("font-src 'self' data:;");

    context.Response.Headers.Append("Content-Security-Policy", csp.ToString());
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";

    await next();

    if ((context.Response.StatusCode == 401 || context.Response.StatusCode == 403) && !context.Response.HasStarted)
    {
        context.DeleteCookies();
    }
});

app.UseStaticFiles();

app.UseRouting();

app.UseStatusCodePagesWithReExecute("/Error/{0}");

app.UseAuthentication();
app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
  name: "default",
  pattern: "{controller=Home}/{action=Index}/{id?}")
  .WithStaticAssets();

app.Run();