using Kanban.Entities;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Kanban
{
    public static class Extensions
    {
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
        public static void DeleteCookies(this HttpContext context)
        {
            var options = new CookieOptions { Path = "/" };
            if (!string.IsNullOrEmpty(context.Request.Cookies["Kanflow.Auth"]))
            {
                context.Response.Cookies.Delete("Kanflow.Auth", options);
            }
            if (!string.IsNullOrEmpty(context.Request.Cookies["Kanflow.Antiforgery"]))
            {
                context.Response.Cookies.Delete("Kanflow.Antiforgery", options);
            }
            if (!string.IsNullOrEmpty(context.Request.Cookies["XSRF-TOKEN"]))
            {
                context.Response.Cookies.Delete("XSRF-TOKEN", options);
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
