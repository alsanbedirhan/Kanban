using Kanban;
using Kanban.Entities;
using Kanban.Repositories;
using Kanban.Security;
using Kanban.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
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

static bool WantsJsonResponse(HttpRequest request)
{
    if (string.Equals(request.Headers.XRequestedWith, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase))
        return true;

    var accept = request.Headers.Accept;
    var wantsJson = accept.Any(a => a != null && a.Contains("application/json", StringComparison.OrdinalIgnoreCase));
    var wantsHtml = accept.Any(a => a != null && a.Contains("text/html", StringComparison.OrdinalIgnoreCase));

    return wantsJson && !wantsHtml;
}

static bool IsApiRequest(HttpRequest request) => WantsJsonResponse(request);

static bool IsStaticAssetRequest(HttpRequest request)
{
    var path = request.Path.Value ?? string.Empty;
    return path.StartsWith("/css/", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("/js/", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("/avatars/", StringComparison.OrdinalIgnoreCase)
        || path.Equals("/favicon.ico", StringComparison.OrdinalIgnoreCase)
        || path.Equals("/favicon.svg", StringComparison.OrdinalIgnoreCase)
        || path.Equals("/logo.png", StringComparison.OrdinalIgnoreCase);
}

static void DisableStatusCodePages(HttpContext httpContext)
{
    var statusCodePagesFeature = httpContext.Features.Get<IStatusCodePagesFeature>();
    if (statusCodePagesFeature != null)
    {
        statusCodePagesFeature.Enabled = false;
    }
}

static (int StatusCode, string Message) MapUnhandledException(Exception? error) => error switch
{
    AntiforgeryValidationException =>
        (StatusCodes.Status400BadRequest, "Session validation failed. Please refresh the page and try again."),
    BadHttpRequestException =>
        (StatusCodes.Status400BadRequest, "Invalid request."),
    _ =>
        (StatusCodes.Status500InternalServerError, "An unexpected error occurred. Please try again.")
};

static bool IsClientDisconnect(Exception? error) =>
    error is OperationCanceledException or TaskCanceledException;

static async Task RejectPrincipalAsync(CookieValidatePrincipalContext context)
{
    context.RejectPrincipal();
    await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    context.HttpContext.DeleteCookies();
}

static string GetClientPartitionKey(HttpContext context) =>
    context.Connection.RemoteIpAddress?.ToString() ?? context.TraceIdentifier;

builder.Services.AddDbContext<KanbanDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure(
            maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(3),
            errorNumbersToAdd: null)));

builder.Services.AddScoped<IUserSecurityService, UserSecurityService>();
builder.Services.AddScoped<IDBDateTimeProvider, DBDateTimeProvider>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IKanbanRepository, KanbanRepository>();
builder.Services.AddScoped<IKanbanService, KanbanService>();
builder.Services.AddScoped<IEmailService, EmailService>();

builder.Services.AddHttpClient<ITurnstileService, TurnstileService>();

builder.Services.AddSingleton<IOtpCodeProtector, OtpCodeProtector>();

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
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
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
            DisableStatusCodePages(context.HttpContext);
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
            GetClientPartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
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
            context.HttpContext.DeleteCookies();
            DisableStatusCodePages(context.HttpContext);

            if (WantsJsonResponse(context.Request))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json; charset=utf-8";
                await context.Response.WriteAsJsonAsync(ServiceResult.Fail("You do not have permission for this action."));
                return;
            }

            context.Response.Redirect("/");
        },
        OnRedirectToLogin = async context =>
        {
            context.HttpContext.DeleteCookies();
            DisableStatusCodePages(context.HttpContext);

            if (WantsJsonResponse(context.Request))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json; charset=utf-8";
                await context.Response.WriteAsJsonAsync(ServiceResult.Fail("Your session is not active or has expired."));
                return;
            }

            context.Response.Redirect("/");
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

// İşlenmemiş istisnalar: API → JSON ServiceResult, sayfa → /Error/500
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerPathFeature>();
        var error = feature?.Error;
        if (IsClientDisconnect(error))
            return;

        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
        logger.LogError(error, "Unhandled error. Path: {Path}", feature?.Path);

        if (IsApiRequest(context.Request))
        {
            var (statusCode, message) = MapUnhandledException(error);
            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsJsonAsync(ServiceResult.Fail(message));
            return;
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.Redirect("/Error/500");
    });
});

app.UseRewriter(new RewriteOptions().AddRedirectToNonWwwPermanent());
app.UseForwardedHeaders();
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
    context => !WantsJsonResponse(context.Request) && !IsStaticAssetRequest(context.Request),
    branch => branch.UseStatusCodePagesWithReExecute("/Error/{0}"));
app.UseRouting();

app.UseRateLimiter();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.Run();