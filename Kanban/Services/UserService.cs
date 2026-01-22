using Kanban.Entities;
using Kanban.Models;
using Kanban.Repositories;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

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
                return ServiceResult<User>.Fail("Bu email ile zaten bir kullanıcı var.");
            }
            var hashedPassword = BCrypt.Net.BCrypt.HashPassword(model.password);

            try
            {
                if (u != null)
                {
                    u.FullName = model.fullname;
                    u.HashPassword = hashedPassword;
                    u.IsActive = true;
                    await _userRepository.SaveContext();
                    return ServiceResult<User>.Ok(u);
                }
                else
                {
                    return ServiceResult<User>.Ok(await _userRepository.Create(new User
                    {
                        FullName = model.fullname,
                        Email = model.email,
                        IsActive = true,
                        HashPassword = hashedPassword
                    }));
                }
            }
            catch (Exception ex)
            {
                return ServiceResult<User>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult<User>> Login(string email, string password)
        {
            try
            {
                var user = await _userRepository.GetByEmail(email);

                if (user == null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(password, user.HashPassword))
                    return ServiceResult<User>.Fail("Kullanıcı adı veya şifre hatalı.");

                return ServiceResult<User>.Ok(user);
            }
            catch (Exception)
            {
                return ServiceResult<User>.Fail("Hata oluştu");
            }
        }

        public async Task<ServiceResult> GenerateAndSaveVerifyCode(string email)
        {
            try
            {
                if (await _userRepository.VerifyCountToday(email) > 3)
                {
                    return ServiceResult.Fail("Limit aşıldı");
                }

                string code = new Random().Next(100000, 999999).ToString();

                await _mailService.SendVerificationCode(email, code);

                await _userRepository.SaveVerifyCode(email, code);

                return ServiceResult.Ok();
            }
            catch (Exception ex)
            {
                return ServiceResult<User>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> VerifyCodeAndUpdate(string email, string code)
        {
            try
            {
                var now = await _dbDate.Now();
                var stored = await _userRepository.GetLastVerify(email);
                if (stored == null || stored.Code != code || stored.ExpiresAt < now)
                    return ServiceResult.Fail("Kod geçersiz veya süresi dolmuş.");

                await _userRepository.SetCodeUsed(stored.Id);

                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult<User>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }
    }
}
