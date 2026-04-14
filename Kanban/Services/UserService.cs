using Kanban.Entities;
using Kanban.Models;
using Kanban.Repositories;

namespace Kanban.Services
{
    public class UserService : IUserService
    {
        private readonly IUserRepository _userRepository;
        private readonly IEmailService _mailService;
        private readonly IDBDateTimeProvider _dbDate;

        public UserService(IUserRepository userRepository, IEmailService mailService, IDBDateTimeProvider dbDate)
        {
            _userRepository = userRepository;
            _mailService = mailService;
            _dbDate = dbDate;
        }

        public async Task<ServiceResult<User>> Register(string email, string password, string fullName)
        {
            var u = await _userRepository.GetByEmailForUpdate(email);
            if (u != null && u.IsActive)
            {
                return ServiceResult<User>.Fail("A user with this email already exists.");
            }
            var hashedPassword = BCrypt.Net.BCrypt.HashPassword(password);

            try
            {
                if (u != null)
                {
                    u.FullName = fullName;
                    u.HashPassword = hashedPassword;
                    u.IsActive = true;
                    await _userRepository.SaveContext();
                    return ServiceResult<User>.Ok(u);
                }
                else
                {
                    return ServiceResult<User>.Ok(await _userRepository.Create(new User
                    {
                        FullName = fullName,
                        Email = email,
                        IsActive = true,
                        HashPassword = hashedPassword
                    }));
                }
            }
            catch (Exception ex)
            {
                return ServiceResult<User>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<User>> Login(string email, string password)
        {
            try
            {
                var user = await _userRepository.GetByEmail(email);

                if (user == null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(password, user.HashPassword))
                    return ServiceResult<User>.Fail("Incorrect email or password.");

                return ServiceResult<User>.Ok(user);
            }
            catch (Exception)
            {
                return ServiceResult<User>.Fail("An error occurred.");
            }
        }

        public async Task<ServiceResult> GenerateAndSaveVerifyCode(string email)
        {
            try
            {
                if (await _userRepository.VerifyCountToday(email) > 3)
                {
                    return ServiceResult.Fail("Daily limit exceeded.");
                }

                string code = new Random().Next(100000, 999999).ToString();

                await _mailService.SendVerificationCode(email, code);

                await _userRepository.SaveVerifyCode(email, code);

                return ServiceResult.Ok();
            }
            catch (Exception ex)
            {
                return ServiceResult<User>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> VerifyCodeAndUpdate(string email, string code)
        {
            try
            {
                var now = await _dbDate.Now();
                var stored = await _userRepository.GetLastVerify(email);
                if (stored == null || stored.Code != code || stored.ExpiresAt < now)
                    return ServiceResult.Fail("Invalid or expired code.");

                await _userRepository.SetCodeUsed(stored.Id);

                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult<User>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> UpdateAvatar(long userId, string avatar)
        {
            try
            {
                await _userRepository.UpdateAvatar(userId, avatar);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> ChangePassword(long userId, string email, string currentPassword, string newPassword)
        {
            try
            {
                var userPass = await _userRepository.GetHashPasswordByEmail(email);

                if (string.IsNullOrEmpty(userPass) || !BCrypt.Net.BCrypt.Verify(currentPassword, userPass))
                    return ServiceResult.Fail("Incorrect password.");

                await _userRepository.ChangePassword(userId, BCrypt.Net.BCrypt.HashPassword(newPassword));
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("An error occurred.");
            }
        }

        public async Task<ServiceResult<string>> GetAvatar(long userId)
        {
            try
            {
                return ServiceResult<string>.Ok(await _userRepository.GetAvatar(userId));
            }
            catch (Exception)
            {
                return ServiceResult<string>.Fail("An error occurred.");
            }
        }

        public async Task<ServiceResult> ResetPassword(string email, string password)
        {
            try
            {
                var u = await _userRepository.GetUserIdByEmail(email);
                if (u == null)
                {
                    return ServiceResult.Fail("There is no user with this email.");
                }
                await _userRepository.ChangePassword(u.Value, BCrypt.Net.BCrypt.HashPassword(password));
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("An error occurred.");
            }
        }

        public async Task<ServiceResult<List<QuickNoteResultModel>>> GetQuickNotes(long userId)
        {
            try
            {
                var r = await _userRepository.GetQuickNotes(userId);
                if (r.Count <= 0)
                {
                    var v = await _userRepository.AddQuickNote(userId, "Note 1", "");
                    r.Add(new QuickNoteResultModel { Id = v.Id, Title = v.Title, Note = v.Note });
                }
                return ServiceResult<List<QuickNoteResultModel>>.Ok(r);
            }
            catch (Exception)
            {
                return ServiceResult<List<QuickNoteResultModel>>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<UserNote>> AddQuickNote(long userId, string title, string note)
        {
            try
            {
                return ServiceResult<UserNote>.Ok(await _userRepository.AddQuickNote(userId, title, note));
            }
            catch (Exception)
            {
                return ServiceResult<UserNote>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> RenameQuickNote(long userId, long noteId, string title)
        {
            try
            {
                if (!await _userRepository.ValidateQuickNote(userId, noteId))
                {
                    return ServiceResult.Fail("You do not have permission to manage this note.");
                }
                await _userRepository.RenameQuickNote(noteId, title);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> DeleteQuickNote(long userId, long noteId)
        {
            try
            {
                if (!await _userRepository.ValidateQuickNote(userId, noteId))
                {
                    return ServiceResult.Fail("You do not have permission to manage this note.");
                }
                if (await _userRepository.GetQuickNoteCount(userId) <= 1)
                {
                    return ServiceResult.Fail("You must have at least one note.");
                }
                await _userRepository.DeleteQuickNote(noteId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> UpdateQuickNote(long userId, long noteId, string note)
        {
            try
            {
                if (!await _userRepository.ValidateQuickNote(userId, noteId))
                {
                    return ServiceResult.Fail("You do not have permission to manage this note.");
                }
                await _userRepository.UpdateQuickNote(userId, noteId, note);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }
    }
}