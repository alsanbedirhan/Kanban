
namespace Kanban.Models
{
    public class MyClaims : UserResultModel
    {
        public long Id { get; set; }
        public string? SecurityStamp { get; set; }
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
}
