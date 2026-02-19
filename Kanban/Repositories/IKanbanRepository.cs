using Kanban.Entities;
using Kanban.Models;
using Mailjet.Client.Resources;
using System.ComponentModel.Design;

namespace Kanban.Repositories
{
    public interface IKanbanRepository
    {
        Task<List<BoardColumnResultModel>> GetBoardColumns_Cards(long boardId);
        Task<BoardRefresResultModel> GetBoardVersion(long boardId);
        Task<List<BoardOwnerResultModel>> GetBoards(long userId);
        Task<List<CommentResutModel>> GetComments(long cardId);
        Task DeleteComment(long commentId);
        Task<bool> ValidateComment(long userId, long commentId);
        Task WorkInvite(long inviteId, long userId, long boardId, bool isAccepted);
        Task<BoardCardComment> AddComment(long userId, long cardId, string message);
        Task<List<BoardMemberResultModel>> GetBoardMembers(long boardId);
        Task<bool> CheckBoardMembers(long userId, long boardId);
        Task<long?> GetCardAssignee(long cardId);
        Task<string> GetBoardTitle(long boardId);
        Task<Board?> GetBoard(long boardId);
        Task<Board> AddBoard(long userId, string title);
        Task<BoardCard> AddCard(long userId, long boardId, long columnId, string desc, DateOnly dueDate, int warningDays, string highlightColor, long assigneeId);
        Task UpdateCard(long userId, long cardId, string desc, DateOnly dueDate, int warningDays, string highlightColor, long assigneeId);
        Task AddUserToBoard(long userId, long boardId, string roleCode);
        Task MoveCard(long userId, long cardId, long newColumnId, int newOrder);
        Task<bool> ValidateManageBoard(long userId, long boardId);
        Task<bool> ValidateBoardWithBoardId(long userId, long boardId);
        Task<bool> ValidateBoardColumn(long boardId, long columnId);
        Task<bool> ValidateBoardCard(long boardId, long cardId);
        Task<bool> ValidateBoardComment(long boardId, long commentId);
        Task DeleteColumn(long columnId);
        Task DeleteBoard(long userId, long boardId);
        Task DeleteCard(long cardId);
        Task DeleteMember(long boardId, long userId);
        Task PromoteToOwner(long boardId, long userId);
        Task UpdateBoardTitle(long boardId, string title);
        Task<BoardColumn> AddColumn(long boardId, string title);
    }
}
