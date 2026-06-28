using Kanban.Entities;
using Kanban.Models;

namespace Kanban.Services
{
    public interface IUserService
    {
        Task<ServiceResult<User>> Register(string email, string password, string fullName);
        Task<ServiceResult<User>> Login(string email, string password);
        Task<ServiceResult> ResetPassword(string email, string password);
        Task<ServiceResult> GenerateAndSaveVerifyCode(string email, string purpose = "register");
        Task<ServiceResult> VerifyCodeAndUpdate(string email, string code);
        Task<ServiceResult<User>> RegisterWithOtp(string email, string password, string fullName, string otpCode);
        Task<ServiceResult> ResetPasswordWithOtp(string email, string password, string otpCode);
        Task<ServiceResult> UpdateAvatar(long userId, string avatar);
        Task<ServiceResult<string>> GetAvatar(long userId);
        Task<ServiceResult> ChangePassword(long userId, string email, string currentPassword, string newPassword);
        Task<ServiceResult<List<QuickNoteResultModel>>> GetQuickNotes(long userId);
        Task<ServiceResult<UserNote>> AddQuickNote(long userId, string title, string note);
        Task<ServiceResult> RenameQuickNote(long userId, long noteId, string title);
        Task<ServiceResult> DeleteQuickNote(long userId, long noteId);
        Task<ServiceResult> UpdateQuickNote(long userId, long noteId, string note);
    }
}
