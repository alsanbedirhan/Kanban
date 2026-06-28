using Microsoft.Extensions.Caching.Memory;

namespace Kanban.Security
{
    public static class TurnstileSessionCache
    {
        public static readonly TimeSpan Window = TimeSpan.FromMinutes(10);

        public static string Key(string email, string purpose) =>
            $"TURNSTILE_OK:{email.Trim().ToLowerInvariant()}:{purpose}";

        public static void MarkVerified(IMemoryCache cache, string email, string purpose) =>
            cache.Set(Key(email, purpose), true, Window);

        public static bool ConsumeVerification(IMemoryCache cache, string email, string purpose)
        {
            var key = Key(email, purpose);
            if (!cache.TryGetValue(key, out _))
                return false;

            cache.Remove(key);
            return true;
        }

        public static bool HasVerification(IMemoryCache cache, string email, string purpose) =>
            cache.TryGetValue(Key(email, purpose), out _);
    }
}
