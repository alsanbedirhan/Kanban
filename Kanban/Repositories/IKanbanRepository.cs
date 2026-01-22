using Kanban.Entities;

namespace Kanban.Repositories
{
    public interface IKanbanRepository
    {
        Task<List<BoardColumn>> GetBoardColumns_Cards(long boardId);
        Task<List<Models.BoardOwnerResultModel>> GetBoards(long userId);
        Task<List<Models.BoardMemberResultModel>> GetBoardMembers(long boardId);
        Task<bool> CheckBoardMembers(long userId, long boardId);
        Task<Userinvite?> GetInvite(long id);
        Task SetAcceptedInvite(long inviteId);
        Task<Userinvite> AddInvite(long senderUserId, long boardId, string email);
        Task<string> GetBoardTitle(long boardId);
        Task<Board?> GetBoard(long boardId);
        Task<Board> AddBoard(long userId, string title);
        Task<BoardCard> AddCard(long userId, long columnId, string desc, DateOnly dueDate, int warningDays, string highlightColor);
        Task AddUserToBoard(long userId, long boardId, string roleCode);
        Task MoveCard(long userId, long cardId, long newColumnId, int newOrder);
        Task<bool> ValidateManageBoard(long userId, long boardId);
        Task<bool> ValidateBoardWithBoardId(long userId, long boardId);
        Task<bool> ValidateBoardWithColumnId(long userId, long columnId);
        Task<bool> ValidateBoardWithCardId(long userId, long cardId);
        Task DeleteColumn(long columnId);
        Task DeleteBoard(long userId, long boardId);
        Task DeleteCard(long cardId);
        Task DeleteMember(long boardId, long userId);
        Task PromoteToOwner(long boardId, long userId);
        Task<BoardColumn> AddColumn(long boardId, string title);
    }
}
