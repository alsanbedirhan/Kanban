using Kanban.Models;
using Microsoft.Extensions.Caching.Memory;

namespace Kanban.Security
{
    // Güvenlik damgası her istekte doğrulandığı için kısa süreli önbelleklenir.
    // Damga veya aktiflik durumu değiştiren her yol Invalidate çağırmak zorundadır;
    // Window yalnızca uygulama dışından (örn. doğrudan SQL) yapılan değişiklikler
    // için üst sınır görevi görür.
    public static class UserSecurityCache
    {
        public static readonly TimeSpan Window = TimeSpan.FromMinutes(5);

        public static string Key(long userId) => $"SECURITY:{userId}";

        public static bool TryGet(IMemoryCache cache, long userId, out UserSecuritySnapshot? snapshot) =>
            cache.TryGetValue(Key(userId), out snapshot);

        public static void Set(IMemoryCache cache, long userId, UserSecuritySnapshot? snapshot) =>
            cache.Set(Key(userId), snapshot, Window);

        public static void Invalidate(IMemoryCache cache, long userId) =>
            cache.Remove(Key(userId));
    }
}
