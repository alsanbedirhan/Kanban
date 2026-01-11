namespace Kanban.Models
{
    public class UserResultModel
    {
        public string? FullName { get; set; }
        public string Email { get; set; }
    }
    public class BoardResultModel : BoardInputModel
    {
        public long Id { get; set; }
        public bool IsOwner { get; set; }
    }
    public class BoardOutputModel: BoardInputModel
    {
        public long Id { get; set; }
    }
    public class BoardInputModel
    {
        public string? Title { get; set; }
    }
    public class BoardColumnResultModel 
    {
        public long Id { get; set; }
        public string Title { get; set; }
        public List<BoardCardResultModel> Cards { get; set; }
    }
    public class BoardCardResultModel
    {
        public long Id { get; set; }
        public string Desc { get; set; }
    }
}
