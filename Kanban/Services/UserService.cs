using Kanban.Entities;
using Kanban.Models;
using Kanban.Repositories;

namespace Kanban.Services
{
    public class UserService : IUserService
    {
        private readonly IUserRepository _userRepository;

        public UserService(IUserRepository userRepository)
        {
            _userRepository = userRepository;
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

    }
}
