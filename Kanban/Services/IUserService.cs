using Kanban.Entities;
using Kanban.Models;

namespace Kanban.Services
{
    public interface IUserService
    {
        Task<ServiceResult<User>> Register(RegisterViewModel model);
        Task<ServiceResult<User>> Login(string email, string password);
        Task<ServiceResult> GenerateAndSaveVerifyCode(string email);
        Task<ServiceResult> VerifyCodeAndUpdate(string email, string code);
    }
}
