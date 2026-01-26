using Kanban;
using Kanban.Entities;
using Kanban.Models;
using Kanban.Repositories;
using Kanban.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

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

builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-XSRF-TOKEN";
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
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;

    options.LoginPath = "/";
    options.AccessDeniedPath = "/Error/403";

    options.Events = new CookieAuthenticationEvents
    {
        OnValidatePrincipal = async context =>
        {
            var acceptHeader = context.Request.Headers["Accept"].ToString();

            if (!string.IsNullOrEmpty(acceptHeader) && acceptHeader.Contains("image/"))
            {
                return;
            }

            var userIdClaim = context.Principal.FindFirst(ClaimTypes.NameIdentifier);
            var stampClaim = context.Principal.FindFirst("SecurityStamp");

            if (userIdClaim == null || stampClaim == null)
            {
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync();
                return;
            }

            var securityService = context.HttpContext.RequestServices
              .GetRequiredService<IUserSecurityService>();

            var isValid = await securityService.IsUserValidAsync(
              int.Parse(userIdClaim.Value),
              stampClaim.Value
            );

            if (!isValid)
            {
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync();
            }
        },

        OnRedirectToLogin = async context =>
        {
            if ((context.Request.Headers.ContainsKey("X-Requested-With") && context.Request.Headers["X-Requested-With"].ToString() == "XMLHttpRequest") ||
            (context.Request.Headers.ContainsKey("Accept") && context.Request.Headers["Accept"].ToString().Contains("application/json")) ||
            (context.Request.Headers.ContainsKey("Content-Type") && context.Request.Headers["Content-Type"].ToString().Contains("application/json")))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            context.Response.Redirect(context.RedirectUri);
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

app.UseCors(x => x.WithOrigins("https://kanflow.online", "https://www.kanflow.online")
       .AllowCredentials()
       .AllowAnyMethod()
       .AllowAnyHeader());

app.UseHttpsRedirection();
app.UseRouting();

app.UseStatusCodePagesWithReExecute("/Error/{0}");

app.UseAuthentication();
app.UseAuthorization();

app.Use(async (context, next) =>
{
    var allowed = new[] { "GET", "POST", "DELETE", "PUT" };

    if (!allowed.Contains(context.Request.Method))
    {
        context.Response.StatusCode = StatusCodes.Status405MethodNotAllowed;
        return;
    }

    var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
    var tokens = antiforgery.GetAndStoreTokens(context);

    context.Response.Cookies.Append("XSRF-TOKEN", tokens.RequestToken,
      new CookieOptions
      {
          HttpOnly = false,
          Secure = true,
          SameSite = SameSiteMode.Strict
      });

    await next();
});

app.MapStaticAssets();

app.MapControllerRoute(
  name: "default",
  pattern: "{controller=Home}/{action=Index}/{id?}")
  .WithStaticAssets();

app.Run();