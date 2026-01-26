namespace Kanban.Services
{
    public interface IUserSecurityService
    {
        Task<bool> IsUserValidAsync(long userId, string securityStamp);
    }
}
