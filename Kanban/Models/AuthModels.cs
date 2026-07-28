
using System.ComponentModel.DataAnnotations;

namespace Kanban.Models
{
    public class MyClaims : UserResultModel
    {
        public string? SecurityStamp { get; set; }
    }
    public class LoginViewModel 
    {
        [Required, EmailAddress, MaxLength(100)]
        public string email { get; set; } = string.Empty;

        [Required, MinLength(8), MaxLength(128)]
        public string password { get; set; } = string.Empty;

        [Required]
        public string turnstileToken { get; set; } = string.Empty;
    }
    public class ResetPasswordViewModel : LoginViewModel
    {
        [Required, StringLength(6, MinimumLength = 6)]
        public string otpCode { get; set; } = string.Empty;
    }
    public class EmailSettings
    {
        public string ConnectionString { get; set; } = string.Empty;
        public string SenderEmail { get; set; } = string.Empty;
        public string Domain { get; set; } = string.Empty;
    }
    public class JwtSettings
    {
        public string Key { get; set; } = string.Empty;
        public string Issuer { get; set; } = string.Empty;
        public string Audience { get; set; } = string.Empty;
        public int ExpireMinutes { get; set; }
    }
    public class AntiforgeryTokenResult
    {
        public string XsrfToken { get; set; } = string.Empty;
    }

    public class TurnstileSettings
    {
        public string SiteKey { get; set; } = string.Empty;
        public string SecretKey { get; set; } = string.Empty;
    }
    public class RegisterViewModel : LoginViewModel
    {
        [Required, MaxLength(100)]
        public string fullName { get; set; } = string.Empty;

        [Required, StringLength(6, MinimumLength = 6)]
        public string otpCode { get; set; } = string.Empty;
    }
    public class VerifyViewModel
    {
        [Required, EmailAddress, MaxLength(100)]
        public string email { get; set; } = string.Empty;

        [Required]
        public string turnstileToken { get; set; } = string.Empty;

        /// <summary>"register" or "reset"</summary>
        public string purpose { get; set; } = "register";
    }
    public class ChangePasswordViewModel
    {
        [Required, MinLength(8), MaxLength(128)]
        public string currentPassword { get; set; } = string.Empty;

        [Required, MinLength(8), MaxLength(128)]
        public string newPassword { get; set; } = string.Empty;
    }
}
