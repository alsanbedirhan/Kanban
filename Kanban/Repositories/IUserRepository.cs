using Kanban.Entities;
using Kanban.Models;

namespace Kanban.Repositories
{
    public interface IUserRepository
    {
        Task<User?> GetByEmail(string email);
        Task<string> GetHashPasswordByEmail(string email);
        Task<long?> GetUserIdByEmail(string email);
        Task<bool> CheckInvite(long userId, long boardId, string email);
        Task<UserInvite?> GetInvite(long id);
        Task<List<InviteResultModel>> GetInvites(string email);
        Task SetAcceptedInvite(long inviteId, long userId);
        Task<UserInvite> AddInvite(long senderUserId, long boardId, string email, long userId);
        Task<int> CheckInviteCountToday(string email);
        Task<bool> CheckNotification(long userId, long id);
        Task<List<NotificationResultModel>> GetNotifications(long userId);
        Task DeleteNotification(long id, long userId);
        Task DeleteNotifications(long userId);
        Task<bool> CheckUpdates(long userId, string email);
        Task<User?> GetByEmailForUpdate(string email);
        Task ChangePassword(long userId, string pass);
        Task UpdateAvatar(long userId, string avatar);
        Task<string> GetAvatar(long userId);
        Task<User?> GetById(long userId);
        Task<User?> GetByIdForUpdate(long userId);
        Task SaveContext();
        Task<User> Create(User user);
        Task<int> VerifyCountToday(string email);
        Task SaveVerifyCode(string email, string code);
        Task SetCodeUsed(long id);
        Task<UserVerification?> GetLastVerify(string email);
        Task<List<QuickNoteResultModel>> GetQuickNotes(long userId);
        Task<UserNote> AddQuickNote(long userId, string title, string note);
        Task RenameQuickNote(long userId, long noteId, string title);
        Task UpdateQuickNote(long userId, long noteId, string note);
        Task DeleteQuickNote(long userId, long noteId);
        Task<int> GetQuickNoteCount(long userId);
        Task<bool> ValidateQuickNote(long userId, long noteId);
    }
}
