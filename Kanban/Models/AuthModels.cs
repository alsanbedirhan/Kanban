
namespace Kanban.Models
{
    public class MyClaims : UserResultModel
    {
        public long Id { get; set; }
        public string? SecurityStamp { get; set; }
    }
    public class LoginViewModel : VerifyViewModel
    {
        public string password { get; set; }
    }
    public class EmailSettings
    {
        public string Domain { get; set; }
        public string Address { get; set; }
        public string API_Key { get; set; }
        public string Secret_Key { get; set; }
    }
    public class JwtSettings
    {
        public string Key { get; set; }
        public string Issuer { get; set; }
        public string Audience { get; set; }
        public int ExpireMinutes { get; set; }
    }
    public class RegisterViewModel : LoginViewModel
    {
        public string fullname { get; set; }
        public string otpCode { get; set; }
    }
    public class VerifyViewModel
    {
        public string email { get; set; }
    }
}
