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
    }
}
