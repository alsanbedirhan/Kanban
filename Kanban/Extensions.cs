using Kanban.Entities;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using System.Security.Claims;

namespace Kanban
{
    public static class Extensions
    {
        private static void DeleteCookie(HttpContext context, string name)
        {
            if (!context.Request.Cookies.ContainsKey(name))
                return;

            var env = context.RequestServices.GetRequiredService<IWebHostEnvironment>();
            var expired = DateTimeOffset.UtcNow.AddYears(-1);
            var isHttpOnly = name is "Kanflow.Auth" or "Kanflow.Antiforgery";

            var variants = new List<CookieOptions>
            {
                new()
                {
                    Path = "/",
                    SameSite = SameSiteMode.Strict,
                    Secure = env.IsDevelopment() ? context.Request.IsHttps : true,
                    HttpOnly = isHttpOnly,
                    Expires = expired
                },
                new()
                {
                    Path = "/",
                    SameSite = SameSiteMode.Strict,
                    Secure = true,
                    HttpOnly = isHttpOnly,
                    Expires = expired
                },
                new()
                {
                    Path = "/",
                    SameSite = SameSiteMode.Strict,
                    Secure = false,
                    HttpOnly = isHttpOnly,
                    Expires = expired
                }
            };

            foreach (var options in variants)
            {
                context.Response.Cookies.Delete(name, options);
                context.Response.Cookies.Append(name, string.Empty, options);
            }
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
            var env = context.RequestServices.GetRequiredService<IWebHostEnvironment>();
            return new CookieOptions
            {
                HttpOnly = false,
                Secure = env.IsDevelopment() ? context.Request.IsHttps : true,
                SameSite = SameSiteMode.Strict,
                Path = "/"
            };
        }

        public static void DeleteCookies(this HttpContext context)
        {
            try
            {
                DeleteCookie(context, "Kanflow.Antiforgery");
                DeleteCookie(context, "Kanflow.Auth");
                DeleteCookie(context, "XSRF-TOKEN");
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
    }
    public interface IDBDateTimeProvider
    {
        Task<DateTime> Now();
    }
    public class DBDateTimeProvider : IDBDateTimeProvider
    {
        private readonly KanbanDbContext _context;

        public DBDateTimeProvider(KanbanDbContext context)
        {
            _context = context;
        }

        public async Task<DateTime> Now()
        {
            var connection = _context.Database.GetDbConnection();

            if (connection.State != System.Data.ConnectionState.Open)
                await connection.OpenAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT GETDATE()";

            var result = await command.ExecuteScalarAsync();
            return (DateTime)result!;
        }
    }
}
