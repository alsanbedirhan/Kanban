using Kanban.Models;
using Kanban.Services;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;

namespace Kanban.Controllers
{
    public class HomeController : Controller
    {
        private readonly IKanbanService _kanbanService;
        private readonly IDBDateTimeProvider _dbDate;
        public HomeController(IKanbanService kanbanService, IDBDateTimeProvider dbDate)
        {
            _kanbanService = kanbanService;
            _dbDate = dbDate;
        }
        [HttpGet]
        public async Task<IActionResult> Index(string? token)
        {
            if (!string.IsNullOrEmpty(token))
            {
                var r = await _kanbanService.VerifyActivationToken(User.GetUserId(), token);
                if (r != null)
                {
                    return View(r);
                }
            }
            return View(ServiceResult<InviteStatus>.Ok(InviteStatus.NONE));
        }
        [HttpGet]
        public IActionResult Fetch()
        {
            if (User.Identity?.IsAuthenticated ?? false)
            {
                return Ok(ServiceResult<UserResultModel>.Ok(new UserResultModel
                {
                    UserId = User.GetUserId(),
                    FullName = User.Identity?.Name ?? "",
                    Email = User.GetEmail(),
                    Avatar = User.GetAvatar()
                }));
            }
            return Ok(ServiceResult.Fail(""));
        }
        [HttpGet]
        public async Task<IActionResult> Now()
        {
            return Ok(ServiceResult<DateTime>.Ok(await _dbDate.Now()));
        }
    }
}
