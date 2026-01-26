
namespace Kanban.Models
{
    public class UserResultModel : AvatarResultModel
    {
        public long UserId { get; set; }
        public string? FullName { get; set; }
        public string Email { get; set; }
    }
    public class BoardRefresResultModel
    {
        public DateTime LastUpdate { get; set; }
        public DateTime Now { get; set; }
    }
    public class InviteResultModel
    {
        public long Id { get; set; }
        public string BoardName { get; set; }
        public string InviterName { get; set; }
    }
    public class AvatarResultModel
    {
        public string Avatar { get; set; }
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
    public class NotificationInputModel
    {
        public long NotificationId { get; set; }
    }
    public class InviteInputModel
    {
        public long InviteId { get; set; }
        public bool IsAccepted { get; set; }
    }
    public class BoardUserInputModel
    {
        public long BoardId { get; set; }
        public string Email { get; set; }
    }
    public class BoardModel
    {
        public long BoardId { get; set; }
        public int WarningDays { get; set; }
        public string HighlightColor { get; set; }
        public string Description { get; set; }
        public DateOnly DueDate { get; set; }
        public long AssigneeId { get; set; }
    }
    public class AvatarUpdateModel
    {
        public string Avatar { get; set; }
    }
    public class BoardDeleteModel
    {
        public long BoardId { get; set; }
    }
    public class BoardColumnDeleteModel : BoardDeleteModel
    {
        public long ColumnId { get; set; }
    }
    public class BoardCardCommentDeleteModel : BoardDeleteModel
    {
        public long CommentId { get; set; }
    }
    public class BoardCardDeleteModel : BoardDeleteModel
    {
        public long CardId { get; set; }
    }
    public class BoardCardUpdateModel : BoardModel
    {
        public long CardId { get; set; }
    }
    public class CommentInputModel
    {
        public long BoardId { get; set; }
        public long CardId { get; set; }
        public string Message { get; set; }
    }
    public class BoardCardInsertModel : BoardModel
    {
        public long ColumnId { get; set; }
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
    public class NotificationResultModel
    {
        public long Id { get; set; }
        public string Message { get; set; }
        public DateTime CreatedAt { get; set; }
    }
    public class CommentResutModel : NotificationResultModel
    {
        public string FullName { get; set; }
        public long UserId { get; set; }
    }
    public class BoardMemberResultModel
    {
        public long UserId { get; set; }
        public string? FullName { get; set; }
        public string Email { get; set; }
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
        public string AssigneeName { get; set; }
        public string AssigneeAvatar { get; set; }
        public long AssigneeId { get; set; }
    }
}
