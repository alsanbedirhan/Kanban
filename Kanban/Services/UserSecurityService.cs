using Kanban.Repositories;
using Kanban.Security;
using Microsoft.Extensions.Caching.Memory;

namespace Kanban.Services
{
    public class UserSecurityService : IUserSecurityService
    {
        private readonly IMemoryCache _cache;
        private readonly IUserRepository _userRepository;

        public UserSecurityService(IMemoryCache cache, IUserRepository userRepository)
        {
            _cache = cache;
            _userRepository = userRepository;
        }

        public async Task<bool> IsUserValidAsync(long userId, string securityStamp)
        {
            if (!UserSecurityCache.TryGet(_cache, userId, out var snapshot))
            {
                snapshot = await _userRepository.GetSecuritySnapshot(userId);
                UserSecurityCache.Set(_cache, userId, snapshot);
            }

            if (snapshot == null || !snapshot.IsActive)
                return false;

            return string.Equals(snapshot.SecurityStamp, securityStamp, StringComparison.Ordinal);
        }
    }
}
