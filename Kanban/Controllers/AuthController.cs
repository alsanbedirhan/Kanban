using Kanban.Entities;
using Kanban.Models;
using Kanban.Services;
using Mailjet.Client.Resources;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Kanban.Controllers
{
    public class AuthController : Controller
    {
        private readonly IUserService _userService;
        private readonly ITurnstileService _turnstileService;
        public AuthController(IUserService userService, ITurnstileService turnstileService)
        {
            _userService = userService;
            _turnstileService = turnstileService;
        }

        [HttpPost]
        public async Task<IActionResult> Login([FromBody] LoginViewModel model)
        {
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
        public async Task<IActionResult> VerifyWork([FromBody] VerifyViewModel model)
        {
            var isHuman = await _turnstileService.VerifyAsync(model.turnstileToken);
            if (!isHuman)
            {
                return Ok(ServiceResult.Fail("Turnstile verification failed."));
            }

            var result = await _userService.GenerateAndSaveVerifyCode(model.email);

            if (!result.Success)
            {
                return Ok(ServiceResult.Fail(result.ErrorMessage));
            }

            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> Register([FromBody] RegisterViewModel model)
        {
            var verify = await _userService.VerifyCodeAndUpdate(model.email, model.otpCode);
            if (!verify.Success)
            {
                return Ok(ServiceResult.Fail(verify.ErrorMessage));
            }

            var result = await _userService.Register(model.email, model.password, model.fullName);
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
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordViewModel model)
        {
            var verify = await _userService.VerifyCodeAndUpdate(model.email, model.otpCode);
            if (!verify.Success)
            {
                return Ok(ServiceResult.Fail(verify.ErrorMessage));
            }

            var result = await _userService.ResetPassword(model.email, model.password);
            if (!result.Success)
            {
                return Ok(ServiceResult.Fail(result.ErrorMessage));
            }

            return Ok(ServiceResult.Ok());
        }

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordViewModel model)
        {
            var result = await _userService.ChangePassword(User.GetUserId(), User.GetEmail(), model.currentPassword, model.newPassword);

            if (!result.Success)
            {
                return Ok(ServiceResult.Fail(result.ErrorMessage));
            }
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
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
        [HttpPost]
        public async Task<IActionResult> UpdateQuickNote([FromBody] QuickNoteModel model)
        {
            var userId = User.GetUserId();
            var r = await _userService.UpdateQuickNote(userId, model.QuickNote);
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

            HttpContext.Response.Cookies.Append("XSRF-TOKEN", tokens.RequestToken!,
                new CookieOptions
                {
                    HttpOnly = false,
                    Secure = true,
                    SameSite = SameSiteMode.Strict,
                    Path = "/"
                });
        }

    }
}
