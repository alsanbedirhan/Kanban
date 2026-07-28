using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kanban.Controllers
{
    [AllowAnonymous]
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
                    404 => "Page not found. Please check the URL.",
                    429 => "Too many requests. Please wait a moment and try again.",
                    500 => "An unexpected error occurred. Please try again.",
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
