using Kanban.Entities;
using Kanban.Models;

namespace Kanban.Services
{
    public interface IUserService
    {
        Task<ServiceResult<User>> Register(RegisterViewModel model);
        Task<ServiceResult<User>> Login(string email, string password);
        string GenerateJwt(string email, long inviteId); 
        Task<ServiceResult<BoardUserInviteModel>> VerifyActivationToken(string token);
        Task<ServiceResult> GenerateAndSaveVerifyCode(string email);
        Task<ServiceResult> VerifyCodeAndUpdate(string email, string code);
    }
}
