using Microsoft.AspNetCore.DataProtection;
using System.Security.Cryptography;

namespace Kanban.Security
{
    public interface IOtpCodeProtector
    {
        string Protect(string plainCode);
        string? Unprotect(string protectedCode);
    }

    public class OtpCodeProtector : IOtpCodeProtector
    {
        private readonly IDataProtector _protector;

        public OtpCodeProtector(IDataProtectionProvider provider)
        {
            _protector = provider.CreateProtector("Kanflow.OtpCode.v1");
        }

        public string Protect(string plainCode) => _protector.Protect(plainCode);

        public string? Unprotect(string protectedCode)
        {
            try
            {
                return _protector.Unprotect(protectedCode);
            }
            catch (CryptographicException)
            {
                return null;
            }
        }
    }
}
