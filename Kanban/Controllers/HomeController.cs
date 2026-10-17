using Kanban.Models;
using Kanban.Security;
using Kanban.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Kanban.Controllers
{
    [EnableRateLimiting("page")]
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
        [AllowAnonymous]
        public async Task<IActionResult> Index(string? token)
        {
            await AuthRecovery.ClearOrphanAuthCookieAsync(HttpContext);

            if (!string.IsNullOrEmpty(token))
            {
                var boardTitle = await _kanbanService.GetInvitePreview(token);
                if (boardTitle == null)
                {
                    return View(ServiceResult<InviteStatus>.Ok(InviteStatus.ERROR));
                }

                ViewData["InviteToken"] = token;
                var pending = ServiceResult<InviteStatus>.Ok(InviteStatus.PENDING);
                pending.ErrorMessage = boardTitle;
                return View(pending);
            }
            return View(ServiceResult<InviteStatus>.Ok(InviteStatus.NONE));
        }

        [HttpPost]
        [AllowAnonymous]
        [EnableRateLimiting("auth")]
        public async Task<IActionResult> AcceptInvite([FromBody] InviteTokenModel model)
        {
            var status = InviteStatus.ERROR;
            string? message = null;
            if (ModelState.IsValid)
            {
                var r = await _kanbanService.VerifyActivationToken(User.GetUserId(), model.token);
                status = r.Data;
                message = status == InviteStatus.WRONG_ACC
                    ? $"{User.GetEmail()}|{r.ErrorMessage}"
                    : r.ErrorMessage;
            }

            var result = ServiceResult<string>.Ok(status.ToString());
            result.ErrorMessage = message;
            return Ok(result);
        }

        [HttpGet]
        [AllowAnonymous]
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
                    Avatar = AvatarNames.Normalize(avatar.Data, "def")
                }));
            }
            return Ok(ServiceResult.Fail(""));
        }

        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetToken()
        {
            var antiforgery = HttpContext.RequestServices.GetRequiredService<IAntiforgery>();
            var tokens = antiforgery.GetAndStoreTokens(HttpContext);

            HttpContext.Response.Cookies.Append("XSRF-TOKEN", tokens.RequestToken!, HttpContext.CreateXsrfCookieOptions());

            return Ok(ServiceResult<AntiforgeryTokenResult>.Ok(new AntiforgeryTokenResult
            {
                XsrfToken = tokens.RequestToken!
            }));
        }
    }
}
