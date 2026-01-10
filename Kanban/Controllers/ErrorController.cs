using Kanban.Models;
using Microsoft.AspNetCore.Mvc;

namespace Kanban.Controllers
{
    public class ErrorController : Controller
    {
        [Route("[controller]/{statusCode}")]
        public IActionResult HandleError(int statusCode)
        {
            string message = $"Hata oluştu";
            if (statusCode == 401)
            {
                message = "Yetkisiz erişim. Lütfen giriş yapın.";
            }
            else if (statusCode == 403)
            {
                message = "Erişim reddedildi. Bu sayfaya erişim izniniz yok.";
            }
            else if (statusCode == 404)
            {
                message = "Sayfa bulunamadı. Lütfen URL'yi kontrol edin.";
            }
            return View(new ErrorViewModel { ErrorCode = statusCode, Message = message });
        }
    }
}
public class ErrorViewModel
{
    public int ErrorCode { get; set; }
    public string Message { get; set; }
}
