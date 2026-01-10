using Kanban.Entities;

namespace Kanban.Repositories
{
    public interface IUserRepository
    {
        Task<User?> GetByEmail(string email);
        Task<User?> GetByEmailForUpdate(string email);
        Task<User?> GetById(long id);
        Task<User?> GetByIdForUpdate(long id);
        Task SaveContext();
        Task<User> Create(User user);
    }
}
