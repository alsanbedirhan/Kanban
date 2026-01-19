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
        private readonly JwtSettings? _jwtSettings;
        private readonly IUserRepository _userRepository;
        private readonly IEmailService _mailService;
        private readonly IDBDateTimeProvider _dbDate;

        public UserService(IConfiguration config, IUserRepository userRepository, IEmailService mailService, IDBDateTimeProvider dbDate)
        {
            _jwtSettings = config.GetSection("JwtSettingsKey").Get<JwtSettings>() ?? null;
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
                    u.IsApproved = false;
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
                        HashPassword = hashedPassword,
                        IsApproved = false
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

        public string GenerateJwt(string email, long inviteId)
        {
            var claims = new[]
            {
            new Claim(ClaimTypes.Email, email)
        };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _jwtSettings.Issuer,
                audience: _jwtSettings.Audience,
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(15),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public async Task<ServiceResult<BoardUserInviteModel>> VerifyActivationToken(string token)
        {
            try
            {
                var handler = new JwtSecurityTokenHandler();

                var validations = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = _jwtSettings.Issuer,
                    ValidAudience = _jwtSettings.Audience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key))
                };

                var claims = handler.ValidateToken(token, validations, out var tokenSecure) ?? throw new Exception();

                var v = new BoardUserInviteModel
                {
                    InviteId = long.Parse(claims.FindFirst("InviteId")!.Value),
                    Email = claims.FindFirst(ClaimTypes.Email)!.Value,
                    BoardTitle = claims.FindFirst("BoardTitle")!.Value,
                    BoardId = long.Parse(claims.FindFirst("BoardId")!.Value),
                };

                var i = await _userRepository.GetInvite(v.InviteId);
                if (i == null || i.IsUsed || v.Email != i.Email /*|| v.BoardId != i.BoardId*/)
                {
                    throw new Exception();
                }

                var u = await _userRepository.GetByEmail(v.Email);
                v.IsRegistered = u != null;

                return ServiceResult<BoardUserInviteModel>.Ok(v);
            }
            catch
            {
                return ServiceResult<BoardUserInviteModel>.Fail("Aktivasyon bağlantısı geçersiz veya süresi dolmuş.");
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
