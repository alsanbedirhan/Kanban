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
        Task<ServiceResult> UpdateAvatar(long userId, string avatar);
        Task<ServiceResult<string>> GetAvatar(long userId);
        Task<ServiceResult<string>> GetQuickNote(long userId);
        Task<ServiceResult> UpdateQuickNote(long userId, string quickNote);
        Task<ServiceResult> ChangePassword(long userId, string email, string currentPassword, string newPassword);
    }
}
