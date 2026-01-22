
namespace Kanban.Models
{
    public class UserResultModel
    {
        public long UserId { get; set; }
        public string? FullName { get; set; }
        public string Email { get; set; }
    }
    public class BoardResultModel : BoardInputModel
    {
        public long Id { get; set; }
        public bool IsOwner { get; set; }
    }
    public class BoardOwnerResultModel
    {
        public Entities.Board Board { get; set; }
        public bool IsOwner { get; set; }
    }
    public class BoardOutputModel : BoardInputModel
    {
        public long Id { get; set; }
    }
    public class BoardInputModel
    {
        public string? Title { get; set; }
    }
    public class BoardUserInviteModel
    {
        public long InviteId { get; set; }
        public long BoardId { get; set; }
        public string Email { get; set; }
    }
    public class BoardUserInputModel
    {
        public long BoardId { get; set; }
        public string Email { get; set; }
    }
    public class BoardCardInputModel
    {
        public long ColumnId { get; set; }
        public string Description { get; set; }
        public DateOnly DueDate { get; set; }
        public int WarningDays { get; set; }
        public string HighlightColor { get; set; }
    }
    public class BoardCardMoveInputModel
    {
        public long BoardId { get; set; }
        public long CardId { get; set; }
        public long NewColumnId { get; set; }
        public int NewOrder { get; set; }
    }
    public class BoardColumnInputModel
    {
        public long BoardId { get; set; }
        public string? Title { get; set; }
    }
    public class BoardMemberInputModel
    {
        public long BoardId { get; set; }
        public long UserId { get; set; }
    }
    public class BoardColumnResultModel
    {
        public long Id { get; set; }
        public string Title { get; set; }
        public List<BoardCardResultModel> Cards { get; set; }
    }
    public class BoardMemberResultModel : UserResultModel
    {
        public string RoleCode { get; set; }
    }
    public class BoardCardResultModel
    {
        public long Id { get; set; }
        public string Desc { get; set; }
        public int Order { get; set; }
        public DateOnly DueDate { get; set; }
        public int WarningDays { get; set; }
        public string HighlightColor { get; set; }
    }
}
