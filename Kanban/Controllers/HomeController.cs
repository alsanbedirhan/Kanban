using Kanban.Models;
using Kanban.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;

namespace Kanban.Controllers
{
    public class HomeController : Controller
    {
        private readonly IKanbanService _kanbanService;
        private readonly IUserService _userService;
        public HomeController(IKanbanService kanbanService, IUserService userService)
        {
            _kanbanService = kanbanService;
            _userService = userService;
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
        public async Task<IActionResult> Fetch()
        {
            if (User.Identity?.IsAuthenticated ?? false)
            {
                var avatar = await _userService.GetAvatar(User.GetUserId());
                return Ok(ServiceResult<FetchResultModel>.Ok(new FetchResultModel
                {
                    UserId = User.GetUserId(),
                    FullName = User.Identity?.Name ?? "",
                    Email = User.GetEmail(),
                    Avatar = avatar.Data ?? ""
                }));
            }
            return Ok(ServiceResult.Fail(""));
        }

        [HttpGet]
        public IActionResult GetToken()
        {
            var antiforgery = HttpContext.RequestServices.GetRequiredService<IAntiforgery>();
            var tokens = antiforgery.GetAndStoreTokens(HttpContext);

            HttpContext.Response.Cookies.Append("XSRF-TOKEN", tokens.RequestToken!,
                new CookieOptions
                {
                    HttpOnly = false,
                    Secure = true,
                    SameSite = SameSiteMode.Strict,
                    Path = "/"
                });

            return Ok(ServiceResult.Ok());
        }
    }
}
