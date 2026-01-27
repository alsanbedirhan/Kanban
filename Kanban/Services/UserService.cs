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

        public async Task<ServiceResult<User>> Register(RegisterViewModel model)
        {
            var u = await _userRepository.GetByEmailForUpdate(model.email);
            if (u != null && u.IsActive)
            {
                return ServiceResult<User>.Fail("A user with this email already exists.");
            }
            var hashedPassword = BCrypt.Net.BCrypt.HashPassword(model.password);

            try
            {
                if (u != null)
                {
                    u.FullName = model.fullName;
                    u.HashPassword = hashedPassword;
                    u.IsActive = true;
                    await _userRepository.SaveContext();
                    return ServiceResult<User>.Ok(u);
                }
                else
                {
                    return ServiceResult<User>.Ok(await _userRepository.Create(new User
                    {
                        FullName = model.fullName,
                        Email = model.email,
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
                    return ServiceResult<User>.Fail("Incorrect username or password.");

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
    }
}