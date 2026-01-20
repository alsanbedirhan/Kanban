using Kanban.Entities;
using Kanban.Models;

namespace Kanban.Services
{
    public interface IKanbanService
    {
        Task<ServiceResult<List<BoardColumn>>> GetBoard(long userId, long boardId);
        Task<ServiceResult<List<BoardOwnerResultModel>>> GetBoards(long userId);
        Task<ServiceResult<Board>> CreateBoard(long userId, string title);
        Task<ServiceResult<BoardColumn>> AddColumn(long boardId, string title);
        Task<ServiceResult<BoardCard>> AddCard(long userId, long columnId, string desc, DateOnly dueDate, int warningDays, string highlightColor);
        Task<ServiceResult> MoveCard(long userId, long boardId, long cardId, long newColumnId, int newOrder);
        Task<ServiceResult> DeleteColumn(long userId, long columnId);
        Task<ServiceResult> DeleteBoard(long userId, long boardId);
        Task<ServiceResult> DeleteCard(long userId, long cardId);
        Task<ServiceResult> InviteUserToBoard(long senderUserId, string senderFullName, string senderEmail, long boardId, string email);
        Task<ServiceResult> AddUserToBoard(long userId, long boardId, string roleCode);
        Task<ServiceResult<string>> VerifyActivationToken(string token);
        string GenerateJwt(string email, long inviteId, long boardId);
    }
}
