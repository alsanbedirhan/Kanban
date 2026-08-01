using Kanban;
using Kanban.Models;
using Kanban.Security;
using Kanban.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Claims;

namespace Kanban.Controllers
{
    [EnableRateLimiting("auth")]
    public class AuthController : Controller
    {
        private readonly IUserService _userService;
        private readonly IKanbanService _kanbanService;
        private readonly ITurnstileService _turnstileService;
        private readonly IMemoryCache _cache;

        public AuthController(
            IUserService userService,
            IKanbanService kanbanService,
            ITurnstileService turnstileService,
            IMemoryCache cache)
        {
            _userService = userService;
            _kanbanService = kanbanService;
            _turnstileService = turnstileService;
            _cache = cache;
        }

        [HttpPost]
        [AllowAnonymous]
        [EnableRateLimiting("auth-strict")]
        public async Task<IActionResult> Login([FromBody] LoginViewModel model)
        {
            if (!ModelState.IsValid)
                return Ok(ServiceResult.Fail("Invalid email or password."));
            var isHuman = await _turnstileService.VerifyAsync(model.turnstileToken);
            if (!isHuman)
                return Ok(ServiceResult.Fail("Turnstile verification failed."));
            var result = await _userService.Login(model.email, model.password);
            if (!result.Success)
            {
                return Ok(ServiceResult.Fail(result.ErrorMessage));
            }
            await signIn(new MyClaims
            {
                UserId = result.Data.Id,
                FullName = result.Data.FullName,
                Email = result.Data.Email,
                SecurityStamp = result.Data.SecurityStamp
            });
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        [AllowAnonymous]
        [EnableRateLimiting("auth-otp")]
        public async Task<IActionResult> VerifyWork([FromBody] VerifyViewModel model)
        {
            if (!ModelState.IsValid)
                return Ok(ServiceResult.Fail("Invalid request."));
            var isHuman = await _turnstileService.VerifyAsync(model.turnstileToken);
            if (!isHuman)
            {
                return Ok(ServiceResult.Fail("Turnstile verification failed."));
            }
            var purpose = string.IsNullOrWhiteSpace(model.purpose) ? "register" : model.purpose.Trim().ToLowerInvariant();
            if (purpose is not ("register" or "reset"))
                return Ok(ServiceResult.Fail("Invalid request."));
            var result = await _userService.GenerateAndSaveVerifyCode(model.email, purpose);
            if (!result.Success)
            {
                return Ok(ServiceResult.Fail(result.ErrorMessage));
            }
            TurnstileSessionCache.MarkVerified(_cache, model.email, purpose);
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        [AllowAnonymous]
        [EnableRateLimiting("auth-register")]
        public async Task<IActionResult> Register([FromBody] RegisterViewModel model)
        {
            if (!ModelState.IsValid)
                return Ok(ServiceResult.Fail("Invalid registration data."));
            var isHuman = await _turnstileService.VerifyAsync(model.turnstileToken);
            if (!isHuman)
                return Ok(ServiceResult.Fail("Turnstile verification failed."));
            if (!TurnstileSessionCache.HasVerification(_cache, model.email, "register"))
                return Ok(ServiceResult.Fail("Verification expired. Please verify again."));
            var result = await _userService.RegisterWithOtp(model.email, model.password, model.fullName, model.otpCode);
            if (!result.Success)
            {
                return Ok(ServiceResult.Fail(result.ErrorMessage));
            }
            TurnstileSessionCache.ConsumeVerification(_cache, model.email, "register");

            await _kanbanService.EnsureWelcomeBoard(result.Data.Id);

            await signIn(new MyClaims
            {
                UserId = result.Data.Id,
                FullName = result.Data.FullName,
                Email = result.Data.Email,
                SecurityStamp = result.Data.SecurityStamp
            });
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        [AllowAnonymous]
        public async Task<IActionResult> Logout()
        {
            try
            {
                await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            }
            catch (Exception)
            {
            }
            HttpContext.DeleteCookies();
            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        [AllowAnonymous]
        [EnableRateLimiting("auth-reset")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordViewModel model)
        {
            if (!ModelState.IsValid)
                return Ok(ServiceResult.Fail("Invalid request."));
            if (!TurnstileSessionCache.HasVerification(_cache, model.email, "reset"))
                return Ok(ServiceResult.Fail("Verification expired. Please verify again."));
            var isHuman = await _turnstileService.VerifyAsync(model.turnstileToken);
            if (!isHuman)
                return Ok(ServiceResult.Fail("Turnstile verification failed."));
            var result = await _userService.ResetPasswordWithOtp(model.email, model.password, model.otpCode);
            if (!result.Success)
            {
                return Ok(ServiceResult.Fail(result.ErrorMessage));
            }
            TurnstileSessionCache.ConsumeVerification(_cache, model.email, "reset");
            return Ok(ServiceResult.Ok());
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordViewModel model)
        {
            if (!ModelState.IsValid)
                return Ok(ServiceResult.Fail("Invalid password."));
            var result = await _userService.ChangePassword(User.GetUserId(), User.GetEmail(), model.currentPassword, model.newPassword);
            if (!result.Success)
            {
                return Ok(ServiceResult.Fail(result.ErrorMessage));
            }
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            HttpContext.DeleteCookies();
            return Ok(ServiceResult.Ok());
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> UpdateAvatar([FromBody] AvatarUpdateModel model)
        {
            var r = await _userService.UpdateAvatar(User.GetUserId(), model.Avatar);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [Authorize]
        [HttpGet]
        public async Task<IActionResult> GetQuickNotes()
        {
            var userId = User.GetUserId();
            var r = await _userService.GetQuickNotes(userId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<QuickNoteResultModel>>.Ok(r.Data));
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> AddQuickNote([FromBody] QuickNoteInputModel model)
        {
            var r = await _userService.AddQuickNote(User.GetUserId(), model.Title, model.Note);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<QuickNoteResultModel>.Ok(new QuickNoteResultModel { Id = r.Data.Id, Note = r.Data.Note, Title = r.Data.Title }));
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> RenameQuickNote([FromBody] QuickNoteRenameModel model)
        {
            var r = await _userService.RenameQuickNote(User.GetUserId(), model.UserNoteId, model.Title);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> DeleteQuickNote([FromBody] QuickNoteDeleteModel model)
        {
            var r = await _userService.DeleteQuickNote(User.GetUserId(), model.UserNoteId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> UpdateQuickNote([FromBody] QuickNoteUpdateModel model)
        {
            var r = await _userService.UpdateQuickNote(User.GetUserId(), model.UserNoteId, model.Note);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult.Ok());
        }

        private async Task signIn(MyClaims claimsModel)
        {
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, claimsModel.UserId.ToString()),
                new Claim(ClaimTypes.Name, claimsModel.FullName ?? ""),
                new Claim(ClaimTypes.Email, claimsModel.Email),
                new Claim("SecurityStamp", claimsModel.SecurityStamp ?? "")
            };
            var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            var authProperties = new AuthenticationProperties { IsPersistent = true };
            await HttpContext.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(claimsIdentity),
                authProperties);
            var antiforgery = HttpContext.RequestServices.GetRequiredService<IAntiforgery>();
            var tokens = antiforgery.GetAndStoreTokens(HttpContext);
            HttpContext.Response.Cookies.Append("XSRF-TOKEN", tokens.RequestToken!, HttpContext.CreateXsrfCookieOptions());
        }
    }
}
