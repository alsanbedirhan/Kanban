using Kanban;
using Kanban.Entities;
using Kanban.Repositories;
using Kanban.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Rewrite;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

static bool IsApiRequest(HttpRequest request)
{
    var path = request.Path.Value?.ToLower() ?? "";
    return path.StartsWith("/auth") || path.StartsWith("/kanban") ||
        request.Headers["X-Requested-With"] == "XMLHttpRequest" ||
        request.Headers.Accept.Any(x => x != null && x.Contains("application/json"));
}

static string GetClientPartitionKey(HttpContext context) =>
    context.Connection.RemoteIpAddress?.ToString() ?? context.TraceIdentifier;

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

builder.Services.AddMemoryCache();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        if (IsApiRequest(context.HttpContext.Request))
        {
            context.HttpContext.Response.ContentType = "application/json";
            await context.HttpContext.Response.WriteAsJsonAsync(
                ServiceResult.Fail("Too many requests. Please try again later."), token);
        }
    };

    options.AddPolicy("auth-strict", context =>
        RateLimitPartition.GetSlidingWindowLimiter(
            GetClientPartitionKey(context),
            _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 4,
                QueueLimit = 0
            }));

    options.AddPolicy("auth-otp", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            GetClientPartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0
            }));

    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            GetClientPartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-XSRF-TOKEN";
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

    options.Events = new CookieAuthenticationEvents
    {
        OnValidatePrincipal = async context =>
        {
            var userIdClaim = context.Principal?.FindFirst(ClaimTypes.NameIdentifier);
            var stampClaim = context.Principal?.FindFirst("SecurityStamp");

            if (userIdClaim == null || stampClaim == null)
            {
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                context.HttpContext.DeleteCookies();
                return;
            }

            var securityService = context.HttpContext.RequestServices.GetRequiredService<IUserSecurityService>();
            var isValid = await securityService.IsUserValidAsync(int.Parse(userIdClaim.Value), stampClaim.Value);

            if (!isValid)
            {
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                context.HttpContext.DeleteCookies();
            }
        },
        OnRedirectToAccessDenied = context =>
        {
            context.HttpContext.DeleteCookies();
            if (IsApiRequest(context.Request))
            {
                var statusCodePagesFeature = context.HttpContext.Features.Get<IStatusCodePagesFeature>();
                if (statusCodePagesFeature != null)
                {
                    statusCodePagesFeature.Enabled = false;
                }
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
            }
            else
            {
                context.Response.Redirect("/");
            }

            return Task.CompletedTask;
        },
        OnRedirectToLogin = context =>
        {
            context.HttpContext.DeleteCookies();
            if (IsApiRequest(context.Request))
            {
                var statusCodePagesFeature = context.HttpContext.Features.Get<IStatusCodePagesFeature>();
                if (statusCodePagesFeature != null)
                {
                    statusCodePagesFeature.Enabled = false;
                }
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            }
            else
            {
                context.Response.Redirect("/");
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddControllersWithViews(options =>
{
    options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute());
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseRewriter(new RewriteOptions().AddRedirectToNonWwwPermanent());
app.UseHttpsRedirection();
app.Use(async (context, next) =>
{
    var csp = new StringBuilder();
    csp.Append("default-src 'self'; ");
    csp.Append("script-src 'self' https://challenges.cloudflare.com https://cdn.jsdelivr.net https://cdn.quilljs.com; ");
    csp.Append("script-src-elem 'self' https://challenges.cloudflare.com https://cdn.jsdelivr.net https://cdn.quilljs.com; ");
    csp.Append("style-src 'self' 'unsafe-inline' https://cdn.quilljs.com https://cdn.jsdelivr.net; ");
    csp.Append("style-src-elem 'self' 'unsafe-inline' https://cdn.quilljs.com https://cdn.jsdelivr.net; ");
    csp.Append("frame-src 'self' https://challenges.cloudflare.com; ");
    csp.Append("connect-src 'self' https://challenges.cloudflare.com");
    if (app.Environment.IsDevelopment())
    {
        csp.Append(" ws://localhost:* http://localhost:*");
    }
    csp.Append("; ");
    csp.Append("img-src 'self' data: blob: https:; ");
    csp.Append("font-src 'self' data:; ");
    csp.Append("object-src 'none'; ");
    csp.Append("base-uri 'self'; ");
    csp.Append("form-action 'self'; ");
    csp.Append("frame-ancestors 'self'");
    if (!app.Environment.IsDevelopment())
    {
        csp.Append("; upgrade-insecure-requests");
    }

    context.Response.Headers.ContentSecurityPolicy = csp.ToString();
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "SAMEORIGIN";

    await next();
});

app.UseStatusCodePagesWithReExecute("/Error/{0}");
app.UseRouting();

app.UseCors(x =>
{
    var origins = new List<string> { "https://kanflow.online", "https://www.kanflow.online" };
    if (app.Environment.IsDevelopment())
    {
        origins.AddRange(["http://localhost:5000", "https://localhost:5001", "http://localhost:5173"]);
    }
    x.WithOrigins(origins.ToArray())
        .AllowCredentials()
        .AllowAnyMethod()
        .AllowAnyHeader();
});

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.Run();