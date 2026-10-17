using Kanban.Entities;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using System.Security.Claims;

namespace Kanban
{
    public static class Extensions
    {
        private const string CookiesClearedItemKey = "__Kanflow.CookiesCleared";

        private static bool IsSecureRequest(HttpContext context)
        {
            var env = context.RequestServices.GetRequiredService<IWebHostEnvironment>();
            return env.IsDevelopment() ? context.Request.IsHttps : true;
        }

        private static CookieOptions CreateDeleteOptions(HttpContext context, bool httpOnly)
        {
            return new CookieOptions
            {
                Path = "/",
                Secure = IsSecureRequest(context),
                HttpOnly = httpOnly,
                SameSite = SameSiteMode.Strict,
                IsEssential = true,
                Expires = DateTimeOffset.UnixEpoch,
                MaxAge = TimeSpan.Zero
            };
        }

        private static void DeleteCookie(HttpContext context, string name, bool httpOnly)
        {
            var options = CreateDeleteOptions(context, httpOnly);
            var manager = new ChunkingCookieManager();
            manager.DeleteCookie(context, name, options);
        }

        public static long GetUserId(this ClaimsPrincipal user)
        {
            long.TryParse(user.FindFirst(ClaimTypes.NameIdentifier)?.Value, out long userId);
            return userId;
        }
        public static string GetEmail(this ClaimsPrincipal user)
        {
            return user.FindFirst(ClaimTypes.Email)?.Value ?? "";
        }
        public static string GetFullName(this ClaimsPrincipal user)
        {
            return user.FindFirst(ClaimTypes.Name)?.Value ?? "";
        }
        public static CookieOptions CreateXsrfCookieOptions(this HttpContext context)
        {
            return new CookieOptions
            {
                HttpOnly = false,
                Secure = IsSecureRequest(context),
                SameSite = SameSiteMode.Strict,
                Path = "/",
                IsEssential = true
            };
        }

        public static void DeleteCookies(this HttpContext context)
        {
            if (context.Response.HasStarted || context.Items.ContainsKey(CookiesClearedItemKey))
                return;

            context.Items[CookiesClearedItemKey] = true;

            try
            {
                DeleteCookie(context, "Kanflow.Auth", httpOnly: true);
                DeleteCookie(context, "Kanflow.Antiforgery", httpOnly: false);
                DeleteCookie(context, "XSRF-TOKEN", httpOnly: false);

                foreach (var name in context.Request.Cookies.Keys)
                {
                    if (name.StartsWith("Kanflow.AuthC", StringComparison.OrdinalIgnoreCase))
                        DeleteCookie(context, name, httpOnly: true);
                }
            }
            catch (Exception)
            {
            }
        }
    }
    public enum InviteStatus
    {
        ALREADY,
        ADDED,
        REGISTER,
        ERROR,
        NONE,
        WRONG_ACC,
        PENDING,
    }
    public static class TimeProviderExtensions
    {
        public static DateTime LocalNow(this TimeProvider time) => time.GetLocalNow().DateTime;
    }
}
