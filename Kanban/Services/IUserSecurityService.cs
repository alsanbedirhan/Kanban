namespace Kanban.Services
{
    public interface IUserSecurityService
    {
        Task<bool> IsUserValidAsync(int userId, string securityStamp);
    }
}
