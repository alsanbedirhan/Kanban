
namespace Kanban.Models
{
    public class MyClaims
    {
        public long Id { get; set; }
        public string FullName { get; set; }
        public string Email { get; set; }
        public string SecurityStamp { get; set; }
    }
    public class LoginViewModel
    {
        public string email { get; set; }
        public string password { get; set; }
    }
    public class RegisterViewModel : LoginViewModel
    {
        public string fullname { get; set; }
    }
    public class LoginResultModel : Services.ApiResponse
    {
        public string FullName { get; set; }
    }
}
