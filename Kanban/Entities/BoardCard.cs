using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class BoardCard
{
    public long Id { get; set; }

    public long BoardColumnId { get; set; }

    public string Desc { get; set; } = null!;

    public bool IsActive { get; set; }

    public long CreatedBy { get; set; }

    public DateTime? CreatedAt { get; set; }

    public int OrderNo { get; set; }

    public DateOnly DueDate { get; set; }

    public int WarningDays { get; set; }

    public string? HighlightColor { get; set; }

    public long? AssigneeUserId { get; set; }

    public virtual User? AssigneeUser { get; set; }

    public virtual ICollection<BoardCardComment> BoardCardComments { get; set; } = new List<BoardCardComment>();

    public virtual BoardColumn BoardColumn { get; set; } = null!;
}
