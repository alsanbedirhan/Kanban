using Kanban.Entities;
using Kanban.Models;
using Kanban.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Kanban.Controllers
{
    public class AuthController : Controller
    {
        private readonly IUserService _userService;
        public AuthController(IUserService userService)
        {
            _userService = userService;
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
                SecurityStamp = result.Data.SecurityStamp,
                Avatar = result.Data.Avatar
            });

            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> VerifyWork([FromBody] VerifyViewModel model)
        {
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

            var result = await _userService.Register(model);
            if (!result.Success)
            {
                return Ok(ServiceResult.Fail(result.ErrorMessage));
            }

            await signIn(new MyClaims
            {
                UserId = result.Data.Id,
                FullName = result.Data.FullName,
                Email = result.Data.Email,
                SecurityStamp = result.Data.SecurityStamp,
                Avatar = result.Data.Avatar
            });

            return Ok(ServiceResult.Ok());
        }

        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Ok(ServiceResult.Ok());
        }

        private async Task signIn(MyClaims claims)
        {
            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
               new ClaimsPrincipal(new ClaimsIdentity(new List<Claim>
           {
                new Claim(ClaimTypes.NameIdentifier, claims.UserId.ToString()),
                new Claim(ClaimTypes.Name, claims.FullName),
                new Claim(ClaimTypes.Email, claims.Email),
                new Claim(ClaimTypes.UserData, claims.Avatar),
                new Claim("SecurityStamp", claims.SecurityStamp)
           }, CookieAuthenticationDefaults.AuthenticationScheme)));
        }

    }
}
