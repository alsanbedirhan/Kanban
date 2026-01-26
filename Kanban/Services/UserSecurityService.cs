using Kanban.Repositories;
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
            string key = $"SECURITY:{userId}";
            if (!_cache.TryGetValue(key, out string? stamp) || string.IsNullOrEmpty(stamp))
            {
                var user = await _userRepository.GetById(userId);

                if (user == null)
                    return false;

                stamp = user.SecurityStamp;

                _cache.Set(key, stamp, TimeSpan.FromHours(6));
            }

            if (stamp != securityStamp)
                return false;

            return true;
        }
    }

}
