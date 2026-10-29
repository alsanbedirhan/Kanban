using Kanban;
using Kanban.Entities;
using Kanban.Hubs;
using Kanban.Repositories;
using Kanban.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Rewrite;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

static bool IsApiRequest(HttpRequest request) => AuthRecovery.WantsJsonResponse(request);

static async Task RejectPrincipalAsync(CookieValidatePrincipalContext context)
{
    context.RejectPrincipal();
    await AuthRecovery.ClearSessionAsync(context.HttpContext);
}

static string GetClientPartitionKey(HttpContext context) =>
    context.Connection.RemoteIpAddress?.ToString() ?? context.TraceIdentifier;

static string GetApiPartitionKey(HttpContext context)
{
    var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    return string.IsNullOrEmpty(userId) ? $"ip:{GetClientPartitionKey(context)}" : $"user:{userId}";
}

builder.Services.AddDbContext<KanbanDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure(
            maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(3),
            errorNumbersToAdd: null)));

builder.Services.AddScoped<IUserSecurityService, UserSecurityService>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IKanbanRepository, KanbanRepository>();
builder.Services.AddScoped<IKanbanService, KanbanService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IBoardNotifier, BoardNotifier>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSignalR();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddHttpClient<ITurnstileService, TurnstileService>();

builder.Services.AddMemoryCache();

var configuredKeysPath = builder.Configuration["DataProtection:KeysPath"];
var dataProtectionKeysPath = !string.IsNullOrWhiteSpace(configuredKeysPath)
    ? Path.IsPathRooted(configuredKeysPath)
        ? configuredKeysPath
        : Path.Combine(builder.Environment.ContentRootPath, configuredKeysPath)
    : Path.Combine(builder.Environment.ContentRootPath, "App_Data", "DataProtection-Keys");
Directory.CreateDirectory(dataProtectionKeysPath);

var cookieSecurePolicy = builder.Environment.IsDevelopment()
    ? CookieSecurePolicy.SameAsRequest
    : CookieSecurePolicy.Always;

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    foreach (var cidr in builder.Configuration.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [])
    {
        options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(cidr));
    }
});

builder.Services.AddDataProtection()
    .SetApplicationName("Kanflow")
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath));

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;

        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString();

        if (IsApiRequest(context.HttpContext.Request))
        {
            AuthRecovery.DisableStatusCodePages(context.HttpContext);
            context.HttpContext.Response.ContentType = "application/json; charset=utf-8";
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

    // OTP tamamlama: kayıt (dakikada 8 / IP).
    options.AddPolicy("auth-register", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            GetClientPartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 8,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // OTP tamamlama: şifre sıfırlama (dakikada 8 / IP).
    options.AddPolicy("auth-reset", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            GetClientPartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 8,
                Window = TimeSpan.FromMinutes(1),
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

    options.AddPolicy("api", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            GetApiPartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    options.AddPolicy("page", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            GetApiPartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    options.AddPolicy("health", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 2,
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
    options.Cookie.SecurePolicy = cookieSecurePolicy;
    options.Cookie.IsEssential = true;
});

builder.Services.AddHsts(options =>
{
    options.Preload = true;
    options.IncludeSubDomains = true;
    options.MaxAge = TimeSpan.FromDays(365);
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(
                "https://kanflow.online",
                "https://www.kanflow.online")
            .AllowCredentials()
            .WithMethods("GET", "POST")
            .AllowAnyHeader());
});

builder.Services.AddSingleton<IAuthorizationMiddlewareResultHandler, SessionRecoveryAuthorizationHandler>();

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
    options.Cookie.SecurePolicy = cookieSecurePolicy;
    options.Cookie.IsEssential = true;
    options.LoginPath = "/Auth/ClearSession";
    options.AccessDeniedPath = "/Auth/ClearSession";
    options.ExpireTimeSpan = TimeSpan.FromDays(7);
    options.SlidingExpiration = true;

    options.Events = new CookieAuthenticationEvents
    {
        OnValidatePrincipal = async context =>
        {
            try
            {
                var userIdClaim = context.Principal?.FindFirst(ClaimTypes.NameIdentifier);
                var stampClaim = context.Principal?.FindFirst("SecurityStamp");

                if (userIdClaim == null || stampClaim == null)
                {
                    await RejectPrincipalAsync(context);
                    return;
                }

                if (!long.TryParse(userIdClaim.Value, out var userId))
                {
                    await RejectPrincipalAsync(context);
                    return;
                }

                var securityService = context.HttpContext.RequestServices.GetRequiredService<IUserSecurityService>();
                if (!await securityService.IsUserValidAsync(userId, stampClaim.Value))
                {
                    await RejectPrincipalAsync(context);
                }
            }
            catch (Exception ex)
            {
                var logger = context.HttpContext.RequestServices
                    .GetRequiredService<ILogger<Program>>();
                logger.LogError(ex, "Unexpected error while validating the auth cookie.");
                await RejectPrincipalAsync(context);
            }
        },
        OnRedirectToAccessDenied = async context =>
        {
            await AuthRecovery.RespondAsync(context.HttpContext, forbidden: true);
        },
        OnRedirectToLogin = async context =>
        {
            await AuthRecovery.RespondAsync(context.HttpContext, forbidden: false);
        }
    };
});

builder.Services.AddControllersWithViews(options =>
{
    options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute());
});

var appDomain = builder.Configuration["EmailSettings:Domain"];
var websocketSource = string.IsNullOrWhiteSpace(appDomain) ? "" : $" wss://{appDomain}";

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseExceptionHandler();

app.UseRewriter(new RewriteOptions().AddRedirectToNonWwwPermanent());
app.UseForwardedHeaders();
app.UseHttpsRedirection();
app.Use(async (context, next) =>
{
    var csp = new StringBuilder();
    csp.Append("default-src 'self'; ");
    csp.Append("script-src 'self' https://challenges.cloudflare.com; ");
    csp.Append("script-src-elem 'self' https://challenges.cloudflare.com; ");
    csp.Append("style-src 'self' 'unsafe-inline'; ");
    csp.Append("style-src-elem 'self' 'unsafe-inline'; ");
    csp.Append("frame-src 'self' https://challenges.cloudflare.com; ");
    csp.Append($"connect-src 'self'{websocketSource} https://challenges.cloudflare.com");
    if (app.Environment.IsDevelopment())
    {
        csp.Append(" ws://localhost:* http://localhost:*");
    }
    csp.Append("; ");
    csp.Append("img-src 'self' data: blob:; ");
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
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";

    await next();
});

app.UseWhen(
    context => !AuthRecovery.WantsJsonResponse(context.Request) && !AuthRecovery.IsStaticAssetRequest(context.Request),
    branch => branch.UseStatusCodePages(async statusContext =>
    {
        var context = statusContext.HttpContext;
        var statusCode = context.Response.StatusCode;

        if (statusCode is StatusCodes.Status401Unauthorized or StatusCodes.Status403Forbidden)
        {
            await AuthRecovery.RecoverHtmlAuthFailureAsync(context);
            return;
        }

        var originalPath = context.Request.Path;
        var originalQuery = context.Request.QueryString;

        context.Request.Path = $"/Error/{statusCode}";
        context.Request.QueryString = QueryString.Empty;
        context.SetEndpoint(null);
        context.Request.RouteValues.Clear();

        try
        {
            await statusContext.Next(context);
        }
        finally
        {
            context.Request.Path = originalPath;
            context.Request.QueryString = originalQuery;
        }
    }));
app.UseRouting();

app.UseCors();
app.UseAuthentication();
app.Use(async (context, next) =>
{
    if (AuthRecovery.HasStaleAuthCookie(context))
        await AuthRecovery.ClearSessionAsync(context);

    await next();

    if (!context.Response.HasStarted && AuthRecovery.HasStaleAuthCookie(context))
        await AuthRecovery.ClearSessionAsync(context);
});
app.UseRateLimiter();
app.UseAuthorization();

app.MapStaticAssets();

app.MapGet("/health", (HttpContext context) =>
    {
        context.Response.Headers.CacheControl = "no-store";
        return Results.NoContent();
    })
    .AllowAnonymous()
    .RequireRateLimiting("health");

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.MapHub<BoardHub>("/hubs/board");

app.Run();