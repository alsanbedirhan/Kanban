using Kanban.Entities;

namespace Kanban.Repositories
{
    public interface IUserRepository
    {
        Task<User?> GetByEmail(string email);
        Task<Userverification?> GetInvite(long id);
        Task<User?> GetByEmailForUpdate(string email);
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
