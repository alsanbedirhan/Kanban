using Kanban.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
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
            || path.StartsWith("/lib/", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/avatars/", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/icons/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/favicon.ico", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/favicon.svg", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/manifest.json", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/sw.js", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/offline.html", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/logo.png", StringComparison.OrdinalIgnoreCase);
    }

    public static void DisableStatusCodePages(HttpContext httpContext)
    {
        var statusCodePagesFeature = httpContext.Features.Get<IStatusCodePagesFeature>();
        if (statusCodePagesFeature != null)
            statusCodePagesFeature.Enabled = false;
    }

    public static bool HasStaleAuthCookie(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated ?? false)
            return false;

        return context.Request.Cookies.Keys.Any(IsAuthCookieName);
    }

    public static void ClearOrphanAuthCookie(HttpContext context)
    {
        if (HasStaleAuthCookie(context))
            context.DeleteCookies();
    }

    public static async Task ClearSessionAsync(HttpContext context)
    {
        if (context.Response.HasStarted)
            return;

        const string sessionClearedKey = "__Kanflow.SessionCleared";
        if (context.Items.ContainsKey(sessionClearedKey))
            return;
        context.Items[sessionClearedKey] = true;

        try
        {
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        }
        catch (Exception)
        {
        }

        context.DeleteCookies();
    }

    public static Task ClearOrphanAuthCookieAsync(HttpContext context) =>
        HasStaleAuthCookie(context) ? ClearSessionAsync(context) : Task.CompletedTask;

    public static async Task RespondAsync(HttpContext context, bool forbidden)
    {
        await ClearSessionAsync(context);
        DisableStatusCodePages(context);
        ApplyNoStoreHeaders(context);

        if (WantsJsonResponse(context.Request))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.ContentType = "application/json; charset=utf-8";
            var message = forbidden
                ? "You do not have permission for this action."
                : "Your session is not active or has expired.";
            await context.Response.WriteAsJsonAsync(ServiceResult.Fail(message));
            return;
        }

        RedirectToSessionReset(context);
    }

    public static async Task RecoverHtmlAuthFailureAsync(HttpContext context)
    {
        await ClearSessionAsync(context);
        DisableStatusCodePages(context);
        ApplyNoStoreHeaders(context);
        RedirectToSessionReset(context);
    }

    private static void ApplyNoStoreHeaders(HttpContext context)
    {
        context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        context.Response.Headers.Pragma = "no-cache";
    }

    private static void RedirectToSessionReset(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        if (path.StartsWith("/Auth/ClearSession", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.Redirect("/");
            return;
        }

        context.Response.Redirect("/Auth/ClearSession");
    }

    private static bool IsAuthCookieName(string name) =>
        name.Equals("Kanflow.Auth", StringComparison.OrdinalIgnoreCase)
        || name.StartsWith("Kanflow.AuthC", StringComparison.OrdinalIgnoreCase);
}
