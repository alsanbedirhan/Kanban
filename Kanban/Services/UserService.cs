using Kanban.Entities;
using Kanban.Models;
using Kanban.Repositories;
using Kanban.Security;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Cryptography;
using System.Text;

namespace Kanban.Services
{
    public class UserService : IUserService
    {
        private static string GenerateOtpCode() =>
            RandomNumberGenerator.GetInt32(100_000, 1_000_000).ToString();

        private readonly IUserRepository _userRepository;
        private readonly IEmailService _mailService;
        private readonly IDBDateTimeProvider _dbDate;
        private readonly IMemoryCache _cache;

        public UserService(
            IUserRepository userRepository,
            IEmailService mailService,
            IDBDateTimeProvider dbDate,
            IMemoryCache cache)
        {
            _userRepository = userRepository;
            _mailService = mailService;
            _dbDate = dbDate;
            _cache = cache;
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
                    u.SecurityStamp = Guid.NewGuid().ToString();
                    await _userRepository.SaveContext();
                    UserSecurityCache.Invalidate(_cache, u.Id);
                    return ServiceResult<User>.Ok(u);
                }
                return ServiceResult<User>.Ok(await _userRepository.Create(new User
                {
                    FullName = fullName,
                    Email = email,
                    IsActive = true,
                    HashPassword = hashedPassword
                }));
            }
            catch (Exception)
            {
                return ServiceResult<User>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<User>> Login(string email, string password)
        {
            try
            {
                if (IsLoginLockedOut(email))
                    return ServiceResult<User>.Fail("Too many failed attempts. Please try again later.");

                var user = await _userRepository.GetByEmail(email);
                var hashToVerify = user?.HashPassword ?? LoginSecurity.DummyPasswordHash;
                var passwordValid = BCrypt.Net.BCrypt.Verify(password, hashToVerify);

                if (user == null || !user.IsActive || !passwordValid)
                {
                    RecordLoginFailure(email);
                    return ServiceResult<User>.Fail("Incorrect email or password.");
                }

                ClearLoginFailures(email);
                return ServiceResult<User>.Ok(user);
            }
            catch (Exception)
            {
                return ServiceResult<User>.Fail("An error occurred.");
            }
        }

        public async Task<ServiceResult> GenerateAndSaveVerifyCode(string email, string purpose = "register")
        {
            try
            {
                var existing = await _userRepository.GetByEmail(email);
                if (purpose == "register")
                {
                    if (existing != null && existing.IsActive)
                        return ServiceResult.Fail("A user with this email already exists.");
                }
                else if (purpose == "reset")
                {
                    if (existing == null || !existing.IsActive)
                        return ServiceResult.Fail("There is no account with this email address.");
                }
                if (await _userRepository.VerifyCountToday(email) > 3)
                {
                    return ServiceResult.Fail("Daily limit exceeded.");
                }
                string code = GenerateOtpCode();
                await _mailService.SendVerificationCode(email, code);
                await _userRepository.SaveVerifyCode(email, HashOtp(code));
                ClearOtpFailures(email);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> VerifyCodeAndUpdate(string email, string code)
        {
            var validation = await ValidateVerificationCode(email, code);
            if (!validation.Success)
                return validation;
            await _userRepository.SetCodeUsed(validation.Data);
            return ServiceResult.Ok();
        }

        public async Task<ServiceResult<User>> RegisterWithOtp(string email, string password, string fullName, string otpCode)
        {
            var validation = await ValidateVerificationCode(email, otpCode);
            if (!validation.Success)
                return ServiceResult<User>.Fail(validation.ErrorMessage!);
            var result = await Register(email, password, fullName);
            if (!result.Success)
                return result;
            await _userRepository.SetCodeUsed(validation.Data);
            ClearOtpFailures(email);
            return result;
        }

        public async Task<ServiceResult> ResetPasswordWithOtp(string email, string password, string otpCode)
        {
            var validation = await ValidateVerificationCode(email, otpCode);
            if (!validation.Success)
                return validation;
            var result = await ResetPassword(email, password);
            if (!result.Success)
                return result;
            await _userRepository.SetCodeUsed(validation.Data);
            ClearOtpFailures(email);
            return ServiceResult.Ok();
        }

        private async Task<ServiceResult<long>> ValidateVerificationCode(string email, string code)
        {
            try
            {
                if (IsOtpLockedOut(email))
                    return ServiceResult<long>.Fail("Too many failed attempts. Please request a new code.");
                var now = await _dbDate.Now();
                var stored = await _userRepository.GetLastVerify(email);
                if (stored == null || stored.ExpiresAt < now || string.IsNullOrEmpty(stored.Code))
                {
                    RecordOtpFailure(email);
                    return ServiceResult<long>.Fail("Invalid or expired code.");
                }
                if (!OtpSecurity.CodesMatch(stored.Code, HashOtp(code)))
                {
                    RecordOtpFailure(email);
                    return ServiceResult<long>.Fail("Invalid or expired code.");
                }
                return ServiceResult<long>.Ok(stored.Id);
            }
            catch (Exception)
            {
                return ServiceResult<long>.Fail("A database error occurred, please try again.");
            }
        }

        private static string HashOtp(string code)
            => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(code)));

        private static string OtpFailKey(string email) =>
            $"OTP_FAIL:{email.Trim().ToLowerInvariant()}";
        private bool IsOtpLockedOut(string email) =>
            _cache.TryGetValue(OtpFailKey(email), out int failures) && failures >= OtpSecurity.MaxFailedAttempts;
        private void RecordOtpFailure(string email)
        {
            var key = OtpFailKey(email);
            var failures = _cache.TryGetValue(key, out int count) ? count + 1 : 1;
            _cache.Set(key, failures, OtpSecurity.FailedAttemptWindow);
        }

        private void ClearOtpFailures(string email) =>
            _cache.Remove(OtpFailKey(email));

        private static string LoginFailKey(string email) =>
            $"LOGIN_FAIL:{email.Trim().ToLowerInvariant()}";
        private bool IsLoginLockedOut(string email) =>
            _cache.TryGetValue(LoginFailKey(email), out int failures) && failures >= LoginSecurity.MaxFailedAttempts;
        private void RecordLoginFailure(string email)
        {
            var key = LoginFailKey(email);
            var failures = _cache.TryGetValue(key, out int count) ? count + 1 : 1;
            _cache.Set(key, failures, LoginSecurity.FailedAttemptWindow);
        }
        private void ClearLoginFailures(string email) =>
            _cache.Remove(LoginFailKey(email));
        public async Task<ServiceResult> UpdateAvatar(long userId, string avatar)
        {
            if (!AvatarNames.IsAllowed(avatar))
                return ServiceResult.Fail("Invalid avatar selection.");
            try
            {
                await _userRepository.UpdateAvatar(userId, AvatarNames.Normalize(avatar));
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
                if (await _userRepository.GetQuickNoteCount(userId) >= QuickNoteLimits.MaxNotesPerUser)
                {
                    return ServiceResult<UserNote>.Fail(
                        $"You can have at most {QuickNoteLimits.MaxNotesPerUser} notes.");
                }
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
                await _userRepository.RenameQuickNote(userId, noteId, title);
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
                await _userRepository.DeleteQuickNote(userId, noteId);
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
