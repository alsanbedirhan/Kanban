using Kanban.Models;
using Microsoft.AspNetCore.Mvc;

namespace Kanban.Controllers
{
    public class HomeController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
        public IActionResult Fetch()
        {
            return Ok(new LoginResultModel
            {
                Success = User.Identity?.IsAuthenticated ?? false,
                FullName = User.Identity?.Name ?? ""
            });
        }
    }
}
