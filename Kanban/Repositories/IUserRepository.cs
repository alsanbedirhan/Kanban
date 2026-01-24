using Kanban.Entities;
using Kanban.Models;

namespace Kanban.Repositories
{
    public interface IUserRepository
    {
        Task<User?> GetByEmail(string email);
        Task<long?> GetUserIdByEmail(string email);
        Task<bool> CheckInvite(long userId, long boardId, string email);
        Task<Userinvite?> GetInvite(long id);
        Task<List<InviteResultModel>> GetInvites(string email);
        Task SetAcceptedInvite(long inviteId);
        Task<Userinvite> AddInvite(long senderUserId, long boardId, string email);
        Task<int> CheckInviteCountToday(string email);
        Task<bool> CheckNotification(long userId, long id);
        Task<List<NotificationResultModel>> GetNotifications(long userId);
        Task DeleteNotification(long id);
        Task DeleteNotifications(long userId);
        Task<bool> CheckUpdates(long userId, string email);
        Task<User?> GetByEmailForUpdate(string email);
        Task UpdateAvatar(long userId, string avatar);
        Task<User?> GetById(long id);
        Task<User?> GetByIdForUpdate(long id);
        Task SaveContext();
        Task<User> Create(User user);
        Task<int> VerifyCountToday(string email);
        Task SaveVerifyCode(string email, string code);
        Task SetCodeUsed(long id);
        Task<Userverification?> GetLastVerify(string email);
    }
}
