using Kanban.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Kanban;

public class ApiExceptionHandler : IExceptionHandler
{
    private readonly ILogger<ApiExceptionHandler> _logger;

    public ApiExceptionHandler(ILogger<ApiExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is OperationCanceledException)
            return true;

        var path = context.Features.Get<IExceptionHandlerPathFeature>()?.Path ?? context.Request.Path.Value;
        _logger.LogError(exception, "Unhandled error. Path: {Path}", path);

        if (AuthRecovery.WantsJsonResponse(context.Request))
        {
            var (statusCode, message) = Map(exception);
            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsJsonAsync(ServiceResult.Fail(message), cancellationToken);
            return true;
        }

        context.Response.Redirect("/Error/500");
        return true;
    }

    private static (int StatusCode, string Message) Map(Exception exception) => exception switch
    {
        AntiforgeryValidationException =>
            (StatusCodes.Status400BadRequest, "Session validation failed. Please refresh the page and try again."),
        BadHttpRequestException =>
            (StatusCodes.Status400BadRequest, "Invalid request."),
        DbUpdateException or SqlException or RetryLimitExceededException =>
            (StatusCodes.Status500InternalServerError, "A database error occurred, please try again."),
        _ =>
            (StatusCodes.Status500InternalServerError, "An unexpected error occurred. Please try again.")
    };
}
