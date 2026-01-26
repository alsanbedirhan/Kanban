using Kanban.Entities;
using Kanban.Models;
using Mailjet.Client.Resources;

namespace Kanban.Services
{
    public interface IKanbanService
    {
        Task<ServiceResult<List<BoardColumnResultModel>>> GetBoard(long userId, long boardId);
        Task<ServiceResult<List<BoardMemberResultModel>>> GetBoardMembers(long userId, long boardId);
        Task<ServiceResult<BoardRefresResultModel>> GetBoardVersion(long userId, long boardId);
        Task<ServiceResult<List<NotificationResultModel>>> GetNotifications(long userId);
        Task<ServiceResult<BoardCardComment>> AddComment(long userId, long boardId, long cardId, string message);
        Task<ServiceResult<List<CommentResutModel>>> GetComments(long userId, long boardId, long cardId);
        Task<ServiceResult> DeleteNotification(long userId, long id);
        Task<ServiceResult> DeleteComment(long userId, long boardId, long commentId);
        Task<ServiceResult> DeleteNotifications(long userId);
        Task<ServiceResult> DeleteMember(long userId, long boardId, long removeUserId);
        Task<ServiceResult> PromoteToOwner(long userId, long boardId, long promoteUserId);
        Task<ServiceResult<List<BoardOwnerResultModel>>> GetBoards(long userId);
        Task<ServiceResult<Board>> CreateBoard(long userId, string title);
        Task<ServiceResult<BoardColumn>> AddColumn(long userId, long boardId, string title);
        Task<ServiceResult<BoardCard>> AddCard(long userId, long boardId, long columnId, string desc, DateOnly dueDate, int warningDays, string highlightColor, long assigneeId);
        Task<ServiceResult> UpdateCard(long userId, long boardId, long cardId, string desc, DateOnly dueDate, int warningDays, string highlightColor, long assigneeId);
        Task<ServiceResult> MoveCard(long userId, long boardId, long cardId, long newColumnId, int newOrder);
        Task<ServiceResult> DeleteColumn(long userId, long boardId, long columnId);
        Task<ServiceResult> DeleteBoard(long userId, long boardId);
        Task<ServiceResult> DeleteCard(long userId, long boardId, long cardId);
        Task<ServiceResult> InviteUserToBoard(long senderUserId, string senderFullName, string senderEmail, long boardId, string email);
        Task<ServiceResult<InviteStatus>> VerifyActivationToken(long activeUserId, string token);
        Task<ServiceResult<List<InviteResultModel>>> GetInvites(string email);
        string GenerateJwt(string email, long inviteId, long boardId);
        Task<ServiceResult> WorkInvite(string email, long userId, long inviteId, bool isAccepted);
        Task<ServiceResult<bool>> CheckUpdates(long userId, string email);
    }
}
