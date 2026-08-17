using Kanban.Services;
using Microsoft.AspNetCore.Diagnostics;

namespace Kanban;

public static class AuthRecovery
{
    public static bool WantsJsonResponse(HttpRequest request)
    {
        if (string.Equals(request.Headers.XRequestedWith, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase))
            return true;

        var accept = request.Headers.Accept;
        var wantsJson = accept.Any(a => a != null && a.Contains("application/json", StringComparison.OrdinalIgnoreCase));
        var wantsHtml = accept.Any(a => a != null && a.Contains("text/html", StringComparison.OrdinalIgnoreCase));

        return wantsJson && !wantsHtml;
    }

    public static bool IsStaticAssetRequest(HttpRequest request)
    {
        var path = request.Path.Value ?? string.Empty;
        return path.StartsWith("/css/", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/js/", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/avatars/", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/icons/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/favicon.ico", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/favicon.svg", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/manifest.json", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/logo.png", StringComparison.OrdinalIgnoreCase);
    }

    public static void DisableStatusCodePages(HttpContext httpContext)
    {
        var statusCodePagesFeature = httpContext.Features.Get<IStatusCodePagesFeature>();
        if (statusCodePagesFeature != null)
            statusCodePagesFeature.Enabled = false;
    }

    public static void ClearOrphanAuthCookie(HttpContext context)
    {
        if (context.Request.Cookies.ContainsKey("Kanflow.Auth")
            && !(context.User.Identity?.IsAuthenticated ?? false))
        {
            context.DeleteCookies();
        }
    }

    public static bool HasStaleAuthCookie(HttpContext context) =>
        context.Request.Cookies.ContainsKey("Kanflow.Auth")
        && !(context.User.Identity?.IsAuthenticated ?? false);

    public static async Task RespondAsync(HttpContext context, bool forbidden)
    {
        context.DeleteCookies();
        DisableStatusCodePages(context);
        context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        context.Response.Headers.Pragma = "no-cache";

        if (WantsJsonResponse(context.Request))
        {
            context.Response.StatusCode = forbidden
                ? StatusCodes.Status403Forbidden
                : StatusCodes.Status401Unauthorized;
            context.Response.ContentType = "application/json; charset=utf-8";
            var message = forbidden
                ? "You do not have permission for this action."
                : "Your session is not active or has expired.";
            await context.Response.WriteAsJsonAsync(ServiceResult.Fail(message));
            return;
        }

        context.Response.Redirect("/");
    }

    public static Task RecoverHtmlAuthFailureAsync(HttpContext context)
    {
        context.DeleteCookies();
        DisableStatusCodePages(context);
        context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        context.Response.Headers.Pragma = "no-cache";
        context.Response.Redirect("/");
        return Task.CompletedTask;
    }
}
