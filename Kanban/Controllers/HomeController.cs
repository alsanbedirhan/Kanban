using Kanban.Models;
using Kanban.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kanban.Controllers
{
    public class HomeController : Controller
    {
        private readonly IKanbanService _kanbanService;
        public HomeController(IKanbanService kanbanService)
        {
            _kanbanService = kanbanService;
        }
        [HttpGet]
        public async Task<IActionResult> Index(string? token)
        {
            if (!string.IsNullOrEmpty(token))
            {
                var r = _kanbanService.VerifyActivationToken(token);
                if (r != null)
                {
                    return View(r);
                }
            }
            return View();
        }
        [HttpGet]
        public IActionResult Fetch()
        {
            if (User.Identity?.IsAuthenticated ?? false)
            {
                return Ok(ServiceResult<UserResultModel>.Ok(new UserResultModel { FullName = User.Identity?.Name ?? "", Email = User.GetEmail() }));
            }
            return Ok(ServiceResult.Fail(""));
        }
    }
}
