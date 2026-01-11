using Kanban.Models;
using Kanban.Services;
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
            if (User.Identity?.IsAuthenticated ?? false)
            {
                return Ok(ServiceResult.Fail(""));
            }
            return Ok(ServiceResult<UserResultModel>.Ok(new UserResultModel { FullName = User.Identity?.Name ?? "", Email = User.GetEmail() }));
        }
    }
}
