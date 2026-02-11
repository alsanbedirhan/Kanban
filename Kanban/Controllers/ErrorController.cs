using Microsoft.AspNetCore.Mvc;

namespace Kanban.Controllers
{
    public class ErrorController : Controller
    {
        [Route("[controller]/{statusCode}")]
        public IActionResult HandleError(int statusCode)
        {
            return View(new ErrorViewModel
            {
                ErrorCode = statusCode,
                Message = statusCode switch
                {
                    401 => "Unauthorized access. Please log in.",
                    403 => "Access denied. You do not have permission to access this page.",
                    404 => "Page not found. Please check the URL.",
                    _ => "An error occurred"
                }
            });
        }
    }
}
public class ErrorViewModel
{
    public int ErrorCode { get; set; }
    public string Message { get; set; }
}
